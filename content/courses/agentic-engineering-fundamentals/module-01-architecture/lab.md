# Module 1 Lab: Build a Broken Research Pipeline

**Module**: 1 — Agent Architecture Patterns
**Estimated time**: 60–90 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

You receive a partially broken 3-agent research system. The system was designed to research a question, but it's built with a flat peer-to-peer design that fails at scale. Your job is to:

1. **Diagnose** why the peer-to-peer design creates coordination failures
2. **Refactor** the system to an orchestrator/worker pattern
3. **Document** your architecture using the provided diagram template

This lab teaches the most common refactor pattern in production agentic systems: migrating from ad-hoc P2P to structured orchestration.

---

## Scenario

The Acme research team built a 3-agent system to answer complex research questions:

- **PlannerAgent**: Decomposes a question into sub-questions
- **SearchAgent**: Searches a web index for information
- **SummarizerAgent**: Synthesizes search results into an answer

The original design has PlannerAgent calling SearchAgent directly, SearchAgent sometimes calling SummarizerAgent with partial results, and SummarizerAgent occasionally calling SearchAgent for additional information. This worked fine for simple questions. Under production load, it produces duplicate results, dropped sub-questions, and occasional infinite loops.

---

## Setup

Your sandbox environment is pre-configured with:

```bash
# Verify your sandbox is ready
$ research-lab status
✓ PlannerAgent scaffold: loaded
✓ SearchAgent scaffold: loaded
✓ SummarizerAgent scaffold: loaded
✓ Test harness: ready
✓ Architecture diagram template: /workspace/diagram-template.md
```

The broken system is in `/workspace/broken-pipeline/`.

---

## Part 1: Diagnose the P2P Failures (20 minutes)

### Step 1.1: Run the diagnostic suite

```bash
cd /workspace/broken-pipeline
research-lab diagnose --input test-inputs/complex-question.txt --verbose
```

The diagnostic suite will run the broken P2P system against a complex multi-part question and capture:
- Agent call graph (which agent called which)
- Duplicate tool calls
- Dropped sub-questions (sub-questions from the plan that were never searched)
- Any detected cycle patterns

### Step 1.2: Analyze the call graph

Examine the call graph output. You should observe:

- At least one instance where SearchAgent calls SummarizerAgent before all sub-questions are searched
- At least one instance where two agents make the same search query (deduplication failure)
- At least one instance of a near-cycle: SummarizerAgent requests more information from SearchAgent, which returns to SummarizerAgent

### Step 1.3: Document your findings

In `/workspace/diagnosis.md`, record:

1. **What coordination failures you observed** (with specific examples from the call graph)
2. **Why the P2P design causes these failures** (in 3–5 sentences connecting the pattern to the failure)
3. **Which aspects of the P2P design are salvageable** (hint: the individual agents' core logic is fine — only the coordination layer needs to change)

**Expected output**: A completed `/workspace/diagnosis.md` file.

---

## Part 2: Refactor to Orchestrator/Worker (40 minutes)

### Step 2.1: Design the orchestrator

In `/workspace/refactored-pipeline/orchestrator.py`, implement an `OrchestratorAgent` class that:

1. Receives the original research question
2. Calls `PlannerAgent` to decompose it into sub-questions
3. Calls `SearchAgent` for each sub-question **in parallel** (use `asyncio.gather`)
4. Waits for all search results before calling `SummarizerAgent`
5. Returns the final synthesized answer

```python
# Scaffold provided — implement the marked sections

class OrchestratorAgent:
    def __init__(self, planner: PlannerAgent, searcher: SearchAgent, summarizer: SummarizerAgent):
        self.planner = planner
        self.searcher = searcher
        self.summarizer = summarizer

    async def research(self, question: str) -> ResearchResult:
        # TODO: Step 1 — Call planner, get sub-questions
        # TODO: Step 2 — Call searcher in parallel for each sub-question
        # TODO: Step 3 — Validate all search results returned
        # TODO: Step 4 — Call summarizer with all results
        # TODO: Step 5 — Return structured ResearchResult
        pass
```

### Step 2.2: Remove direct agent-to-agent calls

In the existing agent files, remove any code that calls other agents directly:
- `SearchAgent` should only search — no calls to `SummarizerAgent`
- `SummarizerAgent` should only summarize — no calls to `SearchAgent`
- `PlannerAgent` should only plan — no calls to other agents

All coordination now goes through `OrchestratorAgent`.

### Step 2.3: Add result validation

Add validation to the orchestrator to detect and handle partial failures:

```python
def validate_search_results(
    self,
    sub_questions: list[str],
    results: list[SearchResult | None]
) -> ValidationReport:
    # Check: did we get a result for every sub-question?
    # Check: are any results empty or error states?
    # Return: ValidationReport with success flag and list of missing/failed sub-questions
    pass
```

If validation fails, the orchestrator should:
1. Log the failures
2. Retry failed sub-questions once
3. If still failing, proceed with partial results and annotate the summary accordingly

### Step 2.4: Run the validation suite

```bash
research-lab validate --pipeline refactored-pipeline/ --input test-inputs/
```

**Expected output**:
```
✓ complex-question.txt: All 5 sub-questions searched, no duplicates, summary produced
✓ simple-question.txt: 2 sub-questions searched, summary produced
✓ edge-case-ambiguous.txt: 4/4 sub-questions searched, 1 retry triggered, summary annotated with uncertainty
✗ edge-case-rate-limit.txt: PARTIAL FAIL — your retry logic must handle rate limit errors
```

Fix the rate limit handling in your retry logic, then re-run until all 4 test cases pass.

---

## Part 3: Document Your Architecture (20 minutes)

Using the provided diagram template at `/workspace/diagram-template.md`, create an architecture diagram for your refactored system that includes:

1. **Component boxes** for each agent (Orchestrator, Planner, Searcher, Summarizer)
2. **Arrows** showing the direction of calls and data flow
3. **Labels** on each arrow indicating what data is passed (question, sub-questions, search results, final summary)
4. **Annotations** for:
   - The parallelism point (where sub-questions are searched concurrently)
   - The validation checkpoint
   - The error handling path

**Completed diagram should look something like**:

```
User Question
     │
     ▼
┌────────────────────────────────────────────────────────┐
│                    OrchestratorAgent                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 1. Decompose question into sub-questions          │  │
│  │ 2. Dispatch sub-questions in parallel             │  │
│  │ 3. Validate all results received                  │  │
│  │ 4. Synthesize final answer                        │  │
│  └──────────────────────────────────────────────────┘  │
└──┬────────┬────────────┬──────────────────────┬─────────┘
   │ plan   │ search(q1) │ search(q2)...search(qN)│ summarize
   ▼        ▼            ▼                       ▼
Planner  Searcher    Searcher                Summarizer
```

Add written justification (3–5 sentences) explaining:
- Why you chose orchestrator/worker over other patterns for this task
- How the parallelism approach improves performance over the original P2P design
- One trade-off of the orchestrator/worker approach you'd need to address at higher scale

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| Diagnosis document | 20 | Correctly identifies 3+ failure modes with evidence from call graph |
| Refactored orchestrator | 40 | Passes all 4 test cases in validation suite |
| Direct agent calls removed | 10 | No agent-to-agent calls outside orchestrator |
| Validation + retry logic | 15 | Handles partial failures and rate limits gracefully |
| Architecture diagram | 15 | Complete, labeled, accurate, with written justification |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
research-lab submit --workspace /workspace/
```

Your submission includes:
- `/workspace/diagnosis.md`
- `/workspace/refactored-pipeline/`
- `/workspace/architecture-diagram.md`

The submission system will re-run the validation suite against your code. Your final score is based on the automated test results plus instructor review of the written components.

---

## Hints and Common Mistakes

**"My orchestrator runs searches sequentially instead of in parallel"**
Use `asyncio.gather(*[self.searcher.search(q) for q in sub_questions])` not a `for` loop with `await` inside it.

**"The validator suite fails on empty results but my code looks correct"**
Check that `SearchAgent.search()` returns `SearchResult(success=False, data=None, error="...")` on failure, not raises an exception. The validator expects a result object, not an exception.

**"My retry logic causes the test to hang"**
Add a timeout to your retry. Retried searches should have a shorter deadline than original searches to prevent runaway retries.

**"I'm not sure how to write the architecture justification"**
Focus on: (1) task has clear decomposition → fits orchestrator/worker, (2) sub-questions are independent → parallelism saves time, (3) trade-off: orchestrator is a single point of failure → mention how you'd add redundancy at scale.
