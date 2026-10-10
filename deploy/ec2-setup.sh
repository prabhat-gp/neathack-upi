#!/bin/bash
# One-time setup on a fresh Ubuntu 24.04 EC2 instance (t3.small is enough). Run as the ubuntu user:
#   curl -fsSL https://raw.githubusercontent.com/prabhat-gp/neathack-upi/main/deploy/ec2-setup.sh | BRANCH=main bash
# Then: put backend/.env in place, run `codex login --device-auth` once, and `sudo systemctl restart disputepro-api`.
set -euo pipefail
BRANCH="${BRANCH:-main}"
APP=/home/ubuntu/neathack-upi
PUBLIC_IP=$(curl -fsS http://checkip.amazonaws.com)

sudo apt-get update -y
sudo apt-get install -y git python3-venv python3-pip curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g @openai/codex

[ -d "$APP" ] || git clone -b "$BRANCH" https://github.com/prabhat-gp/neathack-upi.git "$APP"
cd "$APP" && git fetch && git checkout "$BRANCH" && git pull

cd "$APP/backend"
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env

cd "$APP/frontend"
npm ci
NEXT_PUBLIC_API_URL="http://$PUBLIC_IP:8000" npm run build

sudo tee /etc/systemd/system/disputepro-api.service >/dev/null <<EOF
[Unit]
Description=DisputePro API and agents
After=network.target
[Service]
User=ubuntu
WorkingDirectory=$APP/backend
Environment=PATH=/usr/bin:/usr/local/bin:$APP/backend/.venv/bin
ExecStart=$APP/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
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
ExecStart=/usr/bin/npm start -- -p 3000
Restart=always
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now disputepro-api disputepro-web
echo
echo "Web:  http://$PUBLIC_IP:3000      API: http://$PUBLIC_IP:8000/health"
echo "Next: edit $APP/backend/.env (keys + PUBLIC_BASE_URL=http://$PUBLIC_IP:8000), run 'codex login --device-auth',"
echo "      then 'sudo systemctl restart disputepro-api'."
