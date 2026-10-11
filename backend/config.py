import json
import os
import shutil


def _load_dotenv(path: str) -> None:
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

PORT = int(os.environ.get("PORT", "8000"))

# Agent brain: "bedrock" | "anthropic" | "rules" | "auto" (auto picks the first one with credentials).
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "auto").lower()
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
# OpenAI Codex CLI signed in with a ChatGPT plan (`codex login`): agents run on the plan's usage, no API key.
CODEX_BIN = os.environ.get("CODEX_BIN") or shutil.which("codex") or "codex"
CODEX_HOME = os.environ.get("CODEX_HOME", os.path.expanduser("~/.codex"))
CODEX_MODEL = os.environ.get("CODEX_MODEL", "gpt-5.5")
CODEX_REASONING_EFFORT = os.environ.get("CODEX_REASONING_EFFORT", "low")


def codex_signed_in() -> bool:
    try:
        return shutil.which(CODEX_BIN) is not None and json.load(open(os.path.join(CODEX_HOME, "auth.json"))).get("auth_mode") == "chatgpt"
    except (OSError, ValueError):
        return False

LLM_MAX_TURNS = int(os.environ.get("LLM_MAX_TURNS", "8"))

# Where agents reach the counterparties. Defaults to the bundled sandbox; point these at real adapters in a bank.
PARTY_BASE_URL = os.environ.get("PARTY_BASE_URL", f"http://127.0.0.1:{PORT}/sandbox")
PARTY_URLS = {p: os.environ.get(f"{p.upper()}_URL", f"{PARTY_BASE_URL}/{p}") for p in ("cbs", "npci", "bene", "acquirer", "ncrp")}

RUNS_PER_VISITOR_PER_HOUR = int(os.environ.get("RUNS_PER_VISITOR_PER_HOUR", "6"))
MAX_CONCURRENT_LLM_RUNS = int(os.environ.get("MAX_CONCURRENT_LLM_RUNS", "2"))

# DisputePro MCP (/mcp) bearer token: cfo.ai and Claude Code send it to read desk numbers
MCP_API_TOKEN = os.environ.get("MCP_API_TOKEN", "")

# Autopilot: how often a simulated customer writes in, and the hard cap per session (each case costs model usage)
AUTOPILOT_INTERVAL_SEC = int(os.environ.get("AUTOPILOT_INTERVAL_SEC", "120"))
AUTOPILOT_MAX_COMPLAINTS = int(os.environ.get("AUTOPILOT_MAX_COMPLAINTS", "10"))

AUTO_APPROVE_LIMIT_PAISE = int(os.environ.get("AUTO_APPROVE_LIMIT_PAISE", str(10_000_00)))
NEATLOGS_API_KEY = os.environ.get("NEATLOGS_API_KEY", "")
# Not secrets: used to link each run to its trace in the neatlogs dashboard
NEATLOGS_ORG_ID = os.environ.get("NEATLOGS_ORG_ID", "")
NEATLOGS_PROJECT_ID = os.environ.get("NEATLOGS_PROJECT_ID", "")


def brain() -> str:
    has_aws = bool(BEDROCK_MODEL_ID and (os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_PROFILE")))
    if LLM_PROVIDER == "auto":
        if codex_signed_in():
            return "codex"
        if has_aws:
            return "bedrock"
        if ANTHROPIC_API_KEY:
            return "anthropic"
        return "rules"
    return LLM_PROVIDER


def brain_label() -> str:
    return {
        "codex": f"OpenAI {CODEX_MODEL} via Codex · ChatGPT plan",
        "bedrock": f"Claude on AWS Bedrock · {BEDROCK_MODEL_ID}",
        "anthropic": f"Claude · {ANTHROPIC_MODEL}",
        "rules": "Rules engine (no LLM credentials configured)",
    }[brain()]


def model_name() -> str | None:
    return {"codex": CODEX_MODEL, "bedrock": BEDROCK_MODEL_ID, "anthropic": ANTHROPIC_MODEL}.get(brain())

# Server-only company research; never exposed in client assets or evidence files.
CRUSTDATA_API_KEY = os.environ.get("CRUSTDATA_API_KEY", "")
