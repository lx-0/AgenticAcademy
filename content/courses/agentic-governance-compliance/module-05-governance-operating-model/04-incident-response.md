# Lesson 5.4: Incident Response for Agent Failures

**Module**: 5 — Building a Governance Operating Model
**Estimated reading time**: ~22 minutes
**Level**: Intermediate–Advanced

---

## Overview

Agent failures have properties that make them different from traditional software incidents: they may not produce obvious error states, they may propagate through multiple systems via multi-agent pipelines, and the harm may already be done before the failure is detected. Effective incident response for agentic systems requires adapted processes that account for these properties.

---

## What Makes Agent Incidents Different

**Silent failure**: An agent that makes incorrect decisions but doesn't produce errors is harder to detect than a server that crashes. The triage agent that misclassified a patient (Module 3 lab) was not failing technically — it was processing requests and returning outputs. The failure was governance.

**Multi-system propagation**: In multi-agent systems, Agent A's incorrect output becomes Agent B's input. By the time the failure is detected, multiple systems may have acted on incorrect information. Containment requires identifying and stopping every agent in the propagation chain.

**Non-reversible harm**: Unlike a failed API request (which can be retried), many agent actions cannot be undone: emails sent, payments executed, records deleted, communications published.

**Non-reproducibility**: You cannot replay the incident exactly to understand it. The audit trail is the only record of what happened.

**Extended time to detection**: Because agents don't produce obvious errors, detection latency can be hours or days. The blast radius compounds with time.

---

## Incident Classification

Define incident severity levels before incidents occur:

| Severity | Description | Response SLA | Examples |
|---------|-------------|-------------|---------|
| **P1: Critical** | Active harm in production; potential regulatory breach; significant irreversible impact | Acknowledge in 15 min; contain within 1 hour | Agent exfiltrating data; runaway payment processing; decision system producing discriminatory outcomes |
| **P2: Major** | Potential for significant harm; governance controls bypassed; audit trail integrity compromised | Acknowledge in 1 hour; contain within 4 hours | Prompt injection detected; HITL controls not functioning; audit log gap discovered |
| **P3: Significant** | Governance degradation without immediate harm; control effectiveness declining | Acknowledge in 4 hours; resolve within 24 hours | Approval expiry rate elevated; policy drift detected; anomalous behavior within safe parameters |
| **P4: Minor** | Low-risk governance observation; improvement opportunity | Review at next governance board meeting | Threshold calibration needed; documentation outdated |

---

## The Incident Response Playbook

### Phase 1: Detection and Declaration (15 minutes for P1)

**Detection sources**:
- Automated monitoring alerts
- Human observation (unusual agent outputs, customer complaints)
- External reports (regulatory inquiry, third-party notification)
- Routine audit review

**Declaration process**:
```
1. Incident Commander declared (on-call engineering lead)
2. Incident channel created (#incident-[date]-[short-description])
3. Severity level assigned with justification
4. Initial notification sent to stakeholders per severity level
5. Incident record created with:
   - Incident ID, timestamp, declared severity
   - Initial description of observed behavior
   - Affected agents and systems identified
   - First responder identity
```

### Phase 2: Containment (immediate priority)

**Stop the harm first. Investigate second.**

```
Containment checklist (P1):
□ Identify affected agent(s) by name and run_id
□ Suspend affected agents immediately
  Command: agent-manager suspend --agent-id [id] --run-id [id] --reason incident-[ID]
□ Block new runs of affected agents
  Command: agent-manager block-new-runs --agent-id [id]
□ Revoke affected agent credentials
  Command: vault revoke-credentials --agent-id [id]
□ Identify downstream agents that received output from affected agents
□ Suspend downstream agents if affected
□ Capture state snapshot of all affected agents before any remediation
  (State snapshots enable investigation; do not modify until snapshot complete)
□ Verify containment: confirm no new agent runs are starting
```

**Containment does not require knowing the root cause.** Contain first; investigate after containment is confirmed.

### Phase 3: Investigation

With containment confirmed, use the audit trail to reconstruct what happened:

```
Investigation steps:
1. Retrieve execution trace for affected run(s) from audit log
   Query: GET /audit-log?run_id=[id]&order=asc

2. Build the incident timeline:
   - When did the anomalous behavior start?
   - What was the triggering input or event?
   - What actions did the agent take?
   - Which systems were affected?
   - What data was accessed or modified?

3. Identify the root cause:
   - Which governance layer failed? (Layer 1: Policy, 2: Guardrails, 3: Audit,
     4: HITL, 5: Incident Response)
   - Why did it fail? (Misconfiguration? Missing control? Control bypassed?)
   - Was this a known failure mode or novel?

4. Assess the full impact:
   - What data was accessed that shouldn't have been?
   - What actions were taken that shouldn't have been?
   - Are any of these actions irreversible?
   - Are affected individuals at risk?
   - Are there regulatory notification obligations?
```

### Phase 4: Remediation

```
Remediation steps:
1. Address immediate harm:
   - Reverse reversible actions (restore deleted data, cancel pending transactions)
   - Flag irreversible actions for legal review
   - Notify affected parties as required by policy/regulation

2. Apply root cause fix:
   - Do not restart agents until the root cause is addressed
   - Document the specific code/configuration change
   - Test the fix against the incident scenario

3. Restore operations:
   - Apply fix to agent configuration
   - Verify fix with governance team sign-off
   - Restart agent with enhanced monitoring
   - Monitor first 24 hours post-restoration closely

4. Notify stakeholders:
   - Internal: affected business owners, DPO, CISO, legal
   - External: affected individuals (if required by GDPR, HIPAA, or other regulation)
   - Regulators: within regulatory notification windows (GDPR: 72 hours for breaches)
```

### Phase 5: Post-Incident Review

The post-incident review (PIR) is the most valuable part of incident response for governance improvement. A blameless PIR focuses on system and process failures, not individual mistakes.

**PIR structure (1–2 hours; within 5 business days of incident resolution)**:

```markdown
# Post-Incident Review: [Incident ID]

## Incident Summary
[3-4 sentences: what happened, when, what was the impact]

## Timeline
[Chronological table of key events]

## Root Cause Analysis
### Immediate cause
[What directly caused the incident]

### Contributing factors
[What conditions allowed the immediate cause to have the impact it did]

### Why governance controls did not prevent or detect sooner
[Honest assessment of control failures — not "we need to try harder" but
"the guardrail did not cover this case because..."]

## What Went Well
[Controls, processes, or responses that functioned correctly]

## Action Items
| Action | Owner | Deadline |
|--------|-------|---------|
| [Specific fix] | [Name] | [Date] |

## Governance Layer Update
[Which governance layer failed and what specific control is being added or improved]
```

---

## Regulatory Notification Requirements

When agent incidents involve personal data breaches, notification obligations apply:

**GDPR Article 33**: Data breaches must be reported to the supervisory authority within 72 hours of becoming aware of the breach, unless the breach is unlikely to result in a risk to individuals.

**GDPR Article 34**: Data subjects must be notified without undue delay when a breach is likely to result in a high risk to their rights and freedoms.

**HIPAA Breach Notification**: Covered entities must notify affected individuals within 60 days of discovering a breach. Large breaches (>500 individuals in a state) require media notification.

**Engineering implication**: These notification windows are short. The audit trail and incident documentation must be sufficient to determine the scope and nature of a breach *quickly*. Organizations that cannot reconstruct what happened miss notification windows, compounding regulatory exposure.

---

## Summary

- Agent incidents differ from traditional software incidents: silent failures, multi-system propagation, non-reversible harm, non-reproducibility, extended detection latency
- Incident classification (P1–P4) defines response SLAs and stakeholder notification requirements before incidents occur
- The incident response phases: Detection and Declaration → Containment (stop harm first) → Investigation (use audit trail) → Remediation → Post-Incident Review
- Containment does not require knowing the root cause — contain first, investigate second
- Blameless PIR structure focuses on system and process failures; action items must be specific with named owners and deadlines
- GDPR 72-hour breach notification window makes rapid audit trail reconstruction a regulatory requirement, not just a best practice

---

*Next: [Lesson 5.5 — Governance Maturity Models](05-governance-maturity.md)*
