#!/bin/bash
# DisputePro on one Ubuntu 24.04 EC2 instance (t3.small). Safe to re-run: it pulls, rebuilds and restarts.
#
#   curl -fsSL https://raw.githubusercontent.com/prabhat-gp/neathack-upi/main/deploy/ec2-setup.sh | bash
#
# Public traffic only reaches Caddy on 80/443. The frontend (3000) and backend (8000) listen on 127.0.0.1.
# URL: https://<elastic-ip-with-dashes>.sslip.io (override with HOST=...).
set -euo pipefail
BRANCH="${BRANCH:-main}"
APP=/home/ubuntu/neathack-upi
IP=$(curl -fsS http://checkip.amazonaws.com)
HOST="${HOST:-$(echo "$IP" | tr . -).sslip.io}"

# 2 GB swap: the Next.js build needs more than a t3.small's 2 GB RAM.
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

sudo apt-get update -y
sudo apt-get install -y git python3-venv python3-pip curl debian-keyring debian-archive-keyring apt-transport-https gnupg
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
command -v codex >/dev/null || sudo npm install -g @openai/codex
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y caddy
fi

[ -d "$APP" ] || git clone -b "$BRANCH" https://github.com/prabhat-gp/neathack-upi.git "$APP"
cd "$APP" && git fetch origin && git checkout "$BRANCH" && git pull --ff-only origin "$BRANCH"

cd "$APP/backend"
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
if [ ! -f .env ]; then
  cp .env.example .env
  # Judged deployment runs the stronger model (the example file carries the cheap build model).
  sed -i 's/^CODEX_MODEL=.*/CODEX_MODEL=gpt-6.1-sol/; s/^CODEX_REASONING_EFFORT=.*/CODEX_REASONING_EFFORT=medium/' .env
fi
# Deployment defaults; existing values in .env are left alone.
setdefault() { grep -q "^$1=" .env || echo "$1=$2" >> .env; }
setdefault LLM_PROVIDER codex
setdefault CODEX_MODEL gpt-6.1-sol
setdefault CODEX_REASONING_EFFORT medium
setdefault BANK_BATCH_SIZE 3
setdefault BANK_BATCHES_PER_HOUR 2
grep -q "^OPERATOR_TOKEN=." .env || { sed -i '/^OPERATOR_TOKEN=/d' .env; echo "OPERATOR_TOKEN=$(openssl rand -hex 24)" >> .env; }
chmod 600 .env

cd "$APP/frontend"
npm ci
NEXT_PUBLIC_API_URL="https://$HOST" npm run build

sudo tee /etc/systemd/system/disputepro-api.service >/dev/null <<EOF
[Unit]
Description=DisputePro API and agents
After=network.target
[Service]
User=ubuntu
Environment=HOME=/home/ubuntu
Environment=PATH=/usr/bin:/usr/local/bin:$APP/backend/.venv/bin
WorkingDirectory=$APP/backend
ExecStart=$APP/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/disputepro-web.service >/dev/null <<EOF
[Unit]
Description=DisputePro web app
After=network.target
[Service]
User=ubuntu
WorkingDirectory=$APP/frontend
ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p 3000
Restart=always
[Install]
WantedBy=multi-user.target
EOF

# Caddy: HTTPS for the site and /api; internal endpoints (sandbox money movement, agent tools, API docs) stay private.
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$HOST {
	encode zstd gzip
	@internal path /sandbox /sandbox/* /agent-mcp /agent-mcp/* /docs /docs/* /redoc /openapi.json
	handle @internal {
		respond 404
	}
	handle /api/* {
		reverse_proxy 127.0.0.1:8000 {
			flush_interval -1
		}
	}
	handle /health {
		reverse_proxy 127.0.0.1:8000
	}
	handle /mcp* {
		reverse_proxy 127.0.0.1:8000
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

sudo systemctl daemon-reload
sudo systemctl enable --now disputepro-api disputepro-web caddy
sudo systemctl restart disputepro-api disputepro-web caddy

echo
echo "Site:  https://$HOST            Bank desk: https://$HOST/console"
echo "Check: curl -s https://$HOST/health   (codex_signed_in must be true)"
echo
echo "First time only:"
echo "  1. Add secrets to $APP/backend/.env (NEATLOGS_API_KEY, NEATLOGS_ORG_ID, NEATLOGS_PROJECT_ID, MCP_API_TOKEN)."
echo "  2. Sign the agents in to the ChatGPT plan:  codex login --device-auth"
echo "  3. sudo systemctl restart disputepro-api"
echo "Operator reset token: grep OPERATOR_TOKEN $APP/backend/.env"
