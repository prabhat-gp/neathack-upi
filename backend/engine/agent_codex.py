"""Agent loop on OpenAI Codex, authenticated with the user's ChatGPT plan (`codex login`), no API key.

Each agent is one `codex exec --json` session. Our tools reach the model through a per-agent MCP endpoint
(agent_mcp.py); Crustdata's hosted MCP server is added for the Investigator. Codex's JSONL events are turned
into console steps: turns, reasoning, tool choices, external MCP calls and token usage.
"""

import asyncio
import json
import os
import tempfile
import time

import agent_mcp
import config

from .run import Run
from .tools import Tool


class AgentError(Exception):
    pass


GROUND_RULES = """You are running inside DisputePro as one agent of a multi-agent desk.
Use ONLY the MCP tools provided (server "disputepro"{extra}). Do not run shell commands, read files or browse.
Before each batch of tool calls, write one or two sentences of reasoning. Finish by calling {submit} exactly once."""


def _cmd(sid: str, system: str, external: bool) -> list[str]:
    url = f"http://127.0.0.1:{config.PORT}/agent-mcp/{sid}"
    c = [config.CODEX_BIN, "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
         "-s", "read-only", "-C", tempfile.gettempdir(), "-m", config.CODEX_MODEL,
         "-c", f'model_reasoning_effort="{config.CODEX_REASONING_EFFORT}"',
         "-c", 'model_reasoning_summary="concise"',
         "-c", f'mcp_servers.disputepro.url="{url}"', "-c", "mcp_servers.disputepro.tool_timeout_sec=90",
         "-c", 'mcp_servers.disputepro.default_tools_approval_mode="approve"',  # our tools enforce their own guardrails
         "--disable", "browser_use", "--disable", "computer_use", "--disable", "apps"]
    if external:
        c += ["-c", f'mcp_servers.crustdata.url="{config.CRUSTDATA_MCP_URL}"',
              "-c", 'mcp_servers.crustdata.bearer_token_env_var="CRUSTDATA_API_KEY"', "-c", "mcp_servers.crustdata.tool_timeout_sec=60",
              "-c", 'mcp_servers.crustdata.default_tools_approval_mode="approve"']
    return c + ["-"]  # prompt on stdin


async def run_agent_codex(run: Run, node: str, system: str, tools: list[Tool], task: str, submit: str,
                          validate=None, external: bool = False) -> dict:
    external = external and bool(config.CRUSTDATA_API_KEY)
    sid, box = agent_mcp.open_session(run, node, tools, submit, validate)
    rules = GROUND_RULES.format(extra=' and "crustdata" for outside intelligence' if external else "", submit=submit)
    prompt = f"{system}\n\n{rules}\n\n---\n{task}"
    env = {**os.environ, "CRUSTDATA_API_KEY": config.CRUSTDATA_API_KEY}
    env.pop("OPENAI_API_KEY", None)  # always the ChatGPT login, never an API key

    proc = await asyncio.create_subprocess_exec(*_cmd(sid, system, external), stdin=asyncio.subprocess.PIPE,
                                                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                                                env=env, limit=8 * 1024 * 1024)
    proc.stdin.write(prompt.encode())
    await proc.stdin.drain()
    proc.stdin.close()

    turn, tid, t0 = 0, None, 0.0
    ext: dict[str, tuple[str, float]] = {}
    errors: list[str] = []
    try:
        async for raw in proc.stdout:
            try:
                ev = json.loads(raw)
            except ValueError:
                continue
            et, item = ev.get("type"), ev.get("item") or {}
            it = item.get("type")
            if et == "turn.started":
                turn += 1
                t0 = time.monotonic()
                tid = await run.step(node, "turn", f"Turn {turn}", config.CODEX_MODEL, status="running", pause=0)
            elif et == "item.started" and it == "mcp_tool_call":
                server, name = item.get("server", ""), item.get("tool", "")
                await run.step(node, "decision", f"Chose {name}", None, status="info", pause=0)
                if server == "crustdata":
                    run.calls.append("crustdata")
                    ext[item["id"]] = (await run.step(node, "call", f"Crustdata · {name.replace('_', ' ')}", None, status="running",
                                                      party="crustdata", http={"method": "MCP", "path": name, "body": item.get("arguments")},
                                                      pause=0), time.monotonic())
            elif et == "item.completed" and it == "mcp_tool_call" and item.get("id") in ext:
                sid_, start = ext.pop(item["id"])
                res, err = item.get("result") or {}, item.get("error")
                text = " ".join(c.get("text", "") for c in (res.get("content") or []) if isinstance(c, dict)) if isinstance(res, dict) else str(res)
                await run.update(sid_, "bad" if err else "ok", result=(str(err or text)[:140] or "No results"), data={"result": text[:4000]},
                                 http={"status": "error" if err else 200, "latency_ms": int((time.monotonic() - start) * 1000)})
            elif et == "item.completed" and it in ("reasoning", "agent_message") and item.get("text", "").strip():
                text = item["text"].strip()
                headline_only = text.startswith("**") and text.endswith("**") and "\n" not in text  # summary title, no content
                if not headline_only and not (it == "agent_message" and "result" in box):
                    await run.step(node, "think", "Reasoning", text, status="ok", pause=0)
            elif et == "item.started" and it == "command_execution":
                await run.step(node, "guard", "Ignored a shell command", item.get("command", ""), status="warn", pause=0)
            elif et == "turn.completed":
                u = ev.get("usage") or {}
                inp, out = u.get("input_tokens", 0), u.get("output_tokens", 0) + u.get("reasoning_output_tokens", 0)
                await run.add_usage(node, inp, out)
                if tid:
                    await run.update(tid, "ok", result=f"{time.monotonic() - t0:.1f}s · {inp + out:,} tokens")
            elif et in ("turn.failed", "error"):
                errors.append(str(ev.get("error", ev.get("message", ev)))[:300])
        await proc.wait()
    finally:
        if proc.returncode is None:
            proc.kill()
        agent_mcp.close_session(sid)

    if "result" not in box:
        err = errors or [(await proc.stderr.read()).decode(errors="ignore")[-300:]]
        raise AgentError(f"{node} did not call {submit}: {' | '.join(e for e in err if e) or 'no submission'}")
    return box["result"]
