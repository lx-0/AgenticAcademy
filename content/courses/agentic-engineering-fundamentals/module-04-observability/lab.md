# Module 4 Lab: Find the Silent Failure

**Module**: 4 — Observability and Debugging
**Estimated time**: 75–90 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

A pre-built 4-agent pipeline silently fails on ~20% of inputs with no error output — it just returns empty results. Your job is to:

1. **Instrument** each agent in the pipeline with OpenTelemetry
2. **Reproduce** the failure pattern using the provided test inputs
3. **Read** the generated trace to identify the root cause: a specific agent that exhausts its context window on complex inputs and silently returns an empty string
4. **Implement** the fix and verify the failure rate drops to 0%

---

## Scenario

The 4-agent competitive intelligence pipeline:

```
Query Input
    │
    ▼
PlannerAgent: Decomposes query into research sub-questions
    │
    ▼
ResearchAgent: Searches for information per sub-question (context-heavy)
    │
    ▼
AnalysisAgent: Analyzes all research findings
    │
    ▼
SummaryAgent: Produces final summary report
```

On simple queries (1-2 sub-questions), it works perfectly. On complex queries (5+ sub-questions with large search results), approximately 20% of runs return an empty summary with `success=true`. No errors are raised.

---

## Setup

```bash
$ observability-lab status
✓ 4-agent pipeline: loaded (uninstrumented version)
✓ OpenTelemetry collector: running at localhost:4317
✓ Jaeger UI: running at http://localhost:16686
✓ Test harness: ready (30 test inputs, 6 complex queries known to trigger failure)
✓ OTel SDK: installed (opentelemetry-api, opentelemetry-sdk, opentelemetry-exporter-otlp)

# Run baseline (no instrumentation)
$ observability-lab run-baseline --input test-inputs/complex-queries.json
Output: 4/6 successful (66%) — WARNING: 2/6 returned empty results
```

---

## Part 1: Add OpenTelemetry Instrumentation (35 minutes)

### Step 1.1: Initialize the tracer

In `/workspace/pipeline/tracing_setup.py`, initialize OpenTelemetry:

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

def initialize_tracing(service_name: str) -> trace.Tracer:
    # TODO: Create TracerProvider with service.name resource
    # TODO: Add OTLPSpanExporter to provider (endpoint: "localhost:4317")
    # TODO: Set the provider as global
    # TODO: Return tracer for service_name
    pass
```

### Step 1.2: Instrument each agent

For each of the 4 agents in `/workspace/pipeline/agents.py`, add spans:

**PlannerAgent.execute** should create a span with attributes:
- `agent.id`, `task.id`, `task.type`
- `planner.sub_question_count` (how many sub-questions it generated)

**ResearchAgent.execute** should create a span with attributes:
- `agent.id`, `task.id`, `sub_question.id`
- `research.context_tokens_before` (context size before this research)
- `research.context_tokens_after` (context size after appending results)
- `research.context_utilization_pct`
- `research.result_empty` (boolean — did research return empty results?)

This last attribute is the key one for this lab.

**AnalysisAgent.execute** should create a span with attributes:
- `agent.id`, `task.id`
- `analysis.input_size` (how much research data was passed in)

**SummaryAgent.execute** should create a span with attributes:
- `agent.id`, `task.id`
- `summary.output_length` (length of final output)
- `summary.output_empty` (boolean — is output empty?)

### Step 1.3: Propagate context across agents

The orchestrator passes tasks between agents. Add trace context propagation:

```python
# In orchestrator.py
from opentelemetry import trace, propagate

async def run_pipeline(query: str) -> PipelineResult:
    tracer = trace.get_tracer("orchestrator")

    with tracer.start_as_current_span("pipeline.execute") as root_span:
        root_span.set_attribute("query.input", query[:100])  # First 100 chars

        # Inject context into each step's context dictionary
        headers = {}
        propagate.inject(headers)

        plan = await planner.execute(query, trace_headers=headers)
        research = await researcher.execute(plan, trace_headers=headers)
        analysis = await analyzer.execute(research, trace_headers=headers)
        summary = await summarizer.execute(analysis, trace_headers=headers)

        root_span.set_attribute("pipeline.output_empty", len(summary.text) < 10)
        return summary
