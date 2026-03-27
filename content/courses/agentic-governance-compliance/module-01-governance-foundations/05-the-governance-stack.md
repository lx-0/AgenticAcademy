# Lesson 1.5: The Governance Stack

**Module**: 1 — Governance Foundations for Agentic Systems
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Overview

Good governance is not a single control. It is a stack of complementary layers, where each layer catches failures that bypass the layer above it. This lesson introduces the complete governance stack architecture for agentic systems — the framework you will build on throughout this course.

---

## Why a Stack?

A single guardrail is insufficient because:
- Guardrails can be bypassed (prompt injection, edge cases, adversarial inputs)
- No single control mechanism is reliable under all conditions
- Defense in depth is a fundamental security and governance principle

The governance stack ensures that a failure in one layer is caught by the next layer, rather than propagating to a harmful outcome.

---

## The Five-Layer Governance Stack

```
┌──────────────────────────────────────────────────────────────┐
│                   Layer 5: Incident Response                  │
│    (What happens when governance fails — detect, contain,    │
│     remediate, learn)                                         │
├──────────────────────────────────────────────────────────────┤
│                   Layer 4: Human Oversight                    │
│    (Approval checkpoints, escalation, audit review)           │
├──────────────────────────────────────────────────────────────┤
│                   Layer 3: Audit and Observability            │
│    (What happened, why, with what effect — real-time and      │
│     retrospective)                                            │
├──────────────────────────────────────────────────────────────┤
│                   Layer 2: Runtime Controls (Guardrails)      │
│    (Input validation, output filtering, action constraints,   │
│     scope enforcement)                                        │
├──────────────────────────────────────────────────────────────┤
│                   Layer 1: Policy and Design                  │
│    (Access control, goal specification, capability scoping,  │
│     threat modeling)                                          │
└──────────────────────────────────────────────────────────────┘
```

Each layer is the subject of subsequent modules in this course. This lesson gives you the architecture; the following modules fill in each layer.

---

## Layer 1: Policy and Design

This is the foundation. Policy and design decisions determine what can go wrong before anything is built.

**Key decisions at this layer**:

- **Goal specification**: Is the agent's goal specified with explicit constraints, not just success criteria?
- **Capability scoping**: Which tools does the agent need? What data sources? Have we removed capabilities that are not required?
- **Threat modeling**: What are the highest-probability, highest-impact failure modes? (Module 4 covers this in depth.)
- **Deployment context**: In what environment will this agent operate? What are the regulatory constraints of that environment?

**What failure at this layer looks like**: An agent is deployed with access to production databases "just in case" rather than the read-only replica it actually needs. When an LLM reasoning error produces a malformed query, it executes against production and corrupts data.

**What success at this layer looks like**: Before writing any code, the team produces a one-page threat model identifying the three highest-risk capability grants, and removes two of them from the design.

---

## Layer 2: Runtime Controls (Guardrails)

Guardrails are code that runs at the boundaries of agent execution to enforce policy at runtime.

**Three guardrail points**:

```
User/System Input
        │
        ▼
┌─────────────────┐
│  Input Guardrail │  ← Validate input structure, detect injection, classify intent
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Agent Loop    │  ← The agent reasons and calls tools
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Action Guardrail │  ← Validate tool calls before execution (scope check, rate limit)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Output Guardrail │  ← Filter PII, detect policy violations before returning output
└────────┬────────┘
         │
         ▼
     Caller / User
```

**What failure at this layer looks like**: An agent processes a document containing a prompt injection attempt. The injected instruction asks the agent to call an external API with all customer data from the current session. The action guardrail is not present. The call executes.

**What success at this layer looks like**: The action guardrail checks every tool call against the agent's declared scope. The external API call is not in scope. Execution is blocked, the attempt is logged as a suspicious event, and an alert fires.

---

## Layer 3: Audit and Observability

Audit and observability answer "what happened?" — both in real-time (to detect anomalies) and retrospectively (to investigate incidents).

**Two components**:

**Real-time observability**: Metrics, traces, and alerts that let operators see agent behavior as it occurs. Anomaly detection that surfaces unusual patterns (unexpected tool call sequences, cost spikes, error rate increases) before they become incidents.

**Audit trail**: The tamper-evident record of all agent actions, used for incident investigation, compliance reporting, and accountability. Designed for completeness and integrity over performance.

**What failure at this layer looks like**: An agent has been silently exfiltrating customer records for 3 weeks. The team only discovers it when a customer complains. The logs exist but were never reviewed. No alert was configured for bulk data access patterns.

**What success at this layer looks like**: An alert fires 4 minutes after the agent begins making unusual high-volume data access calls. The on-call engineer reviews the execution trace and determines a prompt injection attack is in progress. The agent is suspended.

---

