# Lesson 2.3: Concurrency and Parallelism

**Module**: 2 — Orchestration and Coordination
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

One of the biggest performance gains in multi-agent systems comes from running independent tasks in parallel rather than sequentially. A research task that requires 5 independent sub-queries can run all 5 simultaneously, reducing wall-clock time by up to 5x.

But parallel agent execution introduces coordination challenges that don't exist in sequential systems: race conditions, result merging complexity, and partial failure handling. This lesson covers fan-out/fan-in patterns, merge strategies, and production concurrency management.

---

## Fan-Out / Fan-In

The fundamental parallel pattern is **fan-out / fan-in**:

1. **Fan-out**: One orchestrator dispatches multiple independent tasks to worker agents simultaneously
2. **Fan-in**: When all (or enough) workers complete, their results are collected and merged

```
                  ┌───────────────┐
                  │  Orchestrator │
                  └───────┬───────┘
                          │ Fan-out
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │Worker 1│  │Worker 2│  │Worker 3│
         └────┬───┘  └────┬───┘  └────┬───┘
              │           │           │
              └───────────┼───────────┘
                          │ Fan-in
                          ▼
                  ┌───────────────┐
                  │  Merge Step   │
                  └───────────────┘
```

### Basic implementation with asyncio

```python
async def fan_out_fan_in(
    orchestrator: OrchestratorAgent,
    tasks: list[Task],
    workers: list[WorkerAgent]
) -> list[TaskResult]:
    # Assign tasks to workers (round-robin or capability-based)
    assignments = assign_tasks_to_workers(tasks, workers)

    # Fan-out: execute all tasks concurrently
    coroutines = [
        worker.execute(task)
        for worker, task in assignments
    ]
    results = await asyncio.gather(*coroutines, return_exceptions=True)

    # Separate successes from failures
    successful = []
    failed = []
    for task, result in zip(tasks, results):
        if isinstance(result, Exception):
            failed.append((task, result))
        else:
            successful.append(result)

    if failed:
        # Handle failures based on policy
        await handle_parallel_failures(failed, orchestrator)

    return successful
```

### The gather-or-cancel decision

`asyncio.gather` by default continues even if some tasks fail. Consider whether to:

1. **Continue on failure** (`return_exceptions=True`): Best when partial results are useful. The merge step handles missing data.

2. **Cancel on first failure** (`return_exceptions=False`): Best when all results are required and partial results are not useful. Fails fast rather than waiting for all tasks to complete.

```python
# Continue on failure (partial results acceptable)
results = await asyncio.gather(*coroutines, return_exceptions=True)

# Cancel on first failure (all results required)
try:
    results = await asyncio.gather(*coroutines)
except Exception as e:
    # One task failed; all remaining tasks are cancelled
    await handle_complete_failure(e)
```

---

## Concurrency Controls

Unlimited parallelism causes its own problems:
- **Rate limiting**: External APIs have request limits. 20 concurrent agents all calling the same API will hit rate limits.
- **Cost explosion**: Each concurrent agent consumes tokens. 50 concurrent agents running for 5 minutes each is 250 agent-minutes of cost.
- **Resource contention**: Shared database connections, file handles, or network bandwidth get exhausted.

### Semaphore-based concurrency limits

```python
async def fan_out_with_limit(
    tasks: list[Task],
    workers: list[WorkerAgent],
    max_concurrent: int = 5
) -> list[TaskResult]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def execute_with_limit(worker: WorkerAgent, task: Task) -> TaskResult:
        async with semaphore:
            return await worker.execute(task)

    coroutines = [
        execute_with_limit(worker, task)
        for worker, task in assign_tasks_to_workers(tasks, workers)
    ]
    return await asyncio.gather(*coroutines, return_exceptions=True)
```

### Rate-limited execution

When calling external APIs, implement exponential backoff with jitter to avoid retry storms:

```python
async def execute_with_rate_limit(
    task: Task,
    worker: WorkerAgent,
    rate_limiter: RateLimiter
) -> TaskResult:
    for attempt in range(5):
        try:
            # Acquire rate limit token before executing
            await rate_limiter.acquire()
            return await worker.execute(task)

        except RateLimitError as e:
            wait_time = min(2 ** attempt + random.uniform(0, 1), 60)
            await asyncio.sleep(wait_time)

    raise MaxRetriesExceeded(f"Task {task.id} failed after 5 rate limit retries")
```

---

## Merge Strategies

Fan-in requires a merge strategy: how do you combine results from multiple workers into a coherent final output?

### Strategy 1: Concatenation (for lists)

When workers produce independent items that should all be included:

```python
def merge_by_concatenation(results: list[TaskResult]) -> MergedResult:
    all_items = []
    for result in results:
        all_items.extend(result.items)

    return MergedResult(
        items=deduplicate(all_items),  # Remove duplicates from overlapping searches
        sources=flatten([r.sources for r in results])
    )
```

### Strategy 2: LLM synthesis (for narrative content)

When workers produce text summaries that should be combined into a coherent narrative:

```python
async def merge_by_synthesis(
    results: list[TaskResult],
    original_goal: str,
    synthesizer: SynthesizerAgent
) -> MergedResult:
    # Prepare summaries for synthesis
    summaries = [
        f"[Worker {i+1} findings on '{r.sub_task}']\n{r.content}"
        for i, r in enumerate(results)
    ]

    merged = await synthesizer.synthesize(
        goal=original_goal,
        inputs=summaries
    )

    return MergedResult(
        content=merged,
        sources=flatten([r.sources for r in results]),
        confidence=min(r.confidence for r in results)  # Conservative: use minimum confidence
    )
```

