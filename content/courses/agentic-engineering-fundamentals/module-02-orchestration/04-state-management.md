# Lesson 2.4: State Management Across Agents

**Module**: 2 — Orchestration and Coordination
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

State management is one of the hardest problems in distributed systems. Multi-agent systems are distributed systems, with the additional complexity that the "processes" making decisions are non-deterministic LLMs. This lesson covers shared memory stores, blackboards, event buses, and the idempotency guarantees needed to make them work correctly.

---

## The State Problem in Multi-Agent Systems

Consider three agents working concurrently on a research task:

- Agent A finds a key fact and writes it to shared state
- Agent B reads shared state (getting Agent A's fact) and adds its own findings
- Agent C reads shared state but reads a stale snapshot before Agent B wrote

Agent C's output is based on incomplete information. This is the **read-after-write consistency problem**, and it affects every multi-agent system that uses shared state.

The solution depends on your consistency requirements:

| Requirement | Use Case | Solution |
|-------------|----------|---------|
| Strong consistency | All agents see the same state at the same time | Distributed locks / transactions |
| Eventual consistency | Agents eventually converge to the same state | Event sourcing / append-only logs |
| Session consistency | Each agent sees its own writes | Per-agent state partitioning |
| Causal consistency | If B reads A's write, B's write is visible to anyone who reads B's | Causal clocks |

Most multi-agent systems use eventual consistency with careful conflict resolution, as strong consistency is too expensive and slow.

---

## Shared Memory Stores

A shared memory store is a persistent key-value or document store that all agents can read and write.

### Basic shared store operations

```python
class SharedMemoryStore:
    async def read(self, key: str) -> Value | None: ...
    async def write(self, key: str, value: Value) -> None: ...
    async def read_many(self, keys: list[str]) -> dict[str, Value]: ...
    async def write_many(self, updates: dict[str, Value]) -> None: ...
    async def compare_and_swap(
        self,
        key: str,
        expected: Value | None,
        new_value: Value
    ) -> bool: ...  # Returns True if swap succeeded
    async def delete(self, key: str) -> None: ...
```

### Namespacing state

Partition state by task and agent to prevent accidental cross-contamination:

```python
class NamespacedStore:
    def __init__(self, store: SharedMemoryStore, task_id: str, agent_id: str):
        self.store = store
        self.prefix = f"task:{task_id}:agent:{agent_id}"

    async def read(self, key: str) -> Value | None:
        return await self.store.read(f"{self.prefix}:{key}")

    async def write(self, key: str, value: Value) -> None:
        await self.store.write(f"{self.prefix}:{key}", value)

    # Cross-agent reads (for shared task state)
    async def read_shared(self, key: str) -> Value | None:
        return await self.store.read(f"task:{self.task_id}:shared:{key}")
```

---

## The Blackboard Pattern

The blackboard pattern is a coordination mechanism where agents write their findings to a shared "blackboard" that all agents can read. A controller agent monitors the blackboard and triggers new agents when new information arrives.

```
┌──────────────────────────────────────────────────────┐
│                    BLACKBOARD                        │
│                                                      │
│  findings: [...]        status: in_progress          │
│  open_questions: [...]  coverage: 0.6                │
│  sources: [...]         quality: 0.8                 │
│                                                      │
└──────────────────────────────────────────────────────┘
        ▲                               │
        │ write                         │ read
   ┌────┴─────┐                    ┌────▼─────┐
   │ Agent A  │                    │Controller│
   └──────────┘                    └────┬─────┘
                                        │ dispatch
   ┌──────────┐                    ┌────▼─────┐
   │ Agent B  │─── write ─────────►│          │
   └──────────┘                    │ Blackboard│
                                    └──────────┘
```

### Blackboard schema

```python
@dataclass
class BlackboardState:
    # Task context
    task_id: str
    original_goal: str
    status: Literal["pending", "in_progress", "complete", "failed"]

    # Accumulated knowledge
    findings: list[Finding]           # What agents have discovered
    open_questions: list[Question]    # What still needs to be answered
    sources_consulted: list[str]      # To prevent duplicate queries

    # Quality signals
    coverage_score: float             # 0.0–1.0 (how much of the goal is addressed)
    confidence_score: float           # 0.0–1.0 (quality of findings)

    # Work tracking
    active_agents: list[str]          # Agents currently working
    completed_agents: list[str]       # Agents that have finished

    # Versioning
    version: int                      # Incremented on each write
    last_modified_by: str
    last_modified_at: str
```

### Writing to the blackboard with conflict resolution

```python
async def write_findings_to_blackboard(
    blackboard: BlackboardStore,
    agent_id: str,
    new_findings: list[Finding]
) -> None:
    max_retries = 5
    for _ in range(max_retries):
        # Read current state with version
        current = await blackboard.read_with_version()

        # Apply updates to a local copy
        updated = current.copy()
        updated.findings.extend(new_findings)
        updated.completed_agents.append(agent_id)
        updated.active_agents.remove(agent_id)
        updated.version = current.version + 1
        updated.last_modified_by = agent_id
        updated.last_modified_at = datetime.utcnow().isoformat()

        # Attempt optimistic write
        success = await blackboard.compare_and_swap(
            expected_version=current.version,
            new_state=updated
        )

        if success:
            return

        # Version conflict — another agent wrote concurrently
        # Reload and retry
        await asyncio.sleep(0.1 * random.uniform(0.5, 1.5))  # jitter

    raise BlackboardWriteError(f"Failed to write to blackboard after {max_retries} retries")
```

---

## Event Buses

An event bus decouples agents: instead of calling each other directly, agents publish events that other agents subscribe to.

```
Agent A publishes: ResearchCompleted(task_id, findings)
                         │
                         ▼
                    Event Bus
                     │    │
                     ▼    ▼
              Agent B  Agent C
              (subscribed  (subscribed
               to Research  to Research
               Completed)   Completed)
```

### Event design

```python
@dataclass
class AgentEvent:
    event_id: str              # Unique ID (for deduplication)
    event_type: str            # e.g., "research.completed", "task.failed"
    source_agent_id: str
    task_id: str
    payload: dict              # Event-specific data
    timestamp: str
    correlation_id: str        # Links related events in a task flow
```

### Publishing and subscribing

```python
class EventBus:
    async def publish(self, event: AgentEvent) -> None: ...
    async def subscribe(
        self,
        event_types: list[str],
        handler: Callable[[AgentEvent], Awaitable[None]]
    ) -> Subscription: ...
    async def unsubscribe(self, subscription: Subscription) -> None: ...
```

```python
# Agent A publishes a completion event
await event_bus.publish(AgentEvent(
    event_id=str(uuid.uuid4()),
    event_type="research.completed",
    source_agent_id=self.agent_id,
    task_id=self.task_id,
    payload={"findings": findings, "sources": sources},
    timestamp=datetime.utcnow().isoformat(),
    correlation_id=self.correlation_id
))

# Agent B subscribes to research completion events
subscription = await event_bus.subscribe(
    event_types=["research.completed"],
    handler=self.on_research_completed
)

async def on_research_completed(self, event: AgentEvent) -> None:
    # Only process events for our task
    if event.task_id != self.task_id:
        return
    # Process the research findings
    await self.start_synthesis(event.payload["findings"])
```

### Event deduplication

At-least-once delivery (the norm for distributed event buses) means an event may arrive multiple times. Handle this:

```python
async def on_event(self, event: AgentEvent) -> None:
    # Idempotency check
    if await self.processed_events.contains(event.event_id):
        return  # Already processed, skip

    # Process the event
    await self._handle_event(event)

    # Record as processed
    await self.processed_events.add(event.event_id, ttl_seconds=3600)
```

---

## Idempotency Guarantees in Distributed Agent Systems

Idempotency means that performing an operation multiple times has the same effect as performing it once. This is essential when:
- Networks are unreliable and messages may be delivered multiple times
- Agents retry failed operations
- Task assignment systems re-queue tasks on worker failure

### Making agent tasks idempotent

```python
async def execute_task(self, task: Task) -> TaskResult:
    # Check if this task was already completed
    cached_result = await self.result_cache.get(task.idempotency_key)
    if cached_result:
        return cached_result  # Return identical result for duplicate invocation

    # Execute the task
    result = await self._do_work(task)

    # Cache the result with the idempotency key
    await self.result_cache.set(
        key=task.idempotency_key,
        value=result,
        ttl_seconds=86400  # 24-hour cache
    )

    return result
```

The `idempotency_key` should be derived from the task's inputs, not its ID:

```python
def compute_idempotency_key(task: Task) -> str:
    # Key based on what makes this task unique
    return hashlib.sha256(
        json.dumps({
            "task_type": task.type,
            "input_hash": hash_input(task.input),
            "agent_version": AGENT_VERSION
        }, sort_keys=True).encode()
    ).hexdigest()
```

Note: Include `agent_version` in the key. If the agent's behavior changes (new tools, updated prompts), cached results from the old version should not be returned.

---

## Real-World Failure Mode: State Corruption from Concurrent Writes

**What it is**: Two agents read the same state version, both compute updates, and both write. The second write silently overwrites the first. One agent's contribution is lost.

**How to reproduce it**: In a test environment with two agents writing to shared state concurrently, observe that only one agent's data appears in the final state, even though both agents reported success.

**Root cause**: Writing without a version check — just `store.write(key, value)` without any concurrency control.

**Fix**: Always use `compare_and_swap` for writes to shared state. If the swap fails (version mismatch), reload the current state, reapply your changes, and retry.

**Why it's insidious**: Both agents get success responses from the write call. There's no error. You only discover the corruption when you examine the final state and notice missing data.

---

## Summary

- Multi-agent shared state requires explicit consistency strategies: strong (locks), eventual (event sourcing), session (partitioned), or causal
- Shared memory stores require version-based concurrency control (compare-and-swap) for correctness
- The blackboard pattern provides a shared coordination surface for open-ended collaborative tasks
- Event buses decouple agents and enable reactive coordination without polling
- Idempotency is non-negotiable: wrap all operations with idempotency key checks
- State corruption from concurrent writes is silent and insidious — always use compare-and-swap

---

*Next: [Lesson 2.5 — Failure Handling in Orchestration](05-failure-handling.md)*
