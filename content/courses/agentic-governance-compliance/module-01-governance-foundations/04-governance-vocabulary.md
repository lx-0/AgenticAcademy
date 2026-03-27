# Lesson 1.4: The Governance Vocabulary

**Module**: 1 — Governance Foundations for Agentic Systems
**Estimated reading time**: ~15 minutes
**Level**: Intermediate–Advanced

---

## Overview

One of the most consistent findings from enterprise AI adoption: engineers and compliance teams speak different languages. When they try to collaborate on AI governance, miscommunication produces requirements that look satisfied on paper but are not implemented correctly in code.

This lesson is a shared vocabulary reference. Every term has a plain-language definition, a technical implementation note, and an example of how it appears in compliance conversations. Learn these terms. Use them in meetings with legal, risk, and compliance teams. The shared vocabulary is itself a governance mechanism.

---

## Core Governance Terms

### Scope Boundary

**Definition**: The set of actions, data sources, and external systems that an agent is authorized to access and modify.

**Technical implementation**: The list of tools provided to the agent, the databases and APIs those tools can access, and any additional constraints on input values (e.g., "can query customer records but only for the currently authenticated customer").

**In compliance conversations**: "What is the agent's scope?" means "what can it do?" The answer must be specific — not "it has access to our APIs" but "it has read access to the customer support table for the current ticket's customer, and write access to the ticket status and notes fields only."

**Code example**:
```python
# Scope boundary defined in tool configuration
SUPPORT_AGENT_TOOLS = [
    Tool(
        name="get_customer_record",
        description="Get customer record for the current support ticket",
        # Scope constraint: only the customer for the active ticket
        parameter_constraints={
            "customer_id": "must match session.active_ticket.customer_id"
        }
    ),
    Tool(
        name="update_ticket_status",
        description="Update the status of the current support ticket",
        # Scope constraint: only the active ticket, only status/notes fields
        parameter_constraints={
            "ticket_id": "must match session.active_ticket.id",
            "updatable_fields": ["status", "notes"]
        }
    )
    # NOT included: create_ticket_for_other_customer, query_all_customers, etc.
]
```

---

### Least Privilege

**Definition**: Agents should have only the access they need for their current task, not access that might be convenient for future tasks.

**Technical implementation**: Per-task tool grants, not global access lists. An agent that handles invoice processing should not have access to HR records "just in case" someone accidentally routes an HR document to it.

**In compliance conversations**: "Does this system follow least privilege?" means "have you removed all access that isn't required for the task?" Security teams expect to see evidence of privilege scoping — not just an assertion that it exists.

**Anti-pattern to avoid**:
```python
# BAD: Granting broad access because it's convenient
agent = Agent(
    tools=ALL_AVAILABLE_TOOLS,  # "We'll restrict it when we know what it needs"
    system_prompt="You are a helpful assistant."
)

# GOOD: Scoping tools to the task
invoice_agent = Agent(
    tools=[read_invoice, validate_vat_number, approve_payment_under_1000,
           flag_for_human_review],
    system_prompt=(
        "You process invoices under $1,000. For invoices over $1,000, "
        "flag for human review. You do not have access to HR, payroll, "
        "or customer records."
    )
)
```

---

### Audit Trail

**Definition**: A tamper-evident, chronological record of all agent actions, including the reasoning behind each action, the tools called, inputs provided to tools, and outputs received.

**Technical implementation**: Structured, append-only log with correlation IDs linking actions to the execution context, goal, and responsible agent. Tamper-evident means the log cannot be modified after write — typically implemented with append-only storage and cryptographic checksums.

**In compliance conversations**: "Can you produce an audit trail for this agent's actions last Tuesday?" must be answerable in under 30 minutes. If it takes days, your audit trail is not fit for compliance purposes.

**Minimum audit trail fields**:
```json
{
  "event_id": "uuid-v4-immutable",
  "timestamp": "ISO-8601",
  "agent_id": "which agent produced this event",
  "run_id": "which execution context (links all events in one run)",
  "action_type": "tool_call | reasoning | message | decision",
  "tool_name": "name of tool called (if action_type = tool_call)",
  "tool_input": "sanitized input parameters",
  "tool_output_hash": "hash of output (not the output itself if sensitive)",
  "reasoning_summary": "one-line summary of agent's reasoning step",
  "goal_id": "which goal this run was serving",
  "human_oversight_id": "if this action was approved by a human, the approval record ID"
}
```

---

### Guardrail

