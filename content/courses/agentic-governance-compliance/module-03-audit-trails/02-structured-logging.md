# Lesson 3.2: Structured Logging for Agent Actions

**Module**: 3 — Audit Trails and Observability for Compliance
**Estimated reading time**: ~22 minutes
**Level**: Intermediate–Advanced

---

## Overview

Structured logging is the foundation of compliance-grade audit trails. Unlike unstructured text logs (designed for engineers to read), structured logs are machine-parseable, queryable, and designed to answer specific compliance questions. This lesson covers the schema, implementation patterns, and common pitfalls.

---

## The Compliance Log Schema

A compliance-grade audit log for agentic systems requires a richer schema than standard application logs. Here is the reference schema:

```json
{
  // Identity fields — who/what produced this record
  "event_id": "uuid-v4",          // Immutable unique identifier
  "agent_id": "string",           // Which agent
  "agent_version": "string",      // Agent version at time of action
  "run_id": "uuid-v4",            // Execution context (links all events in one run)
  "parent_run_id": "uuid-v4",     // For sub-agents: which run spawned this one
  "user_id": "string | null",     // Human who triggered this run (if applicable)
  "session_id": "string | null",  // User session if interactive

  // Timing
  "timestamp": "ISO-8601",         // When the event occurred (UTC)
  "sequence_number": "integer",   // Monotonically increasing within a run

  // Event classification
  "event_type": "enum",            // See event types below
  "event_category": "enum",        // reasoning | tool_call | decision | human_interaction | system

  // Goal context
  "goal_id": "string",             // Which business goal this run serves
  "task_id": "string | null",      // If task-management system is used
  "task_description": "string",    // Plain language description of the current task

  // Action details (for tool_call events)
  "tool_name": "string | null",
  "tool_input_hash": "string | null",    // Hash of input (not plaintext if sensitive)
  "tool_input_summary": "string | null", // Non-sensitive summary of input parameters
  "tool_output_status": "enum | null",   // success | failure | timeout | rate_limited
  "tool_output_hash": "string | null",   // Hash of output (for integrity verification)
  "tool_output_summary": "string | null",// Non-sensitive summary of what was returned

  // Decision details (for decision events)
  "decision_type": "string | null",     // What kind of decision (classification, approval, routing)
  "decision_outcome": "string | null",  // What the agent decided
  "decision_reasoning_summary": "string | null", // 1-2 sentence plain language summary
  "policy_references": ["string"],      // Which policies governed this decision

  // Human interaction (for HITL events)
  "approval_id": "string | null",       // Links to approval record
  "approver_id": "string | null",       // Human who approved/rejected
  "approval_outcome": "enum | null",    // approved | rejected | approved_with_modifications
  "override_applied": "boolean",

  // Integrity
  "previous_event_hash": "string",      // Hash of previous event in this run (chain integrity)
  "record_hash": "string",              // Hash of this record (self-integrity)

  // Environment
  "environment": "enum",                // production | staging | development
  "region": "string",                   // For data residency tracking
  "model_id": "string",                 // Which LLM was used
  "model_version": "string"
}
```

### Event Types

```python
class AuditEventType(Enum):
    # Agent lifecycle
    RUN_STARTED = "run_started"
    RUN_COMPLETED = "run_completed"
    RUN_FAILED = "run_failed"
    RUN_SUSPENDED = "run_suspended"
    RUN_TERMINATED = "run_terminated"

    # Tool interactions
    TOOL_CALL_REQUESTED = "tool_call_requested"
    TOOL_CALL_EXECUTED = "tool_call_executed"
    TOOL_CALL_BLOCKED = "tool_call_blocked"  # Blocked by guardrail
    TOOL_CALL_FAILED = "tool_call_failed"

    # Decisions
    DECISION_MADE = "decision_made"
    ESCALATION_TRIGGERED = "escalation_triggered"

    # Human interaction
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_RECEIVED = "approval_received"
    APPROVAL_EXPIRED = "approval_expired"
    OVERRIDE_APPLIED = "override_applied"

    # Security events
    GUARDRAIL_TRIGGERED = "guardrail_triggered"
    ANOMALY_DETECTED = "anomaly_detected"
    ACCESS_DENIED = "access_denied"

    # Data access
    DATA_READ = "data_read"
    DATA_WRITTEN = "data_written"
    DATA_DELETED = "data_deleted"
```

