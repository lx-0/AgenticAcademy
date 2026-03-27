# Lesson 4.3: Distributed Tracing for Agent Systems

**Module**: 4 — Observability and Debugging
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

A single user request may trigger a chain of 10 agents, 50 tool calls, and 3 external API calls. When that request produces a wrong answer or takes 45 seconds instead of 5, how do you find where the problem is?

Distributed tracing answers this question by connecting every operation in the chain into a single, queryable call graph. This lesson covers OpenTelemetry for agents, span hierarchy design, and sampling strategies.

---

## OpenTelemetry for Agents

OpenTelemetry (OTel) is the open standard for distributed tracing. It provides language SDKs, a data model, and a collector that routes telemetry to any backend (Jaeger, Zipkin, Datadog, Honeycomb, etc.).

### Core concepts

**Tracer**: A tracer creates spans. Each agent should have its own tracer instance.

**Span**: A named, timed operation. Spans have:
- `name`: Human-readable identifier (e.g., "SearchAgent.execute", "web_search.tool_call")
- `start_time` / `end_time`
- `parent_span_id`: Links this span to its parent
- `attributes`: Key-value metadata
- `events`: Time-stamped sub-events within the span
- `status`: OK, ERROR, or UNSET

**Trace**: All spans that share the same `trace_id`. The trace is the complete picture of a request's execution.

### Setting up OTel for agents

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

def setup_tracing(service_name: str, otlp_endpoint: str) -> None:
    """Initialize OpenTelemetry tracing for an agent service."""
    # Create tracer provider
    provider = TracerProvider(
        resource=Resource.create({
            "service.name": service_name,
            "service.version": os.getenv("AGENT_VERSION", "unknown"),
            "deployment.environment": os.getenv("ENVIRONMENT", "development")
        })
    )

    # Configure exporter (sends spans to your observability backend)
    exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)

# Each agent gets its own tracer
tracer = trace.get_tracer("search-agent", version="2.1.0")
```

---

## Span Hierarchy Design for Agent Systems

The span hierarchy is the tree structure of your trace. Good hierarchy design makes traces readable and useful.

### Recommended span hierarchy

```
[Trace: user-request-abc123]
│
├─ [Span: OrchestratorAgent.research_task] (root span)
│   ├─ attributes: task_id, user_id, goal
│   ├─ [Event: plan_created, sub_question_count=5]
│   │
│   ├─ [Span: SearchAgent.execute] (child of orchestrator)
│   │   ├─ attributes: sub_question_id, query
│   │   ├─ [Span: web_search.tool_call] (child of search agent)
│   │   │   ├─ attributes: query, result_count
│   │   │   └─ duration: 1.2s
│   │   └─ duration: 1.8s (includes tool call + processing)
│   │
│   ├─ [Span: SearchAgent.execute] (parallel, same level)
│   │   ├─ [Span: web_search.tool_call]
│   │   └─ duration: 0.9s
│   │
│   ├─ [Span: SummarizerAgent.synthesize]
│   │   ├─ attributes: input_sources_count, output_word_count
│   │   └─ duration: 4.2s
│   │
│   └─ duration: 7.5s (total end-to-end)
```

This hierarchy tells you: the request took 7.5s, most of it was the synthesizer (4.2s), the two search agents ran in parallel (so they didn't both contribute to total latency), and the slowest tool call was the web search at 1.2s.

### Instrumenting an agent with OTel

```python
class InstrumentedAgent:
    def __init__(self, name: str):
        self.tracer = trace.get_tracer(name)
        self.name = name

    async def execute(self, task: Task, parent_context=None) -> TaskResult:
        # Create a span for this agent's execution
        with self.tracer.start_as_current_span(
            f"{self.name}.execute",
            context=parent_context,  # Link to parent span if provided
            kind=SpanKind.SERVER
        ) as span:
            # Add key attributes
            span.set_attribute("task.id", task.id)
            span.set_attribute("task.type", task.type)
            span.set_attribute("agent.id", self.agent_id)

            try:
                result = await self._execute_internal(task)

                # Record success
                span.set_attribute("task.success", True)
                span.set_attribute("task.token_usage", result.token_usage)
                span.set_status(trace.StatusCode.OK)
                return result

            except Exception as e:
                # Record failure
                span.set_status(trace.StatusCode.ERROR, str(e))
                span.record_exception(e)
                span.set_attribute("task.success", False)
                span.set_attribute("error.type", type(e).__name__)
                raise

    async def call_tool_with_tracing(
        self,
        tool_name: str,
        tool_input: dict
    ) -> ToolResult:
        # Create a child span for the tool call
        with self.tracer.start_as_current_span(
            f"{tool_name}.tool_call",
            kind=SpanKind.CLIENT
        ) as span:
            span.set_attribute("tool.name", tool_name)
            span.set_attribute("tool.input_size", len(str(tool_input)))

            start = time.time()
            result = await tool_registry.call(tool_name, tool_input)
            duration_ms = int((time.time() - start) * 1000)

            span.set_attribute("tool.duration_ms", duration_ms)
            span.set_attribute("tool.success", not isinstance(result, ToolError))

            if isinstance(result, ToolError):
                span.set_status(trace.StatusCode.ERROR, result.message)
            else:
                span.set_attribute("tool.result_size", len(str(result)))

            return result
