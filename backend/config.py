import os


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
LLM_MAX_TURNS = int(os.environ.get("LLM_MAX_TURNS", "8"))

# Where agents reach the counterparties. Defaults to the bundled sandbox; point these at real adapters in a bank.
PARTY_BASE_URL = os.environ.get("PARTY_BASE_URL", f"http://127.0.0.1:{PORT}/sandbox")
PARTY_URLS = {p: os.environ.get(f"{p.upper()}_URL", f"{PARTY_BASE_URL}/{p}") for p in ("cbs", "npci", "bene", "acquirer", "ncrp")}

AUTO_APPROVE_LIMIT_PAISE = int(os.environ.get("AUTO_APPROVE_LIMIT_PAISE", str(10_000_00)))
NEATLOGS_API_KEY = os.environ.get("NEATLOGS_API_KEY", "")


def brain() -> str:
    has_aws = bool(BEDROCK_MODEL_ID and (os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_PROFILE")))
    if LLM_PROVIDER == "auto":
        if has_aws:
            return "bedrock"
        if ANTHROPIC_API_KEY:
            return "anthropic"
        return "rules"
    return LLM_PROVIDER


def brain_label() -> str:
    return {
        "bedrock": f"Claude on AWS Bedrock · {BEDROCK_MODEL_ID}",
        "anthropic": f"Claude · {ANTHROPIC_MODEL}",
        "rules": "Rules engine (no LLM credentials configured)",
    }[brain()]


def model_name() -> str | None:
    return {"bedrock": BEDROCK_MODEL_ID, "anthropic": ANTHROPIC_MODEL}.get(brain())
