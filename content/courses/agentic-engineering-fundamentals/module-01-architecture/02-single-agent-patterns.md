# Lesson 1.2: Single-Agent Patterns

**Module**: 1 — Agent Architecture Patterns
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Before building multi-agent systems, you need mastery of single-agent patterns. Multi-agent architectures are assemblies of single agents — if you don't understand how an individual agent reasons and acts, you'll struggle to debug systems where five of them are collaborating.

This lesson covers the three fundamental single-agent patterns used in production: **tool-use loops**, **ReAct (Reason + Act)**, and **plan-and-execute**.

---

## Pattern 1: The Tool-Use Loop

The simplest agent pattern is the tool-use loop. The agent:

1. Receives input
2. Calls a tool
3. Receives the result
4. Decides: is the task done? If not, go to step 2.

```
Input
  │
  ▼
┌─────────────────────────────┐
│  LLM: Should I call a tool? │
│  If yes: which one?         │
└─────────────────────────────┘
  │
  ├─► Tool call ──► Result ──► back to LLM
  │
  └─► Final answer (done)
```

This pattern works well for **narrow, bounded tasks** where the set of possible tool calls is small and the completion criterion is clear.

**Real-world example**: A customer support agent that can `lookup_order(order_id)`, `check_inventory(sku)`, and `create_refund(order_id, amount)`. The agent receives a customer message, calls one or two tools, and responds.

### Where tool-use loops break down

**Unbounded tool sets**: If you give a tool-use loop agent 50 tools, it may struggle to select the right one. Cognitive load matters even for LLMs.

**Multi-step planning**: Tool-use loops work step-by-step without explicit planning. For complex tasks requiring 10+ steps with dependencies between them, a more structured pattern is needed.

**Ambiguous stopping conditions**: If the task is "research this topic thoroughly," the tool-use loop may not know when "thorough" is satisfied.

---

## Pattern 2: ReAct (Reason + Act)

ReAct was introduced in a 2022 research paper and has become a foundational pattern for production agents. The key innovation: **make the reasoning explicit as part of the agent's output**, interleaved with actions.

The agent produces alternating **Thought** and **Action** outputs:

```
Thought: I need to find the customer's most recent order. I'll search by email address.
Action: search_orders(email="alice@example.com")
Observation: Found 3 orders. Most recent: Order #1492, placed 2026-03-20, status: shipped.

Thought: The order is shipped. I need to check the tracking number.
Action: get_tracking(order_id=1492)
Observation: Tracking #1Z999AA10123456784, carrier: UPS, estimated delivery: 2026-03-27.

Thought: I have all the information the customer needs. I can now respond.
Action: final_answer("Your order #1492 is on its way! Tracking: 1Z999AA10123456784...")
```

### Why explicit reasoning helps

**Debuggability**: When something goes wrong, you can read the Thought chain and understand exactly where the reasoning broke down.

**Consistency**: Forcing the model to reason before acting reduces impulsive tool calls based on superficial pattern matching.

**Error recovery**: When a tool returns an error, the explicit Thought gives the model space to acknowledge the error and reason about a recovery strategy.

### Implementing ReAct in practice

Most modern LLM APIs support structured tool use natively, which implements ReAct implicitly (the model generates reasoning in its response, then a tool call). You don't need to enforce the Thought/Action format manually in most production contexts.

What you *do* need to handle explicitly:

1. **Observation formatting**: How tool results are fed back to the model matters. Verbose, unstructured results degrade reasoning quality. Pre-process tool results into concise, structured observations.

2. **Thought quality prompting**: System prompts should encourage reasoning before action. "Before calling any tool, state explicitly what you're trying to learn from it and why" is a common approach.

3. **Loop limits**: ReAct loops can run indefinitely. Always implement a maximum iteration count and handle it gracefully.

```python
MAX_ITERATIONS = 20

async def react_agent(goal: str, tools: list[Tool]) -> str:
    messages = [{"role": "user", "content": goal}]

    for iteration in range(MAX_ITERATIONS):
        response = await llm.complete(messages, tools=tools)

        if response.stop_reason == "end_turn":
            return response.content

        if response.stop_reason == "tool_use":
            tool_results = await execute_tools(response.tool_calls)
            messages.extend([
                {"role": "assistant", "content": response.content},
                {"role": "user", "content": tool_results}
            ])

    # Graceful degradation: return partial result with warning
    return f"[Max iterations reached] Partial result: {messages[-1]['content']}"
```

### Where ReAct breaks down

**Long-horizon tasks**: For tasks requiring 50+ steps, the growing context window becomes expensive and quality degrades as earlier reasoning is compressed or lost.

**Tasks requiring upfront planning**: ReAct is greedy — it reasons one step ahead. For tasks with dependencies (step 5 requires output from both step 2 and step 4), plan-and-execute is more appropriate.

---

## Pattern 3: Plan-and-Execute

The plan-and-execute pattern separates planning from execution. The agent first produces a **plan** — a structured sequence of steps — and then executes each step.

