# Lesson 1.3: Multi-Agent Patterns

**Module**: 1 — Agent Architecture Patterns
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Single agents are powerful. Multi-agent systems are transformative — and significantly more complex to build and operate correctly.

This lesson covers the three core multi-agent patterns used in production: **orchestrator/worker**, **peer-to-peer**, and **pipeline/sequential**. For each, you'll learn not just how it works but when it breaks and what that looks like in production.

---

## Why Multi-Agent at All?

Before diving into patterns, understand the motivations:

**Specialization**: Different agents can be optimized for different tasks — a code-writing agent tuned differently from a code-review agent.

**Parallelism**: Multiple agents can work concurrently on independent subtasks, reducing total wall-clock time.

**Scale**: A single agent is bounded by its context window. Multiple agents can collectively process far more information.

**Fault isolation**: A failure in one agent doesn't necessarily take down the entire system (with proper error handling).

**However**: Each of these benefits comes with coordination overhead. Multi-agent systems are harder to debug, more expensive per token, and introduce failure modes that don't exist in single-agent systems. Use them when the benefits clearly outweigh the complexity.

---

## Pattern 1: Orchestrator/Worker

The orchestrator/worker pattern has one **orchestrator agent** that plans and assigns tasks, and one or more **worker agents** that execute specific tasks.

```
                    ┌─────────────────┐
                    │   Orchestrator  │
                    │  (planner/mgr)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Worker A │  │ Worker B │  │ Worker C │
        │(research)│  │ (write)  │  │(review)  │
        └──────────┘  └──────────┘  └──────────┘
```

### How it works

1. Orchestrator receives a high-level goal
2. Orchestrator decomposes the goal into discrete tasks
3. Orchestrator assigns tasks to appropriate workers (by capability, availability, or both)
4. Workers execute their tasks and return results
5. Orchestrator synthesizes results and either completes the goal or creates new tasks

### Real-world example: Content production pipeline

```
Orchestrator receives: "Produce a competitive analysis of cloud database offerings"

Orchestrator plan:
  Task 1: Research AWS database services → assign to ResearchAgent
  Task 2: Research GCP database services → assign to ResearchAgent
  Task 3: Research Azure database services → assign to ResearchAgent
  [Tasks 1-3 run in parallel]
  Task 4: Compare pricing and features → assign to AnalysisAgent (after Tasks 1-3 complete)
  Task 5: Draft executive summary → assign to WritingAgent (after Task 4 completes)
  Task 6: Review for accuracy → assign to ReviewAgent (after Task 5 completes)
```

### Strengths

- Clear responsibility separation: orchestrator knows the goal; workers know their specialty
- Easy to add workers without changing orchestrator logic
- Orchestrator can handle retries and re-assignment when workers fail
- Natural human-in-the-loop insertion point at the orchestrator level

### Failure modes

**Orchestrator as bottleneck**: All coordination flows through the orchestrator. If it's slow, the whole system is slow.

**Orchestrator hallucinating worker capabilities**: The orchestrator may assign tasks to workers that can't handle them, especially when worker capability descriptions are vague.

**Worker result divergence**: Workers may return results in inconsistent formats, requiring the orchestrator to do complex normalization.

**Fix**: Define worker capability schemas explicitly. Each worker should have a typed input schema and output schema. The orchestrator should validate outputs before passing them downstream.

---

## Pattern 2: Peer-to-Peer (P2P)

In the peer-to-peer pattern, agents communicate directly with each other without a central coordinator. Agents can request services from any peer.

```
  ┌──────────┐         ┌──────────┐
  │ Agent A  │◄───────►│ Agent B  │
  └────┬─────┘         └─────┬────┘
       │                     │
       ▼                     ▼
  ┌──────────┐         ┌──────────┐
  │ Agent C  │◄───────►│ Agent D  │
  └──────────┘         └──────────┘
```

### How it works

Each agent has a set of capabilities it can offer to peers. Agents discover each other through a capability registry or shared communication channel. Any agent can initiate a request to any other agent.

### Where P2P works well

P2P is appropriate when:
- Agents need to share state dynamically (e.g., a shared knowledge base)
- The task structure is not known in advance and emerges from interaction
- Agents have symmetric responsibilities (no clear "manager" role)

**Example use case**: A swarm of research agents that share findings with each other as they discover them, avoiding redundant searches.

### Where P2P fails badly (and why it's used less in production)

**Coordination complexity grows quadratically**: In an orchestrator/worker system with N workers, coordination links = N (each worker talks to the orchestrator). In a fully connected P2P system, coordination links = N(N-1)/2. With 10 agents, that's 45 potential communication channels to monitor and debug.

**Deadlock risk**: Agent A is waiting for Agent B. Agent B is waiting for Agent A. Neither makes progress.

**Cycles and infinite loops**: Agent A calls Agent B, which calls Agent C, which calls Agent A. This is very hard to detect when the call graph is not centrally managed.

**Observability nightmare**: Without a central coordinator, reconstructing what happened in a P2P system requires correlating logs from every agent involved.

