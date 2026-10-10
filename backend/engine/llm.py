"""Tool-using agent loop on Claude (AWS Bedrock or Anthropic API)."""

import asyncio
import json
import time

import config

from .run import Run
from .tools import Tool

_client = None


def client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic, AsyncAnthropicBedrock

        if config.brain() == "bedrock":
            _client = AsyncAnthropicBedrock(aws_region=config.AWS_REGION)
        else:
            _client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


def model() -> str:
    return config.BEDROCK_MODEL_ID if config.brain() == "bedrock" else config.ANTHROPIC_MODEL


class AgentError(Exception):
    pass


async def _streamed_turn(run: Run, node: str, system: str, tools: list[Tool], messages: list[dict], turn: int):
    """One model call, streamed: reasoning text appears token by token, tool choices as the model makes them."""
    t0 = time.monotonic()
    tid = await run.step(node, "turn", f"Turn {turn}", model(), status="running")
    think_id = None
    async with client().messages.stream(model=model(), max_tokens=2000, system=system,
                                        tools=[t.spec() for t in tools], messages=messages) as stream:
        async for ev in stream:
            if ev.type == "text":
                if think_id is None:
                    think_id = await run.step(node, "think", "Reasoning", "", status="running", streamed=True)
                await run.emit("step_delta", id=think_id, text=ev.text)
            elif ev.type == "content_block_start" and ev.content_block.type == "tool_use":
                await run.step(node, "decision", f"Chose {ev.content_block.name}", None, status="info")
        resp = await stream.get_final_message()
    if think_id:
        await run.update(think_id, "ok")
    await run.add_usage(node, resp.usage.input_tokens, resp.usage.output_tokens)
    await run.update(tid, "ok", result=f"{time.monotonic() - t0:.1f}s · {resp.usage.input_tokens + resp.usage.output_tokens:,} tokens")
    return resp


async def run_agent(run: Run, node: str, system: str, tools: list[Tool], task: str, submit: str,
                    validate=None) -> dict:
    """Loop until the agent calls its submit tool. `validate(input) -> str | None` can bounce a bad submission."""
    if config.brain() == "codex":
        from .agent_codex import run_agent_codex
        return await run_agent_codex(run, node, system, tools, task, submit, validate)
    by_name = {t.name: t for t in tools}
    messages: list[dict] = [{"role": "user", "content": task}]
    for turn in range(1, config.LLM_MAX_TURNS + 1):
        resp = await _streamed_turn(run, node, system, tools, messages, turn)
        messages.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in resp.content]})

        uses = [b for b in resp.content if b.type == "tool_use"]
        if not uses:
            messages.append({"role": "user", "content": f"Continue. When you are done, call {submit}."})
            continue

        submitted = next((u for u in uses if u.name == submit), None)
        others = [u for u in uses if u.name != submit]

        async def run_tool(u):
            tool = by_name.get(u.name)
            if not tool or not tool.fn:
                return u.id, {"error": f"Unknown tool {u.name}"}, True
            try:
                return u.id, await tool.fn(run, node, u.input), False
            except Exception as e:  # surfaced to the model so it can recover
                return u.id, {"error": str(e)}, True

        results = await asyncio.gather(*(run_tool(u) for u in others))
        content = [{"type": "tool_result", "tool_use_id": uid, "content": json.dumps(out, default=str)[:6000], "is_error": err}
                   for uid, out, err in results]

        if submitted:
            problem = validate(submitted.input) if validate else None
            if problem is None and not others:
                return submitted.input
            content.append({"type": "tool_result", "tool_use_id": submitted.id, "is_error": True,
                            "content": problem or "Submit only after reading the other tool results."})
            if problem:
                await run.step(node, "guard", "Submission bounced", problem, status="warn", pause=0.4)
        messages.append({"role": "user", "content": content})
    raise AgentError(f"{node} did not finish within {config.LLM_MAX_TURNS} turns")