---

## Sensitive Data Handling in Logs

The most common structured logging mistake: including sensitive data (PII, financial data, credentials) in plaintext in audit logs. This creates a compliance violation — GDPR data minimization and purpose limitation apply to audit logs as much as to primary data.

**The correct approach: hash and summarize**

```python
import hashlib
import json
from typing import Any

def sanitize_for_audit(data: Any, sensitive_fields: list[str]) -> dict:
    """
    Produces an audit-safe version of data:
    - Sensitive fields are replaced with their SHA-256 hash
    - A non-sensitive summary is generated for human readability
    """
    if not isinstance(data, dict):
        return {"value_hash": sha256(str(data))}

    sanitized = {}
    for key, value in data.items():
        if key in sensitive_fields:
            sanitized[f"{key}_hash"] = sha256(json.dumps(value))
            sanitized[f"{key}_redacted"] = True
        else:
            sanitized[key] = value

    return sanitized

def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()

# Usage
tool_input = {
    "customer_id": "cust-12345",
    "email": "user@example.com",      # PII
    "ssn": "123-45-6789",             # PII
    "query_type": "account_balance",  # Not sensitive
    "account_id": "acc-98765"         # Sensitivity depends on context
}

SENSITIVE_FIELDS = ["email", "ssn", "date_of_birth", "card_number"]

audit_safe_input = sanitize_for_audit(tool_input, SENSITIVE_FIELDS)
# Result:
# {
#   "customer_id": "cust-12345",
#   "email_hash": "abc123...",
#   "email_redacted": True,
#   "ssn_hash": "def456...",
#   "ssn_redacted": True,
#   "query_type": "account_balance",
#   "account_id": "acc-98765"
# }
```

