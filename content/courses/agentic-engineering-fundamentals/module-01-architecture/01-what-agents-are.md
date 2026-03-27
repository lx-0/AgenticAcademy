# Lesson 1.1: What Agents Are — And What They Are Not

**Module**: 1 — Agent Architecture Patterns
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

The word "agent" is used loosely in the industry. Before you can build reliable agentic systems, you need a precise definition — one that holds up under production conditions, not just in demos.

This lesson establishes a working definition of agents, contrasts them with adjacent concepts (chatbots, scripts, traditional automation), and introduces the mental model you'll use throughout this course.

---

## The Definition That Actually Matters

An **agent** is a software process that:

1. **Perceives** its environment through inputs (text, tool results, API responses, sensor data)
2. **Reasons** about those inputs using a language model or similar decision-making component
3. **Acts** on that reasoning by invoking tools, producing outputs, or directing other agents
4. **Iterates** — repeating the perceive-reason-act cycle until a goal is reached or a stopping condition is met

That last point is what distinguishes agents from ordinary LLM calls. A single-shot completion is not an agent. An agent runs in a **loop**.

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT LOOP                             │
│                                                             │
│   Perception ──► Reasoning ──► Action                       │
│       ▲                            │                        │
│       └────────────────────────────┘                        │
│                  (until done)                               │
└─────────────────────────────────────────────────────────────┘
```

The loop is the engine. Everything else — tools, memory, other agents — is infrastructure that makes the loop useful.

---

## What Agents Are Not

Understanding what agents *aren't* is as important as knowing what they are.

### Chatbots

A chatbot responds to user messages in a conversational interface. It may use an LLM, but a chatbot is typically **reactive** and **stateless between sessions** — it waits for the user to drive the interaction.

An agent is **proactive** and **goal-directed**. Given a goal, it figures out what steps to take and executes them autonomously, without waiting for human prompts at each step.

**Key distinction**: A chatbot helps a human accomplish a task. An agent accomplishes a task on behalf of a human.

### Scripts and Automation

Traditional scripts and automation tools (cron jobs, CI pipelines, RPA bots) execute **predetermined sequences of steps**. They're brittle — any input that doesn't match the expected format breaks them.

Agents handle **ambiguity and variation** because their decision-making is adaptive. An agent can read an error message it's never seen before and reason about how to respond. A script cannot.

**Key distinction**: Scripts follow a fixed path. Agents navigate.

### Retrieval-Augmented Generation (RAG)

RAG systems augment LLM responses with retrieved documents. This is a valuable pattern, but a RAG system that runs a single search-and-generate cycle is not an agent — it's a pipeline.

A RAG system becomes agentic when it can decide *whether* to search, *what* to search for, *whether the results are sufficient*, and *whether to search again*. The decision loop is what makes it an agent.

**Key distinction**: RAG is a retrieval pattern. An agent can use RAG as one of many tools.

### Traditional ML Models

A classification model, regression model, or recommendation engine makes predictions. These are powerful, but they don't act. They don't use tools. They don't iterate.

An agent can *use* a traditional ML model as a tool — for example, calling a classifier to route a document — but the model itself is not an agent.

---

## The Agent's Environment

Every agent operates within an **environment**: the set of all inputs it can perceive and all actions it can take.

For a software engineering agent, the environment might include:
- A codebase (readable via file tools)
- A test runner (executable via shell tool)
- A version control system (writable via git tools)
- Documentation (readable via search tools)

The **action space** defines what the agent can do. Restricting the action space is one of the most important governance decisions you'll make. An agent that can only read files behaves very differently from one that can also deploy to production.

---

## The Memory Spectrum

Agents have different types of memory, each with different trade-offs:

| Memory Type | Description | Scope | Example |
|-------------|-------------|-------|---------|
| In-context | Text within the active context window | Current session | Conversation history, retrieved docs |
| External (read) | Queried from external stores | Persistent | Vector databases, knowledge bases |
| External (write) | Written to external stores for later retrieval | Persistent, cross-session | User preferences, learned facts |
| Procedural | Embedded in system prompts or fine-tuning | Fixed until redeployment | Skills, personas, behavioral constraints |

Understanding memory type is essential for reasoning about agent behavior. An agent with only in-context memory forgets everything when the session ends. An agent with external write memory can learn — which is powerful but requires careful governance.

---

## Tools: The Agent's Interface to the World

Tools are functions the agent can invoke. They are the mechanism by which reasoning becomes action.

Well-designed tools share these properties:

**Specificity**: A tool does one thing clearly. `read_file(path)` is better than `file_operations(action, path, content)`.

**Predictability**: The same input produces the same type of output. Tools shouldn't behave differently based on hidden state.

**Observability**: The tool returns enough information for the agent to reason about what happened, including errors.

**Bounded scope**: Tools should not have unbounded side effects. A tool that sends an email should require an explicit recipient — it should not infer "everyone in the database".

Here's an example of a well-specified tool schema (using the Anthropic tool-use format as reference):

```json
{
  "name": "read_file",
  "description": "Read the contents of a file at the given path. Returns the file content as a string. Raises FileNotFoundError if the path does not exist.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute or relative path to the file to read"
      },
      "max_bytes": {
        "type": "integer",
        "description": "Maximum number of bytes to read. Defaults to 100000.",
        "default": 100000
      }
    },
    "required": ["path"]
  }
}
```

Notice what's explicit: what the tool does, what inputs it accepts, what it returns, and what errors it can raise. An agent that cannot read its tool descriptions cannot reason about when to use them.

---

## A Concrete Example: The Anatomy of One Agent Turn

Let's trace through a single agent loop iteration to make this concrete.

**Scenario**: An agent is tasked with "Summarize all customer complaints from last week and categorize them by type."

**Turn 1 — Reasoning step**:

```
The user wants a summary of customer complaints from last week.
I need to:
1. Find where complaints are stored
2. Filter by date range (last 7 days)
3. Read the complaint content
4. Categorize by type
5. Summarize