```

---

## Propagating Context Across Agent Boundaries

When an orchestrator calls a worker agent (possibly a separate process or service), the trace context must be propagated:

```python
from opentelemetry.propagators.b3 import B3MultiFormat
from opentelemetry import propagate

class OrchestratorAgent:
    async def delegate_to_worker(
        self,
        worker: WorkerAgent,
        task: Task
    ) -> TaskResult:
        # Inject current trace context into the task headers
        headers = {}
        propagate.inject(headers)  # Injects traceparent, tracestate headers

        enriched_task = task.with_headers(headers)

        # The worker extracts context from headers and creates child spans
        return await worker.execute(enriched_task)

class WorkerAgent:
    async def execute(self, task: Task) -> TaskResult:
        # Extract trace context from task headers
        context = propagate.extract(task.headers)

        # Create child span linked to orchestrator's span
        with tracer.start_as_current_span(
            "WorkerAgent.execute",
            context=context  # Links to orchestrator span
        ) as span:
            return await self._execute_internal(task)
```

With this propagation, the worker's spans appear as children of the orchestrator's span in the trace view — giving you the complete call graph.

---

## Span Attributes for Agent-Specific Context

OpenTelemetry allows arbitrary attributes on spans. For agent systems, standardize on these:

```python
# Agent identity attributes (on every span)
span.set_attribute("agent.id", self.agent_id)
span.set_attribute("agent.name", self.agent_name)
span.set_attribute("agent.version", self.version)
span.set_attribute("agent.role", self.role)

# Task context attributes
span.set_attribute("task.id", task.id)
span.set_attribute("task.type", task.type)
span.set_attribute("task.priority", task.priority)
span.set_attribute("task.parent_id", task.parent_id or "")

# LLM inference attributes (on spans that include LLM calls)
span.set_attribute("llm.model", model_name)
span.set_attribute("llm.input_tokens", response.usage.input_tokens)
span.set_attribute("llm.output_tokens", response.usage.output_tokens)
span.set_attribute("llm.total_tokens", response.usage.total_tokens)
span.set_attribute("llm.cost_usd_cents", estimated_cost)
span.set_attribute("llm.latency_ms", llm_latency_ms)

# Context window attributes
span.set_attribute("context.messages_count", len(messages))
span.set_attribute("context.estimated_tokens", estimated_tokens)
span.set_attribute("context.utilization_pct", utilization_pct)

# Tool call attributes (on tool call spans)
span.set_attribute("tool.name", tool_name)
span.set_attribute("tool.attempt_number", attempt)
span.set_attribute("tool.is_retry", attempt > 1)
```

---

## Sampling Strategies

Traces generate a lot of data. For high-throughput systems, you can't afford to keep every trace. Sampling selects a subset:

### Head-based sampling

Decide at the start of a request whether to trace it. Simple but loses the ability to sample based on outcome.

```python
# Sample 10% of requests
sampler = TraceIdRatioBased(0.10)
```

### Tail-based sampling (recommended for agents)

Make the sampling decision at the end of the request, once you know the outcome. This lets you:
- Keep 100% of error traces
- Keep 100% of traces exceeding a latency threshold
- Sample only 5% of normal, fast traces

```python
class AgentTailSampler(Sampler):
    def should_sample(self, span: ReadableSpan) -> bool:
        # Always keep error traces
        if span.status.status_code == StatusCode.ERROR:
            return True

        # Always keep slow traces (> 30 seconds)
        duration_s = (span.end_time - span.start_time) / 1e9  # nanoseconds to seconds
        if duration_s > 30:
            return True

        # Always keep high-cost traces (> 10k tokens)
        total_tokens = sum(
            event.attributes.get("llm.total_tokens", 0)
            for event in span.events
        )
        if total_tokens > 10000:
            return True

        # Sample 5% of normal traces
        return random.random() < 0.05
```

---

## Reading Traces for Debugging

When debugging a production issue, here's the workflow:

### Step 1: Find the trace

```
# Search by task ID, user ID, or time range in your tracing backend
GET /api/traces?task_id=task_comp_analysis_01&start=2026-03-25T14:00:00Z
```

### Step 2: Look at the waterfall

The trace waterfall shows all spans in timeline order. Look for:
- **The longest span** (the bottleneck)
- **Gaps between spans** (time where nothing is happening — often waiting for external resources)
- **Error spans** (red indicators)
- **Spans that shouldn't exist** (unexpected tool calls, delegation to wrong agents)

### Step 3: Drill into error spans

Click on an error span to see:
- Exception type and message
- Stack trace
- Input attributes at the time of failure
- Events recorded before the error

### Step 4: Cross-reference with logs

Use the `trace_id` to pull all structured logs for this trace:

```sql
SELECT * FROM logs
WHERE trace_id = 'trace_abc123'
ORDER BY timestamp ASC;
```

This gives you both the timeline (trace) and the detailed events (logs) for the full picture.

---

## Summary

- OpenTelemetry is the open standard for distributed tracing — use it to instrument agents
- Span hierarchy: root span (user request), child spans (agent executions), grandchild spans (tool calls)
- Propagate trace context across agent boundaries using OTel's built-in propagation APIs
- Standardize span attributes: agent identity, task context, LLM inference metrics, context window state
- Tail-based sampling keeps 100% of error and slow traces while sampling normal traces at lower rates
- Debugging workflow: find trace → read waterfall → drill into error spans → cross-reference with logs

---

*Next: [Lesson 4.4 — Metrics and Cost Monitoring](04-metrics-and-monitoring.md)*