## Layer 4: Human Oversight

Human oversight provides the "second set of eyes" for high-stakes decisions that automated controls alone should not make.

**Two forms**:

**Prospective oversight (HITL)**: Human approval required before the agent executes a high-impact action. The agent pauses, surfaces the pending action to a reviewer, and waits for approval or rejection.

**Retrospective oversight (review)**: Human review of agent actions after execution, on a scheduled or triggered basis. Identifies systematic issues, policy drift, and edge cases not caught by automated controls.

**What failure at this layer looks like**: An agent deletes 40,000 records it classified as "stale" based on a misunderstood date field. No HITL was required for bulk deletion because the team assumed the agent's classification would be correct. By the time the deletion is noticed, the data is gone. No backup exists because the data was classified as "transient."

**What success at this layer looks like**: Bulk deletion is categorized as a high-impact, irreversible action. A HITL gate requires a human to review a random sample of 10 records before approving any bulk deletion. The reviewer notices the date field misinterpretation and rejects the action.

---

## Layer 5: Incident Response

Every governance system will eventually be tested by an incident. Layer 5 is what happens when layers 1–4 fail.

**Four phases**:

**Detect**: How does the organization know a governance failure has occurred? Alert thresholds, anomaly detection, customer reports, and regular audit reviews all contribute.

**Contain**: Stop the harm from spreading. Suspend the agent. Revoke access. Disable the capability that was exploited. Speed matters — every minute a compromised agent runs is more harm done.

**Remediate**: Reverse what can be reversed. Notify affected parties as required by regulation. Document what happened and why.

**Learn**: Update the governance stack to prevent recurrence. What layer failed? Why wasn't it caught by the next layer? What control needs to be added?

**What failure at this layer looks like**: An agent incident is discovered. The team has no documented response procedure. Decisions are made ad hoc. Notifications are delayed beyond legally required timeframes. The post-mortem is a blame session, not a systematic analysis.

**What success at this layer looks like**: A written incident playbook is invoked. The agent is suspended within 5 minutes of incident declaration. Affected parties are notified within the required 72-hour window. A structured root cause analysis produces 3 specific control improvements.

---

## Governance Stack Maturity Model

Organizations progress through maturity levels as they build their governance stack:

| Level | Characteristics | Risk Profile |
|-------|----------------|--------------|
| **Level 0: Ad hoc** | No governance infrastructure. Agents deployed without formal controls. | High — incidents likely and responses will be slow and uncoordinated |
| **Level 1: Policy exists** | Governance policies documented but not enforced with controls | Medium-high — intent is present but implementation gaps are large |
| **Level 2: Controls implemented** | Runtime guardrails and audit trails in place for most agents | Medium — catches common failures but lacks HITL and mature incident response |
| **Level 3: Oversight active** | Human oversight mechanisms in place and exercised regularly | Medium-low — systematic failures get caught, but response time may be slow |
| **Level 4: Continuous improvement** | Incident response is practiced, retrospectives drive control improvements | Low — governance is a feedback loop, not a one-time setup |
| **Level 5: Governance as competitive advantage** | Governance enables faster deployment because risk is understood and managed | Low — governance accelerates rather than slows deployment |

Most enterprise organizations deploying agentic systems in 2026 are at Level 0 or Level 1. Getting to Level 3 within the first year of an agentic program is a realistic and impactful goal.

---

## Building the Stack Incrementally

You do not need to build all five layers simultaneously. A practical sequence:

**Phase 1 (Before first production deployment)**:
- Layer 1: Document the threat model. Remove unnecessary capabilities.
- Layer 2: Implement input validation and output filtering for PII.
- Layer 3: Implement the audit trail. It must exist before you deploy.

**Phase 2 (First month in production)**:
- Layer 3: Add real-time observability and anomaly alerts.
- Layer 4: Identify the top 3 high-impact actions. Add HITL for each.

**Phase 3 (First quarter in production)**:
- Layer 5: Write the incident response playbook. Run a tabletop exercise.
- Layer 4: Establish regular audit review cadence.
- Layer 2: Add action guardrails based on production incident data.

By the end of Phase 3, you have a Level 3 governance stack. From there, continuous improvement carries you toward Level 4 and 5.

---

## Summary

- The five-layer governance stack: Policy and Design → Runtime Controls → Audit and Observability → Human Oversight → Incident Response
- Each layer catches failures that bypass the layer above it — defense in depth
- Failure modes at each layer illustrate why each layer is necessary, not optional
- The governance maturity model shows a realistic progression from Level 0 (ad hoc) to Level 5 (governance as competitive advantage)
- Build the stack incrementally: audit trail before deployment, observability in month one, incident playbook in quarter one

---

*Proceed to the [Module 1 Lab](lab.md) to apply these concepts.*
