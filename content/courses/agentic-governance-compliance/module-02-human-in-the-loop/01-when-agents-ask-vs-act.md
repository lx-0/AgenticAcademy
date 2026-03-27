# Lesson 2.1: When Agents Should Ask vs. Act

**Module**: 2 — Designing Human-in-the-Loop Controls
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Learning Objectives

By the end of this module, you will be able to:

1. Apply a principled framework to determine when agents should request human approval vs. act autonomously
2. Design approval gate schemas for high-stakes agent actions
3. Implement escalation patterns that surface the right information to the right person at the right time
4. Build override mechanisms that are usable, auditable, and abuse-resistant
5. Test HITL controls to verify they work under real operational conditions

---

## Overview

The question of when an agent should act autonomously versus request human input is one of the most consequential design decisions in agentic system engineering. Get it wrong in one direction and the agent is so interrupt-heavy it provides no value. Get it wrong in the other direction and the agent takes consequential actions without appropriate oversight.

This lesson gives you a principled framework for drawing that line.

---

## The Two Failure Modes

**Under-autonomy**: The agent asks for approval so frequently that humans become rubber-stampers. Nobody actually reads what they're approving. The HITL control exists on paper but provides no real oversight.

**Over-autonomy**: The agent acts on insufficient information or in situations it was not designed to handle. Consequential mistakes happen without anyone in a position to prevent them.

Both failure modes undermine the purpose of HITL controls. The design goal is appropriate autonomy: agents act independently on decisions within their design envelope, and request human input for decisions outside it.

---

## The Action Classification Matrix

Before deciding when to require HITL, classify every action the agent can take across two dimensions:

**Impact**: How harmful can this action be if the agent gets it wrong?
- Low: Reversible, affects only the current task, no external side effects
- Medium: Partially reversible, affects downstream systems, limited external exposure
- High: Irreversible or difficult to reverse, affects multiple systems or people, external exposure

**Uncertainty**: How confident is the agent likely to be when making this decision?
- Low: Clear policy exists, action fits a well-defined pattern
- High: Ambiguous inputs, edge cases, decisions requiring context the agent may not have

```
                    UNCERTAINTY
                 Low            High
             ┌───────────────┬───────────────┐
         Low │  AUTO-APPROVE │  AUTO + LOG   │
             │               │               │
IMPACT       ├───────────────┼───────────────┤
             │               │  ESCALATE TO  │
        High │   REQUIRE     │   SPECIALIST  │
             │   APPROVAL    │               │
             └───────────────┴───────────────┘
```

**Quadrant definitions**:

- **Auto-approve** (Low impact, Low uncertainty): The agent can act without approval. Decisions in this quadrant should be monitored but not gated.

- **Auto + log** (Low impact, High uncertainty): The agent can act but the action should be logged with extra detail and reviewed at the next oversight cycle. The uncertainty may indicate a class of decisions that needs policy clarification.

- **Require approval** (High impact, Low uncertainty): The agent knows what to do but the stakes are high enough that a human should confirm. The approval workflow can be straightforward because the decision is clear.

- **Escalate to specialist** (High impact, High uncertainty): The agent should escalate to a human with domain expertise. This is the highest-risk quadrant. Do not automate here.

---

## Applying the Matrix: Common Agent Actions

Here is how common agent actions map to the matrix:

| Action | Impact | Uncertainty | Treatment |
|--------|--------|-------------|-----------|
| Read a file | Low | Low | Auto-approve |
| Run a read-only query | Low | Low | Auto-approve |
| Write to a log file | Low | Low | Auto-approve |
| Call a read-only external API | Low | Low | Auto-approve |
| Create a draft document | Low | Medium | Auto + log |
| Send an internal notification | Medium | Low | Auto + log |
| Classify a document (label only) | Low | Medium | Auto + log |
| Update a database record | Medium | Low | Require approval |
| Send an external email | High | Low | Require approval |
| Delete data | High | Low | Require approval |
| Execute a financial transaction | High | Low | Require approval |
| Make a decision with ambiguous policy guidance | Medium | High | Escalate |
| Take action on behalf of a user with conflicting signals | High | High | Escalate |
| Handle an exception or error condition | Medium | High | Escalate |

---

## The "Within Design Envelope" Test

A more intuitive way to apply the matrix: ask whether the action is *within the agent's design envelope*.

The design envelope is the set of situations the agent was explicitly designed and tested for. Signs that an action is *outside* the design envelope:

- The agent's reasoning references uncertainty ("I'm not sure if this falls under...")
- The input is structurally different from training examples (unusual format, unexpected field)
- The policy reference for this decision is ambiguous or missing
- The action has never been taken in production before (first occurrence)
- The action involves a combination of factors not seen in development or testing

When an action is outside the design envelope, the probability of error increases. The agent should escalate, not guess.

**Implementation pattern**: Agents should be able to express uncertainty. A well-designed agent that encounters an out-of-envelope situation should produce a structured escalation request rather than guessing:

```json
{
  "action": "escalate",
  "reason": "outside_design_envelope",
  "decision_point": "invoice_category_classification",
  "input_description": "Invoice from vendor with both software and hardware line items; policy only specifies one-category invoices",
  "policy_reference": "Expense Policy v3.2, Section 4.1",
  "recommended_escalation_target": "finance_team",
  "context": {
    "invoice_id": "INV-29847",
    "vendor": "TechCo Ltd",
    "amount": 4200.00,
    "line_items": ["software_license: 2800.00", "hardware: 1400.00"]
  }
}
```

---

## The Approval Threshold Design

For actions in the "require approval" quadrant, you need to design the threshold at which approval is triggered. Common threshold types:

**Value-based thresholds**: Approval required above a dollar amount, record count, or other quantitative measure.
```python
APPROVAL_THRESHOLDS = {
    "financial_transaction": {"amount_usd": 1000},
    "bulk_data_deletion": {"record_count": 100},
    "mass_communication": {"recipient_count": 10}
}
```

**Action-type thresholds**: Specific action types always require approval regardless of parameters.
```python
ALWAYS_REQUIRE_APPROVAL = [
    "delete_production_database",
    "revoke_user_access",
    "send_external_communication",
    "deploy_to_production"
]
```

**Combination thresholds**: Approval required when multiple conditions are met simultaneously.
```python
def requires_approval(action: AgentAction) -> bool:
    # High dollar value alone doesn't require approval (routine large transactions)
    # Unusual time doesn't alone (legitimate off-hours operations)
    # But high dollar + unusual time = require approval
    if (action.amount > 5000 and
        action.timestamp.hour not in BUSINESS_HOURS and
        action.vendor not in APPROVED_VENDORS):
        return True
    return False
```

**Frequency-based thresholds**: Approval required if the action occurs more times than expected in a time window.
```python
def rate_limit_approval_check(agent_id: str, action_type: str) -> bool:
    count = get_action_count(agent_id, action_type, window_hours=1)
    threshold = ACTION_RATE_LIMITS.get(action_type, DEFAULT_RATE_LIMIT)
    return count > threshold
```

---

## The False Positive Problem

Every HITL threshold generates false positives — legitimate actions that trigger approval requests unnecessarily. Too many false positives:
- Train reviewers to approve without reading (approval fatigue)
- Slow down legitimate operations
- Create pressure to raise thresholds, reducing oversight

Calibrate thresholds against production data:

```
Initial threshold: financial_transaction > $500 requires approval
After 30 days:
  - 847 approval requests
  - 843 approved without change (99.5%)
  - 4 modified before approval
  - 0 rejected

Analysis: $500 threshold is too low. 99.5% approval rate with no rejections
suggests reviewers are approving by default, not reviewing. Raise threshold
to $2,000 and add velocity check (>5 transactions in 1 hour).

After adjustment:
  - 94 approval requests/month (89% reduction)
  - 87 approved without change (93%)
  - 5 modified before approval
  - 2 rejected (first rejections in production)
```

This calibration process is ongoing. Thresholds should be reviewed quarterly against production data.

---

## Summary

- The two failure modes of HITL are under-autonomy (rubber-stamp approvals) and over-autonomy (consequential mistakes without oversight)
- The action classification matrix plots Impact vs. Uncertainty to determine appropriate treatment: auto-approve, auto+log, require approval, or escalate
- The "within design envelope" test identifies when agents should escalate: unusual inputs, ambiguous policy, first-occurrence actions
- Well-designed agents express uncertainty as structured escalation requests rather than guessing
- Threshold design types: value-based, action-type, combination, frequency-based
- Threshold calibration is ongoing: excessive false positives train reviewers to approve without reviewing

---

*Next: [Lesson 2.2 — Approval Gates and Escalation Patterns](02-approval-gates.md)*
