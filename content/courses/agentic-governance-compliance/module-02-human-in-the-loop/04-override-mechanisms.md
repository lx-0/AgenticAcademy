# Lesson 2.4: Override Mechanisms and Fallback Behavior

**Module**: 2 — Designing Human-in-the-Loop Controls
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Overview

Override mechanisms allow authorized humans to redirect, suspend, or terminate agent actions in real time. Fallback behavior defines what an agent does when it cannot complete its task — whether due to an error, a rejection, or an unavailable resource.

Both are essential for resilient agentic systems: overrides handle anomalies during operation; fallbacks handle graceful degradation when the expected path is blocked.

---

## Override Types

There are four categories of override, each appropriate for different situations:

### 1. Action Override

An authorized human changes the parameters of a proposed action before it executes.

*Example*: An agent proposes to send a payment of $15,000. A reviewer approves but changes the amount to $14,200 to match a corrected invoice.

*Implementation*: The approval system must accept modification inputs, not just approve/reject. The modified parameters replace the agent's proposed parameters in the execution record.

```python
@dataclass
class ApprovalDecision:
    decision: Literal["approved", "rejected", "approved_with_modifications"]
    reviewer_id: str
    reviewed_at: datetime
    notes: str
    # For approved_with_modifications:
    parameter_overrides: Optional[dict] = None

# Usage
decision = ApprovalDecision(
    decision="approved_with_modifications",
    reviewer_id="user-finance-lead",
    reviewed_at=datetime.utcnow(),
    notes="Corrected amount per updated invoice INV-9842-rev",
    parameter_overrides={
        "amount": 14200,
        "invoice_reference": "INV-9842-rev"
    }
)
```

The action execution must apply parameter overrides *before* execution and log both the original parameters and the override:

```json
{
  "action_id": "act-uuid",
  "agent_proposed": {"amount": 15000, "invoice_reference": "INV-9842"},
  "human_override": {"amount": 14200, "invoice_reference": "INV-9842-rev"},
  "executed_with": {"amount": 14200, "invoice_reference": "INV-9842-rev"},
  "override_by": "user-finance-lead",
  "override_reason": "Corrected amount per updated invoice"
}
```

### 2. Suspension Override

An authorized human suspends the agent's current execution without terminating the underlying task.

*Use case*: Anomalous behavior is detected mid-run. The agent needs to be paused for investigation but the task should resume after review.

*Implementation*: A suspension command that:
1. Pauses the agent's execution loop after the current action completes
2. Preserves the agent's state (context, current task, progress)
3. Notifies the agent system owner with the suspension reason
4. Allows resumption by an authorized reviewer

```python
class AgentSuspensionController:
    def suspend(
        self,
        agent_id: str,
        run_id: str,
        reason: str,
        suspended_by: str,
        allow_resume: bool = True
    ) -> SuspensionRecord:
        # Set suspension flag — agent checks this at loop start and after each action
        self.state_store.set_suspension_flag(agent_id, run_id, True)

        # Capture current state for resumption
        current_state = self.state_store.get_agent_state(agent_id, run_id)

        record = SuspensionRecord(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            run_id=run_id,
            reason=reason,
            suspended_by=suspended_by,
            suspended_at=datetime.utcnow(),
            state_snapshot=current_state,
            allow_resume=allow_resume
        )
        self.store.save(record)

        audit_log.record(
            event_type="agent_suspended",
            agent_id=agent_id,
            run_id=run_id,
            suspension_record_id=record.id,
            reason=reason,
            suspended_by=suspended_by
        )

        return record
```

### 3. Termination Override

An authorized human terminates the agent's execution permanently, with the task returned to the queue or marked as requiring human resolution.

*Use case*: The agent is in a runaway loop, has produced clearly incorrect outputs, or is consuming excessive resources.

*Implementation*: Termination must:
1. Stop the agent immediately (not after the current action)
2. Revoke any in-flight tool calls if possible
3. Roll back partially executed reversible actions
4. Log all actions taken before termination
5. Notify the task originator that the task was not completed

### 4. Constraint Override

An authorized human modifies the agent's operating constraints — expanding or restricting what the agent is permitted to do for the current run.

*Use case*: A high-priority situation requires the agent to take an action it would normally require approval for. A constraint override pre-authorizes that class of actions for this specific run.

*This is the highest-risk override type.* Constraint overrides can effectively bypass all HITL controls for the overridden constraint. They must be:
- Scoped to a single run (not a permanent change)
- Logged with the authorizing human's identity
- Reviewed post-run in the next oversight cycle
- Revoked automatically when the run completes

```python
@dataclass
class ConstraintOverride:
    override_id: str
    agent_id: str
    run_id: str  # MUST be scoped to a run
    constraint_name: str  # What constraint is being relaxed
    override_reason: str
    authorized_by: str
    authorized_at: datetime
    expires_at: datetime  # Must expire
    revoked_at: Optional[datetime] = None

    def is_active(self) -> bool:
        return (
            self.revoked_at is None and
            datetime.utcnow() < self.expires_at
        )
```

---

## Fallback Behavior Design

