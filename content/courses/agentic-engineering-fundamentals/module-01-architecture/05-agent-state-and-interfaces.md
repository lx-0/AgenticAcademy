# Lesson 1.5: Agent Interfaces, State, and Architecture Anti-Patterns

**Module**: 1 — Agent Architecture Patterns
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

This final lesson in Module 1 closes out the architecture foundation with two critical topics: how to design clean agent interfaces (the contracts between agents and their callers) and how to manage state correctly. We'll also survey the most common architecture anti-patterns so you can recognize and avoid them in your own systems.

---

## Agent Interfaces: The Contract

An agent interface defines what the agent accepts and what it produces. Well-designed interfaces are the backbone of maintainable multi-agent systems.

### Input contract

Every agent should have an explicit input schema:

```python
@dataclass
class ResearchAgentInput:
    query: str                          # What to research
    depth: Literal["shallow", "medium", "deep"]  # How thorough
    source_constraints: list[str]       # e.g., ["academic_papers_only"]
    max_sources: int = 10               # Upper bound on sources to consult
    deadline_seconds: int = 60          # Max execution time
    context: str | None = None          # Prior context to inform search
```

Without an explicit input schema:
- Callers don't know what to pass
- The agent may silently ignore required fields
- Schema drift causes failures that are hard to diagnose

### Output contract

```python
@dataclass
class ResearchAgentOutput:
    success: bool
    findings: list[Finding]             # Structured results
    sources: list[Source]               # Provenance for each finding
    summary: str                        # Human-readable summary
    confidence: float                   # 0.0–1.0
    open_questions: list[str]           # What remains unresolved
    token_usage: TokenUsage             # For cost attribution
    execution_time_ms: int
    error: AgentError | None            # Populated only on failure
```

The output should always include:
- A `success` flag (never rely on empty results to signal failure)
- Structured data (not just a narrative string)
- Provenance/sources when the agent consumes external information
- Usage metadata for observability

### Versioning

Agent interfaces will change. Design for it from the start:

```python
@dataclass
class AgentInput:
    schema_version: str = "1.0"  # Explicit version
    # ... fields
```

When you update an interface, increment the version. Callers that haven't been updated yet should receive a clear error: `SchemaVersionMismatch("Expected 1.0, received 2.0")`.

---

## State Management: The Hard Problem

State management is where most multi-agent systems accumulate technical debt. Getting this right early prevents painful refactors.

### State Types and Lifetimes

| State Type | Lifetime | Storage | Example |
|-----------|----------|---------|---------|
| Ephemeral | Single agent loop | In-context | Tool call result for current turn |
| Session | Duration of a task | In-memory or task-scoped store | Intermediate research findings |
| Persistent | Cross-session | External store (DB, vector store) | User preferences, learned facts |
| Shared | Concurrent agents | Shared store with locking | Shared task queue, blackboard |

### Rule: Be explicit about which type you're using

The most common state management mistake is using the wrong state type for the job:

- Using **in-context** state for data that needs to survive session boundaries
- Using **persistent** state for data that only matters within a single task (now it requires cleanup)
- Using **ephemeral** state that gets passed between agents (no persistence, no recovery on failure)

### Persistent State Design

When agents write to persistent state, design for idempotency:

```python
async def store_research_result(
    task_id: str,
    agent_id: str,
    result: ResearchResult
) -> None:
    # Idempotent: same task_id + agent_id + content hash = no-op
    content_hash = hash_result(result)
    await state_store.upsert(
        key=f"research:{task_id}:{agent_id}",
        value=result,
        dedup_key=content_hash
    )
```

Without idempotency, retried agents will write duplicate results, causing synthesis agents downstream to process the same information multiple times.

### Shared State and Concurrency

When multiple agents read and write shared state concurrently, you need coordination:

**Optimistic locking** (for low-contention scenarios):

```python
async def update_shared_doc(doc_id: str, updates: dict, expected_version: int):
    result = await state_store.compare_and_swap(
        key=doc_id,
        expected_version=expected_version,
        new_value=updates
    )
    if not result.success:
        raise ConcurrentModificationError(
            f"Document {doc_id} was modified by another agent. "
            f"Expected version {expected_version}, found {result.actual_version}."
        )
```

**Append-only state** (for high-contention scenarios):

Rather than updating a shared document, each agent appends its contribution. A synthesis step later merges the contributions.

```
Agent A writes: contribution_A
Agent B writes: contribution_B
Agent C writes: contribution_C

[Later] Synthesis agent reads all contributions, produces merged result
```

Append-only is simpler to implement and has no contention, but requires a synthesis step that naive update approaches don't.

---

## Context Window Management

The context window is your agent's working memory. Mismanaging it is the leading cause of quality degradation in long-running agents.

### The context accumulation problem

Every tool result appended to context takes up tokens. In a long-running ReAct agent:

```
Turn 1: System prompt (2000 tokens) + User goal (200 tokens)
Turn 2: + Tool result 1 (500 tokens)
Turn 3: + Tool result 2 (800 tokens)
...
Turn 20: Context is now 15,000 tokens and growing
```

As context grows:
- Cost increases linearly with input tokens
- Model attention quality degrades (later parts of very long contexts receive less "attention")
- Critical early context (the original goal) may be compressed or effectively ignored

### Strategies for context management

**Windowing**: Keep only the last N turns in context. Simple but lossy — important early context is dropped.

**Summarization**: Periodically compress older context into a summary. Higher quality than windowing but adds latency and cost.

