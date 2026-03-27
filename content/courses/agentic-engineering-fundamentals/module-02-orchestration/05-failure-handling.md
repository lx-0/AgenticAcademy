# Lesson 2.5: Failure Handling in Orchestration

**Module**: 2 — Orchestration and Coordination
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

In production, things fail. APIs time out. LLMs return unexpected outputs. Agents run out of context. Networks drop packets. A multi-agent orchestration system that doesn't account for failure isn't production-grade — it's a demo.

This lesson covers retry logic, circuit breakers, fallback agents, and dead-letter queues. These patterns transform a system that works when everything goes right into one that recovers gracefully when things go wrong.

---

## Failure Taxonomy

Not all failures are equal. Before designing recovery, classify your failures:

| Failure Type | Example | Recovery Strategy |
|-------------|---------|-------------------|
| Transient | Network timeout, rate limit | Retry with backoff |
| Intermittent | Flaky tool API | Retry with increased timeout |
| Systematic | Invalid input format | Fix input, don't retry |
| Permanent | Agent misconfiguration | Escalate, don't retry |
| Cascading | Downstream failure propagating up | Circuit breaker |
| Silent | Agent returns wrong but plausible output | Validation + monitoring |

The most dangerous failures are the **silent** ones — they don't raise exceptions, they produce plausible-looking wrong answers that propagate through the system.

---

## Retry Logic

Retries handle transient failures. They should always include:

1. **Maximum attempt count**: Retrying indefinitely wastes resources and delays escalation.
2. **Exponential backoff**: Rapid retries worsen load on a struggling service.
3. **Jitter**: Random delay variation prevents retry storms (all agents retrying at the same time).
4. **Retry condition**: Not all errors should be retried (retrying on a 400 Bad Request wastes time).

```python
@dataclass
class RetryConfig:
    max_attempts: int = 3
    base_delay_seconds: float = 1.0
    max_delay_seconds: float = 60.0
    backoff_factor: float = 2.0
    jitter_factor: float = 0.25
    retryable_exceptions: tuple = (TimeoutError, RateLimitError, TransientAPIError)

async def with_retry(
    coroutine_fn: Callable[[], Coroutine],
    config: RetryConfig = RetryConfig()
) -> Any:
    last_exception = None

    for attempt in range(config.max_attempts):
        try:
            return await coroutine_fn()

        except config.retryable_exceptions as e:
            last_exception = e

            if attempt == config.max_attempts - 1:
                break  # Don't sleep after the last attempt

            # Exponential backoff with jitter
            delay = min(
                config.base_delay_seconds * (config.backoff_factor ** attempt),
                config.max_delay_seconds
            )
            jitter = delay * config.jitter_factor * random.uniform(-1, 1)
            sleep_time = max(0, delay + jitter)

            await asyncio.sleep(sleep_time)

        except Exception as e:
            # Non-retryable error — fail immediately
            raise NonRetryableError(f"Non-retryable failure: {e}") from e

    raise MaxRetriesExceeded(
        f"Failed after {config.max_attempts} attempts. Last error: {last_exception}"
    ) from last_exception
```

### Retry idempotency

Before retrying, always verify that the operation is idempotent. Retrying a non-idempotent operation (e.g., "send email") can cause duplicate side effects.

```python
async def safe_retry(task: Task, config: RetryConfig) -> TaskResult:
    if not task.is_idempotent:
        # Non-idempotent tasks should not be automatically retried
        raise NonRetryableTask(
            f"Task {task.id} is not marked idempotent — manual retry required"
        )

    return await with_retry(lambda: agent.execute(task), config)
```

---

## Circuit Breakers

A circuit breaker prevents a failing dependency from taking down the entire system. When a service starts failing, the circuit "opens" and requests fail fast (without attempting the call) until the service recovers.

```
Normal state:       CLOSED (requests pass through)
After N failures:   OPEN (requests fail immediately without attempting)
After timeout:      HALF-OPEN (one trial request allowed through)
If trial succeeds:  Back to CLOSED
If trial fails:     Back to OPEN
```

