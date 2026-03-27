# Lesson 3.3: Audit Trails

**Module**: 3 — Governance and Compliance
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

An audit trail is a tamper-evident, sequential record of all agent actions. When an incident occurs — a data breach, an unauthorized action, an incorrect output — the audit trail is what lets you reconstruct what happened, who (or what) did it, and when.

Without an audit trail, you can't do post-incident forensics, you can't demonstrate compliance to regulators, and you can't identify patterns of misbehavior before they escalate.

This lesson covers what to log, structured log formats for agent events, and retention requirements.

---

## What Makes an Audit Trail

An audit trail is not just logs. Logs are often unstructured, incomplete, and not tamper-evident. An audit trail is:

1. **Structured**: Every event has a defined schema. You can query it programmatically.
2. **Complete**: Every agent action that matters is recorded. Gaps are detectable.
3. **Tamper-evident**: The integrity of the log can be verified. Deleted or modified entries are detectable.
4. **Attributable**: Every entry is linked to a specific agent, task, and timestamp.
5. **Queryable**: You can answer questions like "show me all actions Agent X took on data belonging to Customer Y last week."

---

## The Agent Event Taxonomy

Not all agent activity needs the same level of detail. Here's a taxonomy of event types ranked by criticality:

### Critical events (always log, with full context)

| Event Type | Description | Why Critical |
|-----------|-------------|--------------|
| `tool.invoked` | Agent called a tool | Every action has a record |
| `tool.blocked` | Guardrail blocked a tool call | Evidence of guardrail effectiveness |
| `data.accessed` | Agent read data from an external store | Privacy compliance |
| `data.written` | Agent wrote data to an external store | Change accountability |
| `data.deleted` | Agent deleted data | Irreversible actions must be logged |
| `external.api.called` | Agent called an external API | Liability, rate limits |
| `message.sent` | Agent sent a message (email, chat, etc.) | Communication accountability |
| `agent.escalated` | Agent escalated to human approval | Oversight record |
| `budget.exceeded` | Agent hit a spending limit | Cost accountability |
| `guardrail.triggered` | A guardrail fired | Security monitoring |

### Important events (always log, standard context)

| Event Type | Description |
|-----------|-------------|
| `task.started` | Agent began a task |
| `task.completed` | Agent completed a task |
| `task.failed` | Agent failed a task |
| `agent.delegated` | Agent delegated to a sub-agent |

### Informational events (log with reduced context)

| Event Type | Description |
|-----------|-------------|
| `reasoning.step` | Agent reasoning step (for debug builds) |
| `context.updated` | Agent's context was updated |

---

## Structured Log Schema

Every audit log entry should include a standard envelope plus event-specific fields:

```python
@dataclass
class AuditLogEntry:
    # Envelope fields (required for all events)
    event_id: str           # UUID — unique per event
    event_type: str         # From taxonomy above
    timestamp: str          # ISO 8601 UTC
    schema_version: str     # "1.0" — for forward compatibility

    # Attribution
    agent_id: str           # Which agent took this action
    agent_name: str         # Human-readable agent name
    agent_role: str         # Agent's role (researcher, executor, etc.)
    task_id: str            # Which task this was part of
    parent_task_id: str | None  # For delegated tasks
    run_id: str             # Current execution run ID

    # Correlation
    correlation_id: str     # Links all events in a single task execution
    user_id: str | None     # If triggered by a specific user

    # Event-specific payload (varies by event_type)
    payload: dict

    # Integrity
    previous_event_id: str | None  # For chain integrity verification
    checksum: str                   # SHA-256 of all fields except checksum
```

### Tool invocation log entry

```json
{
  "event_id": "evt_01HX7K8M3NQPZ4RST5V6W7X8Y",
  "event_type": "tool.invoked",
  "timestamp": "2026-03-25T14:32:10.451Z",
  "schema_version": "1.0",

  "agent_id": "agt_search_worker_03",
  "agent_name": "SearchWorker-03",
  "agent_role": "researcher",
  "task_id": "task_competitive_analysis_01",
  "parent_task_id": "task_market_research_parent",
  "run_id": "run_4e98453f",

  "correlation_id": "corr_abc123",
  "user_id": "user_jane_smith",

  "payload": {
    "tool_name": "web_search",
    "input": {
      "query": "Acme Corp Q1 2026 earnings",
      "max_results": 10
    },
    "output_summary": "Returned 8 results, top result: Forbes article dated 2026-03-15",
    "output_token_count": 2847,
    "duration_ms": 1243,
    "success": true
  },

  "previous_event_id": "evt_01HX7K8M3NQPZ4RST5V6W7X7",
  "checksum": "a3f7b9c2d4e8..."
}
```

### Guardrail triggered log entry

```json
{
  "event_id": "evt_01HX7K8M3NQPZ4RST5V6W7Y1",
  "event_type": "guardrail.triggered",
  "timestamp": "2026-03-25T14:35:22.103Z",

  "agent_id": "agt_support_agent",
  "task_id": "task_support_ticket_9821",
  "run_id": "run_7f12cd89",
  "correlation_id": "corr_def456",

  "payload": {
    "guardrail_name": "ToolScopeGuardrail",
    "action_attempted": "tool.invoked",
    "tool_name": "send_email",
    "blocked_input": {
      "recipient": "external@competitor.com",
      "subject": "RE: Partnership inquiry"
    },
    "block_reason": "Tool 'send_email' is not in allowed list for agent 'support-agent'",
    "severity": "high",
    "action_taken": "blocked"
  }
}
```