```python
async def manage_context(messages: list[Message], max_tokens: int = 8000) -> list[Message]:
    current_size = count_tokens(messages)

    if current_size <= max_tokens:
        return messages

    # Keep first N messages (system prompt, original goal) and last M messages (recent context)
    # Summarize everything in between
    head = messages[:2]  # System prompt + original goal
    tail = messages[-10:]  # Recent context

    to_summarize = messages[2:-10]
    summary = await summarize_messages(to_summarize)

    summary_message = Message(
        role="system",
        content=f"[Context summary - messages omitted for length]\n{summary}"
    )

    return head + [summary_message] + tail
```

**Selective retention**: Instead of keeping all tool results, extract only the key facts from each result and discard the raw data.

```python
async def process_tool_result(result: ToolResult) -> str:
    if count_tokens(result.content) > 1000:
        # Extract key facts rather than appending raw result
        key_facts = await extract_key_facts(result.content, context=current_goal)
        return f"[Extracted from {result.tool_name}]: {key_facts}"
    return result.content
```

---

## Architecture Anti-Patterns

### 1. Monolithic Agent Soup

**What it looks like**: One agent with 50+ tools, a 10,000-token system prompt, and responsibility for everything.

**Why it happens**: The path of least resistance. Adding tools to an existing agent is easier than designing new agents.

**Why it fails**:
- Tool selection quality degrades with too many options
- The system prompt becomes impossible to maintain
- Any failure takes down all capabilities simultaneously
- Impossible to attribute costs to specific capabilities

**Fix**: Decompose by capability. Each agent should do one thing well. If you can't describe an agent's purpose in one sentence, it's too broad.

### 2. Over-Delegation

**What it looks like**: Tasks delegated through 5+ levels of agents when 2 would suffice. Every agent passes work to a sub-agent, which passes to a sub-sub-agent, etc.

**Why it happens**: Architectural cargo-culting — "more layers = more sophisticated."

**Why it fails**: Latency compounds at every delegation. A task that could run in 5 seconds takes 30 because it passes through 6 agents. Error propagation becomes hard to trace. Token costs multiply.

**Fix**: Design the minimum hierarchy that the task actually requires. Each delegation layer should add genuine value (specialization, parallelism, or governance).

### 3. Context Bleed

**What it looks like**: An agent accumulates context from one task and that context influences its handling of the next task.

**Why it happens**: Agents are reused across tasks without proper context isolation. The agent's memory (in-context or external) isn't cleared between tasks.

**Why it fails**: An agent that completed a "be very brief" task carries that instruction into the next task that needs detailed output. Or an agent with access to Customer A's data inadvertently uses it when processing Customer B's request.

**Fix**: Agents should be stateless between task invocations. All context should be explicitly passed in. If external state is used, access should be scoped to the current task ID.

### 4. The Chatty Pipeline

**What it looks like**: Agents constantly checking in with each other for small validations that could be handled autonomously.

**Why it happens**: Over-cautious agent design. Every agent escalates everything.

**Why it fails**: The communication overhead exceeds the value of the validation. A pipeline that spends 30% of its tokens on inter-agent confirmations is inefficient.

**Fix**: Design agents to be autonomy-appropriate. Define explicitly what decisions each agent is authorized to make independently. Reserve inter-agent communication for genuine uncertainty or handoffs.

### 5. The Invisible Bottleneck

**What it looks like**: A system that appears parallel but has a hidden synchronization point that forces sequential execution.

**Why it happens**: The orchestrator waits for all workers to complete before proceeding, even when some results could be processed as they arrive.

**Why it fails**: A single slow worker blocks all downstream processing.

**Fix**: Use streaming result processing wherever possible. As each worker completes, route its result to the appropriate downstream agent without waiting for the others.

---

## Module 1 Architecture Review: Designing a Production-Grade Agent System

When designing a new agent system, work through these questions:

1. **What is the single, clear goal?** If you can't state it in one sentence, decompose further.

2. **What actions does the agent need to take?** List the tools required. More than 15 tools in one agent is a signal to decompose.

3. **What state does the agent need?** Ephemeral, session, persistent, or shared? Use the minimum required.

4. **What is the output contract?** Define the schema before implementation.

5. **What are the failure modes?** For each tool, what happens if it fails? How should the agent respond?

6. **What is the stopping condition?** How does the agent know it's done?

7. **How is context managed?** What is the maximum context budget? How is it pruned?

8. **What does escalation look like?** When should the agent ask for help rather than guessing?

---

## Summary

- Agent interfaces should have explicit input/output schemas with versioning
- State management requires conscious choice of state type (ephemeral, session, persistent, shared)
- Context window management is critical for long-running agents — use windowing, summarization, or selective retention
- Five architecture anti-patterns: monolithic soup, over-delegation, context bleed, chatty pipelines, invisible bottlenecks
- Design principle: the minimum structure that achieves the goal, with explicit contracts at every boundary

---

## Module 1 Key Takeaways

1. An agent is a perceive-reason-act loop driven by an LLM — the loop is what makes it agentic
2. Three single-agent patterns: tool-use loop (simple), ReAct (explicit reasoning), plan-and-execute (structured)
3. Three multi-agent patterns: orchestrator/worker (most common), peer-to-peer (flexible but complex), pipeline (sequential)
4. Hierarchical patterns scale coordination but require strict communication discipline
5. Clean interfaces, proper state management, and context window discipline are the foundations of maintainable systems

---

*Module 1 complete. Proceed to the [Module 1 Assessment](assessment.json) and then the [Module 1 Lab](lab.md) before continuing to Module 2.*