```python
class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        success_threshold: int = 2,
        open_timeout_seconds: float = 60.0
    ):
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold
        self.open_timeout = open_timeout_seconds
        self.opened_at: float | None = None

    async def call(self, coroutine_fn: Callable) -> Any:
        if self.state == CircuitState.OPEN:
            elapsed = time.time() - self.opened_at
            if elapsed < self.open_timeout:
                raise CircuitOpenError(
                    f"Circuit is OPEN. Retry after {self.open_timeout - elapsed:.0f}s"
                )
            # Transition to half-open for a trial call
            self.state = CircuitState.HALF_OPEN

        try:
            result = await coroutine_fn()
            self._on_success()
            return result

        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self):
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                self.success_count = 0
        elif self.state == CircuitState.CLOSED:
            self.failure_count = 0  # Reset on success

    def _on_failure(self):
        self.failure_count += 1
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            self.opened_at = time.time()
            self.success_count = 0
```

### Using circuit breakers in agent systems

```python
class RobustOrchestrator:
    def __init__(self):
        # One circuit breaker per downstream service/agent
        self.breakers = {
            "search-agent": CircuitBreaker(failure_threshold=3, open_timeout_seconds=30),
            "analysis-agent": CircuitBreaker(failure_threshold=5, open_timeout_seconds=60),
            "external-api": CircuitBreaker(failure_threshold=10, open_timeout_seconds=120),
        }

    async def call_agent(self, agent_id: str, task: Task) -> TaskResult:
        breaker = self.breakers.get(agent_id)
        if not breaker:
            raise ConfigError(f"No circuit breaker configured for agent: {agent_id}")

        try:
            return await breaker.call(lambda: self.agents[agent_id].execute(task))
        except CircuitOpenError:
            # Try fallback agent
            return await self.call_fallback(agent_id, task)
```

---

## Fallback Agents

A fallback agent handles tasks when the primary agent is unavailable or over capacity.

```python
@dataclass
class AgentWithFallback:
    primary: Agent
    fallback: Agent | None
    fallback_degraded: bool = True  # Does using fallback reduce output quality?

class FallbackOrchestrator:
    async def execute_with_fallback(
        self,
        agent_config: AgentWithFallback,
        task: Task
    ) -> TaskResult:
        # Try primary
        try:
            result = await agent_config.primary.execute(task)
            return result

        except (CircuitOpenError, AgentUnavailableError, MaxRetriesExceeded) as e:
            primary_error = e

        # Primary failed — try fallback
        if agent_config.fallback is None:
            raise NoBallbackAvailable(
                f"Primary agent failed and no fallback configured: {primary_error}"
            )

        result = await agent_config.fallback.execute(task)

        if agent_config.fallback_degraded:
            result.quality_flag = QualityFlag.DEGRADED
            result.quality_note = f"Result from fallback agent. Primary unavailable: {primary_error}"

        return result
```

### Fallback strategy hierarchy

In complex systems, define a fallback chain:

```
Primary agent (best capability) → Fallback 1 (reduced capability) →
Fallback 2 (minimal capability) → Cache (last known good result) →
Human escalation
```

