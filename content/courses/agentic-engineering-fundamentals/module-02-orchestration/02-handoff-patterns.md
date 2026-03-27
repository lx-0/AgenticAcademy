# Lesson 2.2: Handoff Patterns

**Module**: 2 — Orchestration and Coordination
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

A handoff is the transfer of work from one agent to another. It sounds simple, but handoffs are one of the most common sources of failure in multi-agent systems. Work gets dropped. Context gets lost. Two agents attempt the same task. One agent assumes the previous one completed work it didn't.

This lesson covers the patterns for reliable handoffs: structured context passing, state summaries, and explicit acknowledgment protocols.

---

## What Makes a Handoff Fail

Before looking at solutions, understand the failure modes:

### Context loss

Agent A completes research and hands off to Agent B with: `{"result": "Here is the research summary..."}`. Agent B doesn't know:
- What question was being researched
- What alternatives were considered and rejected
- What data sources were used (and their freshness)
- What caveats apply to the findings

Agent B proceeds as if the context is complete. The output reflects the missing context.

### Implicit acknowledgment

Agent A sends a message to Agent B. A assumes B received it. B never starts because the message was lost (network failure, queue overflow, message routing error). A marks its task done. The work was never completed.

### Partial completion ambiguity

Agent A stops mid-task (timeout, error). Agent B receives the partial result. B doesn't know if A finished or not. B either: (a) tries to complete A's work (leading to duplication if A actually finished), or (b) assumes it's complete and moves forward with partial data.

### Race conditions in sequential handoffs

In a pipeline, Agent A and Agent B are supposed to run sequentially. Due to a retry, two instances of Agent A run simultaneously. Both hand off to Agent B simultaneously. Agent B processes two sets of inputs and produces duplicate, conflicting outputs.

---

## Pattern 1: Structured Context Passing

The fix for context loss is a defined handoff schema that includes not just the result, but the context needed to continue the work.

```python
@dataclass
class AgentHandoff:
    # Identity
    handoff_id: str          # Unique ID for this handoff
    from_agent_id: str
    to_agent_id: str
    task_id: str

    # Core content
    result: dict             # The actual work output
    result_status: Literal["complete", "partial", "failed"]

    # Context for downstream agent
    original_goal: str       # The top-level goal this work contributes to
    task_context: str        # What this specific task was supposed to accomplish
    completion_note: str     # What was done and why it's sufficient

    # Data provenance
    sources_consulted: list[Source]    # Where data came from
    data_timestamps: dict[str, str]    # When data was current

    # Handoff guidance
    suggested_next_steps: list[str]    # Optional: what Agent B should do first
    open_questions: list[str]          # What remains unresolved
    warnings: list[str]                # Caveats Agent B should be aware of

    # Metadata
    created_at: str
    token_usage: int                   # Cost of this task (for attribution)
```

The downstream agent unpacks this handoff and uses it to initialize its own context:

```python
async def receive_handoff(self, handoff: AgentHandoff) -> None:
    if handoff.result_status == "failed":
        raise HandoffException(
            f"Received failed handoff from {handoff.from_agent_id}: "
            f"{handoff.completion_note}"
        )

    self.context = {
        "original_goal": handoff.original_goal,
        "prior_work": handoff.task_context,
        "available_data": handoff.result,
        "data_sources": handoff.sources_consulted,
        "open_questions": handoff.open_questions,
        "warnings": handoff.warnings
    }
```

---

## Pattern 2: State Summaries for Long Handoff Chains

In a long pipeline (5+ agents), the full handoff context from every prior agent becomes unwieldy. Each agent adds its handoff context to the chain, and by Agent 5, the context object is enormous.

The solution: each agent **summarizes** the accumulated context at handoff time.

```python
async def prepare_handoff(self, task_result: dict) -> AgentHandoff:
    # Summarize all prior context into a compact form
    prior_context_summary = await self.summarize_chain_context(
        original_goal=self.context["original_goal"],
        prior_work_items=self.context["prior_work_chain"],
        max_tokens=500  # Hard limit on summary length
    )

    return AgentHandoff(
        # ... standard fields ...
        task_context=prior_context_summary,  # Compact summary, not full chain
        # ... rest of fields ...
    )
```

The summarization prompt should:
1. Preserve the original goal verbatim
2. Capture the key decisions made at each prior step
3. Note what data is available for downstream use
4. Flag any open questions or caveats
5. Discard reasoning details that don't affect downstream work

---

## Pattern 3: Explicit Acknowledgment Protocols

To prevent the implicit acknowledgment failure mode, implement explicit, bidirectional confirmation:

```
Agent A → sends handoff → Message Queue
                              │
                              ▼
                          Agent B receives handoff
                          Agent B validates handoff
                          Agent B sends ACK to queue
                              │
                              ▼
Message Queue → delivers ACK → Agent A
Agent A marks task as "handed off and acknowledged"
```

If Agent A doesn't receive an ACK within a timeout, it retries or escalates.

