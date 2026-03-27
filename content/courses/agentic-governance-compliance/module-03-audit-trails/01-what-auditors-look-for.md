# Lesson 3.1: What Auditors Actually Look For

**Module**: 3 — Audit Trails and Observability for Compliance
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Learning Objectives

By the end of this module, you will be able to:

1. Describe what compliance auditors and forensic investigators require from audit trails
2. Design a structured logging schema that satisfies both compliance and operational needs
3. Implement decision provenance capture that records agent reasoning, not just actions
4. Explain reproducibility requirements and design systems that support decision recreation
5. Build compliance dashboards and reports from audit data

---

## Overview

Most engineers think of audit logs as server access logs — who called what endpoint, when. Compliance auditors and forensic investigators need something fundamentally different. Understanding what they are actually looking for is the starting point for designing audit infrastructure that satisfies governance requirements, not just technical ones.

---

## The Three Questions Every Auditor Needs to Answer

When an auditor examines an agentic system — whether for a routine compliance review, an incident investigation, or a regulatory inquiry — they need to answer three questions:

### Question 1: What happened?

Not "what did the system do" in aggregate, but specifically: what actions were taken, on what data, at what time, by which agent, in the context of which goal?

**What engineers often provide**: Server logs with timestamps and API call records.

**What auditors actually need**: A coherent narrative of the agent's execution — the sequence of decisions and actions, each linked to the context that produced it, in a form a non-engineer can read.

### Question 2: Why did it happen?

What reasoning process produced each action? If the agent approved a payment, why did it approve that payment? If it flagged a document, what criteria triggered the flag?

**What engineers often provide**: The final output of the agent.

**What auditors actually need**: The reasoning steps the agent took to reach each significant decision. Not the full chain-of-thought for every LLM inference — but the decision logic for actions that had real-world impact.

### Question 3: Could it be justified?

Given the documented reasoning and the policies in effect at the time, was the agent's action consistent with policy? If not, was it a policy violation or a policy gap?

**What engineers often provide**: A statement that the system "follows company policy."

**What auditors actually need**: A traceable link between the agent's action and the specific policy rule that authorized or should have authorized that action.

---

## The Audit Evidence Hierarchy

Not all audit evidence is equal. Auditors assess evidence on a hierarchy of reliability:

```
High reliability
     │
     ▼
  System-generated, tamper-evident records
  (append-only logs with cryptographic integrity)
     │
     ▼
  System-generated records without tamper protection
  (standard database tables, overwritable)
     │
     ▼
  Human-attested records
  (approval decisions, override justifications)
     │
     ▼
  Reconstructed records
  (recreated from other sources after the fact)
     │
     ▼
Low reliability
  Post-hoc assertions
  ("the agent was configured correctly at the time")
```

Governance-grade audit trails produce evidence in the top tier: system-generated, tamper-evident records. Everything below that is supplementary at best.

---

## What Makes a Record Tamper-Evident

Tamper-evidence does not require blockchain. It requires:

**Append-only storage**: Records can be added but not modified or deleted. This is achievable with:
- Write-once cloud storage (AWS S3 Object Lock, GCS retention policies)
- Database tables with insert-only permissions (no UPDATE or DELETE grants)
- Immutable audit log services (AWS CloudTrail, Azure Monitor, dedicated SIEM systems)

**Integrity verification**: A mechanism to detect if records have been altered. Options:
- Hash chaining: each record includes the hash of the previous record (like a blockchain, but simpler)
- Periodic snapshots: log state is snapshotted and the snapshot hash is stored separately
- Signed records: each record is signed with a private key; signature verification proves authenticity

**Access controls**: Audit logs must be segregated from the systems they audit. If the agent can write to its own audit log, it can also modify its audit log. Write-only access patterns are standard.

---

## The Five Attributes Auditors Check First

When examining an audit log for the first time, experienced auditors check these five things:

### 1. Completeness
Are all actions recorded, or only some? Common gaps:
- Actions taken by background processes not wired into the audit framework
- Actions taken during system startup or shutdown
- Actions taken via admin tools or manual overrides that bypass the normal agent path
- Actions in sub-agents that log independently without correlation to the parent run

**Test for completeness**: Take a known action sequence from a test run and verify every action appears in the audit log.

### 2. Accuracy
Does the log record what actually happened, or a sanitized/summarized version?

- Does the log include the actual parameters passed to tools, or just the tool name?
- When an action fails, does the log record the failure and the error? Or just the retry success?
- When parameters are modified by a human override, does the log show both versions?

### 3. Timeliness
Were records written at the time of the action, or reconstructed later? A log written 5 minutes after an action can be a sign of post-hoc modification.

**Implementation**: Write audit records synchronously with the action, not in a separate async process. If async logging is required for performance, use a durable queue with at-least-once delivery semantics.

### 4. Attribution
Can every record be linked to a specific agent, run, and human actor where applicable? Anonymous records are low-value audit evidence.

Required attribution fields:
- `agent_id`: which agent
- `run_id`: which execution context
- `user_id` (if applicable): which human authorized or triggered this action
- `approval_id` (if applicable): which human approval authorized this action

### 5. Retention
How long are records kept? Audit records must be retained for the period required by applicable regulations:
- EU AI Act high-risk systems: logging requirements specify the records must be maintained for at least 10 years after the AI system is placed on the market or put into service
- GDPR: personal data in logs must not be retained beyond the purpose that justified its collection — creating a tension between audit retention and data minimization
- SOX: financial records must be retained 7 years
- HIPAA: 6 years for medical records

Designing retention policies that satisfy all applicable requirements requires legal input, not engineering guesswork.

---

## The Narrative Requirement

One aspect of audit trails that engineers often miss: the audit trail must tell a story that a non-engineer can follow.

A compliance auditor investigating a specific incident needs to reconstruct the sequence of events in plain language. An audit trail that requires a data engineer to query 5 tables and write custom joins is not fit for compliance purposes.

**The narrative test**: Given an incident report ("on March 15th at 14:32 UTC, an agent transferred $25,000 to an unauthorized vendor"), can a compliance officer reconstruct the following in under 30 minutes without writing code?

1. Which agent took the action
2. What the agent's goal was
3. What reasoning led to the decision
4. Whether the action was authorized by a human approval
5. What data the agent accessed in making the decision
6. Who was responsible for overseeing this agent

If the answer is no, the audit trail is not fit for compliance purposes.

---

## Summary

- Auditors need to answer three questions: what happened, why, and was it justifiable
- The audit evidence hierarchy ranks tamper-evident system-generated records as most reliable
- Tamper-evidence requires append-only storage, integrity verification, and access controls that separate audit logs from the systems they monitor
- The five first-checks for audit log quality: completeness, accuracy, timeliness, attribution, retention
- The narrative requirement: a non-engineer must be able to reconstruct a specific incident in under 30 minutes without writing code

---

*Next: [Lesson 3.2 — Structured Logging for Agent Actions](02-structured-logging.md)*
