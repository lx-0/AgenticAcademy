# Lesson 4.2: Structured Logging for Agent Events

**Module**: 4 — Observability and Debugging
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Structured logging is the foundation of agent observability. Unstructured log lines (plain text messages) are impossible to query at scale. Structured logs — with defined schemas, consistent field names, and machine-readable formats — enable real-time alerting, dashboards, and forensic analysis.

This lesson covers the agent event taxonomy, log levels, and correlation IDs for multi-agent call chains.

---

## Why Text Logs Fail at Scale

```
# Unstructured (bad)
2026-03-25 14:32:10 INFO Agent SearchWorker-03 called web_search with query "Acme Corp earnings" and got 8 results in 1.2s
2026-03-25 14:32:15 ERROR SearchWorker-03 failed on task competitive_analysis: tool timeout
```

Problems:
- Can't query "all tool calls with duration > 5s" without regex
- Field names vary by developer (sometimes "agent" sometimes "agent_name" sometimes "worker")
- Error details buried in free text
- No machine-parseable correlation IDs

```json
// Structured (good)
{
  "timestamp": "2026-03-25T14:32:10.451Z",
  "level": "INFO",
  "event_type": "tool.invoked",
  "agent_id": "agt_search_worker_03",
  "task_id": "task_comp_analysis_01",
  "trace_id": "trace_abc123",
  "span_id": "span_def456",
  "payload": {
    "tool_name": "web_search",
    "input": {"query": "Acme Corp earnings"},
    "duration_ms": 1243,
    "result_count": 8,
    "success": true
  }
}
```

This is queryable: `SELECT * WHERE event_type = 'tool.invoked' AND payload.duration_ms > 5000`.

---

## The Agent Event Taxonomy (Logging Focus)

From the Module 3 audit trail taxonomy, here's the logging-focused view with recommended log levels:

### CRITICAL level (always alert on-call)

| Event | When to log |
|-------|-------------|
| `agent.panic` | Agent encountered an unrecoverable error |
| `security.guardrail_bypass_attempt` | Possible guardrail bypass detected |
| `data.pii_exfiltration_detected` | PII detected in external output |

### ERROR level (page on-call if production)

| Event | When to log |
|-------|-------------|
| `task.failed_permanent` | Task failed after all retries |
| `tool.error_unhandled` | Tool raised an unhandled exception |
| `agent.hallucinated_tool_call` | Agent invoked a non-existent tool |
| `context.overflow` | Context window limit reached |

### WARN level (alert if sustained)

| Event | When to log |
|-------|-------------|
| `task.failed_transient` | Task failed but retry is underway |
| `tool.retry` | Tool call required retry |
| `budget.near_limit` | Budget 80%+ consumed |
| `context.utilization_high` | Context 80%+ full |
| `output.low_confidence` | Agent output below confidence threshold |

### INFO level (normal operations)

| Event | When to log |
|-------|-------------|
| `task.started` | Task execution began |
| `task.completed` | Task completed successfully |
| `tool.invoked` | Tool was called (success) |
| `agent.delegated` | Task delegated to sub-agent |
| `handoff.sent` | Agent handed off work |
| `handoff.received` | Agent received handoff |

### DEBUG level (development/troubleshooting only)

| Event | When to log |
|-------|-------------|
| `reasoning.step` | Individual reasoning turn |
| `context.updated` | Context window updated |
| `tool.result.raw` | Raw tool response (before processing) |

---

## Log Schema Implementation

### Base log entry

```python
import structlog
from datetime import datetime, timezone

# Configure structlog for JSON output
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)

class AgentLogger:
    def __init__(self, agent_id: str, agent_version: str):
        self.logger = structlog.get_logger()
        self.base_context = {
            "agent_id": agent_id,
            "agent_version": agent_version,
            "environment": os.getenv("ENVIRONMENT", "development")
        }

    def _log(self, level: str, event_type: str, task_id: str, trace_id: str,
             span_id: str, **payload):
        log_fn = getattr(self.logger, level)
        log_fn(
            event_type,
            **self.base_context,
            task_id=task_id,
            trace_id=trace_id,
            span_id=span_id,
            **payload
        )

    def log_tool_invoked(self, task_id: str, trace_id: str, span_id: str,
                          tool_name: str, input_summary: str, duration_ms: int,
                          success: bool, output_summary: str | None = None,
                          error: str | None = None) -> None:
        level = "info" if success else "warning"
        self._log(
            level=level,
            event_type="tool.invoked",
            task_id=task_id,
            trace_id=trace_id,
            span_id=span_id,
            tool_name=tool_name,
            input_summary=input_summary,
            duration_ms=duration_ms,
            success=success,
            output_summary=output_summary,
            error=error
        )

    def log_task_completed(self, task_id: str, trace_id: str, span_id: str,
                            duration_ms: int, token_usage: int, success: bool) -> None:
        level = "info" if success else "error"
        self._log(
            level=level,
            event_type="task.completed",
            task_id=task_id,
            trace_id=trace_id,
            span_id=span_id,
            duration_ms=duration_ms,
            token_usage=token_usage,
            success=success
        )
```

---

## Correlation IDs

In a multi-agent system, a single user request may spawn dozens of agent interactions. Correlation IDs link all these related logs together.

### The correlation ID hierarchy

