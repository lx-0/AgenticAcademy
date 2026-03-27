# Lesson 2.1: Task Routing

**Module**: 2 — Orchestration and Coordination
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Task routing is the mechanism by which an orchestrator decides *which agent* handles *which task*. Get it wrong and tasks land with agents that aren't equipped to handle them. Get it right and the system self-organizes — work flows to where it can be done best, without human intervention.

This lesson covers three routing strategies used in production: **deterministic routing rules**, **LLM-based routing**, and **capability registries**.

---

## Why Routing Matters

In a simple two-agent system, routing is trivial. But as systems scale:

- 10 agents with overlapping capabilities
- Tasks that don't fit neatly into predefined categories
- Load-varying conditions where the best agent depends on current capacity
- Dynamic systems where new agents are added over time

Routing becomes a real engineering problem. Poor routing causes:
- Tasks assigned to agents that lack required tools (guaranteed failure)
- Overloaded agents while others sit idle (performance waste)
- Ambiguous routing causing the same task to be attempted by multiple agents (duplicates)
- Routing failures that silently default to any available agent (garbage outputs)

---

## Strategy 1: Deterministic Routing Rules

Deterministic routing assigns tasks to agents based on explicit, human-written rules. The rules evaluate task properties (type, source, urgency, tags) and return an agent assignment.

### When to use it

- Task types are well-defined and stable
- The routing logic can be expressed as clear conditions
- Correctness is more important than flexibility
- You need routing decisions to be fully auditable

### Implementation

```python
@dataclass
class RoutingRule:
    condition: Callable[[Task], bool]
    target_agent: str
    priority: int  # Higher = evaluated first
    description: str

class DeterministicRouter:
    def __init__(self, rules: list[RoutingRule]):
        self.rules = sorted(rules, key=lambda r: r.priority, reverse=True)

    def route(self, task: Task) -> str:
        for rule in self.rules:
            if rule.condition(task):
                return rule.target_agent
        raise RoutingError(f"No rule matched task type: {task.type}")

# Example rules
router = DeterministicRouter(rules=[
    RoutingRule(
        condition=lambda t: t.type == "code_review" and t.language == "python",
        target_agent="python-reviewer-agent",
        priority=100,
        description="Python code reviews go to the Python specialist"
    ),
    RoutingRule(
        condition=lambda t: t.type == "code_review",
        target_agent="general-reviewer-agent",
        priority=50,
        description="Other code reviews go to the general reviewer"
    ),
    RoutingRule(
        condition=lambda t: t.urgency == "critical",
        target_agent="on-call-agent",
        priority=200,
        description="Critical tasks always go to on-call"
    ),
])
```

### Strengths and weaknesses

**Strengths**: Completely predictable. Every routing decision can be traced to a specific rule. Easy to audit. No LLM tokens spent on routing.

**Weaknesses**: Requires upfront knowledge of all task types. Brittle when task descriptions are free-form or ambiguous. Requires manual updates when new task types are added.

### Production pattern: Rule + fallback

In production, combine deterministic rules with a fallback:

```python
def route(self, task: Task) -> str:
    for rule in self.rules:
        if rule.condition(task):
            return rule.target_agent
    # No rule matched — use LLM routing as fallback
    return self.llm_router.route(task)
```

This gives you deterministic routing for known task types (fast, cheap, predictable) and flexible LLM routing for novel cases.

---

## Strategy 2: LLM-Based Routing

LLM-based routing uses a language model to select the best agent for a given task. The LLM reads the task description and a registry of available agents with their capabilities, and returns an assignment.

### When to use it

- Task descriptions are free-form and not easily categorized
- Task types evolve frequently
- You need nuanced matching between task requirements and agent capabilities
- The routing decision requires understanding task context, not just properties

### Implementation

```python
ROUTING_PROMPT = """You are a task router. Your job is to assign the following task to the most appropriate agent.

Available agents:
{agent_registry}

Task to route:
{task_description}

Rules:
1. Select the agent whose capabilities BEST match the task requirements
2. Consider the task's complexity level against the agent's stated expertise
3. If no agent is a good match, output "ESCALATE" — do not force a poor match

Respond with ONLY the agent_id of the selected agent, or "ESCALATE" if no good match exists.
Do not explain your reasoning."""

class LLMRouter:
    def __init__(self, agent_registry: dict[str, AgentCapabilityDescription]):
        self.registry = agent_registry

    async def route(self, task: Task) -> str:
        registry_text = "\n".join([
            f"- agent_id: {agent_id}\n  capabilities: {cap.description}\n  tools: {', '.join(cap.tools)}"
            for agent_id, cap in self.registry.items()
        ])

        response = await llm.complete(
            ROUTING_PROMPT.format(
                agent_registry=registry_text,
                task_description=task.description
            ),
            max_tokens=50,  # Routing decisions should be brief
            temperature=0.0  # Routing should be deterministic
        )

        return response.strip()
```

### Key design decisions

**Temperature = 0**: Routing should be deterministic. Stochastic routing introduces unpredictable behavior.

**Constrained output**: The LLM should return only the agent ID. Verbose routing decisions are slow and their reasoning may be hallucinated.

**Compact registry**: Describe each agent in 2–3 sentences. Long agent descriptions increase cost and may reduce routing accuracy.

### Failure modes of LLM routing

**Hallucinated agents**: The LLM may "invent" an agent_id that doesn't exist. Validate the output against your actual agent registry.