```python
async def handoff_with_acknowledgment(
    self,
    handoff: AgentHandoff,
    timeout_seconds: int = 30,
    max_retries: int = 3
) -> AcknowledgmentReceipt:
    for attempt in range(max_retries):
        # Send handoff to message queue
        message_id = await self.message_queue.send(handoff)

        try:
            # Wait for acknowledgment from receiving agent
            ack = await asyncio.wait_for(
                self.message_queue.wait_for_ack(message_id),
                timeout=timeout_seconds
            )

            if ack.status == "accepted":
                return ack
            elif ack.status == "rejected":
                raise HandoffRejected(f"Agent {handoff.to_agent_id} rejected handoff: {ack.reason}")

        except asyncio.TimeoutError:
            if attempt == max_retries - 1:
                raise HandoffTimeout(
                    f"No acknowledgment from {handoff.to_agent_id} after "
                    f"{max_retries} attempts"
                )
            # Wait before retry with exponential backoff
            await asyncio.sleep(2 ** attempt)
```

The receiving agent explicitly acknowledges:

```python
async def process_incoming_handoff(self, handoff: AgentHandoff) -> None:
    try:
        await self.receive_handoff(handoff)
        # Acknowledge receipt and successful initialization
        await self.message_queue.ack(
            handoff.handoff_id,
            status="accepted",
            agent_id=self.agent_id
        )
        # Begin working on the task
        await self.execute_task()

    except HandoffValidationError as e:
        # Acknowledge rejection with reason
        await self.message_queue.ack(
            handoff.handoff_id,
            status="rejected",
            reason=str(e)
        )
```

---

## Preventing Race Conditions: Idempotent Handoffs

The idempotency problem: if Agent A retries a handoff (because the first ACK was lost in transit), Agent B may receive the same handoff twice and do the work twice.

**Solution**: Assign each handoff a unique `handoff_id`. The receiving agent checks if this ID has already been processed:

```python
async def receive_handoff(self, handoff: AgentHandoff) -> None:
    # Check idempotency key
    already_processed = await self.dedup_store.exists(handoff.handoff_id)
    if already_processed:
        # Return the previously generated ACK (idempotent response)
        return await self.dedup_store.get_ack(handoff.handoff_id)

    # Process handoff and store result
    result = await self._process_handoff(handoff)
    await self.dedup_store.store(
        key=handoff.handoff_id,
        value=result,
        ttl_seconds=3600  # Keep for 1 hour to handle late retries
    )
    return result
```

---

## Partial Completion Handoffs

Sometimes an agent can't complete its task fully but has produced valuable partial results. Rather than failing the handoff silently, use explicit partial completion semantics:

```python
@dataclass
class PartialHandoff(AgentHandoff):
    result_status: Literal["partial"] = "partial"
    completed_fraction: float      # 0.0–1.0 (e.g., 0.6 = 60% done)
    completed_items: list[str]     # What was completed
    incomplete_items: list[str]    # What remains
    failure_reason: str            # Why the rest wasn't completed

    # Downstream instructions for partial results
    safe_to_proceed: bool          # Can downstream work with this partial result?
    minimum_viable_completion: float  # What fraction is needed for downstream to proceed
```

The receiving agent or orchestrator then decides:

```python
async def evaluate_partial_handoff(self, handoff: PartialHandoff) -> Action:
    if handoff.completed_fraction >= handoff.minimum_viable_completion:
        # Enough data to proceed, with warnings
        self.add_warning(f"Working with partial data: {handoff.completed_fraction*100}% complete. "
                        f"Incomplete items: {handoff.incomplete_items}")
        return Action.PROCEED_WITH_WARNINGS

    elif handoff.safe_to_proceed:
        # Below minimum but agent says it's safe
        self.add_warning(f"Below minimum viable completion ({handoff.minimum_viable_completion*100}%) "
                        f"but marked safe. Proceeding cautiously.")
        return Action.PROCEED_WITH_WARNINGS

    else:
        # Insufficient data — escalate or retry
        return Action.ESCALATE_TO_ORCHESTRATOR
```

---

## Handoff Audit Trail

Every handoff should be logged for debugging and compliance:

```python
async def log_handoff(self, handoff: AgentHandoff, status: str) -> None:
    await self.audit_log.write({
        "event_type": "agent_handoff",
        "handoff_id": handoff.handoff_id,
        "from_agent": handoff.from_agent_id,
        "to_agent": handoff.to_agent_id,
        "task_id": handoff.task_id,
        "result_status": handoff.result_status,
        "status": status,  # "sent", "acked", "rejected", "timed_out"
        "timestamp": datetime.utcnow().isoformat(),
        "token_usage": handoff.token_usage
    })
```

This log enables you to answer:
- Did all handoffs in a pipeline complete successfully?
- Where did work stall in a failed run?
- Which agent produced the data that led to an incorrect final output?

---

## Summary

- Handoff failures fall into four categories: context loss, implicit acknowledgment, partial completion ambiguity, race conditions
- Structured context passing schemas prevent context loss by including not just results but the context needed to continue the work
- State summaries prevent context chain explosion in long pipelines
- Explicit acknowledgment protocols with bidirectional confirmation prevent silent dropped work
- Idempotent handoff IDs prevent duplicate processing on retried handoffs
- Partial completion semantics give downstream agents the information to decide whether to proceed or escalate

---

*Next: [Lesson 2.3 — Concurrency and Parallelism](03-concurrency-and-parallelism.md)*
