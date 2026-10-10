"""Agent loop on OpenAI Codex, authenticated with the user's ChatGPT plan (`codex login`), no API key.

Each agent is one Codex session (`codex exec --json`). Our tools reach the model through a per-agent MCP endpoint
(agent_mcp.py). Codex's JSONL events become console steps (turns, reasoning, tool choices, token usage) and neatlogs
LLM spans. If the model stops without submitting, the same session is resumed and told to submit.
"""

import asyncio
import json
import os
import tempfile
import time

import agent_mcp
import config
import tracing

from .run import Run
from .tools import Tool


class AgentError(Exception):
    pass


GROUND_RULES = """You are running inside DisputePro as one agent of a multi-agent desk.
Use ONLY the MCP tools provided (server "disputepro"). Do not run shell commands, read files or browse.
Before each batch of tool calls, write one or two sentences of reasoning. Finish by calling {submit} exactly once."""

NUDGE = ("You stopped without calling {submit}. Your work is not recorded until you do. Call {submit} now with your "
         "conclusion from the evidence you already gathered.")
MAX_NUDGES = 2


def _cmd(sid: str, resume: str | None) -> list[str]:
    url = f"http://127.0.0.1:{config.PORT}/agent-mcp/{sid}"
    opts = ["--json", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "-m", config.CODEX_MODEL,
            "-c", f'model_reasoning_effort="{config.CODEX_REASONING_EFFORT}"', "-c", 'model_reasoning_summary="concise"',
            "-c", 'sandbox_mode="read-only"',
            "-c", f'mcp_servers.disputepro.url="{url}"', "-c", "mcp_servers.disputepro.tool_timeout_sec=90",
            "-c", 'mcp_servers.disputepro.default_tools_approval_mode="approve"',  # our tools enforce their own guardrails
            "--disable", "browser_use", "--disable", "computer_use", "--disable", "apps"]
    if resume:
        return [config.CODEX_BIN, "exec", "resume", *opts, resume, "-"]
    return [config.CODEX_BIN, "exec", *opts, "-C", tempfile.gettempdir(), "-"]  # prompt on stdin


async def run_agent_codex(run: Run, node: str, system: str, tools: list[Tool], task: str, submit: str,
                          validate=None) -> dict:
    parent = tracing.current_context()  # the AGENT span; tool calls and LLM turns hang under it
    sid, box = agent_mcp.open_session(run, node, tools, submit, validate, parent)
    prompt = f"{system}\n\n{GROUND_RULES.format(submit=submit)}\n\n---\n{task}"
    env = {**os.environ}
    env.pop("OPENAI_API_KEY", None)  # always the ChatGPT login, never an API key
    state = {"turn": 0, "thread": None}
    errors: list[str] = []
    try:
        await _session(run, node, sid, None, prompt, env, box, parent, state, errors)
        for _ in range(MAX_NUDGES):
            if "result" in box or not state["thread"]:
                break
            await run.step(node, "guard", f"No {submit} yet", "The model stopped early; resuming its session to finish.",
                           status="warn", pause=0.3)
            await _session(run, node, sid, state["thread"], NUDGE.format(submit=submit), env, box, parent, state, errors)
    finally:
        agent_mcp.close_session(sid)
    if "result" not in box:
        raise AgentError(f"{node} did not call {submit}: {' | '.join(errors) or 'no submission'}")
    return box["result"]


async def _session(run: Run, node: str, sid: str, resume: str | None, prompt: str, env: dict, box: dict, parent,
                   state: dict, errors: list[str]) -> None:
    proc = await asyncio.create_subprocess_exec(*_cmd(sid, resume), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE, env=env, limit=8 * 1024 * 1024)
    proc.stdin.write(prompt.encode())
    await proc.stdin.drain()
    proc.stdin.close()
    tid, t0, t0_ns, said, first = None, 0.0, 0, [], True
    try:
        async for raw in proc.stdout:
            try:
                ev = json.loads(raw)
            except ValueError:
                continue
            et, item = ev.get("type"), ev.get("item") or {}
            it = item.get("type")
            if et == "thread.started":
                state["thread"] = ev.get("thread_id")
            elif et == "turn.started":
                state["turn"] += 1
                t0, t0_ns, said = time.monotonic(), time.time_ns(), []
                tid = await run.step(node, "turn", f"Turn {state['turn']}", config.CODEX_MODEL, status="running", pause=0)
            elif et == "item.started" and it == "mcp_tool_call":
                await run.step(node, "decision", f"Chose {item.get('tool', '')}", None, status="info", pause=0)
            elif et == "item.completed" and it in ("reasoning", "agent_message") and item.get("text", "").strip():
                text = item["text"].strip()
                said.append(text)
                headline_only = text.startswith("**") and text.endswith("**") and "\n" not in text  # summary title, no content
                if not headline_only and not (it == "agent_message" and "result" in box):
                    await run.step(node, "think", "Reasoning", text, status="ok", pause=0)
            elif et == "item.started" and it == "command_execution":
                await run.step(node, "guard", "Ignored a shell command", item.get("command", ""), status="warn", pause=0)
            elif et == "turn.completed":
                u = ev.get("usage") or {}
                inp, out = u.get("input_tokens", 0), u.get("output_tokens", 0) + u.get("reasoning_output_tokens", 0)
                await run.add_usage(node, inp, out)
                tracing.llm_turn(parent, t0_ns, time.time_ns(), agent=node, turn=state["turn"], model=config.CODEX_MODEL,
                                 prompt=prompt if first else None, output="\n\n".join(said), input_tokens=inp, output_tokens=out,
                                 cached=u.get("cached_input_tokens", 0), reasoning=u.get("reasoning_output_tokens", 0))
                first = False
                if tid:
                    await run.update(tid, "ok", result=f"{time.monotonic() - t0:.1f}s · {inp + out:,} tokens")
            elif et in ("turn.failed", "error"):
                errors.append(str(ev.get("error", ev.get("message", ev)))[:300])
        await proc.wait()
        if proc.returncode and not errors:
            errors.append((await proc.stderr.read()).decode(errors="ignore")[-300:])
    finally:
        if proc.returncode is None:
            proc.kill()