---

## Implementing Tamper Evidence

For audit trails used in compliance contexts, the log itself must be tamper-evident — meaning that if an entry is deleted or modified, the tampering can be detected.

### Hash chaining

Each entry includes a hash of the previous entry. If any entry is altered, all subsequent hashes become invalid:

```python
class TamperEvidentAuditLog:
    def __init__(self, store: AuditLogStore):
        self.store = store
        self._last_entry_id: str | None = None
        self._last_entry_checksum: str | None = None

    def _compute_checksum(self, entry_data: dict, previous_checksum: str | None) -> str:
        content = json.dumps({
            **entry_data,
            "previous_checksum": previous_checksum
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()

    async def append(self, entry: AuditLogEntry) -> None:
        # Link to previous entry
        entry.previous_event_id = self._last_entry_id

        # Compute checksum over content + chain
        entry_data = {k: v for k, v in dataclasses.asdict(entry).items()
                     if k != "checksum"}
        entry.checksum = self._compute_checksum(entry_data, self._last_entry_checksum)

        # Store
        await self.store.append(entry)

        # Update chain state
        self._last_entry_id = entry.event_id
        self._last_entry_checksum = entry.checksum

    async def verify_integrity(self) -> IntegrityReport:
        """Verify that no entries have been tampered with."""
        entries = await self.store.read_all_ordered()
        previous_checksum = None

        for entry in entries:
            expected = self._compute_checksum(
                {k: v for k, v in dataclasses.asdict(entry).items() if k != "checksum"},
                previous_checksum
            )
            if entry.checksum != expected:
                return IntegrityReport(
                    intact=False,
                    first_tampered_entry_id=entry.event_id,
                    tampered_at_position=entries.index(entry)
                )
            previous_checksum = entry.checksum

        return IntegrityReport(intact=True)
```

### Write-once log stores

For compliance-grade audit trails, use append-only log stores where entries cannot be modified or deleted:

- **Cloud options**: AWS CloudTrail, Azure Monitor Logs, GCP Cloud Audit Logs
- **Self-hosted options**: Apache Kafka (with compaction disabled), Elasticsearch (with write-once indices)

---

## Retention Requirements

Audit log retention requirements vary by regulation:

| Regulation/Framework | Minimum Retention |
|---------------------|-------------------|
| GDPR (EU) | No minimum, but must be sufficient to demonstrate compliance |
| EU AI Act (High-risk systems) | At least 10 years |
| SOC 2 Type II | Minimum 1 year (3 years recommended) |
| HIPAA (US healthcare) | Minimum 6 years |
| PCI DSS (payment data) | Minimum 1 year (3 months immediately accessible) |

For most enterprise agentic systems:

- **Hot storage** (immediately queryable): 90 days
- **Warm storage** (queryable within minutes): 1 year
- **Cold storage** (queryable within hours): 7 years

### What to exclude from logs

Not everything should be in the audit trail:

- **Raw LLM outputs**: Store summaries, not full transcripts (reduces storage, avoids logging PII that appeared in model output)
- **Credentials and secrets**: Never log credentials, API keys, or tokens, even if they appear in tool call parameters — redact before logging
- **Large payloads**: Log metadata and summaries, not full content (e.g., "wrote 42KB PDF to /docs/output.pdf", not the PDF content)

---

## Querying Audit Trails for Incident Response

The audit trail is only valuable if you can query it effectively during an incident.

**Common incident response queries**:

```sql
-- All actions by agent X in the last 24 hours
SELECT * FROM audit_log
WHERE agent_id = 'agt_executor_01'
AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp ASC;

-- All data access events for customer Y
SELECT * FROM audit_log
WHERE event_type = 'data.accessed'
AND payload->>'resource_owner' = 'customer_Y'
ORDER BY timestamp ASC;

-- All guardrail triggers in the last week, by severity
SELECT
    payload->>'guardrail_name' as guardrail,
    payload->>'severity' as severity,
    COUNT(*) as trigger_count
FROM audit_log
WHERE event_type = 'guardrail.triggered'
AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY trigger_count DESC;

-- Full execution trace for a specific task
SELECT * FROM audit_log
WHERE correlation_id = 'corr_abc123'
ORDER BY timestamp ASC;
```

---

## Summary

- An audit trail is structured, complete, tamper-evident, attributable, and queryable — logs alone are not sufficient
- The agent event taxonomy distinguishes critical events (always log fully) from informational events (log with reduced context)
- Every entry should include: event ID, type, timestamp, agent attribution, task/run ID, and a payload
- Hash chaining and write-once storage provide tamper evidence
- Retention requirements: 90 days hot, 1 year warm, 7 years cold (adjust for your regulatory context)
- Never log raw credentials, secrets, or large payloads — log metadata and summaries

---

*Next: [Lesson 3.4 — Human-in-the-Loop Patterns](04-human-in-the-loop.md)*