The hash serves two purposes: it allows correlation (two records with the same email_hash accessed the same user's data) without exposing the actual value, and it provides integrity verification (if the original value is later provided in a legal proceeding, you can verify it matches the hash).

---

## Implementing Structured Logging

### The Audit Logger

```python
import uuid
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Optional
import json

@dataclass
class AuditEvent:
    # Required fields
    event_type: str
    agent_id: str
    run_id: str
    goal_id: str
    task_description: str

    # Auto-generated
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    sequence_number: int = 0  # Set by logger

    # Optional context
    agent_version: str = ""
    parent_run_id: Optional[str] = None
    user_id: Optional[str] = None
    tool_name: Optional[str] = None
    tool_input_summary: Optional[str] = None
    tool_input_hash: Optional[str] = None
    tool_output_status: Optional[str] = None
    tool_output_summary: Optional[str] = None
    tool_output_hash: Optional[str] = None
    decision_type: Optional[str] = None
    decision_outcome: Optional[str] = None
    decision_reasoning_summary: Optional[str] = None
    policy_references: list = field(default_factory=list)
    approval_id: Optional[str] = None
    approver_id: Optional[str] = None
    approval_outcome: Optional[str] = None
    override_applied: bool = False
    model_id: str = ""
    environment: str = "production"
    previous_event_hash: str = ""
    record_hash: str = ""


class ComplianceAuditLogger:
    def __init__(self, storage_backend, run_id: str, agent_id: str):
        self.storage = storage_backend
        self.run_id = run_id
        self.agent_id = agent_id
        self._sequence = 0
        self._last_hash = ""

    def log(self, event: AuditEvent) -> str:
        # Set sequence and chain hash
        self._sequence += 1
        event.sequence_number = self._sequence
        event.previous_event_hash = self._last_hash

        # Compute record hash for integrity
        record_json = json.dumps(asdict(event), sort_keys=True, default=str)
        event.record_hash = sha256(record_json)
        self._last_hash = event.record_hash

        # Write to append-only storage
        self.storage.append(event)
        return event.event_id

    def log_tool_call(
        self,
        tool_name: str,
        input_summary: str,
        input_hash: str,
        output_status: str,
        output_summary: str,
        output_hash: str,
        goal_id: str,
        task_description: str
    ) -> str:
        return self.log(AuditEvent(
            event_type=AuditEventType.TOOL_CALL_EXECUTED.value,
            agent_id=self.agent_id,
            run_id=self.run_id,
            goal_id=goal_id,
            task_description=task_description,
            tool_name=tool_name,
            tool_input_summary=input_summary,
            tool_input_hash=input_hash,
            tool_output_status=output_status,
            tool_output_summary=output_summary,
            tool_output_hash=output_hash
        ))
```

### Wrapping Tool Calls

```python
class AuditedTool:
    """Wraps a tool call with audit logging."""

    def __init__(self, tool, audit_logger, sensitive_fields=None):
        self.tool = tool
        self.logger = audit_logger
        self.sensitive_fields = sensitive_fields or []

    def __call__(self, **kwargs) -> Any:
        # Sanitize inputs for audit
        safe_input = sanitize_for_audit(kwargs, self.sensitive_fields)

        try:
            result = self.tool(**kwargs)
            safe_output = sanitize_for_audit(
                result if isinstance(result, dict) else {"result": str(result)},
                self.sensitive_fields
            )

            self.logger.log_tool_call(
                tool_name=self.tool.__name__,
                input_summary=self._summarize(safe_input),
                input_hash=sha256(json.dumps(kwargs, sort_keys=True, default=str)),
                output_status="success",
                output_summary=self._summarize(safe_output),
                output_hash=sha256(json.dumps(result, sort_keys=True, default=str)
                                   if result else "null"),
                goal_id=self.logger.current_goal_id,
                task_description=self.logger.current_task_description
            )
            return result

        except Exception as e:
            self.logger.log(AuditEvent(
                event_type=AuditEventType.TOOL_CALL_FAILED.value,
                agent_id=self.logger.agent_id,
                run_id=self.logger.run_id,
                goal_id=self.logger.current_goal_id,
                task_description=self.logger.current_task_description,
                tool_name=self.tool.__name__,
                tool_input_summary=self._summarize(safe_input),
                tool_output_status="failure",
                tool_output_summary=str(e)[:200]  # Truncate long error messages
            ))
            raise

    def _summarize(self, data: dict) -> str:
        """Generate a concise human-readable summary."""
        keys = list(data.keys())[:5]  # First 5 keys
        return f"{{{', '.join(keys)}}}" + (" ..." if len(data) > 5 else "")
```

---

## Common Structured Logging Mistakes

**Logging the action but not the outcome**
```python
# BAD — logs that the tool was called but not what happened
audit_log.info(f"Called {tool_name} with {params}")
result = tool(params)
# No logging of result or success/failure

# GOOD — logs both action and outcome
try:
    result = tool(params)
    audit_log.log_tool_call(tool_name, params, result, status="success")
except Exception as e:
    audit_log.log_tool_call(tool_name, params, None, status="failure", error=str(e))
    raise
```

**Logging in the wrong process**
```python
# BAD — async logging with no delivery guarantee
def process_action():
    result = take_action()
    asyncio.create_task(log_to_audit(result))  # Fire and forget
    return result

# GOOD — synchronous write or durable queue
def process_action():
    result = take_action()
    audit_queue.put_nowait(result)  # Durable queue with at-least-once delivery
    return result
```

**Overloading application logs with audit records**
Application logs are rotated, compressed, and deleted based on operational needs. Audit records have compliance retention requirements. Mixing them in the same log stream creates conflicts:
- Deleting old application logs for storage may inadvertently delete audit records
- Audit record retention periods may force retention of noisy operational logs

Keep audit records in a separate, dedicated storage layer with its own retention policy.

---

## Summary

- The compliance log schema requires identity fields (agent, run, user), timing, event classification, goal context, action details, decision details, human interaction, and integrity fields
- Sensitive data in logs must be hashed or redacted, not stored in plaintext — GDPR applies to audit logs
- Hash chaining provides tamper-evidence: each record includes the hash of the previous record
- The `AuditedTool` wrapper pattern logs every tool call automatically, reducing the risk of missed events
- Common mistakes: logging the action but not the outcome, fire-and-forget async logging with no delivery guarantee, mixing audit records with application logs

---

*Next: [Lesson 3.3 — Decision Provenance and Reasoning Traces](03-decision-provenance.md)*
