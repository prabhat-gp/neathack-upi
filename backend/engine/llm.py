"""Tool-using agent loop on Claude: neatHack's LiteLLM proxy, AWS Bedrock or the Anthropic API."""

import asyncio
import json
import time

import config
import tracing

from .run import Run
from .tools import Tool

_client = None


def client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic, AsyncAnthropicBedrock

        if config.brain() == "litellm":
            # LiteLLM serves Anthropic's /v1/messages format; the team key goes as a Bearer token.
            _client = AsyncAnthropic(auth_token=config.LITELLM_API_KEY, api_key=None, base_url=config.LITELLM_BASE_URL,
                                     timeout=90, max_retries=2)
        elif config.brain() == "bedrock":
            _client = AsyncAnthropicBedrock(aws_region=config.AWS_REGION)
        else:
            _client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


def model() -> str:
    return {"litellm": config.LITELLM_MODEL, "bedrock": config.BEDROCK_MODEL_ID}.get(config.brain(), config.ANTHROPIC_MODEL)


_prices: dict | None = None


async def _price(model_name: str) -> dict:
    """Per-token prices as LiteLLM itself bills them (/model/info), fetched once."""
    global _prices
    if _prices is None:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"{config.LITELLM_BASE_URL}/model/info", headers={"Authorization": f"Bearer {config.LITELLM_API_KEY}"})
                _prices = {m["model_name"]: m.get("model_info") or {} for m in r.json()["data"]}
        except Exception:
            return {}   # cost unknown this time; try again on the next call
    return _prices.get(model_name, {})


async def _cost(usage) -> float:
    """Streaming responses carry no cost header, so price the reported tokens with LiteLLM's own rates."""
    if config.brain() != "litellm":
        return 0.0
    p = await _price(model())
    return ((usage.input_tokens or 0) * (p.get("input_cost_per_token") or 0)
            + (usage.output_tokens or 0) * (p.get("output_cost_per_token") or 0)
            + (getattr(usage, "cache_read_input_tokens", 0) or 0) * (p.get("cache_read_input_token_cost") or 0)
            + (getattr(usage, "cache_creation_input_tokens", 0) or 0) * (p.get("cache_creation_input_token_cost") or 0))


class AgentError(Exception):
    pass


_CACHE = {"type": "ephemeral"}


def _cached(system: str, messages: list[dict]) -> tuple[list[dict], list[dict]]:
    """Prompt caching, the fix neatlogs' investigation suggested for our token incident: one breakpoint after the
    tools + system prompt, one after the conversation so far, so each turn reads the earlier turns from cache
    (a tenth of the input price) instead of paying for them again."""
    last = messages[-1]
    content = last["content"] if isinstance(last["content"], list) else [{"type": "text", "text": last["content"]}]
    content = [*content[:-1], {**content[-1], "cache_control": _CACHE}]
    return [{"type": "text", "text": system, "cache_control": _CACHE}], [*messages[:-1], {**last, "content": content}]


async def _streamed_turn(run: Run, node: str, system: str, tools: list[Tool], messages: list[dict], turn: int):
    """One model call, streamed: reasoning text appears token by token, tool choices as the model makes them."""
    t0, t0_ns = time.monotonic(), time.time_ns()
    parent = tracing.current_context()
    tid = await run.step(node, "turn", f"Turn {turn}", model(), status="running")
    think_id = None
    system_blocks, sent = _cached(system, messages)
    async with client().messages.stream(model=model(), max_tokens=2000, system=system_blocks,
                                        tools=[t.spec() for t in tools], messages=sent) as stream:
        async for ev in stream:
            if ev.type == "text":
                if think_id is None:
                    think_id = await run.step(node, "think", "Reasoning", "", status="running", streamed=True)
                await run.emit("step_delta", id=think_id, text=ev.text)
            elif ev.type == "content_block_start" and ev.content_block.type == "tool_use":
                await run.step(node, "decision", f"Chose {ev.content_block.name}", None, status="info")
        resp = await stream.get_final_message()
    u = resp.usage
    cached = getattr(u, "cache_read_input_tokens", 0) or 0
    # Anthropic leaves cached tokens out of input_tokens; count the whole prompt so totals stay comparable.
    prompt_tokens = u.input_tokens + cached + (getattr(u, "cache_creation_input_tokens", 0) or 0)
    cost = await _cost(u)
    run.cost_usd = round((getattr(run, "cost_usd", 0) or 0) + cost, 6)
    said = "\n".join(b.text for b in resp.content if b.type == "text")
    calls = ", ".join(b.name for b in resp.content if b.type == "tool_use")
    tracing.llm_turn(parent, t0_ns, time.time_ns(), agent=node, turn=turn, model=model(),
                     prompt=system if turn == 1 else None, output=said or f"(tool calls: {calls})",
                     input_tokens=prompt_tokens, output_tokens=u.output_tokens, cached=cached, reasoning=0,
                     provider=config.brain(), runtime=f"anthropic-messages via {config.brain()}", cost_usd=cost)
    if think_id:
        await run.update(think_id, "ok")
    await run.add_usage(node, prompt_tokens, u.output_tokens)
    await run.update(tid, "ok", result=f"{time.monotonic() - t0:.1f}s · {prompt_tokens + u.output_tokens:,} tokens")
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