Let me start by calling the list_tables tool to understand the data schema.
```

**Turn 1 — Action**:
```python
list_tables()
# Returns: ["customers", "orders", "complaints", "products"]
```

**Turn 2 — Reasoning step**:

```
There's a "complaints" table. I should query it for last week's entries.
```

**Turn 2 — Action**:
```python
run_sql_query("SELECT * FROM complaints WHERE created_at >= NOW() - INTERVAL 7 DAYS")
# Returns: 47 rows of complaint data
```

**Turn 3 — Reasoning step + Action** (categorization)

...and so on until the summary is complete.

Each turn is: observe the result of the last action → reason → decide next action. This is the loop.

---

## Why This Matters for Production Systems

In toy demos, agents work beautifully. In production, the loop creates failure modes that don't exist in simple LLM calls:

**Loop termination**: What stops the agent? If the stopping condition is unclear, agents can run indefinitely, consuming tokens and money.

**Error propagation**: An error in Turn 3 affects Turn 4, Turn 5, and beyond. Unlike a script that fails fast, an agent may continue running on incorrect assumptions.

**Non-determinism**: Two runs of the same agent with the same input may produce different results due to LLM temperature, tool response latency, and intermediate state differences.

**Side effects**: Every action in the loop may have real-world consequences — files written, emails sent, APIs called. Unlike a pure function, these cannot be "undone" by re-running.

Understanding these failure modes now will prepare you for the governance and observability work in Modules 3 and 4.

---

## Summary

- An agent is a perceive-reason-act loop driven by an LLM
- Agents differ from chatbots (proactive, not reactive), scripts (adaptive, not fixed), and single-shot LLM calls (iterative, not one-shot)
- The action space defines what an agent can do — restricting it is a governance decision
- Memory comes in four types with different persistence properties
- Tools are the agent's interface to the world — well-designed tools are specific, predictable, observable, and bounded
- The loop creates production failure modes that don't exist in simpler systems

---

## Key Terms

| Term | Definition |
|------|------------|
| Agent | A perceive-reason-act loop driven by an LLM |
| Action space | The set of all tools/actions available to an agent |
| In-context memory | State maintained within the active context window |
| Tool | A function the agent can invoke to interact with the world |
| Turn | One iteration of the perceive-reason-act loop |

---

*Next: [Lesson 1.2 — Single-Agent Patterns](02-single-agent-patterns.md)*
