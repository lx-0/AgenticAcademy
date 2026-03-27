# Lesson 1.4: Hierarchical Agent Patterns

**Module**: 1 — Agent Architecture Patterns
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

When your problem is large enough that a single orchestrator can't manage all worker agents effectively, you need hierarchy. Hierarchical agent patterns mirror how human organizations scale: managers delegate to managers, who delegate to workers. This lesson covers manager/IC (individual contributor) trees, delegation chains, and role-based decomposition — the patterns behind enterprise-grade agentic systems.

---

## Why Hierarchy?

The orchestrator/worker pattern from Lesson 1.3 works well up to a point. As systems grow:

- A single orchestrator managing 20 workers is cognitively overwhelming (and token-expensive)
- Different domains need specialized coordination logic
- Governance and accountability need clear reporting structures
- Failure isolation becomes critical — a problem in one subtree shouldn't cascade to all others

Hierarchy solves these problems by introducing **intermediate manager agents** that own specific subdomains of the larger task.

---

## Pattern 1: Manager/IC Agent Trees

The manager/IC tree is a direct mapping of hierarchical organizational structures onto agents.

```
                         ┌─────────────────┐
                         │    CEO Agent    │
                         │ (top-level goal)│
                         └────────┬────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
                ▼                 ▼                 ▼
         ┌──────────┐      ┌──────────┐      ┌──────────┐
         │ Manager  │      │ Manager  │      │ Manager  │
         │ Research │      │ Writing  │      │  Review  │
         └────┬─────┘      └────┬─────┘      └────┬─────┘
              │                 │                 │
         ┌────┴────┐       ┌────┴────┐       ┌────┴────┐
         │   IC    │       │   IC    │       │   IC    │
         │Agent 1  │       │Agent 4  │       │Agent 7  │
         └─────────┘       └─────────┘       └─────────┘
         ┌─────────┐       ┌─────────┐       ┌─────────┐
         │   IC    │       │   IC    │       │   IC    │
         │Agent 2  │       │Agent 5  │       │Agent 8  │
         └─────────┘       └─────────┘       └─────────┘
```

### Responsibilities at each level

**CEO Agent (or top-level orchestrator)**:
- Interprets the user's high-level goal
- Decomposes into major work streams
- Assigns work streams to manager agents
- Monitors overall progress
- Synthesizes final output
- Escalation point for cross-team conflicts

**Manager Agents**:
- Own a specific domain or work stream
- Further decompose work into worker tasks
- Manage their IC agents (assignment, retries, quality checks)
- Return synthesized results to the CEO agent
- Handle failures within their subtree without escalating unless necessary

**IC (Individual Contributor) Agents**:
- Execute specific, well-defined tasks
- No delegation — do the work, return results
- Specialize in one capability (web search, code execution, document parsing, etc.)

### Communication flow

Communication in a manager/IC tree is **strictly hierarchical** — agents communicate up and down the chain, not across it. An IC agent in the Research subtree does not call an IC agent in the Writing subtree directly. All cross-domain coordination goes through the CEO agent.

This constraint:
- Prevents coordination cycles (A calls B calls A)
- Makes audit trails readable (every message has a clear parent)
- Enables per-subtree governance (managers can enforce policies for their domain)

---

## Pattern 2: Delegation Chains

A delegation chain is a linear hierarchy where each agent can delegate to exactly one subordinate.

```
User Goal
    │
    ▼
Senior Agent (interprets goal, delegates complex parts)
    │
    ▼
Mid-level Agent (handles domain-specific logic, delegates implementation)
    │
    ▼
Execution Agent (runs tools, returns results)
    │
    ▼
Result flows back up the chain
```

### When to use delegation chains

Delegation chains work well for tasks with **depth** — where understanding a problem requires progressively more specialized knowledge.

**Example**: A security audit task

```
Security Auditor Agent:
"I need to audit this system for vulnerabilities."
→ Delegates: "Analyze all network endpoints"

Network Analyst Agent:
"I need to map all network endpoints and check configurations."
→ Delegates: "Run port scan on these IP ranges"

Port Scanner Agent:
Runs actual port scanning tools, returns raw results.

[Results flow back up]:
Raw port data → Network Analyst (interprets, structures) → Security Auditor (synthesizes into report)
```

### The delegation anti-pattern: Unnecessary depth

Every level of delegation adds:
- Latency (another LLM call)
- Context overhead (passing context up and down)
- Failure surface (another agent that can fail)

**Rule of thumb**: A delegation chain should only have as many levels as the task genuinely requires. If an agent can accomplish a task in one step, don't add a subordinate just for structural elegance.

---

## Pattern 3: Role-Based Decomposition

Role-based decomposition assigns agents roles that map to organizational functions, with defined responsibilities and authority levels.

**Common agent roles in production systems**:

| Role | Responsibilities | Authority Level |
|------|-----------------|-----------------|
| Planner | Decompose goals into tasks, sequence work | Can assign to worker agents |
| Researcher | Gather information from tools and external sources | Read-only |
| Analyst | Interpret and synthesize information | Read-only |
| Writer | Produce natural language outputs | Write to document stores |
| Reviewer | Evaluate quality and flag issues | Can block, cannot fix |
| Executor | Run code, API calls, system operations | Bounded write/execute |
| Auditor | Record decisions and verify compliance | Read-only |

**Why explicit roles matter**:

1. **Tool access control**: Role determines which tools are available. Reviewers should not have write access. Executors should not plan.

2. **Prompt specialization**: Each role has a tailored system prompt. A Researcher's system prompt emphasizes thoroughness and source quality. A Writer's emphasizes clarity and structure. Role-specific prompts outperform "do-everything" prompts.

3. **Accountability**: When something goes wrong, role assignments make it clear which agent made the decision.

4. **Cost optimization**: Not all roles need frontier models. Researchers may benefit from frontier models for nuanced judgment; Formatters can use smaller, cheaper models.

### Role interaction diagram

```
             User Goal
                │
                ▼
         ┌────────────┐
         │  Planner   │──── creates plan
         └─────┬──────┘
               │ assigns tasks
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌─────────┐
│Research│ │Analyst │ │  Write  │
│ Agent  │ │ Agent  │ │  Agent  │
└────────┘ └────────┘ └────┬────┘
                            │
                            ▼
                      ┌──────────┐
                      │ Reviewer │
                      │  Agent   │
                      └──────────┘
                            │
               ┌────────────┤
               │            │
               ▼            ▼
           Approved     Revise
          (to Planner) (to Writer)
```

---

## Authority and Escalation

In hierarchical systems, every agent needs clarity on two things:
1. What decisions am I authorized to make independently?
2. When should I escalate to my manager?

**Escalation criteria** (build these into manager agent system prompts):

```
Escalate to parent when:
- A subtask has failed more than N times
- Required data or access is unavailable
- The user's goal is ambiguous and I cannot resolve the ambiguity from context
- The cost of proceeding may exceed the allocated budget
- A security or compliance risk is identified that I'm not authorized to handle
```

Without explicit escalation criteria, agents will either:
- Over-escalate (every small problem reaches the top, defeating the purpose of hierarchy)
- Under-escalate (silently fail or produce incorrect results rather than asking for help)

---

## Real-World Failure Mode: The Silent Propagation

**What it is**: An IC agent fails silently (returns an empty result or a generic "task complete"), the manager agent doesn't detect the failure, synthesizes a result as if the task succeeded, and passes the defective result to the CEO agent. The CEO agent produces a confident-sounding final output based on incomplete information.

**Why it happens**: Agents are often good at not raising errors. They're trained to be helpful and complete tasks. This can manifest as "completing" a task incorrectly rather than admitting failure.

**How to prevent it**:

1. **Typed result schemas**: IC agents return structured results with an explicit `success` flag and `error_details` field. Managers validate this field before incorporating results.

```python
@dataclass
class AgentResult:
    success: bool
    data: dict | None
    error_code: str | None  # "TOOL_FAILURE", "TIMEOUT", "INSUFFICIENT_DATA", etc.
    error_details: str | None
    confidence: float  # 0.0 to 1.0
    warnings: list[str]
```

2. **Manager-level sanity checks**: Manager agents should verify that IC agent results make sense given the task. "The research agent returned 0 results for a query about cloud databases" should trigger a re-attempt or escalation.

3. **Partial result handling**: Design the system to accept partial results gracefully. Better to produce an accurate partial output than a confident incorrect complete output.

---

## Governance in Hierarchical Systems

Hierarchy creates natural governance boundaries:

**Budget isolation**: Each subtree can have its own token budget. The Research manager's budget doesn't affect the Writing manager's budget. The CEO agent allocates budgets at task assignment time.

**Audit trails**: Every agent action should be logged with its position in the hierarchy. A well-structured log entry includes: `agent_id`, `agent_role`, `parent_agent_id`, `task_id`, `action_type`, `timestamp`.

**Permission inheritance**: Permissions should be hierarchical and additive, not inherited. An IC agent should have the minimum permissions needed for its specific tasks — not the union of all its ancestors' permissions.

---

## Summary

- Manager/IC trees scale coordination by introducing intermediate manager agents that own specific domains
- Communication is hierarchical — agents communicate up and down the chain, not laterally
- Delegation chains add depth for tasks requiring progressively specialized knowledge — use only as deep as the task genuinely requires
- Role-based decomposition assigns explicit responsibilities, tool access, and authority levels to each agent type
- Escalation criteria must be explicit — without them, agents either over- or under-escalate
- Silent propagation of failures is the most dangerous hierarchical failure mode — typed result schemas and manager-level sanity checks prevent it

---

*Next: [Lesson 1.5 — Agent State and Interfaces](05-agent-state-and-interfaces.md)*
