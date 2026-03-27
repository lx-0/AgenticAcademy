# Lesson 4.4: Metrics, Cost Monitoring, and Common Failure Modes

**Module**: 4 — Observability and Debugging
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Metrics are the early warning system of your agent infrastructure. Traces tell you what happened after the fact. Metrics tell you something is wrong right now. This lesson covers the key metrics for agent systems, real-time cost monitoring, and the debugging playbook for the most common agent failure modes.

---

## The Core Metrics Hierarchy

Organize metrics into three tiers:

### Tier 1: Availability (are agents working?)

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `agent.task_success_rate` | % of tasks completing successfully | < 95% |
| `agent.error_rate` | % of tasks failing with errors | > 5% |
| `agent.availability` | % of time agent is responsive | < 99.5% |

### Tier 2: Performance (are agents fast?)

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `agent.task_p50_latency_ms` | Median task completion time | Depends on SLA |
| `agent.task_p95_latency_ms` | 95th percentile latency | Depends on SLA |
| `agent.task_p99_latency_ms` | Tail latency | Depends on SLA |
| `agent.tool_call_latency_ms` | Per-tool call latency, by tool | > 2x baseline |
| `agent.queue_depth` | Tasks waiting to be processed | > 100 |

### Tier 3: Economics (are agents affordable?)

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `agent.token_input_total` | Input tokens consumed per task | Baseline + 50% |
| `agent.token_output_total` | Output tokens produced per task | Baseline + 50% |
| `agent.cost_per_task_usd` | Total cost per task completed | Budget limit |
| `agent.cost_per_hour_usd` | Hourly spend rate | Budget limit |
| `agent.context_utilization_pct` | % of context window used | > 80% |

---

## Implementing Per-Agent Token Tracking

```python
from prometheus_client import Counter, Histogram, Gauge
import time

# Define metrics
TASK_SUCCESS = Counter(
    'agent_task_success_total',
    'Number of successfully completed tasks',
    ['agent_id', 'task_type', 'environment']
)

TASK_ERRORS = Counter(
    'agent_task_errors_total',
    'Number of failed tasks',
    ['agent_id', 'task_type', 'error_type', 'environment']
)

TASK_DURATION = Histogram(
    'agent_task_duration_seconds',
    'Task execution duration',
    ['agent_id', 'task_type'],
    buckets=[0.1, 0.5, 1, 5, 10, 30, 60, 120, 300]
)

TOKEN_USAGE = Counter(
    'agent_token_usage_total',
    'Total tokens used',
    ['agent_id', 'model', 'token_type']  # token_type: input, output
)

COST_USD_CENTS = Counter(
    'agent_cost_usd_cents_total',
    'Estimated cost in USD cents',
    ['agent_id', 'model', 'task_type']
)

CONTEXT_UTILIZATION = Gauge(
    'agent_context_utilization_ratio',
    'Context window utilization (0.0-1.0)',
    ['agent_id']
)

class MetricsCollector:
    def __init__(self, agent_id: str, model: str):
        self.agent_id = agent_id
        self.model = model
        self.environment = os.getenv("ENVIRONMENT", "development")

    def record_task_start(self) -> float:
        return time.time()

    def record_task_success(self, start_time: float, task_type: str) -> None:
        duration = time.time() - start_time
        TASK_SUCCESS.labels(
            agent_id=self.agent_id,
            task_type=task_type,
            environment=self.environment
        ).inc()
        TASK_DURATION.labels(
            agent_id=self.agent_id,
            task_type=task_type
        ).observe(duration)

    def record_task_failure(self, task_type: str, error_type: str) -> None:
        TASK_ERRORS.labels(
            agent_id=self.agent_id,
            task_type=task_type,
            error_type=error_type,
            environment=self.environment
        ).inc()

    def record_llm_usage(
        self,
        input_tokens: int,
        output_tokens: int,
        task_type: str
    ) -> None:
        TOKEN_USAGE.labels(
            agent_id=self.agent_id,
            model=self.model,
            token_type="input"
        ).inc(input_tokens)

        TOKEN_USAGE.labels(
            agent_id=self.agent_id,
            model=self.model,
            token_type="output"
        ).inc(output_tokens)

        # Estimate cost (model-specific pricing)
        input_cost = input_tokens * MODEL_PRICING[self.model]["input_per_token"]
        output_cost = output_tokens * MODEL_PRICING[self.model]["output_per_token"]
        total_cents = int((input_cost + output_cost) * 100)

        COST_USD_CENTS.labels(
            agent_id=self.agent_id,
            model=self.model,
            task_type=task_type
        ).inc(total_cents)

    def record_context_utilization(self, tokens_used: int, max_tokens: int) -> None:
        utilization = tokens_used / max_tokens
        CONTEXT_UTILIZATION.labels(agent_id=self.agent_id).set(utilization)
```

