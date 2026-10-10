"""HTTP adapters to the counterparties. In the sandbox these resolve to /sandbox/*; in a bank, set
CBS_URL / NPCI_URL / BENE_URL / ACQUIRER_URL / NCRP_URL to the bank's integration endpoints."""

import time

import httpx

import config

from .run import Run

PARTIES = {
    "cbs": {"label": "Sahyadri Bank CBS", "role": "Remitter bank · core banking & ledger"},
    "npci": {"label": "NPCI UPI switch", "role": "Transaction status · UDIR disputes"},
    "bene": {"label": "Beneficiary bank", "role": "Credit confirmation · account risk · lien"},
    "acquirer": {"label": "Merchant acquirer", "role": "Merchant orders · refunds"},
    "ncrp": {"label": "NCRP portal", "role": "National cybercrime reporting"},
}

_client = httpx.AsyncClient(timeout=15)


class PartyError(Exception):
    def __init__(self, party: str, status: int, body):
        super().__init__(f"{PARTIES[party]['label']} returned {status}: {body}")
        self.party, self.status, self.body = party, status, body


async def call(run: Run, node: str, party: str, method: str, path: str, *, title: str,
               params: dict | None = None, body: dict | None = None, summarize=None) -> dict:
    url = config.PARTY_URLS[party] + path
    run.calls.append(party)
    shown = path + (("?" + "&".join(f"{k}={v}" for k, v in params.items())) if params else "")
    sid = await run.step(node, "call", title, f"{method} {shown}", status="running", party=party,
                         http={"method": method, "path": shown, "body": body}, pause=0.9)
    t0 = time.monotonic()
    resp = await _client.request(method, url, params=params, json=body)
    latency = int((time.monotonic() - t0) * 1000)
    try:
        data = resp.json()
    except ValueError:
        data = {"raw": resp.text}
    ok = resp.status_code < 400
    summary = (summarize(data) if summarize and ok else None) or (f"HTTP {resp.status_code}" if ok else str(data.get("detail", data)))
    tone = summary[1] if isinstance(summary, tuple) else ("ok" if ok else "bad")
    text = summary[0] if isinstance(summary, tuple) else summary
    await run.update(sid, tone, pause=0.5, result=text, data=data, http={"status": resp.status_code, "latency_ms": latency})
    if not ok:
        raise PartyError(party, resp.status_code, data)
    return data
