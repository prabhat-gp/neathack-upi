import asyncio
"""HTTP adapters to the counterparties. In the sandbox these resolve to /sandbox/*; in a bank, set
CBS_URL / NPCI_URL / BENE_URL / ACQUIRER_URL / NCRP_URL to the bank's integration endpoints."""

import time

import httpx

import config
import tracing

from .run import Run

PARTIES = {
    "cbs": {"label": "Sahyadri Bank CBS", "role": "Remitter bank · core banking & ledger"},
    "npci": {"label": "NPCI UPI switch", "role": "Transaction status · UDIR disputes"},
    "bene": {"label": "Beneficiary bank", "role": "Credit confirmation · account risk · lien"},
    "acquirer": {"label": "Merchant acquirer", "role": "Merchant orders · refunds"},
    "ncrp": {"label": "NCRP portal", "role": "National cybercrime reporting"},
    "crustdata": {"label": "Crustdata (MCP)", "role": "Live web, company & people intelligence"},
}

_client = httpx.AsyncClient(timeout=15)


class PartyError(Exception):
    def __init__(self, party: str, status: int, body):
        super().__init__(f"{PARTIES[party]['label']} returned {status}: {body}")
        self.party, self.status, self.body = party, status, body


async def call(run: Run, node: str, party: str, method: str, path: str, *, title: str,
               params: dict | None = None, body: dict | None = None, summarize=None) -> dict:
    with tracing.child(f"{PARTIES[party]['label']} · {method} {path}", "TOOL", inp={k: v for k, v in {"params": params, "body": body}.items() if v} or None,
                       **{"tool.name": f"{PARTIES[party]['label']}: {title}", "http.method": method, "http.route": path}) as sp:
        try:
            data = await _call(run, node, party, method, path, title=title, params=params, body=body, summarize=summarize)
        except PartyError as e:
            tracing.finish(sp, e.body, error=f"{PARTIES[party]['label']} returned {e.status}")
            raise
        tracing.finish(sp, data)
        return data


async def _call(run: Run, node: str, party: str, method: str, path: str, *, title: str,
                params: dict | None, body: dict | None, summarize) -> dict:
    url = config.PARTY_URLS[party] + path
    run.calls.append(party)
    shown = path + (("?" + "&".join(f"{k}={v}" for k, v in params.items())) if params else "")
    sid = await run.step(node, "call", title, f"{method} {shown}", status="running", party=party,
                         http={"method": method, "path": shown, "body": body}, pause=0.9)
    for attempt in (1, 2):  # one retry with backoff on gateway errors; idempotent on the counterparty side
        t0 = time.monotonic()
        try:
            resp = await _client.request(method, url, params=params, json=body)
        except httpx.TimeoutException:
            resp = httpx.Response(504, json={"detail": f"{PARTIES[party]['label']} did not respond in time"})
        latency = int((time.monotonic() - t0) * 1000)
        if resp.status_code < 500 or attempt == 2:
            break
        detail = (resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}).get("detail", resp.text)
        await run.update(sid, "warn", pause=0.3, result=f"HTTP {resp.status_code} · {detail} · retrying in 1.5s",
                         http={"status": resp.status_code, "latency_ms": latency})
        await asyncio.sleep(1.5)
        sid = await run.step(node, "call", f"{title} (retry)", f"{method} {shown}", status="running", party=party,
                             http={"method": method, "path": shown, "body": body}, pause=0.3)
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
