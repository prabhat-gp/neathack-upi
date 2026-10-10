"""Agent loop on the Claude Agent SDK (Claude Code token).

Our tools are served to the model from an in-process MCP server, so every tool call still goes through
the same party adapters and shows up in the run. The Investigator also gets Crustdata's hosted MCP server
for live web / company lookups; those calls are surfaced in the run as Crustdata party calls.
"""

import json
import tempfile
import time

import config

from .run import Run
from .tools import Tool

OURS = "dp"  # in-process MCP server name -> tools are exposed as mcp__dp__<name>


class AgentError(Exception):
    pass


def _text(out) -> str:
    return json.dumps(out, default=str)[:6000]


def _wrap(run: Run, node: str, t: Tool, submit: str, validate, box: dict):
    from claude_agent_sdk import tool

    async def handler(args: dict):
        if t.name == submit:
            problem = validate(args) if validate else None
            if problem:
                await run.step(node, "guard", "Submission bounced", problem, status="warn", pause=0.4)
                return {"content": [{"type": "text", "text": problem}], "is_error": True}
            box["result"] = args
            return {"content": [{"type": "text", "text": "Submitted. Stop here."}]}
        if not t.fn:
            return {"content": [{"type": "text", "text": f"Unknown tool {t.name}"}], "is_error": True}
        try:
            return {"content": [{"type": "text", "text": _text(await t.fn(run, node, args))}]}
        except Exception as e:  # surfaced to the model so it can recover
            return {"content": [{"type": "text", "text": _text({"error": str(e)})}], "is_error": True}

    return tool(t.name, t.description, t.schema)(handler)


async def run_agent_sdk(run: Run, node: str, system: str, tools: list[Tool], task: str, submit: str,
                        validate=None, external: bool = False) -> dict:
    from claude_agent_sdk import (AssistantMessage, ClaudeAgentOptions, ResultMessage, StreamEvent, ToolResultBlock,
                                  UserMessage, create_sdk_mcp_server, query)

    box: dict = {}
    servers: dict = {OURS: create_sdk_mcp_server(OURS, tools=[_wrap(run, node, t, submit, validate, box) for t in tools])}
    allowed = [f"mcp__{OURS}__{t.name}" for t in tools]
    if external and config.CRUSTDATA_API_KEY:
        servers["crustdata"] = {"type": "http", "url": config.CRUSTDATA_MCP_URL,
                                "headers": {"Authorization": f"Bearer {config.CRUSTDATA_API_KEY}"}}
        allowed.append("mcp__crustdata")

    opts = ClaudeAgentOptions(
        system_prompt=system, model=config.AGENT_MODEL, mcp_servers=servers, tools=[], allowed_tools=allowed,
        permission_mode="bypassPermissions", max_turns=config.LLM_MAX_TURNS * 2, include_partial_messages=True,
        setting_sources=[], cwd=tempfile.gettempdir(),  # never load this repo's hooks/settings into the agent
        env={"CLAUDE_CODE_OAUTH_TOKEN": config.CLAUDE_CODE_OAUTH_TOKEN, "ANTHROPIC_API_KEY": ""},
    )

    turn, tid, think_id, t0 = 0, None, None, 0.0
    usage = {"in": 0, "out": 0}
    ext_calls: dict[str, tuple[str, float]] = {}  # tool_use_id -> (step id, start)

    async for msg in query(prompt=task, options=opts):
        if isinstance(msg, StreamEvent):
            ev = msg.event
            et = ev.get("type")
            if et == "message_start":
                turn += 1
                t0, think_id = time.monotonic(), None
                u = ev.get("message", {}).get("usage", {})
                usage = {"in": u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0),
                         "out": u.get("output_tokens", 0)}
                tid = await run.step(node, "turn", f"Turn {turn}", config.AGENT_MODEL, status="running", pause=0)
            elif et == "content_block_start" and ev["content_block"].get("type") == "tool_use":
                name = ev["content_block"]["name"].split("__")[-1]
                await run.step(node, "decision", f"Chose {name}", None, status="info", pause=0)
            elif et == "content_block_delta" and ev["delta"].get("type") == "text_delta":
                if think_id is None:
                    think_id = await run.step(node, "think", "Reasoning", "", status="running", streamed=True, pause=0)
                await run.emit("step_delta", id=think_id, text=ev["delta"]["text"])
            elif et == "message_delta":
                usage["out"] = ev.get("usage", {}).get("output_tokens", usage["out"])
            elif et == "message_stop" and tid:
                if think_id:
                    await run.update(think_id, "ok")
                await run.add_usage(node, usage["in"], usage["out"])
                await run.update(tid, "ok", result=f"{time.monotonic() - t0:.1f}s · {usage['in'] + usage['out']:,} tokens")
                tid = None
        elif isinstance(msg, AssistantMessage):
            for b in msg.content:  # external MCP calls never pass through our handlers; show them as party calls
                if getattr(b, "name", "").startswith("mcp__crustdata__"):
                    run.calls.append("crustdata")
                    label = b.name.removeprefix("mcp__crustdata__").replace("_", " ")
                    sid = await run.step(node, "call", f"Crustdata · {label}", None, status="running", party="crustdata",
                                         http={"method": "MCP", "path": b.name.removeprefix("mcp__crustdata__"), "body": b.input}, pause=0)
                    ext_calls[b.id] = (sid, time.monotonic())
        elif isinstance(msg, UserMessage) and isinstance(msg.content, list):
            for b in msg.content:
                if isinstance(b, ToolResultBlock) and b.tool_use_id in ext_calls:
                    sid, start = ext_calls.pop(b.tool_use_id)
                    raw = b.content if isinstance(b.content, str) else " ".join(c.get("text", "") for c in b.content or [])
                    await run.update(sid, "bad" if b.is_error else "ok", result=(raw[:140] or "No results"),
                                     data={"result": raw[:4000]},
                                     http={"status": "error" if b.is_error else 200, "latency_ms": int((time.monotonic() - start) * 1000)})
        if isinstance(msg, ResultMessage):
            run.cost_usd += msg.total_cost_usd or 0.0
        if isinstance(msg, ResultMessage) and msg.is_error and "result" not in box:
            raise AgentError(f"{node}: {msg.result or msg.subtype}")
        if "result" in box and isinstance(msg, ResultMessage):
            break

    if "result" not in box:
        raise AgentError(f"{node} did not call {submit}")
    return box["result"]
