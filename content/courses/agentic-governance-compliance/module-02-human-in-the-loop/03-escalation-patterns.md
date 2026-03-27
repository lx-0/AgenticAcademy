# Lesson 2.3: Escalation Patterns

**Module**: 2 — Designing Human-in-the-Loop Controls
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Overview

Escalation is the mechanism by which an agent or approval system surfaces a decision to a higher level of authority when the current level cannot — or should not — resolve it unilaterally. Good escalation design is specific, fast, and information-rich. Poor escalation design creates bottlenecks, loses context, and produces decisions made by the wrong people.

---

## What Should Trigger Escalation

Escalation should be triggered by specific, defined conditions — not by vague signals like "the agent is unsure." Define escalation triggers precisely for each agent:

### Trigger Type 1: Threshold Breach

A quantitative limit is exceeded.

```python
ESCALATION_TRIGGERS = {
    "payment_amount": {
        "auto_approve_limit": 1_000,
        "standard_approval_limit": 10_000,
        "escalate_to_director": 50_000,
        "escalate_to_cfo": 100_000
    },
    "data_export_records": {
        "auto_approve_limit": 10,
        "standard_approval_limit": 100,
        "escalate_to_data_officer": 1_000
    }
}
```

### Trigger Type 2: Policy Ambiguity

The agent's decision requires interpreting a policy in a way that the policy does not clearly specify.

```python
def check_policy_ambiguity(action: AgentAction, policy_result: PolicyCheckResult) -> bool:
    # Ambiguity indicators:
    # - Policy check returned multiple conflicting rules
    # - Confidence score below threshold
    # - Exception clause in policy applies but outcome is unclear
    return (
        len(policy_result.conflicting_rules) > 0 or
        policy_result.confidence < 0.85 or
        policy_result.exception_applies and not policy_result.exception_outcome_clear
    )
```

### Trigger Type 3: Irreversibility

The action cannot be undone if wrong.

```python
IRREVERSIBLE_ACTIONS = {
    "delete_records",
    "send_external_communication",
    "publish_content",
    "revoke_access",
    "financial_transfer",
    "legal_document_submission"
}

def requires_escalation_for_irreversibility(action: AgentAction) -> bool:
    return action.action_type in IRREVERSIBLE_ACTIONS
```

### Trigger Type 4: Novel Situation

The agent encounters a situation it has no precedent for.

```python
def is_novel_situation(action: AgentAction, history: AgentHistory) -> bool:
    similar_precedents = history.find_similar_actions(
        action_type=action.action_type,
        context_similarity_threshold=0.8
    )
    return len(similar_precedents) == 0
```

### Trigger Type 5: Conflict of Interest

The action involves parties or contexts where bias or conflict is possible.

```python
def check_conflict_of_interest(action: AgentAction, context: ExecutionContext) -> bool:
    # Example: agent should not process transactions that benefit the
    # requestor who authorized the agent's deployment
    return (
        action.beneficiary_id in context.authorizing_party_affiliates or
        action.vendor_id in context.restricted_vendor_list
    )
```

---

## Escalation Routing Design

Routing escalations to the right person requires a routing table that maps trigger conditions to recipients:

```python
ESCALATION_ROUTING = {
    # Format: trigger_type -> {condition: recipient_role}
    "threshold_breach": {
        "payment.tier_1": "finance_team",
        "payment.tier_2": "finance_director",
        "payment.tier_3": "cfo",
        "data_export.tier_1": "data_protection_team",
        "data_export.tier_2": "dpo"
    },
    "policy_ambiguity": {
        "hr_policy": "hr_business_partner",
        "legal_policy": "legal_team",
        "financial_policy": "finance_compliance",
        "security_policy": "security_team"
    },
    "irreversible_action": {
        "data_deletion": "data_owner",
        "financial_transfer": "finance_approver",
        "communication": "communications_team"
    },
    "novel_situation": {
        "default": "agent_system_owner"
    }
}
```

Routing quality matters enormously. A common failure: escalations go to a "general inbox" where nobody has ownership. Define named individuals (or roles with named individuals in those roles) for every escalation path.

---

## The Escalation Context Package

When an agent escalates, it must pass a context package that gives the recipient everything they need to make a decision. A minimal escalation context package:

```json
{
  "escalation_id": "esc-uuid",
  "triggered_by": "threshold_breach",
  "trigger_detail": "payment.tier_2 — $25,000 exceeds $10,000 limit",
  "agent_id": "payment-processing-agent",
  "run_id": "run-uuid",
  "requested_action": {
    "type": "financial_transfer",
    "description": "Transfer $25,000 to vendor FinCorp Ltd for Invoice INV-9842",
    "amount": 25000,
    "currency": "USD",
    "source_account": "operating-account-001",
    "destination": "FinCorp Ltd — Bank account on file",
    "invoice_reference": "INV-9842"
  },
  "agent_reasoning": "Invoice INV-9842 verified: amount matches PO-8711, vendor is approved, payment window open. Amount exceeds tier-1 auto-approve limit ($10,000). Escalating per payment policy.",
  "supporting_documents": ["INV-9842.pdf", "PO-8711.pdf"],
  "policy_references": ["Payment Policy v4.1, Section 3.2"],
  "deadline": "2026-03-17T17:00:00Z",
  "consequences_if_approved": "Transfer executes immediately. Irreversible.",
  "consequences_if_rejected": "Invoice held in pending queue. Agent will alert on overdue date (2026-04-15).",
  "prior_escalations": []
}
```

Note: the agent's reasoning is included verbatim. This allows the reviewer to see *how* the agent arrived at the action — not just what the action is. If the reasoning is flawed, the reviewer can identify it before approving.

---

## Multi-Level Escalation Chains

For high-stakes decisions, a single escalation may not be sufficient. Design multi-level escalation chains that escalate further if initial reviewers do not respond:

```
Level 1: Primary reviewer (Finance Team)
  ↓ (if no response in 4 hours)
Level 2: Finance Director
  ↓ (if no response in 2 hours)
Level 3: CFO + notification to Agent System Owner
  ↓ (if no response in 1 hour)
Level 4: Automatic rejection + incident log entry
```

The terminal action (Level 4) is critical. Every escalation chain must have a defined terminal behavior — usually automatic rejection — so that unanswered escalations do not silently stall.

```python
def escalation_chain_for_payment(amount: float) -> list[EscalationLevel]:
    return [
        EscalationLevel(
            recipient="finance_team",
            timeout_hours=4,
            on_timeout="escalate"
        ),
        EscalationLevel(
            recipient="finance_director",
            timeout_hours=2,
            on_timeout="escalate"
        ),
        EscalationLevel(
            recipient="cfo",
            timeout_hours=1,
            on_timeout="reject_and_alert"
        )
    ]
```

---

## Escalation Anti-Patterns

**The Black Hole**: Escalation requests go to a shared inbox with no owner. Nobody responds. The agent times out and the action is either automatically approved or rejected without any human input.

**The Forwarding Chain**: Reviewer A sees a request, doesn't feel qualified, forwards to reviewer B without notifying the agent. The agent's deadline expires. The action times out while the forwarding chain continues.

**The Verbal Override**: Reviewer approves the action verbally ("go ahead") but never records the approval. The action executes without an approval record. This is invisible to compliance and creates a gap in the audit trail.

**The Context Strip**: Escalation system sends only "Approval needed for payment" with a link. The reviewer clicks the link and sees a technical payload they cannot interpret. The reviewer approves without understanding what they're approving.

**The Urgency Collapse**: Everything is marked "critical." Reviewers learn to ignore urgency signals. Genuinely critical escalations sit in a queue with non-critical ones.

---

## Designing for Humans, Not Machines

Escalation workflows are ultimately human systems. Design for how people actually behave:

- **Mobile-first notifications**: Many reviewers will see escalations on their phones. The notification must be readable and actionable on a small screen.

- **Single-click decisions for clear cases**: If the action is clearly safe, the approval should be one tap — not a five-step form.

- **Context first, action second**: Show the reviewer *why* before asking them to decide *what*.

- **Rejection requires notes**: Approved actions need a record; rejected actions need an explanation the agent can use to understand what went wrong.

- **Snooze and delegate**: Give reviewers the option to snooze an item (temporarily acknowledge it without deciding) and delegate to another reviewer. People need to manage their workload.

---

## Summary

- Escalation triggers should be specific: threshold breach, policy ambiguity, irreversibility, novel situation, conflict of interest
- Routing maps trigger conditions to named individuals or roles — not shared inboxes
- The escalation context package includes: action description, agent reasoning, supporting documents, policy references, deadline, and consequences
- Multi-level escalation chains must have a terminal behavior (typically automatic rejection) for unanswered requests
- Anti-patterns that undermine escalation: black holes, forwarding chains, verbal overrides, context stripping, urgency collapse
- Design escalation UIs for humans: mobile-first, single-click decisions, context before action, rejection notes required

---

*Next: [Lesson 2.4 — Override Mechanisms and Fallback Behavior](04-override-mechanisms.md)*
