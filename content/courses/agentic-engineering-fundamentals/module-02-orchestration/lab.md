# Module 2 Lab: Debug the Concurrent State Collision

**Module**: 2 — Orchestration and Coordination
**Estimated time**: 75–90 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

You extend the Module 1 research pipeline to run subtasks concurrently. You receive a pre-built system where two worker agents write conflicting results to shared state, producing incorrect merged output. Your job is to:

1. **Reproduce** the race condition using the provided test harness
2. **Implement** a merge strategy with idempotent task processing
3. **Validate** the fix with the provided assertion suite (must pass 10/10 concurrent test cases)

---

## Scenario

The Module 1 research pipeline has been extended to run sub-question searches concurrently. The new pipeline:

1. Orchestrator decomposes question into 5 sub-questions
2. All 5 SearchWorkers run concurrently and write to shared state
3. SummarizerAgent reads shared state when all workers complete

The system was working in low-concurrency testing. Under production load with real concurrent workers, it produces:
- Duplicate findings (the same fact appears multiple times)
- Missing findings (some workers' results don't appear in final state)
- Inconsistent results (running the same query twice produces different output)

You've been brought in to fix it.

---

## Setup

```bash
# Verify your sandbox is ready
$ research-lab status
✓ OrchestratorAgent: loaded
✓ SearchWorker x5: loaded
✓ SummarizerAgent: loaded
✓ SharedStateStore: loaded (buggy version)
✓ Test harness: ready (10 concurrent test cases)

# Inspect the current shared state implementation
$ cat /workspace/concurrent-pipeline/state_store.py
```

---

## Part 1: Reproduce the Race Condition (20 minutes)

### Step 1.1: Run the test harness

```bash
cd /workspace/concurrent-pipeline
research-lab test --mode concurrent --runs 10 --verbose
```

Expected output (buggy system):
```
Run 1: ✓ 5 sub-questions found, 4 results in state (MISSING 1)
Run 2: ✓ 5 sub-questions found, 6 results in state (DUPLICATE 1)
Run 3: ✓ 5 sub-questions found, 3 results in state (MISSING 2)
...
Run 10: ✓ 5 sub-questions found, 5 results in state ✓
Overall: 1/10 test cases passed (FAIL)
```

### Step 1.2: Read the race condition

Examine `/workspace/concurrent-pipeline/state_store.py`. Find the `write_result` method:

```python
async def write_result(self, worker_id: str, result: SearchResult) -> None:
    # BUG: Read-modify-write without version control
    current_state = await self.store.read("task_results")
    if current_state is None:
        current_state = []
    current_state.append(result)
    await self.store.write("task_results", current_state)  # No version check!
```

**Document in `/workspace/race-condition-analysis.md`**:
1. Describe precisely when the race condition occurs (which two operations interleave to cause it)
2. Draw a timeline showing two workers causing a lost update (use ASCII art or text)
3. Explain why this bug appears intermittently rather than always

### Step 1.3: Understand the scope

Run the analysis tool to see how often the race condition occurs at different concurrency levels:

```bash
research-lab analyze-race --workers 2,3,5,10
```

Note how race condition frequency increases with concurrency.

---

## Part 2: Implement the Fix (45 minutes)

### Step 2.1: Fix shared state writes with compare-and-swap

In `/workspace/concurrent-pipeline/state_store.py`, replace the buggy `write_result` method with a version-controlled implementation:

```python
async def write_result(
    self,
    worker_id: str,
    result: SearchResult,
    max_retries: int = 10
) -> None:
    """
    Write a search result to shared state using optimistic locking.
    Retries on version conflict until successful or max_retries exceeded.
    """
    for attempt in range(max_retries):
        # TODO: Read current state with version number
        # TODO: Check for duplicate (idempotency)
        # TODO: Compute new state
        # TODO: Attempt compare-and-swap write
        # TODO: If CAS succeeds, return
        # TODO: If CAS fails (version conflict), add jitter and retry
        pass

    raise StateWriteError(
        f"Worker {worker_id} failed to write after {max_retries} retries"
    )
```

