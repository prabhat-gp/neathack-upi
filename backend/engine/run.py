import asyncio
import time
import uuid


class Run:
    """One dispute run. Everything observable is emitted as an event and streamed to the UI."""

    def __init__(self, case: dict, brain: str, pace: float):
        self.id = "run_" + uuid.uuid4().hex[:8]
        self.case = case
        self.brain = brain
        self.pace = pace
        self.history: list[dict] = []  # every event, so a screen that opens late can replay the run
        self.subscribers: set[asyncio.Queue] = set()
        self.closed = False  # no more events until a human decision resumes it
        self.t0 = time.monotonic()
        self.status = "RUNNING"
        self.facts: dict = {}
        self.pending_plan: dict | None = None
        self.usage: dict[str, dict] = {}
        self.calls: list[str] = []
        self.trace_url: str | None = None
        self.cost_usd = 0.0  # stays 0 on a ChatGPT plan (usage is covered by the subscription, not billed per token)
        self._seq = 0

    def ms(self) -> int:
        return int((time.monotonic() - self.t0) * 1000)

    async def emit(self, type_: str, pause: float = 0.0, **payload):
        ev = {"type": type_, "t": self.ms(), **payload}
        self.history.append(ev)
        for q in list(self.subscribers):
            q.put_nowait(ev)
        if pause and self.pace:
            await asyncio.sleep(self.pace * pause)

    async def node(self, node: str, status: str, pause: float = 0.3, **extra):
        await self.emit("node", pause=pause, node=node, status=status, **extra)

    async def edge(self, edge: str, state: str, pause: float = 0.0):
        await self.emit("edge", pause=pause, edge=edge, state=state)

    async def step(self, node: str, kind: str, title: str, detail: str | None = None, status: str = "info",
                   pause: float = 0.8, **extra) -> str:
        self._seq += 1
        sid = f"s{self._seq}"
        await self.emit("step", pause=pause, id=sid, node=node, kind=kind, title=title, detail=detail, status=status, **extra)
        return sid

    async def update(self, sid: str, status: str, pause: float = 0.0, **extra):
        await self.emit("step_update", pause=pause, id=sid, status=status, **extra)

    def close(self):
        """Tell live viewers the run is idle (finished, failed or waiting for a human)."""
        self.closed = True
        for q in list(self.subscribers):
            q.put_nowait(None)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        for ev in self.history:
            q.put_nowait(ev)
        if self.closed:
            q.put_nowait(None)
        self.subscribers.add(q)
        return q

    async def add_usage(self, node: str, input_tokens: int, output_tokens: int):
        u = self.usage.setdefault(node, {"input_tokens": 0, "output_tokens": 0, "llm_calls": 0})
        u["input_tokens"] += input_tokens
        u["output_tokens"] += output_tokens
        u["llm_calls"] += 1
        await self.emit("usage", node=node, **u)