```python
result = await self.llm_router.route(task)
if result != "ESCALATE" and result not in self.registry:
    raise RoutingError(f"LLM returned non-existent agent: {result}")
```

**Routing to always-first agent**: If your registry lists agents alphabetically and some agents have similar descriptions, the LLM may default to the first alphabetical match. Randomize registry order between calls or use embeddings-based matching.

**Slow routing overhead**: Every routing decision costs tokens and latency. For high-frequency routing, LLM routing adds measurable overhead. Cache routing decisions for identical or near-identical tasks.

---

## Strategy 3: Capability Registries

A capability registry is a structured database of agent capabilities that enables programmatic, semantic matching of tasks to agents.

### Registry schema

```python
@dataclass
class AgentCapability:
    agent_id: str
    name: str
    description: str
    # What task types this agent handles
    task_types: list[str]
    # What tools are available
    tools: list[str]
    # Embedding of the capability description for semantic search
    embedding: list[float]
    # Current load (0.0 = idle, 1.0 = at capacity)
    current_load: float
    # Maximum concurrent tasks
    max_concurrent_tasks: int
    # Current running tasks
    active_tasks: int
```

### Semantic routing using embeddings

Rather than exact rule matching or LLM reasoning, embed both the task description and agent descriptions and find the closest match.

```python
class SemanticRouter:
    def __init__(self, registry: CapabilityRegistry, embedding_model):
        self.registry = registry
        self.embedder = embedding_model

    async def route(self, task: Task) -> str:
        # Embed the task description
        task_embedding = await self.embedder.embed(task.description)

        # Find agents with available capacity
        available_agents = [
            agent for agent in self.registry.all()
            if agent.active_tasks < agent.max_concurrent_tasks
        ]

        if not available_agents:
            raise RoutingError("No agents available — all at capacity")

        # Score each agent by semantic similarity to task
        scores = []
        for agent in available_agents:
            similarity = cosine_similarity(task_embedding, agent.embedding)
            # Penalize heavily loaded agents
            load_penalty = agent.current_load * 0.3
            scores.append((agent.agent_id, similarity - load_penalty))

        # Select highest-scoring available agent
        best_agent_id = max(scores, key=lambda x: x[1])[0]
        return best_agent_id
```

### Keeping the registry current

The registry is only as useful as its accuracy. Agent capabilities change. Implement:

1. **Self-reporting**: Each agent reports its current load and active task count to the registry on a heartbeat.

2. **Health checking**: The registry periodically pings each agent to verify it's responsive.

3. **Capability versioning**: When an agent's tools or capabilities change, the registry entry is updated and the embedding recomputed.

4. **Graceful deregistration**: When an agent is shut down, it removes itself from the registry rather than being marked as unresponsive.

---

## Routing in Production: The Load-Aware Pattern

Static routing (route to the "best" agent regardless of load) causes hot spots: the best agent gets all the work, while capable secondary agents sit idle.

Load-aware routing considers both capability match AND current agent load:

```python
def select_agent(
    self,
    candidates: list[AgentCapability],
    task: Task,
    max_acceptable_load: float = 0.8
) -> str:
    """
    Select the best available agent, considering both capability match and load.
    """
    # Filter to agents below load threshold
    available = [a for a in candidates if a.current_load < max_acceptable_load]

    if not available:
        # All agents near capacity — queue the task or expand
        raise CapacityExceededError(
            f"All {len(candidates)} agents at >{max_acceptable_load*100}% load. "
            "Consider scaling or queueing."
        )

    # Sort by combined score: capability match (primary) and inverse load (secondary)
    scored = sorted(
        available,
        key=lambda a: (self.capability_score(a, task), -a.current_load),
        reverse=True
    )

    return scored[0].agent_id
```

---

## Real-World Failure Mode: The Routing Thundering Herd

**What it is**: Multiple orchestrators start simultaneously and all route to the same agent (the highest-capability one), overloading it while other agents remain idle.

**Why it happens**: Load information in the registry is stale by the time routing decisions are made. The 10 orchestrators all read the same "load = 0.1" value from the registry and all choose the same agent.

**How to reproduce it**: Start 10 concurrent tasks in your test environment and observe the first agent in the registry receives all 10 while others receive 0.

**How to fix it**: Implement **optimistic capacity reservation**. When an orchestrator selects an agent, it atomically increments that agent's `pending_tasks` count in the registry before confirming the assignment. Other orchestrators see the updated count and route to other agents.

```python
async def route_with_reservation(self, task: Task) -> str:
    selected = self.select_agent(self.registry.available(), task)

    # Atomically reserve capacity before confirming
    reserved = await self.registry.atomic_increment(
        agent_id=selected,
        field="pending_tasks",
        expected_max=selected_agent.max_concurrent_tasks
    )

    if not reserved:
        # Lost the race — agent filled up, try again with updated registry
        return await self.route_with_reservation(task)

    return selected
```

---

## Summary

- Three routing strategies: deterministic rules (fast, predictable), LLM-based (flexible, handles ambiguity), capability registries (semantic matching, load-aware)
- Production systems typically combine rules (for known task types) with LLM routing (for novel cases)
- Capability registries enable load-aware routing and are critical for scaling beyond a few agents
- Routing thundering herd is a common failure — solve with optimistic capacity reservation

---

*Next: [Lesson 2.2 — Handoff Patterns](02-handoff-patterns.md)*