---

## Cost Monitoring Dashboard Queries

A cost monitoring view that surfaces per-agent token spend in real time:

```sql
-- Per-agent cost over the last hour (Prometheus/PromQL)
sum by (agent_id) (
  rate(agent_cost_usd_cents_total[1h])
) * 36  -- Convert cents/sec to dollars/hour

-- Top 5 most expensive task types this week
SELECT
    task_type,
    SUM(tokens_used) as total_tokens,
    SUM(cost_usd_cents) / 100.0 as total_cost_usd,
    COUNT(*) as task_count,
    AVG(cost_usd_cents) / 100.0 as avg_cost_per_task
FROM agent_metrics
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY task_type
ORDER BY total_cost_usd DESC
LIMIT 5;

-- Agents with unusually high context utilization (may indicate context bloat)
SELECT
    agent_id,
    AVG(context_utilization_pct) as avg_utilization,
    MAX(context_utilization_pct) as max_utilization,
    COUNT(*) as tasks_analyzed
FROM task_metrics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY agent_id
HAVING avg_utilization > 0.7
ORDER BY avg_utilization DESC;
```

---

## Common Agent Failure Modes and Diagnosis

### Failure Mode 1: Infinite Tool-Call Loops

**What you see**: Task never completes. Token usage climbing. Same tool being called repeatedly with minor variations.

**Metrics signature**:
- `agent_task_duration_seconds` spike to max timeout
- `agent_token_usage_total` unusually high for task type
- Tool call count metric significantly above normal

**Trace signature**: Dozens of identical spans for the same tool at the same depth level.

**Root cause**: The agent is not recognizing that the task is complete, or the task completion condition is unachievable and the agent is trying variations hoping one will work.

**Fix**:
1. Add explicit loop detection: if the same tool is called with nearly-identical inputs N times, force termination
2. Add turn limit enforcement: if `turns > MAX_TURNS`, force a partial completion response
3. Review the task completion criteria — are they achievable and clear?

```python
async def detect_tool_call_loop(
    tool_call_history: list[ToolCall],
    window: int = 5
) -> bool:
    if len(tool_call_history) < window:
        return False

    recent = tool_call_history[-window:]
    # Check for repeated identical calls
    call_signatures = [f"{c.tool_name}:{hash_input(c.input)}" for c in recent]
    unique_signatures = len(set(call_signatures))

    return unique_signatures <= 2  # All or nearly all calls are duplicates
```

### Failure Mode 2: Context Window Overflow

**What you see**: Agent produces degraded output or fails with "context length exceeded" error.

**Metrics signature**: `agent_context_utilization_pct` approaching 1.0 before task completion.

**Trace signature**: Spans showing large `context.messages_count` and `context.estimated_tokens`. Often correlated with tasks involving many tool calls or large data inputs.

**Root cause**: Tool results are being appended to context without summarization. Long-running tasks accumulate context until the window is exhausted.

**Diagnosis query**:
```sql
-- Tasks where context overflow was likely a factor
SELECT task_id, MAX(context_utilization_pct), COUNT(tool_calls) as tool_call_count
FROM task_spans
WHERE agent_id = 'agt_overflowing_agent'
AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY task_id
HAVING MAX(context_utilization_pct) > 0.85
ORDER BY MAX(context_utilization_pct) DESC;
```

