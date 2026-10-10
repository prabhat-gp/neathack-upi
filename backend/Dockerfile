FROM python:3.13-slim
# Codex CLI: the agents' model runtime, signed in to our ChatGPT plan once per server (see README "Deploy").
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm ca-certificates && \
    npm install -g @openai/codex && apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8000 CODEX_HOME=/data/codex LEDGER_PATH=/data/ledger.db
RUN mkdir -p /data/codex
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
