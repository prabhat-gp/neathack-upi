"""Company research for DisputePro's go-to-market plan, never a fraud signal."""
import re
from datetime import datetime, timezone

import httpx
import config

ENDPOINT = "https://api.crustdata.com/company/identify"


async def identify_companies(domains: list[str], *, transport=None) -> dict:
    cleaned = list(dict.fromkeys(d.strip().lower() for d in domains))
    if not cleaned or len(cleaned) > 10 or any(not re.fullmatch(r"(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}", d) for d in cleaned):
        raise ValueError("Provide 1–10 company website domains, not URLs, emails or UPI addresses")
    if not config.CRUSTDATA_API_KEY:
        raise RuntimeError("Crustdata API key is not configured")
    async with httpx.AsyncClient(timeout=25, transport=transport) as client:
        response = await client.post(ENDPOINT, headers={"Authorization": f"Bearer {config.CRUSTDATA_API_KEY}",
                                      "x-api-version": "2025-11-01"}, json={"domains": cleaned, "exact_match": True})
    if response.status_code != 200:
        raise RuntimeError(f"Crustdata lookup failed (HTTP {response.status_code}); no company conclusion was made")
    raw = response.json()
    if not isinstance(raw, list):
        raise RuntimeError("Unexpected Crustdata response; no company conclusion was made")
    entries = []
    for domain in cleaned:
        entry = next((e for e in raw if e.get("matched_on", "").lower() == domain), {})
        matches = []
        for match in entry.get("matches", []):
            company = match.get("company_data", {})
            info = company.get("basic_info", {})
            matches.append({"company_id": company.get("crustdata_company_id") or info.get("crustdata_company_id"),
                            "confidence_score": match.get("confidence_score"),
                            **{k: info.get(k) for k in ("name", "primary_domain", "website", "employee_count_range", "industries")}})
        entries.append({"domain": domain, "status": "matched" if matches else "no_match", "candidates": matches})
    return {"provider": "Crustdata", "endpoint": ENDPOINT, "captured_at": datetime.now(timezone.utc).isoformat(),
            "purpose": "Target-bank research for business planning; not customer or merchant risk scoring",
            "limitations": ["Company matches are not customers, sales leads or evidence of buying intent.",
                            "No match is inconclusive and must never be treated as fraud.",
                            "Company size does not establish dispute volume or willingness to pay."],
            "companies": entries}
