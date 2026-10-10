"""Crustdata, called through its hosted MCP server (`execute` runs a short script against Crustdata's tools).

Used by the Investigator for outside intelligence: public reports of a scam pattern (live web search) and whether
a merchant is a registered company. Each call shows up in the console as a Crustdata party call and in neatlogs as a
TOOL span, with the credits Crustdata reports.
"""

import json
import time

import httpx

import config
import tracing

from .run import Run

_client = httpx.AsyncClient(timeout=60)


class CrustdataError(Exception):
    pass


async def _execute(code: str) -> dict:
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "execute", "arguments": {"code": code}}}
    r = await _client.post(config.CRUSTDATA_MCP_URL, json=body, headers={
        "Authorization": f"Bearer {config.CRUSTDATA_API_KEY}", "accept": "application/json, text/event-stream"})
    r.raise_for_status()
    msg = next((json.loads(l[6:]) for l in r.text.splitlines() if l.startswith("data: ")), None) or r.json()
    res = msg.get("result") or {}
    text = (res.get("content") or [{}])[0].get("text", "")
    if res.get("isError"):
        raise CrustdataError(text[:300])
    out = json.loads(text)
    if not out.get("ok"):
        raise CrustdataError(str(out)[:300])
    return out


async def _call(run: Run, node: str, title: str, tool: str, params: dict, code: str, summarize) -> dict:
    if not config.CRUSTDATA_API_KEY:
        return {"error": "Crustdata is not configured"}
    run.calls.append("crustdata")
    sid = await run.step(node, "call", title, f"MCP execute → {tool}", status="running", party="crustdata",
                         http={"method": "MCP", "path": f"execute · {tool}", "body": params}, pause=0.6)
    t0 = time.monotonic()
    with tracing.child(f"Crustdata: {title}", "TOOL", inp=params, **{"tool.name": f"crustdata.{tool}"}) as sp:
        try:
            out = await _execute(code)
        except (CrustdataError, httpx.HTTPError) as e:
            tracing.finish(sp, error=str(e))
            await run.update(sid, "bad", result=f"Crustdata error: {e}", http={"status": "error", "latency_ms": int((time.monotonic() - t0) * 1000)})
            return {"error": str(e)}
        value, credits = out.get("value"), (out.get("credits") or {}).get("credits")
        tracing.finish(sp, {"value": value, "credits": credits})
    text, tone = summarize(value)
    await run.update(sid, tone, result=text + (f" · {credits} credit" if credits else " · free"), data={"value": value, "credits": credits},
                     http={"status": 200, "latency_ms": int((time.monotonic() - t0) * 1000)})
    return {"results": value, "credits_used": credits}


async def scam_intel_search(run: Run, node: str, a: dict) -> dict:
    q = a["query"][:200]
    code = f"""// model query: public reports of a UPI scam pattern for a dispute investigation
const r = await callTool("web_search_live", {{query: {json.dumps(q)}}});
return ((r.data && r.data.results) || []).slice(0, 5).map(x => ({{title: x.title, url: x.url, snippet: (x.snippet || "").slice(0, 220)}}));"""
    return await _call(run, node, "Search the web for this scam pattern", "web_search_live", {"query": q}, code,
                       lambda v: ((f"{len(v)} public report(s): {v[0]['title'][:70]}" if v else "No public reports found"),
                                  "warn" if v else "info"))


async def verify_merchant(run: Run, node: str, a: dict) -> dict:
    name = a["name"][:120]
    code = f"""// model query: is this merchant a registered company
const r = await callTool("company_identify", {{names: [{json.dumps(name)}]}});
const rows = (r.data && (r.data.results || r.data)) || [];
return (Array.isArray(rows) ? rows : [rows]).slice(0, 3);"""
    return await _call(run, node, "Check merchant in company registry data", "company_identify", {"name": name}, code,
                       lambda v: ((f"{len(v)} match(es) for “{name}”" if v else f"No registered company found for “{name}”"), "ok" if v else "info"))