```
trace_id: "trace_abc123"          # Unique per end-to-end user request
  └─ correlation_id: "corr_def456"  # Unique per task within trace
       ├─ span_id: "span_001"        # Orchestrator start
       ├─ span_id: "span_002"        # Worker 1 execution
       │    └─ span_id: "span_003"   # Tool call within Worker 1
       ├─ span_id: "span_004"        # Worker 2 execution
       └─ span_id: "span_005"        # Synthesizer
```

### Propagating correlation IDs across agents

```python
@dataclass
class TraceContext:
    trace_id: str          # Stays constant for the entire request
    parent_span_id: str    # The span that spawned this one
    correlation_id: str    # Links related agents in the same task
    baggage: dict          # Additional context propagated through the trace

def create_child_span(parent: TraceContext) -> tuple[TraceContext, str]:
    """Create a child span context and new span ID."""
    span_id = generate_span_id()
    child_ctx = TraceContext(
        trace_id=parent.trace_id,          # Same trace
        parent_span_id=parent.parent_span_id,  # Parent links
        correlation_id=parent.correlation_id,  # Same correlation
        baggage=parent.baggage.copy()
    )
    return child_ctx, span_id

class TracedAgent:
    async def execute_with_tracing(
        self,
        task: Task,
        parent_trace_ctx: TraceContext
    ) -> TaskResult:
        # Create a new span for this agent's execution
        ctx, span_id = create_child_span(parent_trace_ctx)

        self.logger.log_task_started(
            task_id=task.id,
            trace_id=ctx.trace_id,
            span_id=span_id,
            parent_span_id=ctx.parent_span_id
        )

        try:
            result = await self._execute(task, ctx)  # Pass context to sub-calls

            self.logger.log_task_completed(
                task_id=task.id,
                trace_id=ctx.trace_id,
                span_id=span_id,
                duration_ms=result.duration_ms,
                token_usage=result.token_usage,
                success=True
            )
            return result

        except Exception as e:
            self.logger.log_task_failed(
                task_id=task.id,
                trace_id=ctx.trace_id,
                span_id=span_id,
                error_type=type(e).__name__,
                error_message=str(e)
            )
            raise
```

### Injecting trace context into tool calls

When an agent calls a tool that calls another service (which may call another agent), the trace context must be propagated:

```python
async def call_tool_with_tracing(
    tool_name: str,
    tool_input: dict,
    trace_ctx: TraceContext,
    tool_span_id: str
) -> ToolResult:
    # Inject trace headers into the tool call
    enriched_input = {
        **tool_input,
        "_trace_headers": {
            "X-Trace-Id": trace_ctx.trace_id,
            "X-Span-Id": tool_span_id,
            "X-Parent-Span-Id": trace_ctx.parent_span_id,
            "X-Correlation-Id": trace_ctx.correlation_id,
        }
    }

    start_time = time.time()
    result = await tool_registry.call(tool_name, enriched_input)
    duration_ms = int((time.time() - start_time) * 1000)

    logger.log_tool_invoked(
        tool_name=tool_name,
        input_summary=summarize_input(tool_input),
        duration_ms=duration_ms,
        success=not isinstance(result, ToolError),
        trace_id=trace_ctx.trace_id,
        span_id=tool_span_id
    )

    return result
```

---

## What NOT to Log

Logging too much is almost as bad as logging too little:

**Never log**:
- Raw credentials, API keys, tokens (even in debug logs)
- Full LLM output (too verbose, may contain PII)
- Full tool results for large payloads (log summaries instead)
- User-provided content verbatim (privacy risk)

**Log summaries instead**:
```python
# Instead of:
log.debug("Tool result", result=raw_tool_result)  # May be 50KB

# Do this:
log.debug("Tool result summary",
    result_type=type(raw_tool_result).__name__,
    result_size_bytes=len(str(raw_tool_result)),
    result_preview=str(raw_tool_result)[:200],  # First 200 chars only
    key_fields=extract_key_fields(raw_tool_result)
)
```

---

## Sampling Strategy

In high-throughput systems, logging every event at INFO level creates unmanageable volume. Use sampling:

```python
class SampledLogger(AgentLogger):
    def __init__(self, *args, sample_rate: float = 1.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.sample_rate = sample_rate

    def log_tool_invoked(self, *args, **kwargs):
        # Always log failures and slow calls
        is_failure = not kwargs.get("success", True)
        is_slow = kwargs.get("duration_ms", 0) > 5000

        if is_failure or is_slow or random.random() < self.sample_rate:
            super().log_tool_invoked(*args, **kwargs)

# Log 100% of errors and slow calls, 10% of normal operations
logger = SampledLogger(agent_id="agt_001", agent_version="2.1.0", sample_rate=0.1)
```

---

## Summary

- Structured logging (JSON with defined schema) enables querying, alerting, and dashboards — text logs do not
- Agent event taxonomy with log levels: CRITICAL/ERROR/WARN/INFO/DEBUG
- Correlation IDs: trace_id (entire request), correlation_id (task), span_id (unit of work)
- Propagate trace context across all agent calls and tool invocations
- Never log credentials, full LLM output, or large raw payloads — log structured summaries
- Use sampling for high-throughput systems while always capturing failures and slow operations

---

*Next: [Lesson 4.3 — Distributed Tracing](03-distributed-tracing.md)*
