"""neatLogs tracing. Active only when NEATLOGS_API_KEY is set; otherwise every helper is a no-op."""

import config

ENABLED = False

if config.NEATLOGS_API_KEY:
    import neatlogs

    neatlogs.init(api_key=config.NEATLOGS_API_KEY, workflow_name="disputepro-upi-disputes",
                  instrumentations=["anthropic", "bedrock"], tags=["neathack"])
    ENABLED = True


def span(kind: str, name: str):
    if not ENABLED:
        return lambda fn: fn
    from neatlogs import span as _span

    return _span(kind=kind, name=name)
