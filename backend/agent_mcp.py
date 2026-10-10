"""Per-agent MCP endpoint (Streamable HTTP, JSON responses).

Each agent turn gets its own session URL, /agent-mcp/<sid>, serving exactly that agent's tools bound to its run.
The Codex CLI connects to it as an MCP server, so every tool call the model makes runs through our party
adapters and guardrails and appears in the console like any other step.
"""

import json
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

import tracing

router = APIRouter()
SESSIONS: dict[str, dict] = {}


def open_session(run, node: str, tools: list, submit: str, validate, parent=None) -> tuple[str, dict]:
    sid = uuid.uuid4().hex
    box: dict = {}
    SESSIONS[sid] = {"run": run, "node": node, "tools": {t.name: t for t in tools}, "submit": submit, "validate": validate,
                     "box": box, "parent": parent}
    return sid, box


def close_session(sid: str) -> None:
    SESSIONS.pop(sid, None)


def _ok(id_, result):
    return {"jsonrpc": "2.0", "id": id_, "result": result}


def _text(out, is_error=False):
    return {"content": [{"type": "text", "text": json.dumps(out, default=str)[:6000] if not isinstance(out, str) else out}],
            "isError": is_error}


async def _call(s: dict, name: str, args: dict) -> dict:
    kind = "GUARDRAIL" if name == s["submit"] and s["validate"] else "TOOL"
    with tracing.child(name, kind, parent=s["parent"], inp=args, **{"tool.name": name}) as sp:
        res = await _call_tool(s, name, args)
        tracing.finish(sp, res["content"][0]["text"], error=res["content"][0]["text"] if res["isError"] else None)
        return res


async def _call_tool(s: dict, name: str, args: dict) -> dict:
    run, node = s["run"], s["node"]
    if name == s["submit"]:
        problem = s["validate"](args) if s["validate"] else None
        if problem:
            await run.step(node, "guard", "Submission bounced", problem, status="warn", pause=0.4)
            return _text(problem, True)
        s["box"]["result"] = args
        return _text("Submitted. Your work on this case is done; reply with one short line and stop.")
    t = s["tools"].get(name)
    if not t or not t.fn:
        return _text(f"Unknown tool {name}", True)
    try:
        return _text(await t.fn(run, node, args))
    except Exception as e:  # surfaced to the model so it can recover
        return _text({"error": str(e)}, True)


@router.post("/agent-mcp/{sid}")
async def agent_mcp(sid: str, request: Request):
    s = SESSIONS.get(sid)
    if not s:
        return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "Session closed"}}, status_code=404)
    msg = await request.json()
    if isinstance(msg, list):  # batches are not used by current clients; answer each
        return JSONResponse([await _handle(s, m) for m in msg if "id" in m])
    if "id" not in msg:  # notification
        return Response(status_code=202)
    return JSONResponse(await _handle(s, msg), headers={"Mcp-Session-Id": sid})


async def _handle(s: dict, msg: dict) -> dict:
    m, id_, p = msg.get("method"), msg.get("id"), msg.get("params") or {}
    if m == "initialize":
        return _ok(id_, {"protocolVersion": p.get("protocolVersion", "2025-06-18"), "capabilities": {"tools": {}},
                         "serverInfo": {"name": "disputepro-agent-tools", "version": "1.0"}})
    if m == "ping":
        return _ok(id_, {})
    if m == "tools/list":
        return _ok(id_, {"tools": [{"name": t.name, "description": t.description, "inputSchema": t.schema} for t in s["tools"].values()]})
    if m == "tools/call":
        return _ok(id_, await _call(s, p.get("name", ""), p.get("arguments") or {}))
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": -32601, "message": f"Method not found: {m}"}}
