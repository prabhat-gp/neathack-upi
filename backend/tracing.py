"""neatlogs tracing. Active only when NEATLOGS_API_KEY is set; otherwise every helper is a no-op.

The agents' model calls happen inside the Codex CLI process, so nothing is auto-instrumented. We write the spans
ourselves on neatlogs' OpenTelemetry pipeline, using its OpenInference attributes:
WORKFLOW (one case) > AGENT (orchestrator / investigator / policy / resolver) > LLM (one Codex turn, with model,
prompt, output and token counts) and TOOL (each tool the model called) > TOOL (each counterparty HTTP call).
"""

import json
from contextlib import contextmanager

import config

ENABLED = False

if config.NEATLOGS_API_KEY:
    import neatlogs

    neatlogs.init(api_key=config.NEATLOGS_API_KEY, workflow_name="upi-exception-desk", tags=["neathack", config.brain()])
    ENABLED = True


def span(kind: str, name: str):
    """Decorator for our own functions (workflow, agents). Their arguments are the live Run object, so inputs and
    outputs are not captured here; the LLM and tool spans underneath carry the real content."""
    if not ENABLED:
        return lambda fn: fn
    from neatlogs import span as _span

    return _span(kind=kind, name=name, capture_input=False, capture_output=False)


def _tracer():
    from neatlogs._wrap_utils import get_tracer  # neatlogs' own provider; it never uses the OTel global one

    return get_tracer()


def _j(v) -> str:
    return v if isinstance(v, str) else json.dumps(v, default=str)[:20000]


def trace_url() -> str | None:
    """Link to the neatlogs trace of the span currently running (the case's WORKFLOW span)."""
    if not ENABLED or not (config.NEATLOGS_PROJECT_ID and config.NEATLOGS_ORG_ID):
        return None
    from opentelemetry import context

    span = context.get_value("neatlogs.parent_span")
    if span is None or not span.get_span_context().is_valid:
        return None
    return (f"https://app.neatlogs.com/traces/{span.get_span_context().trace_id:032x}"
            f"?orgId={config.NEATLOGS_ORG_ID}&projectId={config.NEATLOGS_PROJECT_ID}")


def current_context():
    if not ENABLED:
        return None
    from opentelemetry import context

    return context.get_current()


@contextmanager
def _under(parent):
    """Make a context captured elsewhere current, so neatlogs resolves its private parent key from it."""
    if parent is None:
        yield
        return
    from opentelemetry import context

    token = context.attach(parent)
    try:
        yield
    finally:
        context.detach(token)


@contextmanager
def child(name: str, kind: str, parent=None, inp=None, **attrs):
    """A span under `parent` (a context captured with current_context()) or under the current span."""
    if not ENABLED:
        yield None
        return
    with _under(parent), _tracer().start_as_current_span(name) as s:
        s.set_attribute("openinference.span.kind", kind)
        if inp is not None:
            s.set_attribute("input.value", _j(inp))
        for k, v in attrs.items():
            if v is not None:
                s.set_attribute(k, v if isinstance(v, (str, int, float, bool)) else _j(v))
        yield s


def finish(s, output=None, error: str | None = None) -> None:
    if s is None:
        return
    from opentelemetry.trace import Status, StatusCode

    if output is not None:
        s.set_attribute("output.value", _j(output))
    if error:
        s.set_status(Status(StatusCode.ERROR, error[:300]))


def llm_turn(parent, start_ns: int, end_ns: int, *, agent: str, turn: int, model: str, prompt: str | None,
             output: str, input_tokens: int, output_tokens: int, cached: int, reasoning: int) -> None:
    """One Codex turn as an LLM span with real timing and the usage Codex reported."""
    if not ENABLED:
        return
    with _under(parent):
        s = _tracer().start_span(f"{agent} · turn {turn}", start_time=start_ns)
    for k, v in {
        "openinference.span.kind": "LLM", "llm.system": "openai", "llm.provider": "openai", "gen_ai.system": "openai",
        "llm.model_name": model, "gen_ai.request.model": model,
        "llm.invocation_parameters": json.dumps({"reasoning_effort": config.CODEX_REASONING_EFFORT, "runtime": "codex-cli"}),
        "llm.token_count.prompt": input_tokens, "llm.token_count.completion": output_tokens,
        "llm.token_count.total": input_tokens + output_tokens, "llm.token_count.prompt_details.cache_read": cached,
        "llm.token_count.completion_details.reasoning": reasoning,
        "input.value": prompt or "(continuation of the same Codex session)", "output.value": output or "(tool calls only)",
    }.items():
        s.set_attribute(k, v)
    s.end(end_time=end_ns)
