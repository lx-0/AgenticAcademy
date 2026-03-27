# Lesson 5.4: Model Selection, Prompt Optimization, and Batch Processing

**Module**: 5 — Cost Management and Optimization
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

After caching, the next biggest lever for cost reduction is using the right model for the right task and keeping your prompts lean. This lesson covers model right-sizing, prompt optimization techniques, and batch processing patterns.

---

## Model Right-Sizing

The most common cost mistake in agentic systems: using a frontier model for every task when most tasks don't need frontier-level capability.

### The capability vs. cost trade-off

Different tasks require different levels of model capability:

| Task Type | Required Capability | Appropriate Tier |
|-----------|--------------------|--------------------|
| Complex reasoning, planning, orchestration | Highest reasoning, nuanced judgment | Frontier |
| Code generation, analysis, synthesis | Strong reasoning, detailed generation | Mid-tier |
| Classification, routing, tagging | Pattern matching, constrained output | Small/fast |
| Format conversion, data extraction (structured) | Basic instruction following | Small/fast |
| Summarization of factual content | Fluent generation | Small/fast |
| Spell check, grammar fix | Basic NLP | Small/fast |

**The 10x rule**: There is typically a 5-15x cost difference between frontier and small models. If a small model achieves 90% of the quality of a frontier model for a given task, it's almost always worth using the small model.

### How to determine the right model

**Step 1: Baseline the frontier model**

Run 50 representative examples on the frontier model. Define your quality threshold (e.g., 95% accuracy for classification tasks, human rating of 4+/5 for generation tasks).

**Step 2: Test smaller models**

Run the same 50 examples on successively cheaper models. Find the cheapest model that meets your quality threshold.

**Step 3: Monitor in production**

Quality thresholds in testing don't always hold in production. Monitor the model's performance on production inputs and be ready to upgrade if quality degrades.

```python
MODEL_SELECTION_CONFIG = {
    # Task type → (model, fallback_model)
    "orchestration": ("claude-opus-4-6", "claude-sonnet-4-6"),
    "complex_analysis": ("claude-sonnet-4-6", "claude-haiku-4-5"),
    "code_generation": ("claude-sonnet-4-6", "claude-haiku-4-5"),
    "classification": ("claude-haiku-4-5", "claude-haiku-4-5"),
    "formatting": ("claude-haiku-4-5", "claude-haiku-4-5"),
    "simple_extraction": ("claude-haiku-4-5", "claude-haiku-4-5"),
}

def select_model(task_type: str, require_fallback: bool = False) -> str:
    config = MODEL_SELECTION_CONFIG.get(task_type)
    if not config:
        return DEFAULT_MODEL
    primary, fallback = config
    return fallback if require_fallback else primary
```

---

## Prompt Optimization

Reducing prompt size reduces cost directly: fewer input tokens = lower cost. Beyond raw reduction, well-structured prompts also reduce the number of turns needed.

### Strategy 1: Audit prompt bloat

Run a token count analysis on your system prompts:

```python
def audit_prompt(prompt: str) -> PromptAuditReport:
    tokens = count_tokens(prompt)
    sections = identify_sections(prompt)

    findings = []
    for section in sections:
        # Check for common bloat patterns
        if section.contains_repetition():
            findings.append(f"Repetition detected in '{section.name}': {section.token_count} tokens")
        if section.is_examples_heavy() and section.examples_count > 3:
            findings.append(f"Too many examples in '{section.name}': reduce to 2-3")
        if section.token_count > 500 and section.type == "instructions":
            findings.append(f"Long instruction block '{section.name}': consider condensing")

    return PromptAuditReport(
        total_tokens=tokens,
        sections=sections,
        findings=findings,
        estimated_daily_cost=tokens * DAILY_REQUESTS * MODEL_INPUT_COST_PER_TOKEN
    )
```

### Strategy 2: Use system prompt compression

Rewrite verbose system prompts in a more compact form without losing meaning:

**Before** (250 tokens):
```
You are a helpful assistant that specializes in analyzing financial documents.
Your job is to carefully read the financial documents that are provided to you,
extract the key financial metrics and data points from those documents, and then
present those metrics in a clear and organized way. You should always be accurate
and precise in your extraction. When you are not sure about a value, you should
say so rather than guessing. You should organize your output in a structured format
that makes it easy for the user to understand the key financial information.
```

**After** (80 tokens):
```
You are a financial document analyzer. Extract key metrics accurately and present
them in structured format. If uncertain about a value, flag it rather than guessing.
```

The compressed version loses no information relevant to the task.

### Strategy 3: Remove unnecessary examples

Few-shot examples are expensive. Evaluate each example:
- Does it demonstrate something the model couldn't infer from instructions alone?
- Is it from the tail of the distribution (edge cases the model handles poorly without examples)?

If the answer to both is no, remove the example. Typical savings: 30-50% of system prompt tokens.

### Strategy 4: Structured inputs over freeform

When feeding data into agents, structured formats (JSON, CSV) are more token-efficient than prose descriptions:

**Before (100 tokens)**:
```
The customer's name is Jane Smith. She is 34 years old and lives in New York City.
Her account number is 1234567. She has been a customer since January 2021.
Her current plan is the Premium tier.
```

**After (45 tokens)**:
```json
{"name": "Jane Smith", "age": 34, "city": "New York City", "account": "1234567",
 "since": "2021-01", "plan": "Premium"}
```

Same information, less than half the tokens.

### Strategy 5: Context compression in long conversations

As conversations grow, compress old context. The summarization approach (from Module 1) reduces a 2,000-token conversation history to a 200-token summary — 90% reduction in those tokens.

```python
async def compress_conversation_history(
    messages: list[Message],
    keep_last_n: int = 5,
    summarizer_model: str = "claude-haiku-4-5"  # Use cheap model for compression
) -> list[Message]:
    if len(messages) <= keep_last_n + 2:  # +2 for system + latest user
        return messages

    to_compress = messages[1:-keep_last_n]  # Everything except system + recent

    summary = await summarize_messages(
        to_compress,
        model=summarizer_model,  # Cheap model for summarization
        max_tokens=300
    )

    compressed_message = Message(
        role="system",
        content=f"[Earlier conversation summary]\n{summary}"
    )

    return [messages[0], compressed_message] + messages[-keep_last_n:]
```

---

## Batch Processing

For workloads where responses don't need to be immediate, batch processing can significantly reduce costs.

### When to use batch processing

| Suitable | Not suitable |
|---------|--------------|
| Report generation run nightly | Real-time customer interactions |
| Bulk document processing | Interactive agent sessions |
| Dataset annotation | Time-sensitive alerts |
| Periodic analysis tasks | Streaming responses |

### Provider batch APIs

Most LLM providers offer discounted batch processing:

- **Anthropic Batch API**: ~50% discount on batch requests
- **OpenAI Batch API**: ~50% discount for requests processed within 24 hours

```python
async def run_batch_analysis(
    tasks: list[AnalysisTask],
    batch_size: int = 100
) -> list[AnalysisResult]:
    results = []

    # Split into batches
    for batch_start in range(0, len(tasks), batch_size):
        batch = tasks[batch_start:batch_start + batch_size]

        # Submit batch job
        batch_job = await anthropic_client.messages.batches.create(
            requests=[
                {
                    "custom_id": task.id,
                    "params": {
                        "model": "claude-sonnet-4-6",
                        "max_tokens": 1024,
                        "messages": task.messages
                    }
                }
                for task in batch
            ]
        )

        # Poll for completion (batch jobs can take minutes to hours)
        completed_batch = await wait_for_batch(batch_job.id, poll_interval_seconds=60)

        # Process results
        for result in completed_batch.results:
            results.append(AnalysisResult(
                task_id=result.custom_id,
                content=result.result.message.content
            ))

    return results
```

### Async execution patterns for cost efficiency

Beyond provider batch APIs, structuring your own task queues as batch-friendly can reduce peak costs:

```python
class BatchOptimizedTaskQueue:
    def __init__(self, batch_size: int = 20, max_wait_seconds: float = 5.0):
        self.queue = asyncio.Queue()
        self.batch_size = batch_size
        self.max_wait = max_wait_seconds

    async def process_loop(self, processor: BatchProcessor) -> None:
        while True:
            # Collect tasks for up to max_wait seconds or batch_size
            batch = []
            deadline = asyncio.get_event_loop().time() + self.max_wait

            while len(batch) < self.batch_size:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    break
                try:
                    task = await asyncio.wait_for(self.queue.get(), timeout=remaining)
                    batch.append(task)
                except asyncio.TimeoutError:
                    break

            if batch:
                # Process all collected tasks together (share context setup overhead)
                await processor.process_batch(batch)
```

---

## Module 5 Quick Reference: Cost Optimization Strategies

| Strategy | Typical Savings | Effort | Risk |
|---------|----------------|--------|------|
| Prompt caching | 30-50% on repeated prompts | Low | Low |
| Response caching | 40-60% on repetitive workloads | Medium | Medium (staleness) |
| Semantic deduplication | 10-30% additional | High | Medium (false positives) |
| Model right-sizing | 50-80% on downgradeable tasks | Medium | Medium (quality) |
| Prompt compression | 20-40% on verbose prompts | Low | Low |
| Context compression | 30-60% on long conversations | Medium | Low |
| Batch processing | 40-50% for async workloads | Medium | Low |

---

## Summary

- Model right-sizing: use the cheapest model that meets your quality threshold for each task type — typically 5-15x cost difference between tiers
- Test quality on 50+ representative examples before downgrading, monitor in production after
- Prompt optimization: audit for bloat, compress verbose instructions, reduce examples to 2-3, use structured inputs, compress long conversation history
- Batch processing: 40-50% discount for non-time-sensitive workloads on provider batch APIs
- Combine strategies: caching + right-sizing + compression can reduce total cost by 70-80%

---

*Next: [Lesson 5.5 — Cost Monitoring and the Cost-Reduction Lab](05-cost-monitoring-and-lab.md)*
