# Module 5 Lab: Tame the Runaway Pipeline

**Module**: 5 — Cost Management and Optimization
**Estimated time**: 75–90 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

You receive a multi-agent system that costs ~$0.42 per run — expensive at scale. Your goal is to reduce cost to under $0.10/run without degrading output quality (validated by automated eval harness).

You have four optimization tools available:
1. Token budgets and hard caps
2. Prompt caching on repeated context
3. Downgrade two agents from frontier to mid-tier model
4. Context compression for long-running state

You must document each change and its measured cost impact.

---

## Baseline System

The pipeline is a competitive analysis system:

| Agent | Current Model | Current Avg Cost/Run |
|-------|--------------|----------------------|
| OrchestratorAgent | claude-opus-4-6 | $0.08 |
| ResearchAgent (×3) | claude-opus-4-6 | $0.24 (combined) |
| AnalysisAgent | claude-opus-4-6 | $0.05 |
| SummaryAgent | claude-opus-4-6 | $0.05 |
| **Total** | **All Opus** | **$0.42/run** |

Target: **< $0.10/run** with quality score ≥ 4.0/5.0 (validated by eval harness).

---

## Setup

```bash
$ cost-lab status
✓ Pipeline: loaded (baseline version)
✓ Eval harness: ready (20 test cases, quality graded by automated rubric)
✓ Cost tracker: enabled
✓ 10 test inputs loaded for measurement

# Run baseline measurement
$ cost-lab run-baseline --inputs test-inputs/ --verbose
```

Expected output:
```
Run 1: cost=$0.41, quality=4.3/5
Run 2: cost=$0.44, quality=4.5/5
Run 3: cost=$0.40, quality=4.2/5
...
Average: cost=$0.42, quality=4.3/5
```

---

## Optimization 1: Token Budgets and Hard Caps (15 minutes)

### Step 1.1: Audit current token usage

```bash
cost-lab analyze --run-baseline --show-token-breakdown
```

Review the breakdown. You should find:
- ResearchAgent often generates more output than necessary (long verbose summaries per sub-question)
- OrchestratorAgent's output tokens are higher than needed (verbose reasoning chains)

### Step 1.2: Implement token caps

In `/workspace/pipeline/agents.py`, add `max_tokens` parameters to each agent's LLM call:

```python
# ResearchAgent — output should be concise summaries, not essays
response = await llm.complete(
    messages=messages,
    model=self.model,
    max_tokens=500  # Was uncapped. Research summaries don't need more than 500 tokens
)

# OrchestratorAgent — reasoning should be brief
response = await llm.complete(
    messages=messages,
    model=self.model,
    max_tokens=300  # Was uncapped. Orchestration decisions should be concise
)
```

Choose appropriate `max_tokens` values for each agent. The goal: sufficient for quality, not over-provisioned.

### Step 1.3: Measure impact

```bash
cost-lab run --optimization token-caps --inputs test-inputs/
```

Record your results in `/workspace/optimization-log.md`:
```
## Optimization 1: Token Caps
Before: avg cost=$0.42, avg quality=4.3/5
After: avg cost=$X.XX, avg quality=X.X/5
Reduction: X%
Notes: [What did you cap, and did quality hold?]
```

---

## Optimization 2: Prompt Caching (15 minutes)

### Step 2.1: Identify cacheable content

In the pipeline, each ResearchAgent call includes:
- A 1,800-token system prompt (same every call)
- A 2,400-token reference document about research methodology (same every call)
- The specific sub-question (varies per call)

The system prompt and reference document are prime caching candidates.

### Step 2.2: Implement caching

In `/workspace/pipeline/research_agent.py`, structure the messages to cache the stable prefix:

```python
def build_research_messages(self, sub_question: str) -> list[dict]:
    return [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": RESEARCH_SYSTEM_PROMPT,  # 1,800 tokens
                    "cache_control": {"type": "ephemeral"}
                },
                {
                    "type": "text",
                    "text": RESEARCH_METHODOLOGY_DOC,  # 2,400 tokens
                    "cache_control": {"type": "ephemeral"}
                },
                {
                    "type": "text",
                    "text": f"Research question: {sub_question}"  # Variable
                }
            ]
        }
    ]
```

### Step 2.3: Measure caching impact

```bash
cost-lab run --optimization prompt-caching --inputs test-inputs/
```

Note: Caching saves are most visible after the first request (first request builds the cache). Run at least 5 requests to see the savings.

Record results in `/workspace/optimization-log.md`.

---

## Optimization 3: Model Right-Sizing (20 minutes)

### Step 3.1: Identify downgradeable agents

Consider each agent's task:

- **OrchestratorAgent**: High-level planning and coordination — requires strong reasoning. Keep on Opus.
- **ResearchAgent**: Web search queries and result synthesis — sophisticated but not frontier-critical.
- **AnalysisAgent**: Comparative analysis of research findings — requires nuanced judgment. Test both options.
- **SummaryAgent**: Writing a clear summary from structured input — primarily fluent generation.

Your job: determine which 2 agents can be safely downgraded to `claude-sonnet-4-6` without quality regression.

### Step 3.2: Test each agent's quality with downgraded model

The eval harness supports per-agent model override:

```bash
# Test ResearchAgent on Sonnet
cost-lab eval --agent ResearchAgent --model claude-sonnet-4-6

# Test SummaryAgent on Sonnet
cost-lab eval --agent SummaryAgent --model claude-sonnet-4-6

# Test AnalysisAgent on Sonnet
cost-lab eval --agent AnalysisAgent --model claude-sonnet-4-6
```

Look for quality score >= 4.0/5.0 (maintaining baseline within ±0.3).

### Step 3.3: Apply selected downgrades

In `/workspace/pipeline/config.py`, update the model configuration:

```python
AGENT_MODELS = {
    "OrchestratorAgent": "claude-opus-4-6",         # Keep
    "ResearchAgent": "claude-sonnet-4-6",            # Downgrade if quality holds
    "AnalysisAgent": "claude-opus-4-6",              # Change if quality holds
    "SummaryAgent": "claude-sonnet-4-6",             # Downgrade if quality holds
}
```

### Step 3.4: Measure impact

```bash
cost-lab run --optimization model-downgrades --inputs test-inputs/
```

Record results in `/workspace/optimization-log.md`.

---

## Optimization 4: Context Compression (15 minutes)

### Step 4.1: Identify context bloat

The AnalysisAgent receives the full output from all 3 ResearchAgents. Each ResearchAgent produces a ~500-word summary, so the AnalysisAgent receives ~1,500 words of input. However, the AnalysisAgent only needs the key findings, not the full prose.

### Step 4.2: Implement pre-analysis compression

Before passing research results to the AnalysisAgent, compress them using a cheap model:

```python
async def compress_for_analysis(research_results: list[ResearchResult]) -> CompressedInput:
    """
    Use a cheap model to extract key facts from research outputs
    before passing to the (more expensive) AnalysisAgent.
    """
    compression_prompt = """Extract the 5 most important facts from each research section below.
Output as structured JSON: {"section": "name", "key_facts": ["fact1", "fact2", ...]}
Be concise — each fact should be 1 sentence maximum."""

    compressed = await llm.complete(
        messages=[
            {"role": "user", "content": f"{compression_prompt}\n\n{format_research(research_results)}"}
        ],
        model="claude-haiku-4-5",  # Cheapest model — compression is simple
        max_tokens=800
    )

    return CompressedInput(compressed.content)
```

This adds a small Haiku call but reduces the AnalysisAgent's input token count by 60-70%.

### Step 4.3: Measure impact

```bash
cost-lab run --optimization context-compression --inputs test-inputs/
```

Record results in `/workspace/optimization-log.md`.

---

## Final Measurement: Combined Optimizations

Apply all 4 optimizations together and measure:

```bash
cost-lab run --optimization all --inputs test-inputs/
```

**Target output**:
```
Run 1:  cost=$0.09, quality=4.1/5  ✓
Run 2:  cost=$0.10, quality=4.2/5  ✓
Run 3:  cost=$0.09, quality=4.0/5  ✓
...
Average: cost=$0.09, quality=4.1/5  ✓ (under $0.10 target, quality ≥ 4.0)

Cost reduction: 79% (from $0.42 to $0.09)
```

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| Cost < $0.10/run | 40 | Final combined run achieves target |
| Quality ≥ 4.0/5.0 | 20 | Quality doesn't regress below threshold |
| Optimization log completed | 20 | Each optimization documented with before/after metrics |
| All 4 optimizations implemented | 10 | Evidence of each technique in the code |
| Model downgrade rationale | 10 | Written justification for which agents were downgraded |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
cost-lab submit \
  --pipeline /workspace/pipeline/ \
  --optimization-log /workspace/optimization-log.md \
  --final-run-id <your-final-run-id>
```

---

## Hints

**"My costs are reduced but quality dropped below 4.0"**
Don't combine all optimizations at once before testing each individually. Identify which optimization caused the quality drop, then either revert it or tune it (e.g., increase max_tokens slightly, use a better model for the agent that regressed).

**"Prompt caching isn't reducing costs"**
Verify that the stable prefix (system prompt + docs) comes BEFORE the variable content in your message list. Caching only applies to the *prefix* of the input. Also ensure you're measuring after the first request (first request populates the cache).

**"Context compression adds more cost than it saves"**
If the Haiku compression call is expensive relative to the savings, reduce the compression prompt's verbosity and lower max_tokens. Context compression is most valuable when the original input is large (1000+ tokens).