Fallback behavior is what an agent does when the expected path fails. Well-designed fallbacks are safe, informative, and preserve the ability to resume.

### The Fallback Hierarchy

Design fallbacks as a hierarchy of increasingly conservative responses:

```
Level 1: Retry with backoff
  ↓ (if retry limit reached)
Level 2: Use cached/approximate result
  ↓ (if no acceptable approximation)
Level 3: Partial completion with explicit annotation
  ↓ (if partial completion is not meaningful)
Level 4: Graceful failure — task returned to queue with full context
  ↓ (if queue is unavailable)
Level 5: Hard stop — execution terminated, human notification required
```

### Implementing Safe Fallback

```python
class SafeFallbackHandler:
    def handle_action_failure(
        self,
        action: AgentAction,
        error: Exception,
        attempt_count: int,
        context: ExecutionContext
    ) -> FallbackResult:

        # Level 1: Retry if error is transient
        if is_transient_error(error) and attempt_count < MAX_RETRIES:
            return FallbackResult(
                action=FallbackAction.RETRY,
                delay_seconds=exponential_backoff(attempt_count),
                log_message=f"Transient error, retrying (attempt {attempt_count + 1})"
            )

        # Level 2: Use cached result if available
        cached = self.cache.get(action.cache_key)
        if cached and cached.freshness_seconds < MAX_CACHE_AGE:
            return FallbackResult(
                action=FallbackAction.USE_CACHE,
                data=cached.data,
                log_message=f"Using cached result (age: {cached.freshness_seconds}s)",
                annotation="result_from_cache"
            )

        # Level 3: Check if partial completion is meaningful
        if context.partial_results and context.partial_results_meaningful:
            return FallbackResult(
                action=FallbackAction.PARTIAL_COMPLETE,
                data=context.partial_results,
                log_message="Partial completion — some sub-tasks failed",
                annotation="PARTIAL — see failure_details for incomplete items"
            )

        # Level 4: Return to queue
        return FallbackResult(
            action=FallbackAction.RETURN_TO_QUEUE,
            queue_entry=QueueEntry(
                original_task=context.task,
                agent_state_snapshot=context.state,
                failure_reason=str(error),
                recommended_action="human_review"
            ),
            log_message=f"Task returned to queue after {attempt_count} attempts"
        )
```

### Fallback Anti-Patterns

**Silent partial completion**: The agent completes what it can but does not indicate that some items were not processed. The caller assumes everything was done. This is one of the most dangerous fallback anti-patterns.

```python
# BAD: Returns partial result without indicating incompleteness
def process_invoices(invoice_ids: list[str]) -> dict:
    results = {}
    for invoice_id in invoice_ids:
        try:
            results[invoice_id] = process_invoice(invoice_id)
        except Exception:
            pass  # Silently skip failed invoices
    return results

# GOOD: Explicit success/failure accounting
def process_invoices(invoice_ids: list[str]) -> ProcessingResult:
    succeeded = {}
    failed = {}
    for invoice_id in invoice_ids:
        try:
            succeeded[invoice_id] = process_invoice(invoice_id)
        except Exception as e:
            failed[invoice_id] = {"error": str(e), "action_required": True}

    return ProcessingResult(
        succeeded=succeeded,
        failed=failed,
        is_complete=len(failed) == 0,
        requires_human_review=len(failed) > 0
    )
```

**Infinite retry**: The agent retries indefinitely, consuming resources without making progress.

```python
# BAD
while True:
    try:
        result = call_api()
        break
    except APIError:
        time.sleep(1)  # Retries forever

# GOOD
result = retry_with_backoff(
    call_api,
    max_attempts=5,
    base_delay_seconds=1,
    max_delay_seconds=60,
    on_max_attempts_exceeded=lambda e: escalate_to_human(e)
)
```

---

## Override Authorization Controls

Overrides are powerful. Without controls, overrides can be used to bypass governance entirely. Minimum controls:

**Role-based authorization**: Only specific roles can authorize each override type. Constraint overrides require a higher authorization level than action overrides.

**Two-person authorization for high-risk overrides**: Critical overrides (constraint overrides, termination of agents with active financial transactions) require approval from two independent authorized individuals.

**Override audit trail**: Every override is logged with authorizer identity, timestamp, reason, and scope. Override logs are treated as high-value audit records and protected from modification.

**Regular override review**: Override logs are reviewed at the next oversight cycle. Patterns of frequent overrides may indicate that a threshold or policy needs updating.

---

## Summary

- Four override types: action override (modify parameters), suspension (pause with state preservation), termination (stop immediately), constraint override (relax rules — highest risk, must be scoped and expiring)
- The fallback hierarchy: retry → cached/approximate → partial completion → return to queue → hard stop
- Silent partial completion is a critical anti-pattern: always account explicitly for succeeded vs. failed items
- Override authorization requires role-based controls, two-person authorization for high-risk overrides, and override audit trails
- Override patterns should be reviewed regularly to identify threshold calibration opportunities

---

*Next: [Lesson 2.5 — Testing HITL Controls](05-testing-hitl-controls.md)*