**Definition**: A mechanism that prevents or flags policy-violating actions. Guardrails are implemented in code and operate either at the input stage (before the agent processes a request), at the action stage (before the agent executes a tool), or at the output stage (before the agent's output is returned to the caller).

**Technical implementation**: Input classifiers, output filters, action validators, rate limiters, scope checkers. See Module 3 of the Agentic Engineering Fundamentals course for detailed implementation patterns.

**In compliance conversations**: "What guardrails are in place?" is a question about enforcement mechanisms, not policies. Saying "we have a policy that agents shouldn't exfiltrate data" is not a guardrail answer. "We have an output filter that runs all agent outputs through a PII detector and blocks responses containing more than 3 PII fields" is a guardrail answer.

---

### Human-in-the-Loop (HITL)

**Definition**: A checkpoint where a human must review and approve an agent action before it executes. HITL controls are distinct from monitoring: monitoring observes what happened; HITL prevents execution until approval is granted.

**Technical implementation**: Approval workflows that pause agent execution, surface the pending action to a designated reviewer, and resume (or cancel) based on the review decision. See Module 2 of this course for full implementation patterns.

**In compliance conversations**: "Is there human oversight?" is often asking about HITL. Be precise: "yes, all actions that modify production data require a human approval via our ticketing system before the agent proceeds" is a HITL answer. "We monitor agent outputs" is an observability answer, not a HITL answer.

---

### Blast Radius

**Definition**: The maximum scope of harm a misbehaving agent can cause before it is stopped. Blast radius is bounded by the agent's scope (what it can access), the reversibility of its actions (can they be undone?), and the speed of detection and response.

**Technical implementation**: Calculated from the union of all tools' maximum impact:
```
blast_radius = {
    "maximum_records_modifiable": max records that could be written/deleted,
    "external_systems_reachable": list of external APIs/systems the agent can call,
    "maximum_spend": max cost in $ for one agent run (for LLM + tool costs),
    "reversible_actions": list of actions that can be undone,
    "irreversible_actions": list of actions that cannot be undone
}
```

**In compliance conversations**: Risk officers use blast radius analysis to determine whether an agent failure is a "bad day" or an existential incident. An agent that can modify 50 records has a small blast radius. An agent that can delete production databases has a catastrophic blast radius. Both may be "read/write" agents — the governance treatment differs enormously.

---

### Data Residency and Sovereignty

**Definition**: Requirements about where data is stored and processed, typically driven by national or regional law. EU GDPR requires that personal data of EU residents not be transferred to countries without adequate data protection unless specific safeguards apply.

**Technical implementation**: When building agents that use third-party APIs (model providers, external services), verify that data sent to those APIs does not violate data residency requirements. This requires knowing: (a) where the API processes data, (b) what data is sent in prompts and tool results, (c) whether that data includes personal data subject to residency requirements.

**In compliance conversations**: "We're sending customer PII to a US-based API" is a data residency flag if customers are EU residents and no data transfer mechanism (Standard Contractual Clauses, adequacy decision) is in place.

---

### Model Governance

**Definition**: The policies and controls that govern which AI models are used in production, how they are evaluated, and how model changes are managed. Analogous to software library governance.

**Technical implementation**: A model registry with approval workflows for introducing new models or updating existing ones. Key attributes tracked per model: version, provider, evaluation results (accuracy, safety, bias), approved use cases, prohibited use cases, known limitations.

**In compliance conversations**: "Is your model versioned and tracked?" is a model governance question. So is "what happens if the model provider updates the model?" — if you can't answer this, your governance has a gap.

---

### Policy vs. Control

These terms are often confused:

**Policy**: A written statement of what is required or prohibited. "Agents must not access production databases without explicit authorization." Policies are written by governance, legal, or compliance teams.

**Control**: An implemented mechanism that enforces or evidences a policy. An access control list that prevents database access without an authorization record. Controls are implemented by engineering teams.

The governance failure mode: policies exist, controls do not. The compliance appearance is good; the actual risk management is absent.

**In compliance conversations**: When asked "how do you enforce this policy?", the answer must describe a control — a technical mechanism — not a reference to another policy or a statement of intent.

---

## Terms Compliance Teams Use That Engineers Sometimes Misunderstand

| Compliance Term | What They Mean | Engineering Translation |
|----------------|----------------|------------------------|
| "Due diligence" | Investigation before a decision to establish you knew the risks | Risk assessment documentation before deployment |
| "Material risk" | A risk significant enough to affect decisions | A failure mode that would cause significant harm, not just inconvenience |
| "Adequate oversight" | Oversight that is sufficient to catch and correct failures | Monitoring that detects anomalies + HITL for high-stakes actions |
| "Commensurate controls" | Controls proportional to the risk level | Higher-risk agents need stronger controls |
| "Chain of custody" | Documented history of who handled data and when | Audit trail with actor, timestamp, and action for all data access |
| "Non-repudiation" | Ability to prove an action occurred and who performed it | Tamper-evident logs with identity claims verified |
| "Residual risk" | Risk remaining after controls are applied | Known limitations of your guardrails |
| "Risk tolerance" | How much risk the organization accepts | The threshold above which human approval is required |

---

## Summary

- Scope boundary, least privilege, audit trail, guardrail, HITL, blast radius, data residency, model governance, policy vs. control — these terms must be understood with engineering precision
- Using these terms correctly in compliance conversations reduces miscommunication and produces better-implemented governance requirements
- The key distinction: policies are written statements; controls are implemented mechanisms. Governance requires both
- Many compliance terms map directly to engineering artifacts when correctly translated

---

*Next: [Lesson 1.5 — The Governance Stack](05-the-governance-stack.md)*