**Fix**: Implement context summarization (Lesson 1.5 strategy) and selective retention.

### Failure Mode 3: Hallucinated Tool Calls

**What you see**: Agent calls tools that don't exist. Errors of type `ToolNotFoundError`.

**Metrics signature**: `agent_task_errors_total{error_type="ToolNotFoundError"}` increasing.

**Root cause**: The agent invents tool names based on what it "thinks" should exist. Common when:
- Tool names are poorly described and the agent confuses them
- The agent's training distribution included different tool names
- Context compression dropped the tool schema from context

**Fix**: Implement tool call validation before execution:

```python
def validate_tool_call(tool_call: ToolCall, available_tools: list[Tool]) -> ValidationResult:
    available_names = {t.name for t in available_tools}

    if tool_call.tool_name not in available_names:
        # Find closest match for helpful error message
        closest = min(available_names, key=lambda n: levenshtein(n, tool_call.tool_name))
        return ValidationResult(
            valid=False,
            error=f"Tool '{tool_call.tool_name}' not found. Did you mean '{closest}'?",
            suggestion=closest
        )

    return ValidationResult(valid=True)
```

### Failure Mode 4: Silent Empty Returns

**What you see**: Agent completes tasks and reports success, but output is empty or minimal.

**Metrics signature**: `agent_task_success_rate` looks normal. But output quality metrics (if you have them) drop. Downstream systems receive empty inputs.

**Root cause**: A tool returns an empty result (no data found, API returned 0 results) and the agent treats this as a valid completion rather than investigating whether it was expected.

**Fix**: Add output quality validation:

```python
def validate_task_output(result: TaskResult, task: Task) -> QualityCheck:
    if task.expected_output_type == "non_empty_list":
        if not result.data or len(result.data) == 0:
            return QualityCheck(
                passed=False,
                issue="EMPTY_RESULT",
                message="Task produced empty result. This may be expected (no data) or a tool failure.",
                recommendation="Verify tool returned expected data; retry if tool may have failed"
            )

    if task.min_output_length and len(str(result.data)) < task.min_output_length:
        return QualityCheck(
            passed=False,
            issue="SHORT_RESULT",
            message=f"Result unexpectedly short: {len(str(result.data))} chars (expected >{task.min_output_length})"
        )

    return QualityCheck(passed=True)
```

---

## Building an Agent Health Dashboard

A production agent health dashboard should display at minimum:

```
┌────────────────────────────────────────────────────────────────┐
│  AGENT HEALTH — LAST 24 HOURS                                  │
│                                                                │
│  AVAILABILITY          PERFORMANCE         ECONOMICS           │
│  ────────────          ───────────         ─────────           │
│  Success rate: 97.2%   p50 latency: 3.2s   Today's spend: $12 │
│  Error rate: 2.8%      p95 latency: 14.1s  Per task: $0.08    │
│  Queue depth: 3        p99 latency: 45.0s  Token/task: 4,200  │
│                                                                │
│  TOP ERRORS                  SLOWEST AGENTS                    │
│  ──────────                  ──────────────                    │
│  TimeoutError: 18           SummarizerAgent: 14.2s avg         │
│  ContextOverflow: 7         WebResearchAgent: 8.8s avg         │
│  ToolNotFound: 3            AnalysisAgent: 5.1s avg            │
│                                                                │
│  ACTIVE ALERTS                                                 │
│  ─────────────                                                 │
│  ⚠ SearchAgent context utilization: 88% (threshold: 80%)     │
│  ⚠ Daily cost forecast: $167 (budget: $200)                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Summary

- Three metric tiers: availability (are agents working), performance (are they fast), economics (are they affordable)
- Implement Prometheus/OTel metrics with standard dimensions: agent_id, task_type, environment
- Per-agent cost monitoring: track tokens → estimate cost → alert on budget thresholds
- Four common failure modes with diagnosis and fixes: infinite loops, context overflow, hallucinated tool calls, silent empty returns
- Health dashboards surface availability, performance, cost, and active alerts in one view

---

*Next: [Lesson 4.5 — Debugging Multi-Agent Failures](05-debugging-multi-agent-failures.md)*
