# Lesson 2.2: Approval Gates and Escalation Patterns

**Module**: 2 — Designing Human-in-the-Loop Controls
**Estimated reading time**: ~25 minutes
**Level**: Intermediate–Advanced

---

## Overview

An approval gate is a mechanism that pauses agent execution until a human approves or rejects a proposed action. Designing approval gates well requires thinking about both the technical implementation and the human experience: the right person sees the right information at the right time with enough context to make a meaningful decision.

This lesson covers approval gate design, escalation patterns, and the common implementation mistakes that undermine HITL controls.

---

## The Anatomy of an Approval Request

A well-designed approval request contains five elements:

### 1. What the agent wants to do (Action)

Plain language description of the proposed action. Not technical implementation details — what the action *means* in business terms.

```
BAD: "Calling POST /api/v2/transactions with payload {amount: 15000, account: 'ACC-4892', ...}"

GOOD: "Transfer $15,000 from Operating Account to Vendor Account for FinCorp LLC
       (Invoice INV-2024-00892, dated 2026-03-15)"
```

### 2. Why the agent is taking this action (Context)

The reasoning that led to this proposed action. This is what enables the reviewer to evaluate whether the agent's logic is sound.

```
Context: "Invoice INV-2024-00892 has been verified:
  - Vendor FinCorp LLC is on the approved vendor list (added 2024-11-01)
  - Amount matches PO-4892 ($15,000)
  - Invoice date is within 30-day payment window
  - Payment threshold ($15,000) exceeds auto-approve limit ($5,000)
  - Triggering approval request per payment policy Section 3.4"
```

### 3. What happens if approved (Consequences)

What the action will produce. For irreversible actions, explicitly state they are irreversible.

```
If approved: $15,000 will be transferred. This action is IRREVERSIBLE.
The transfer will settle within 1 business day.
```

### 4. What happens if rejected (Fallback)

What the agent will do if the reviewer rejects the action. This prevents the agent from being stuck if rejections are not handled.

```
If rejected: Payment will be placed in 'Pending Human Action' queue.
The agent will notify you when the invoice becomes overdue (2026-04-15).
```

### 5. Deadline (Urgency)

When a decision is needed. Without this, reviewers cannot prioritize approval requests.

```
Action needed by: 2026-03-17 17:00 UTC (payment terms expire)
```

---

## Approval Gate Implementation

Here is a production-ready approval gate implementation pattern:

```python
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Optional
import uuid

class ApprovalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    ESCALATED = "escalated"

@dataclass
class ApprovalRequest:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    run_id: str = ""
    action_type: str = ""
    action_description: str = ""  # Plain language
    action_context: str = ""      # Why the agent wants to do this
    consequences_approved: str = ""
    consequences_rejected: str = ""
    deadline: Optional[datetime] = None
    requested_at: datetime = field(default_factory=datetime.utcnow)
    status: ApprovalStatus = ApprovalStatus.PENDING
    reviewer_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewer_notes: Optional[str] = None
    escalation_target: Optional[str] = None
    priority: str = "normal"  # normal | high | critical
    metadata: dict = field(default_factory=dict)

    def is_expired(self) -> bool:
        if self.deadline is None:
            return False
        return datetime.utcnow() > self.deadline

    def time_remaining(self) -> Optional[timedelta]:
        if self.deadline is None:
            return None
        remaining = self.deadline - datetime.utcnow()
        return max(remaining, timedelta(0))


class ApprovalGate:
    """
    Pauses agent execution until a human approves or rejects a proposed action.
    """

    def __init__(self, approval_store, notification_service):
        self.store = approval_store
        self.notifications = notification_service

    def request_approval(
        self,
        request: ApprovalRequest,
        on_approved: Callable,
        on_rejected: Callable,
        on_expired: Optional[Callable] = None
    ) -> str:
        """
        Submit an approval request and register callbacks.
        Returns the approval request ID.
        """
        # Store the request
        self.store.save(request)

        # Notify appropriate reviewers
        reviewers = self._determine_reviewers(request)
        for reviewer in reviewers:
            self.notifications.send(
                recipient=reviewer,
                subject=f"[{request.priority.upper()}] Approval required: {request.action_type}",
                body=self._format_approval_notification(request),
                action_url=f"/approvals/{request.id}"
            )

        # Register callbacks
        self.store.register_callbacks(
            request_id=request.id,
            on_approved=on_approved,
            on_rejected=on_rejected,
            on_expired=on_expired or self._default_expiry_handler
        )

        # Log the approval gate activation
        audit_log.record(
            event_type="approval_gate_activated",
            agent_id=request.agent_id,
            run_id=request.run_id,
            approval_request_id=request.id,
            action_type=request.action_type
        )

        return request.id

    def _determine_reviewers(self, request: ApprovalRequest) -> list[str]:
        """
        Determine who should review based on action type and urgency.
        Override this to implement your organization's routing logic.
        """
        reviewers = APPROVAL_ROUTING_TABLE.get(request.action_type, DEFAULT_REVIEWERS)
        if request.priority == "critical":
            reviewers = reviewers + CRITICAL_ESCALATION_CONTACTS
        return reviewers

    def _format_approval_notification(self, request: ApprovalRequest) -> str:
        deadline_str = (
            f"Deadline: {request.deadline.strftime('%Y-%m-%d %H:%M UTC')}"
            if request.deadline else "No deadline specified"
        )
        return f"""
Agent: {request.agent_id}
Action: {request.action_description}

Context:
{request.action_context}

If approved:
{request.consequences_approved}

If rejected:
{request.consequences_rejected}

{deadline_str}

Review at: /approvals/{request.id}
"""
```