### Strategy 3: Voting (for decisions with multiple candidates)

When workers make independent assessments and the result should reflect consensus:

```python
def merge_by_voting(results: list[TaskResult]) -> MergedResult:
    votes = Counter(r.decision for r in results)
    total = len(results)

    winner, count = votes.most_common(1)[0]
    confidence = count / total

    if confidence < 0.6:
        # No clear consensus — flag for human review
        return MergedResult(
            decision=winner,
            confidence=confidence,
            requires_review=True,
            vote_breakdown=dict(votes)
        )

    return MergedResult(
        decision=winner,
        confidence=confidence,
        requires_review=False
    )
```

### Strategy 4: Priority-ordered selection

When one source is more authoritative than others, use it when available and fall back to others:

```python
def merge_by_priority(
    results: list[TaskResult],
    priority_order: list[str]  # agent_ids in priority order
) -> TaskResult:
    # Create lookup by source agent
    by_source = {r.source_agent_id: r for r in results}

    for priority_agent_id in priority_order:
        if priority_agent_id in by_source:
            result = by_source[priority_agent_id]
            if result.success and result.confidence > 0.5:
                return result

    # No priority source available — fall back to most confident result
    return max(results, key=lambda r: r.confidence)
```

---

## Handling Partial Failures in Parallel Execution

When 3 of 5 concurrent tasks succeed and 2 fail, you have three choices:

**Option 1: Proceed with partial results** (best for best-effort tasks)
```python
successful_results = [r for r in results if not isinstance(r, Exception)]
if len(successful_results) / len(results) >= minimum_success_rate:
    return await merge(successful_results, annotate_partial=True)
else:
    raise InsufficientResultsError(...)
```

**Option 2: Retry failed tasks** (best when failures are likely transient)
```python
failed_tasks = [(t, r) for t, r in zip(tasks, results) if isinstance(r, Exception)]
retry_results = await asyncio.gather(*[
    worker.execute(task, attempt=2)
    for task, _ in failed_tasks
], return_exceptions=True)
```

**Option 3: Escalate** (best for high-stakes tasks where partial results are dangerous)
```python
if any(isinstance(r, Exception) for r in results):
    await orchestrator.escalate(
        reason="Parallel task failures — manual review required",
        failed_tasks=failed_tasks
    )
```

Production systems often implement all three with policy-based selection:

```python
async def handle_parallel_failures(
    failed_tasks: list[tuple[Task, Exception]],
    policy: FailurePolicy
) -> None:
    if policy == FailurePolicy.BEST_EFFORT:
        # Log and continue
        for task, error in failed_tasks:
            await log_failure(task, error)
    elif policy == FailurePolicy.RETRY:
        await retry_failed_tasks(failed_tasks)
    elif policy == FailurePolicy.ESCALATE:
        await escalate_to_human(failed_tasks)
```

---

## Streaming Fan-In

In a standard fan-in, the orchestrator waits for ALL workers to complete before merging. For long-running workers, this means early finishers sit idle while slow workers complete.

**Streaming fan-in** processes results as they arrive:

```python
async def streaming_fan_in(
    coroutines: list[Coroutine],
    process_result: Callable[[TaskResult], None]
) -> list[TaskResult]:
    """Process results as they complete rather than waiting for all."""
    collected = []

    for future in asyncio.as_completed(coroutines):
        result = await future
        await process_result(result)  # Process immediately
        collected.append(result)

    return collected
```

This is particularly valuable when:
- Downstream processing can start before all inputs are ready
- Some results are much faster than others (long tail distribution)
- You want to surface early results to users while waiting for complete results

---

## Timeouts: The Parallel Execution Safety Net

Always set timeouts on parallel task execution. A single hanging worker should not block your entire system:

```python
async def fan_out_with_timeout(
    tasks: list[Task],
    workers: list[WorkerAgent],
    timeout_seconds: float = 120.0
) -> list[TaskResult | TimeoutResult]:
    async def execute_with_timeout(worker: WorkerAgent, task: Task) -> TaskResult:
        try:
            return await asyncio.wait_for(
                worker.execute(task),
                timeout=timeout_seconds
            )
        except asyncio.TimeoutError:
            return TimeoutResult(
                task_id=task.id,
                worker_id=worker.agent_id,
                timeout_seconds=timeout_seconds
            )

    return await asyncio.gather(*[
        execute_with_timeout(w, t)
        for w, t in assign_tasks_to_workers(tasks, workers)
    ])
```

---

## Summary

- Fan-out/fan-in is the foundational parallel pattern: dispatch tasks concurrently, collect and merge results
- Control concurrency with semaphores to prevent rate limit violations and resource exhaustion
- Merge strategies depend on result type: concatenation (lists), LLM synthesis (narratives), voting (decisions), priority ordering (authoritative sources)
- Partial failure handling should be policy-driven: proceed with partial results, retry, or escalate
- Streaming fan-in processes results as they arrive rather than waiting for all workers
- Always set timeouts — one hanging worker should not block the entire system

---

*Next: [Lesson 2.4 — State Management Across Agents](04-state-management.md)*