Requirements for your implementation:
- Use `self.store.compare_and_swap(key, expected_version, new_value)` — returns `True` if successful
- Implement exponential backoff with jitter between retries
- Add deduplication: if a result with the same `result.query` already exists in state, skip the write (idempotency)

### Step 2.2: Add idempotent task processing

In `/workspace/concurrent-pipeline/worker.py`, add an idempotency key to each task and check it before executing:

```python
class SearchWorker:
    async def execute_task(self, task: SearchTask) -> SearchResult:
        # TODO: Compute idempotency key from task inputs
        # TODO: Check if result already in cache
        # TODO: If cached, return cached result (idempotent)
        # TODO: Execute search
        # TODO: Store result in cache with idempotency key
        # TODO: Return result
        pass
```

The idempotency key should be derived from `task.query` and `task.task_version` (not `task.id`, which changes on retry).

### Step 2.3: Add merge validation

In `/workspace/concurrent-pipeline/orchestrator.py`, add validation before passing state to the SummarizerAgent:

```python
async def validate_and_merge_results(
    self,
    expected_queries: list[str]
) -> MergedResults:
    """
    Read shared state, validate completeness, and produce a merged result.
    """
    state = await self.state_store.read_all()

    # TODO: Check that we have exactly one result per expected query
    # TODO: Identify any missing queries
    # TODO: Identify any duplicate queries
    # TODO: If missing queries: retry those specific workers
    # TODO: If duplicates: deduplicate by keeping highest-confidence result
    # TODO: Return validated, deduplicated MergedResults
    pass
```

### Step 2.4: Run the test harness again

```bash
research-lab test --mode concurrent --runs 10 --verbose
```

**Target output**:
```
Run 1:  ✓ 5 sub-questions, 5 results, no duplicates (PASS)
Run 2:  ✓ 5 sub-questions, 5 results, no duplicates (PASS)
...
Run 10: ✓ 5 sub-questions, 5 results, no duplicates (PASS)
Overall: 10/10 test cases passed ✓
```

If you're not passing all 10, check:
- Are your retry delays using jitter? (pure exponential without jitter creates synchronized retries)
- Is your deduplication checking the right field? (`query` content, not `result_id`)
- Is your CAS read including the version field?

---

## Part 3: Submit Trace Logs (10 minutes)

The test harness captures execution traces. Export and review them:

```bash
research-lab export-traces --format json > /workspace/traces.json
research-lab analyze-traces --input /workspace/traces.json
```

The trace analysis should show:
- Worker fan-out: all 5 workers started within 100ms of each other
- Correct fan-in: SummarizerAgent started only after all 5 workers completed
- CAS retry events (shows your fix working): some workers retried 1–2 times
- Zero duplicate results in final state

**Submit the trace file** along with your code. The grader will verify that the traces show correct fan-out/fan-in behavior.

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| Race condition analysis | 20 | Correctly identifies the lost-update pattern and explains timing |
| CAS implementation | 30 | Passes 10/10 concurrent test cases |
| Idempotency implementation | 20 | Retried workers don't produce duplicate state writes |
| Merge validation | 20 | Correctly handles missing and duplicate results |
| Trace submission | 10 | Trace shows correct fan-out/fan-in with CAS retries visible |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
research-lab submit \
  --workspace /workspace/concurrent-pipeline/ \
  --analysis /workspace/race-condition-analysis.md \
  --traces /workspace/traces.json
```

---

## Hints

**"My CAS retries loop indefinitely in tests"**
Add a max_retries guard and ensure your backoff actually waits (don't set delay to 0 in tests). The test harness injects artificial delays between CAS operations to surface race conditions — your retry logic needs to handle these.

**"I'm passing 8/10 but not all 10"**
The remaining failures are likely the deduplication check. Ensure you're checking `result.query` (normalized, lowercase) not `result.query_id` (which varies between retry attempts of the same query).

**"The trace shows SummarizerAgent starting before all workers complete"**
Your orchestrator's `wait_for_all_workers` logic has a bug. Check that you're using `asyncio.gather` (waits for all) not `asyncio.as_completed` (processes as they arrive).