---

## Escalation Patterns

Escalation is what happens when an approval gate cannot be resolved at the first level of review. Three escalation patterns:

### Pattern 1: Timeout Escalation

If no reviewer responds within the deadline, escalate to the next level.

```python
def handle_approval_timeout(request: ApprovalRequest):
    if request.escalation_target:
        # Escalate to next level
        escalated_request = ApprovalRequest(
            **request.__dict__,
            id=str(uuid.uuid4()),  # New ID for audit trail
            escalation_target=None,
            priority="high",
            action_description=(
                f"[ESCALATED - no response within deadline]\n"
                f"{request.action_description}"
            )
        )
        approval_gate.request_approval(escalated_request, ...)
    else:
        # No escalation target — reject and log
        request.status = ApprovalStatus.EXPIRED
        audit_log.record(
            event_type="approval_expired_no_escalation",
            approval_request_id=request.id,
            action="rejected_by_timeout"
        )
```

### Pattern 2: Expertise-Based Escalation

Route to a specialist when the first reviewer lacks domain knowledge.

```python
ESCALATION_ROUTING = {
    "financial_transaction": {
        "tier_1": "finance_team",
        "tier_2": "finance_director",
        "tier_3": "cfo"
    },
    "legal_document": {
        "tier_1": "legal_team",
        "tier_2": "general_counsel"
    },
    "production_deployment": {
        "tier_1": "engineering_lead",
        "tier_2": "cto"
    }
}
```

### Pattern 3: Automatic Escalation on Uncertainty

The agent escalates directly to a higher tier when its confidence is below a threshold, bypassing the standard reviewer.

```python
def decide_approval_path(action: AgentAction, confidence: float) -> ApprovalConfig:
    if confidence < 0.5:
        # Low confidence — escalate to specialist directly
        return ApprovalConfig(
            tier="specialist",
            routing_tag="low_confidence_decision",
            require_justification=True
        )
    elif confidence < 0.8:
        # Moderate confidence — standard approval
        return ApprovalConfig(
            tier="standard",
            routing_tag="normal"
        )
    else:
        # High confidence — auto-approve if action is low-impact
        if action.impact_level == "low":
            return ApprovalConfig(tier="auto")
        else:
            return ApprovalConfig(tier="standard")
```

---

## The Approval UX Problem

Technical implementation is only half the challenge. Approval workflows fail when the human experience is poor:

**Approval fatigue**: Too many requests → reviewers approve without reading. Mitigation: calibrate thresholds, batch low-urgency items.

**Context starvation**: Reviewer sees "Approve transfer?" with no context. Mitigation: every approval notification must include the five elements (action, context, consequences, fallback, deadline).

**Unclear rejection options**: Reviewer can only approve or reject, but the right answer is "approve with modification" or "escalate." Mitigation: build multi-option responses into the approval UI.

**No accountability**: Multiple people receive the approval request; nobody responds because everyone assumes someone else will. Mitigation: assign a primary reviewer with named backups, not distribution lists.

**Decision without audit trail**: The reviewer approves verbally or via email rather than through the approval system. Mitigation: make the approval system the path of least resistance; ensure the approval record is required before the action executes.

---

## Approval Records and Audit Integration

Every approval decision must be recorded and linked to the action it authorized:

```json
{
  "approval_id": "apr-uuid-immutable",
  "request_id": "approval-request-id",
  "action_id": "agent-action-id",
  "agent_id": "which-agent-requested",
  "run_id": "execution-context",
  "reviewer_id": "user-who-reviewed",
  "decision": "approved",
  "reviewed_at": "2026-03-15T14:23:07Z",
  "notes": "Verified against PO-4892, amounts match, vendor is on approved list",
  "action_executed_at": "2026-03-15T14:23:09Z"
}
```

This record must be linked bidirectionally:
- The action log entry references the approval record ID
- The approval record references the action execution record

Without this bidirectional link, it is impossible to verify that approved actions were executed correctly and unapproved actions were not executed at all.

---

## Summary

- A complete approval request contains: action (plain language), context (reasoning), consequences (approved and rejected), and deadline
- The approval gate implementation pauses execution, notifies reviewers, registers callbacks for approved/rejected/expired outcomes, and logs all gate activations
- Three escalation patterns: timeout (escalate if no response), expertise-based (route to domain specialist), uncertainty-based (skip tiers when confidence is low)
- Approval UX failures undermine HITL controls: approval fatigue, context starvation, unclear rejection options, diffused accountability, and decisions made outside the system
- Approval records must be bidirectionally linked to action logs for complete audit coverage

---

*Next: [Lesson 2.3 — Escalation Patterns](03-escalation-patterns.md)*