```

### Step 1.4: Run with instrumentation

```bash
observability-lab run-instrumented --input test-inputs/complex-queries.json --traces
```

Expected: Same 66% success rate (instrumentation doesn't fix anything yet), but now you have traces.

---

## Part 2: Reproduce and Diagnose the Failure (20 minutes)

### Step 2.1: Open Jaeger and find failing traces

Navigate to http://localhost:16686 in your browser.

1. Select service: "orchestrator"
2. Filter by: `pipeline.output_empty = true`
3. You should see 2 traces for the 2 failed runs

### Step 2.2: Read the trace waterfall

For a failing trace:
1. Expand the root `pipeline.execute` span
2. Expand each agent span
3. Look for the span where `research.result_empty = true` OR `research.context_utilization_pct > 0.9`

**Expected finding**: The ResearchAgent processes multiple sub-questions sequentially, appending results to its context. On the 4th or 5th sub-question, `research.context_utilization_pct` exceeds 0.95. The model silently returns an empty string rather than raising an error. This propagates: AnalysisAgent receives empty input, SummaryAgent produces empty output.

### Step 2.3: Confirm with the span attributes

Write down the exact span where the silent failure occurs:

```
Failing span: ResearchAgent.execute
  task_id: _______________
  sub_question.id: _______________
  research.context_utilization_pct: _______________
  research.result_empty: true
```

Document this in `/workspace/diagnosis-report.md`.

---

## Part 3: Implement the Fix (25 minutes)

### Step 3.1: Add context overflow detection to ResearchAgent

In `/workspace/pipeline/agents.py`, modify `ResearchAgent.execute` to detect and handle context overflow:

```python
async def execute(self, plan: PlanResult, trace_headers: dict) -> ResearchResult:
    results = []

    for sub_question in plan.sub_questions:
        # Check context utilization before each research step
        current_utilization = self.estimate_context_utilization()

        if current_utilization > 0.85:
            # Context is getting full — summarize accumulated results before continuing
            summarized = await self.summarize_accumulated_results(results)
            results = [summarized]  # Replace with compact summary

        research = await self._research_sub_question(sub_question)

        # Detect empty result
        if not research or len(research.content) < 10:
            # Log a warning span event (for instrumentation visibility)
            span = trace.get_current_span()
            span.add_event("research_empty_result", {
                "sub_question": sub_question,
                "context_utilization": current_utilization
            })
            # TODO: Decide on behavior: skip, retry, or proceed with empty slot?
            continue  # Skip this sub-question rather than silently corrupting output

        results.append(research)

    if not results:
        # All sub-questions failed — fail explicitly, not silently
        raise InsufficientResearchError(
            "All research sub-questions returned empty results. "
            "This may indicate context overflow or tool failures."
        )

    return ResearchResult(findings=results)
```

### Step 3.2: Run the validation suite

```bash
observability-lab run-validation --input test-inputs/complex-queries.json
```

**Target output**:
```
Query 1 (simple): ✓ Summary produced (245 words)
Query 2 (simple): ✓ Summary produced (187 words)
Query 3 (complex): ✓ Summary produced (312 words) [used context summarization at step 4]
Query 4 (complex): ✓ Summary produced (298 words) [used context summarization at step 5]
Query 5 (very complex): ✓ Summary produced with partial data flag (187 words)
Query 6 (very complex): ✓ Summary produced with partial data flag (203 words)

Overall: 6/6 pass (0 empty results) ✓
```

Note: "partial data flag" is acceptable — better than empty output with false success.

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| OTel initialization correct | 10 | Traces appear in Jaeger |
| Agent spans with required attributes | 25 | All 4 agents instrumented with specified attributes |
| Context propagation working | 15 | All agent spans appear as children of root span |
| Diagnosis report identifying root cause | 20 | Correctly identifies ResearchAgent context overflow as root cause, with specific trace evidence |
| Fix implemented | 20 | 6/6 complex queries produce non-empty output |
| Fix verified with traces | 10 | Traces show context summarization events in successful runs |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
observability-lab submit \
  --pipeline /workspace/pipeline/ \
  --diagnosis /workspace/diagnosis-report.md \
  --validation-run-id <your-validation-run-id>
```

---

## Hints

**"My traces are not appearing in Jaeger"**
Check that `initialize_tracing()` is called before any agent code runs. Also verify the OTLP endpoint is correct: `http://localhost:4317` (with http://, not https://).

**"All spans appear flat (no parent-child relationships)"**
The `trace_headers` dict must be extracted using `propagate.extract(headers)` in each agent and passed as the `context` argument to `tracer.start_as_current_span(...)`. If you pass `None` as context, each span becomes a new root span.

**"My fix makes all runs fail explicitly instead of producing partial results"**
Don't raise an exception when a single sub-question returns empty — only when ALL sub-questions fail. Use the `continue` approach for individual empties and only raise if `results` is empty at the end.