**Real production incident pattern**: A team builds a P2P research system that works beautifully on small inputs. Under load, two agents begin calling each other simultaneously (both detecting the same information gap), creating a synchronization storm that exhausts their rate limits and produces duplicate results.

**Fix**: If you need agent-to-agent communication without a central orchestrator, use a **shared message bus** with message deduplication and explicit routing — don't let agents call each other directly.

---

## Pattern 3: Pipeline/Sequential

In the pipeline pattern, agents are arranged in a sequence. The output of Agent N becomes the input of Agent N+1.

```
Input ──► Agent 1 ──► Agent 2 ──► Agent 3 ──► Output
         (extract)   (transform)  (synthesize)
```

### How it works

Each agent performs a transformation on the data passing through. Unlike orchestrator/worker, there's no central planner — the flow is predetermined.

### Real-world example: Document processing pipeline

```
Raw document input
    │
    ▼
Extraction Agent: Extract structured data from unstructured document
    │
    ▼
Classification Agent: Classify document type and assign routing tags
    │
    ▼
Enrichment Agent: Augment with external data (company info, dates, references)
    │
    ▼
Review Agent: Check for completeness and flag missing fields
    │
    ▼
Structured output
```

### Strengths

- Simple to implement and reason about
- Easy to test individual stages in isolation
- Natural monitoring points between each stage
- Predictable latency (total = sum of stage latencies, plus handoffs)

### Failure modes

**Cascade failures**: An error in Stage 2 propagates to Stage 3, Stage 4, etc. By the time you notice the failure, the original error is buried deep in context.

**Context loss at handoffs**: Each agent in the pipeline receives only what the previous agent passed. If Stage 2 drops important context (because it's not relevant to *its* task), Stage 4 may need that context and won't have it.

**Latency amplification**: Pipelines are sequential. A 3-stage pipeline where each stage takes 10 seconds has 30 seconds of minimum latency. There's no parallelism.

**Fix for cascade failures**: Implement per-stage validation. Each agent's output should include a `status` field (success/partial/failed) and a `metadata` field that preserves key context from the original input, even if it's not part of the agent's main task.

---

## Choosing the Right Pattern

| Scenario | Recommended Pattern | Why |
|----------|--------------------|----|
| Clear task decomposition, need parallelism | Orchestrator/Worker | Orchestrator handles dependencies and parallelism |
| Sequential transformation, known flow | Pipeline | Simple, testable, predictable |
| Dynamic agent collaboration, symmetric roles | P2P with shared bus | Flexible but requires disciplined message routing |
| Complex multi-stage with some parallelism | Orchestrator + Pipeline hybrid | Use orchestrator to manage parallel tracks of pipelines |

---

## The Hybrid Architecture (Production Standard)

In practice, most production systems combine patterns:

```
                     ┌─────────────────────┐
                     │    Top-Level        │
                     │    Orchestrator     │
                     └──────────┬──────────┘
                                │
               ┌────────────────┼────────────────┐
               │                │                │
               ▼                ▼                ▼
        ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
        │  Pipeline   │  │  Pipeline   │  │   Single    │
        │  Track A    │  │  Track B    │  │   Agent     │
        │  (3 stages) │  │  (2 stages) │  │   Task C    │
        └─────────────┘  └─────────────┘  └─────────────┘
               │                │                │
               └────────────────▼────────────────┘
                     ┌─────────────────────┐
                     │  Synthesis Agent    │
                     └─────────────────────┘
```

The orchestrator manages high-level flow and parallelism. Individual tracks are pipelines for sequential processing. The synthesis agent combines outputs.

---

## Context Passing Between Agents

The hardest problem in multi-agent architecture is not which pattern to use — it's how agents communicate context.

### The Thin Handoff (Anti-pattern)

```json
// What Agent 1 passes to Agent 2
{
  "result": "Analysis complete",
  "data": { ... }
}
```

This loses all the reasoning that Agent 1 did to produce the result. Agent 2 has no context for why certain decisions were made, what alternatives were considered, or what ambiguities remain.

### The Rich Handoff (Production Pattern)

```json
{
  "result": "...",
  "data": { ... },
  "handoff_context": {
    "original_goal": "...",
    "key_decisions": [
      {
        "decision": "Used Q1 2026 data, not Q4 2025",
        "reason": "User specified 'current quarter'"
      }
    ],
    "open_questions": ["Is the 15% figure including or excluding refunds?"],
    "confidence": "high",
    "data_freshness": "2026-03-25T00:00:00Z"
  }
}
```

This is more verbose, but it gives downstream agents the context they need to continue the work correctly.

---

## Summary

- Three multi-agent patterns: orchestrator/worker, peer-to-peer, pipeline
- Orchestrator/worker is the most common production pattern — clear responsibility, natural parallelism, central error handling
- Peer-to-peer offers flexibility but creates observability and coordination challenges that make it difficult at scale
- Pipelines are simple and testable but fragile to cascade failures and context loss
- Most production systems use hybrid architectures combining all three patterns
- Rich handoff context between agents is as important as the pattern itself

---

*Next: [Lesson 1.4 — Hierarchical Patterns](04-hierarchical-patterns.md)*