Each level represents a trade-off between availability and quality. Critically: **always flag** when a fallback was used. Silent fallback degradation (where the system pretends it used the primary when it didn't) misleads downstream consumers.

---

## Dead-Letter Queues

A dead-letter queue (DLQ) is a holding area for tasks that have exhausted all retry and fallback options. Rather than silently discarding them or propagating failures, you route them to the DLQ for investigation and manual handling.

```python
class AgentTaskQueue:
    async def enqueue(self, task: Task) -> None: ...
    async def dequeue(self) -> Task: ...
    async def ack(self, task_id: str) -> None: ...
    async def nack(self, task_id: str, reason: str) -> None: ...
    async def dead_letter(self, task: Task, reason: str, error: Exception) -> None: ...

class DLQProcessor:
    """Processes dead-lettered tasks — inspects, routes for manual review, or retries."""

    async def process_dlq(self) -> None:
        async for dead_task in self.dlq.stream():
            await self.analyze_dead_task(dead_task)
            await self.route_for_review(dead_task)
            await self.alert_on_call(dead_task)

    async def analyze_dead_task(self, dead_task: DeadLetteredTask) -> None:
        """Classify the failure type to inform routing."""
        if dead_task.failure_count > 10:
            dead_task.failure_category = "persistent_failure"
        elif "rate_limit" in dead_task.last_error:
            dead_task.failure_category = "capacity_issue"
        elif "invalid_input" in dead_task.last_error:
            dead_task.failure_category = "input_validation_failure"
```

### What to capture in the DLQ

```python
@dataclass
class DeadLetteredTask:
    original_task: Task
    failure_count: int
    failure_history: list[FailureRecord]
    last_error: str
    last_error_type: str
    first_failure_at: str
    last_failure_at: str
    failure_category: str | None  # Set by DLQ processor
    manual_review_assigned_to: str | None
    resolution_notes: str | None
```

---

## Putting It All Together: A Robust Execution Pipeline

```python
class RobustExecutionPipeline:
    async def execute(self, task: Task) -> TaskResult:
        try:
            # 1. Check idempotency cache
            if cached := await self.result_cache.get(task.idempotency_key):
                return cached

            # 2. Execute with circuit breaker protection
            result = await self.circuit_breaker.call(
                lambda: with_retry(
                    lambda: self.primary_agent.execute(task),
                    config=RetryConfig(max_attempts=3)
                )
            )

            # 3. Validate result
            await self.validator.validate(result, task)

            # 4. Cache successful result
            await self.result_cache.set(task.idempotency_key, result)

            return result

        except CircuitOpenError:
            # 5. Try fallback agent
            return await self.fallback_agent.execute(task)

        except MaxRetriesExceeded as e:
            # 6. Dead-letter the task
            await self.dlq.enqueue(task, reason=str(e))
            raise TaskPermanentlyFailed(task.id) from e

        except ValidationError as e:
            # 7. Validation failures may be worth retrying (sometimes models improve on retry)
            # or may need human review
            if e.severity == "critical":
                await self.escalate_to_human(task, e)
            else:
                return result.with_warnings([str(e)])
```

---

## Silent Failure Detection

The hardest failures to catch are the ones that don't raise exceptions — where an agent returns a result that looks valid but is actually wrong.

Strategies for detecting silent failures:

**Schema validation**: Parse every agent output against a strict schema. A result that doesn't match the schema is flagged.

**Confidence thresholds**: Require agents to return confidence scores. Results below a threshold trigger review.

**Cross-agent verification**: For high-stakes tasks, run two independent agents and compare results. Significant divergence triggers review.

**Spot checking**: Sample a percentage of agent outputs for human review. This creates a feedback loop for detecting systematic silent failures.

```python
async def execute_with_silent_failure_detection(
    task: Task,
    agent: Agent,
    validator: OutputValidator
) -> TaskResult:
    result = await agent.execute(task)

    # Schema validation
    if not validator.validate_schema(result):
        raise SilentFailureDetected("Output doesn't match expected schema")

    # Confidence check
    if result.confidence < 0.5:
        result.requires_review = True
        result.review_reason = f"Low confidence: {result.confidence}"

    # Spot check sampling (e.g., 5% of outputs)
    if random.random() < 0.05:
        await self.spot_check_queue.enqueue(result, task)

    return result
```

---

## Summary

- Classify failures before designing recovery: transient (retry), systematic (fix input), permanent (escalate), silent (validate)
- Retry with exponential backoff and jitter — always limit attempts and only retry idempotent operations
- Circuit breakers prevent cascading failures by failing fast when a dependency is struggling
- Fallback agents maintain availability when primary agents fail — always flag degraded fallback results
- Dead-letter queues capture permanently failed tasks for investigation rather than silently discarding them
- Silent failure detection (schema validation, confidence thresholds, spot checking) catches the most dangerous failure type

---

## Module 2 Key Takeaways

1. Task routing: deterministic rules for known types, LLM routing for novel cases, capability registries for scale
2. Handoffs require structured context, explicit acknowledgment, and idempotency keys
3. Parallelism: fan-out/fan-in with concurrency limits, timeout protection, and policy-driven partial failure handling
4. Shared state requires optimistic concurrency control (compare-and-swap) and idempotent writes
5. Failure handling: retry → circuit breaker → fallback → DLQ — each layer adds resilience

---

*Module 2 complete. Proceed to the [Module 2 Assessment](assessment.json) and [Module 2 Lab](lab.md) before continuing to Module 3.*
