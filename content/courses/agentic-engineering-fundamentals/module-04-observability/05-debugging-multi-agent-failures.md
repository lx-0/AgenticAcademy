# Lesson 4.5: Debugging Multi-Agent Failures

**Module**: 4 — Observability and Debugging
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Debugging a multi-agent failure is fundamentally different from debugging a single service failure. The failure may have originated several agent hops before you notice it, the reasoning that led to it is non-deterministic, and the fix may need to address the root cause in one agent while updating the detection logic in another.

This lesson provides a systematic debugging methodology for multi-agent systems using the observability tools from previous lessons.

---

## The Multi-Agent Debugging Mindset

Before jumping to tools and queries, internalize these principles:

**Principle 1: The visible failure is rarely the root cause**

An incorrect final answer from the SummarizerAgent was caused by empty results from the SearchAgent, which was caused by an overly narrow query in the PlannerAgent, which was caused by ambiguous task specification from the user. The failure is visible at the SummarizerAgent but the root cause is in the PlannerAgent (or possibly the user's input).

**Principle 2: Trace upstream before debugging the visible failure**

Resist the urge to fix the agent where you first see the problem. Always trace the failure back to its earliest manifestation in the call graph.

**Principle 3: Reproduce narrowly**

A multi-agent system that fails intermittently may fail in different ways each run due to non-determinism. Before spending time debugging, establish: does this failure reproduce consistently? With what inputs? At what rate?

**Principle 4: Instrument before guessing**

Multi-agent reasoning is opaque. Don't guess at the cause of a failure without evidence from logs, traces, or metrics. Guesses about agent failures are wrong more often than guesses about deterministic code failures.

---

## The 5-Step Debugging Protocol

### Step 1: Characterize the failure

Start with what you know:

```python
@dataclass
class FailureCharacterization:
    failure_type: str           # "incorrect_output", "no_output", "timeout", "error"
    affected_task_types: list[str]
    failure_rate: float         # % of runs affected
    first_seen: str
    sample_trace_ids: list[str] # Representative failing traces
    sample_inputs: list[str]    # Inputs that trigger the failure
    consistent: bool            # Does it fail the same way each time?
```

**Queries to build the characterization**:

```sql
-- What % of tasks are failing?
SELECT
    task_type,
    COUNT(*) as total,
    SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failures,
    ROUND(100.0 * SUM(CASE WHEN success = false THEN 1 ELSE 0 END) / COUNT(*), 1) as failure_rate_pct
FROM task_results
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY task_type
ORDER BY failure_rate_pct DESC;

-- First occurrence of this failure type
SELECT MIN(timestamp) FROM task_results
WHERE error_type = 'ContextOverflowError';
```

### Step 2: Identify the failing agent

Find which agent in the call graph is first reporting a failure:

```sql
-- Which agents show errors in failing traces?
SELECT
    agent_id,
    COUNT(*) as error_count,
    array_agg(DISTINCT error_type) as error_types
FROM audit_log
WHERE trace_id IN (SELECT trace_id FROM failing_traces)
AND event_type IN ('task.failed', 'tool.error_unhandled')
GROUP BY agent_id
ORDER BY error_count DESC;
```

Examine a representative trace in your tracing backend. Find the **first error span** in the waterfall — that's the agent to investigate.

### Step 3: Understand the agent's context at failure time

Once you've identified the failing agent and a representative trace, reconstruct what the agent knew at the time of failure:

```sql
-- All log entries for a specific agent in a failing trace
SELECT timestamp, event_type, payload
FROM audit_log
WHERE trace_id = 'trace_failing_abc123'
AND agent_id = 'agt_search_worker_03'
ORDER BY timestamp ASC;
```

Look for:
- What inputs did the agent receive? (task description, context from handoff)
- What tools did it call before failing?
- What did those tools return?
- What was the context size at failure time?

### Step 4: Form a hypothesis

Based on the evidence, form a specific, testable hypothesis:

- "The SearchAgent received sub-queries that were too specific — it returned 0 results, which caused the SummarizerAgent to produce an empty output"
- "The context window was 92% full at the time of the AnalysisAgent call — the model was operating on compressed context and missed key information"
- "The PlannerAgent decomposed the question into 12 sub-tasks (too many) — the fan-in step timed out waiting for all 12 to complete"

A good hypothesis is:
1. Specific (names the agent, the condition, the mechanism)
2. Testable (you can verify it with a specific query or experiment)
3. Actionable (fixing it would resolve the failure)

### Step 5: Verify and fix

Verify your hypothesis with data before implementing a fix:

```python
# Hypothesis: "SearchAgent returns 0 results on overly specific sub-queries"
# Verification query:
zero_result_queries = db.query("""
    SELECT
        tool_input->>'query' as search_query,
        tool_result->>'result_count' as result_count,
        task_id
    FROM tool_invocations
    WHERE tool_name = 'web_search'
    AND tool_result->>'result_count' = '0'
    AND timestamp > NOW() - INTERVAL '7 days'
    ORDER BY timestamp DESC
    LIMIT 50
""")

# If hypothesis is correct: zero_result_queries should be numerous and correlated with failures
```

If the data confirms the hypothesis, implement the fix. If not, form a new hypothesis.

---

## Reading Call Graphs to Isolate Root Cause

When examining a trace, the call graph tells you the execution structure. Here's how to read it for debugging:

### Identifying the bottleneck

```
[Trace: 45.2 seconds total]
├─ OrchestratorAgent (0.3s)
│   ├─ PlannerAgent (0.8s)  ← Quick
│   ├─ SearchAgent (1.2s)   ← Quick
│   ├─ SearchAgent (0.9s)   ← Quick
│   ├─ SearchAgent (1.1s)   ← Quick
│   ├─ SearchAgent (41.7s)  ← BOTTLENECK
│   └─ SummarizerAgent (never started — waiting for SearchAgent)
```

The fourth SearchAgent is the bottleneck. Everything else is waiting for it. Investigate its span.

### Identifying cascade failures

```
[Trace: FAILED]
├─ OrchestratorAgent
│   ├─ ResearchAgent ← FIRST FAILURE (tool returned empty)
│   │   └─ web_search (0 results) ← Root cause
│   ├─ AnalysisAgent ← SECONDARY FAILURE (received empty research)
│   │   └─ [ERROR: Cannot analyze empty input]
│   └─ SummarizerAgent ← TERTIARY FAILURE (received error from Analysis)
│       └─ [ERROR: Analysis failed, cannot summarize]
```

Fix the root cause (web_search returning 0 results) and both secondary failures disappear.

### Identifying unexpected agent calls

```
[Trace: High cost — should be cheap]
├─ OrchestratorAgent
│   ├─ ResearchAgent (expected)
│   ├─ AnalysisAgent (expected)
│   ├─ WritingAgent (expected)
│   ├─ ReviewAgent (expected)
│   └─ ResearchAgent (NOT expected ← why is this running again?)
│       └─ 8 web_search calls
```

The system is calling the ResearchAgent twice. Investigate why the ReviewAgent triggered a re-research cycle rather than just flagging issues.

---

## Debugging Specific Failure Modes

### Debugging: "Silent empty return on ~20% of inputs"

This is the Lab scenario for this module. The system works but sometimes returns empty results with no error.

**Step 1**: Identify the failure rate precisely.
```sql
SELECT COUNT(*) as empty_results, COUNT(*) / TOTAL as pct
FROM task_results WHERE data_size < 10 AND success = true;
```

**Step 2**: Correlate empty results with specific inputs.
```sql
SELECT t.input, t.data_size, t.trace_id
FROM task_results t
WHERE data_size < 10 AND success = true
ORDER BY RANDOM() LIMIT 20;
```

**Step 3**: Examine the trace for representative empty-result tasks.
- Find the span where empty data first appears
- Check the context window utilization at that point

**Step 4**: Hypothesis — "context overflow on complex inputs causes empty return."
```sql
-- Verify: do empty results correlate with high context utilization?
SELECT
    success,
    MAX(context_utilization_pct),
    AVG(data_size)
FROM task_spans
GROUP BY success;
```

**Step 5**: If confirmed, fix: implement context overflow detection + graceful partial return instead of silent empty return.

---

## Module 4 Key Takeaways

1. Agents differ from microservices: non-determinism, implicit context window state, tool calls as I/O
2. Three pillars: logs (events), traces (request flow), metrics (numerical measurements)
3. Instrument with OTel: span hierarchy, propagated context, agent-specific span attributes
4. Core agent metrics: availability, latency, token spend, context utilization
5. Four failure modes: infinite loops, context overflow, hallucinated tool calls, silent empty returns
6. 5-step debugging protocol: characterize → identify failing agent → reconstruct context → hypothesize → verify and fix

---

*Module 4 complete. Proceed to the [Module 4 Assessment](assessment.json) and [Module 4 Lab](lab.md) before continuing to Module 5.*
