# Lesson 5.1: Cost Anatomy — Understanding What You're Paying For

**Module**: 5 — Cost Management and Optimization
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Agentic systems can be expensive at scale. A single agent run might cost fractions of a cent. A production pipeline handling 10,000 requests per day can accumulate hundreds of dollars in daily LLM API costs. Understanding *what* you're paying for is the first step toward paying less.

This lesson breaks down the components of agent cost: input tokens, output tokens, tool call overhead, context caching credits, and model pricing tiers.

---

## The Token Economy

Everything in LLM-based agent systems ultimately costs tokens. Tokens are the unit of billing for every major LLM API provider.

**What is a token?** Roughly 3/4 of a word (or 4 characters) in English text. The number 1234 = 1 token. "The quick brown fox" = 4 tokens. A detailed system prompt = 500–2000 tokens.

### Input tokens

Input tokens are consumed every time the LLM processes text:
- Your system prompt
- The conversation history (all prior messages in context)
- Tool schemas (the descriptions of available tools)
- User messages
- Tool results fed back into context

In a long-running agent, input tokens grow with every turn because the context accumulates. If you don't manage context size, input costs grow quadratically with task complexity.

### Output tokens

Output tokens are the text the LLM generates:
- The agent's reasoning (in ReAct-style models)
- Tool call parameters
- Final responses

Output tokens are typically 3-5x more expensive per token than input tokens (varies by provider and model). This matters: a verbose agent that writes long reasoning chains before every action is significantly more expensive than a concise one.

### Tool call overhead

Beyond the raw token costs, tool invocations have overhead:

- **API latency**: Tool calls add wall-clock time, and more time means more concurrent agent cost
- **Provider-specific pricing**: Some providers charge per tool call in addition to token costs
- **External service costs**: If your tool calls an external API (e.g., web search), that API has its own pricing

---

## Model Pricing Tiers

LLM providers offer models at different price/capability trade-offs. As of early 2026, the approximate tiers (check current provider pricing):

| Tier | Relative cost (input/output) | Capabilities | Typical use cases |
|------|------------------------------|--------------|-------------------|
| Frontier (e.g., Claude Opus, GPT-4) | ~5–10x mid-tier | Best reasoning, complex tasks | Orchestration, complex analysis, planning |
| Mid-tier (e.g., Claude Sonnet, GPT-4o-mini) | ~1–2x baseline | Strong reasoning, faster | Most production tasks |
| Small/fast (e.g., Claude Haiku, GPT-3.5) | ~0.1–0.5x baseline | Basic tasks, fast | Formatting, classification, simple extraction |

**Key insight**: Not every agent in your pipeline needs the same model. Using a frontier model for every task is like using a jet engine to mow a lawn. The right model for each task is the cheapest model that produces acceptable quality.

---

## Context Caching

Context caching is a provider-level feature that reduces costs when the same prefix (e.g., system prompt + document) is used across many requests.

### How it works

1. You mark a portion of your input as "cacheable" (the stable prefix)
2. The provider computes and stores the key-value attention cache for that prefix
3. Subsequent requests that use the same prefix pay a reduced rate for cached input tokens
4. Non-cached (novel) tokens are charged at the standard input rate

```python
# Example using Anthropic's prompt caching (illustrative — check current API docs)
response = client.messages.create(
    model="claude-sonnet-4-6",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": long_document_to_analyze,  # This gets cached
                    "cache_control": {"type": "ephemeral"}  # Mark for caching
                },
                {
                    "type": "text",
                    "text": "Now answer: What are the key financial risks?"
                }
            ]
        }
    ]
)
```

**Cache economics**: Cached tokens cost approximately 10% of normal input token cost. Cache writes cost slightly more than normal (to store the cache). Caching is most cost-effective when the same prefix is used 10+ times.

### When caching helps

- System prompts (same prompt, different user messages)
- Long documents processed by multiple agents
- Large tool schema definitions that don't change
- RAG context documents used repeatedly

### When caching doesn't help

- Short prompts (caching overhead not worth it)
- Highly variable inputs (cache rarely hit)
- Single-use prompts (cache never reused)

---

## The Real-World Cost Breakdown

Let's trace the cost of a realistic agent task: competitive analysis with 5 research sub-questions.

**Setup**:
- System prompt: 2,000 tokens (cached after first use)
- 5 sub-questions researched: each requires 2 tool calls with 1,500-token results
- Analysis: 8,000 tokens of research fed into analysis
- Summary: analysis output + synthesis

**Cost estimate (at Claude Sonnet pricing, approximate)**:

```
Research phase (5 x 2 tool calls):
  Input: 2,000 (system) + 1,500 (tool result) × 10 = 17,000 tokens
  Output: ~200 (tool parameters) × 10 = 2,000 tokens
  Subtotal: ~$0.05

Analysis phase:
  Input: 2,000 (system) + 8,000 (research results) = 10,000 tokens
  Output: ~1,500 tokens
  Subtotal: ~$0.03

Summary phase:
  Input: 2,000 (system) + 1,500 (analysis) = 3,500 tokens
  Output: ~500 tokens
  Subtotal: ~$0.01

Total: ~$0.09 per run
At 1,000 runs/day: ~$90/day = ~$2,700/month
```

This is the "before optimization" baseline. Modules 5.2–5.5 will show how to reduce this significantly.

---

## Estimating Cost Before Deployment

Producing a cost estimate before production deployment is a core engineering skill for agentic systems. Here's a systematic approach:

### 1. Count context tokens per turn

Estimate the average tokens in each part of the context for each turn:
- System prompt: count once
- Prior conversation: grows with turns (use average turns per task)
- Tool results: count average result size × average tool calls per task

### 2. Estimate output tokens

- Tool call parameters are usually 50–300 tokens
- Agent reasoning (if logged): 100–500 tokens per turn
- Final response: 200–2000 tokens depending on task

### 3. Model and multiply

```python
def estimate_task_cost(
    task_config: TaskConfig,
    model_pricing: ModelPricing
) -> CostEstimate:
    # Input token estimate
    input_tokens = (
        task_config.system_prompt_tokens +
        task_config.avg_conversation_tokens +
        task_config.avg_tool_results_tokens * task_config.avg_tool_calls
    )

    # Output token estimate
    output_tokens = (
        task_config.avg_tool_call_params_tokens * task_config.avg_tool_calls +
        task_config.avg_response_tokens
    )

    # Total cost
    input_cost = input_tokens * model_pricing.input_per_token
    output_cost = output_tokens * model_pricing.output_per_token

    return CostEstimate(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        estimated_cost_usd=input_cost + output_cost,
        confidence="within 30%"  # Estimates are rough
    )
```

**Target accuracy**: ±20% of actual cost. You'll calibrate this against real production data.

---

## Summary

- Token costs are the primary cost driver: input tokens (everything in context), output tokens (everything the LLM generates)
- Output tokens cost 3-5x more than input tokens — verbose agents are expensive agents
- Model tiers differ 10-100x in cost — match model capability to task complexity
- Prompt caching reduces costs for stable prefixes (system prompts, repeated documents) to ~10% of normal input cost
- Cost estimation: count context tokens, estimate output tokens, multiply by model pricing

---

*Next: [Lesson 5.2 — Token Budgets and Spending Limits](02-token-budgets.md)*