```
Goal
  │
  ▼
┌──────────────────┐
│  Planner LLM     │
│  Generate plan   │
└──────────────────┘
  │
  ▼
Plan: [Step 1, Step 2, Step 3, ...]
  │
  ▼
┌──────────────────────────────┐
│  Executor (may be different  │
│  LLM or same model)          │
│  Execute Step 1 → result 1   │
│  Execute Step 2 → result 2   │
│  ...                         │
└──────────────────────────────┘
  │
  ▼
Final Result
```

### Advantages over ReAct

**Upfront dependency resolution**: The planner can see the whole task and arrange steps so that dependencies are resolved in the right order.

**Cost efficiency**: You can use a powerful (expensive) model for planning and a cheaper model for routine execution steps.

**Interruptibility**: Plans are inspectable. A human reviewer can look at the plan before execution begins and veto steps that seem risky.

**Re-planning**: If a step fails, you can re-plan from that point rather than starting over.

### The re-planning challenge

Pure plan-and-execute is brittle when reality diverges from the plan. If Step 3 returns data in an unexpected format, the executor may not know how to handle it, and the remaining plan may be invalid.

Production plan-and-execute systems usually include a **replanning step** triggered by execution failures:

```python
async def plan_and_execute(goal: str, tools: list[Tool]) -> str:
    plan = await planner.create_plan(goal, available_tools=tools)

    results = []
    for step_index, step in enumerate(plan.steps):
        try:
            result = await executor.execute_step(step, context=results)
            results.append({"step": step, "result": result, "status": "success"})
        except StepExecutionError as e:
            # Trigger re-planning with current context
            revised_plan = await planner.replan(
                original_goal=goal,
                completed_steps=results,
                failed_step=step,
                failure_reason=str(e)
            )
            # Continue with revised plan from current position
            plan = revised_plan

    return await synthesizer.produce_final_answer(goal, results)
```

### When to use plan-and-execute

- Tasks with 5+ steps that have complex dependencies
- Tasks where upfront human review of the plan is valuable
- Tasks where different steps require different capabilities (use specialized sub-agents per step)
- Tasks where you want cost separation between planning and execution

---

## Comparing the Three Patterns

| Pattern | Best for | Weakness | Debuggability |
|---------|----------|----------|---------------|
| Tool-use loop | Narrow, bounded tasks | Breaks on complex planning | Low (must infer reasoning) |
| ReAct | Open-ended tasks, 5-15 steps | Long-horizon degradation | High (explicit thoughts) |
| Plan-and-execute | Long-horizon, complex dependency tasks | Brittle without re-planning | Very high (plan is inspectable) |

### Combining patterns

These patterns are not mutually exclusive. A common production architecture:

- **Outer layer**: Plan-and-execute to handle the high-level task decomposition
- **Inner layer**: Each step executed by a ReAct agent with access to relevant tools

This gives you the benefits of explicit planning (inspectability, dependency handling) with the benefits of ReAct (flexibility within each step, graceful error recovery).

---

## Production Anti-Patterns to Avoid

### The Eager Caller
An agent that calls tools before reasoning about whether the tool is the right choice. Symptoms: excessive tool calls, redundant API hits, high costs. Fix: add reasoning-before-action requirements to your system prompt and monitor tool call frequency.

### The Infinite Thinker
A ReAct agent that produces long Thought chains without making progress. Symptoms: many iterations, token costs climbing, no final answer. Fix: add progress detection — if N consecutive Thoughts don't result in a new tool call or new information, force a conclusion.

### The Context Hoarder
An agent that appends every tool result in full to the context window. For tools that return large payloads (database query with 10,000 rows), this quickly exhausts the context. Fix: always summarize or truncate tool results before adding them to context.

### The Stateless Planner
A plan-and-execute system where the executor doesn't feed results back to context, so each step is executed without knowledge of what previous steps found. Fix: always maintain an execution state object that accumulates results and is available to each new step.

---

## Real-World Failure Mode: The Ghost Loop

**What it is**: An agent that reaches a loop termination condition but doesn't recognize it, continuing to iterate. Common in ReAct agents where the task completion signal is buried in a large tool result that the model skims over.

**How to reproduce it**: Give a ReAct agent a task like "Research competitors and compile a list of 10." Set max_iterations to 50. Observe the agent continue running after collecting the 10th competitor because the completion signal ("I have found 10 competitors") appears in the middle of a large tool result that the model processes too quickly.

**How to fix it**: Implement explicit termination detection. After each iteration, run a lightweight check: "Has the original goal been satisfied based on current context?" This can be a cheap, structured LLM call with a simple yes/no output and brief justification.

---

## Summary

- Three fundamental single-agent patterns: tool-use loop, ReAct, plan-and-execute
- Tool-use loops are simple and effective for narrow tasks
- ReAct adds explicit reasoning traces that improve debuggability and consistency
- Plan-and-execute handles complex, multi-step tasks with upfront dependency resolution
- Production systems often combine patterns: plan-and-execute outer shell, ReAct inner execution
- Four anti-patterns to avoid: eager calling, infinite thinking, context hoarding, stateless planning

---

*Next: [Lesson 1.3 — Multi-Agent Patterns](03-multi-agent-patterns.md)*
