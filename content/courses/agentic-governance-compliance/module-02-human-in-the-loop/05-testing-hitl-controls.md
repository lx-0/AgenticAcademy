# Lesson 2.5: Testing HITL Controls

**Module**: 2 — Designing Human-in-the-Loop Controls
**Estimated reading time**: ~18 minutes
**Level**: Intermediate–Advanced

---

## Overview

HITL controls that are never tested are controls that may not work when needed. Approval gates can be misconfigured, escalation routing can point to stale contacts, and fallback behavior can silently produce incorrect results. This lesson covers how to test HITL controls systematically — before incidents, not after.

---

## Why HITL Testing Is Different From Standard Testing

Standard software testing validates that code produces the expected output for a given input. HITL testing validates that:

1. The right humans are notified at the right time with the right context
2. Human decisions are correctly recorded and applied to agent execution
3. Escalation chains activate in the right sequence
4. Fallback behavior is safe and explicit when human review is unavailable
5. Override mechanisms work correctly under real operational conditions

Testing (3) requires a test framework that simulates approval delays, approval decisions, and override commands — not just test inputs and expected outputs.

---

## Test Categories for HITL Controls

### Category 1: Trigger Verification Tests

Verify that approval gates activate when they should — and do *not* activate when they should not.

```python
import pytest
from unittest.mock import MagicMock, patch

class TestApprovalTriggers:

    def test_payment_below_threshold_auto_approved(self):
        """Payments under $1,000 should not trigger approval gates."""
        agent = PaymentAgent(approval_threshold=1000)
        mock_approvals = MagicMock()
        agent.approval_gate = mock_approvals

        result = agent.process_payment(amount=500, vendor="approved-vendor")

        mock_approvals.request_approval.assert_not_called()
        assert result.status == "executed"

    def test_payment_above_threshold_triggers_approval(self):
        """Payments over $1,000 must trigger an approval gate."""
        agent = PaymentAgent(approval_threshold=1000)
        mock_approvals = MagicMock()
        agent.approval_gate = mock_approvals

        # Simulate approval not yet received
        mock_approvals.request_approval.return_value = "pending-approval-id"

        result = agent.process_payment(amount=1500, vendor="approved-vendor")

        mock_approvals.request_approval.assert_called_once()
        assert result.status == "pending_approval"

    def test_irreversible_action_always_triggers_approval(self):
        """Irreversible actions (e.g., delete) always trigger approval."""
        agent = DataManagementAgent()
        mock_approvals = MagicMock()
        agent.approval_gate = mock_approvals

        # Even a small deletion should trigger approval
        result = agent.delete_records(record_ids=["rec-1", "rec-2"])

        mock_approvals.request_approval.assert_called_once()
        call_args = mock_approvals.request_approval.call_args[0][0]
        assert "irreversible" in call_args.consequences_approved.lower()

    def test_novel_situation_escalates_not_auto_approves(self):
        """First-ever occurrence of an action should escalate, not auto-approve."""
        agent = DocumentAgent()
        agent.action_history.clear()  # No history

        result = agent.process_document(doc_type="UNKNOWN_FORMAT", doc_id="doc-1")

        assert result.status in ("escalated", "pending_approval")
        assert result.escalation_reason == "novel_situation"
```

### Category 2: Approval Context Tests

Verify that approval requests contain complete and accurate information.

```python
class TestApprovalContext:

    def test_approval_request_contains_five_elements(self):
        """Every approval request must have all five required elements."""
        agent = PaymentAgent(approval_threshold=1000)
        captured_request = None

        def capture_request(request, **kwargs):
            nonlocal captured_request
            captured_request = request
            return "approval-id"

        agent.approval_gate.request_approval = capture_request
        agent.process_payment(amount=1500, vendor="FinCorp", invoice_id="INV-001")

        assert captured_request is not None
        assert captured_request.action_description  # Action in plain language
        assert captured_request.action_context       # Why the agent wants this
        assert captured_request.consequences_approved  # What happens if approved
        assert captured_request.consequences_rejected  # What happens if rejected
        assert captured_request.deadline              # When a decision is needed

    def test_approval_context_mentions_irreversibility(self):
        """Approval requests for irreversible actions must state they are irreversible."""
        agent = DataManagementAgent()
        captured_request = None

        def capture(req, **kwargs):
            nonlocal captured_request
            captured_request = req
            return "approval-id"

        agent.approval_gate.request_approval = capture
        agent.delete_records(["rec-1"])

        assert "irreversible" in captured_request.consequences_approved.lower()

    def test_approval_routing_goes_to_correct_reviewer(self):
        """Financial approvals must route to finance team, not default inbox."""
        notifications = MagicMock()
        agent = PaymentAgent(notification_service=notifications, approval_threshold=1000)
        agent.process_payment(amount=5000, vendor="FinCorp")

        notification_call = notifications.send.call_args
        recipient = notification_call.kwargs.get("recipient") or notification_call[1].get("recipient")
        assert recipient == "finance_team"
```

### Category 3: Escalation Chain Tests

Verify that escalation chains activate correctly and terminate safely.

```python
class TestEscalationChains:

    def test_timeout_triggers_escalation_to_next_level(self):
        """When tier-1 reviewer does not respond, escalate to tier-2."""
        with freeze_time("2026-03-01 10:00:00"):
            approval_id = agent.submit_approval_requiring_action(amount=25000)

        # Simulate 4-hour timeout without response
        with freeze_time("2026-03-01 14:01:00"):
            escalation_manager.process_timeouts()

        escalated_request = approval_store.get_escalated_for(approval_id)
        assert escalated_request is not None
        assert escalated_request.escalation_target == "finance_director"

    def test_chain_terminates_with_rejection_after_all_levels_timeout(self):
        """If all escalation levels time out, action must be rejected (not silently approved)."""
        approval_id = agent.submit_approval_requiring_action(amount=150000)

        # Fast-forward through all escalation timeouts
        simulate_all_escalation_timeouts(approval_id)

        final_status = approval_store.get(approval_id).status
        assert final_status == ApprovalStatus.EXPIRED
        # Critically: action must NOT have been executed
        assert not payment_ledger.contains_transaction(approval_id)

    def test_escalation_context_package_is_complete(self):
        """Escalated requests must include all context from the original request."""
        original_id = agent.submit_approval_requiring_action(amount=25000)
        simulate_tier1_timeout(original_id)
        escalated = approval_store.get_escalated_for(original_id)

        assert escalated.requested_action is not None
        assert escalated.agent_reasoning is not None
        assert escalated.prior_escalations == [original_id]
```

### Category 4: Override Tests

Verify that override mechanisms work and that their audit trails are complete.

```python
class TestOverrideMechanisms:

    def test_action_override_applies_modified_parameters(self):
        """When a reviewer modifies parameters, the modified version executes."""
        approval_id = agent.submit_payment(amount=15000, invoice="INV-001")

        # Reviewer approves with modified amount
        approval_gate.approve_with_modifications(
            approval_id=approval_id,
            reviewer_id="finance-lead",
            parameter_overrides={"amount": 14200, "invoice": "INV-001-rev"},
            notes="Corrected per revised invoice"
        )

        executed_payment = payment_ledger.get_by_approval(approval_id)
        assert executed_payment.amount == 14200  # Modified amount
        assert executed_payment.invoice == "INV-001-rev"  # Modified reference

    def test_action_override_logs_both_original_and_modified(self):
        """Override audit log must show original proposal AND modification."""
        approval_id = agent.submit_payment(amount=15000, invoice="INV-001")
        approval_gate.approve_with_modifications(
            approval_id=approval_id,
            reviewer_id="finance-lead",
            parameter_overrides={"amount": 14200}
        )

        log_entry = audit_log.get_by_approval(approval_id)
        assert log_entry.agent_proposed["amount"] == 15000
        assert log_entry.human_override["amount"] == 14200
        assert log_entry.executed_with["amount"] == 14200

    def test_constraint_override_expires_after_run(self):
        """Constraint overrides must not persist beyond the authorized run."""
        run_id = "test-run-001"
        constraint_override = ConstraintOverride(
            agent_id="test-agent",
            run_id=run_id,
            constraint_name="payment_auto_approve_limit",
            override_reason="Emergency payment processing",
            authorized_by="cfo",
            authorized_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )

        assert constraint_override.is_active()  # Active for this run

        # Simulate run completion — constraint should no longer apply
        override_manager.revoke_for_run(run_id)

        assert not constraint_override.is_active()
```

### Category 5: Fallback Behavior Tests

Verify that fallback paths are safe and explicitly communicate incompleteness.

```python
class TestFallbackBehavior:

    def test_partial_completion_is_explicit_not_silent(self):
        """If some items fail, the result must clearly indicate incompleteness."""
        invoice_ids = ["INV-001", "INV-002", "INV-003"]

        # Simulate INV-002 failing
        with patch_invoice_failure("INV-002"):
            result = agent.process_invoices(invoice_ids)

        assert not result.is_complete
        assert "INV-002" in result.failed
        assert result.requires_human_review is True
        # Critically: result must NOT claim all 3 were processed
        assert len(result.succeeded) == 2

    def test_retry_has_bounded_attempts(self):
        """Agent must not retry indefinitely on persistent failures."""
        with always_failing_api():
            result = agent.call_external_service()

        assert result.attempt_count <= MAX_RETRIES
        assert result.status in ("failed", "escalated")

    def test_unavailable_approval_system_fails_safe(self):
        """If approval system is down, high-risk actions must not auto-execute."""
        with approval_system_unavailable():
            result = agent.attempt_high_impact_action()

        # Must not execute without approval
        assert not action_was_executed()
        assert result.status == "blocked_approval_unavailable"
```

---

## Tabletop Testing: Simulating Real Operational Conditions

Beyond automated tests, HITL controls should be tested in quarterly tabletop exercises:

**Scenario 1: Approval system outage during high-volume processing**
- What happens to agents currently waiting for approvals?
- Do agents queue new requests or block new execution?
- Is there an offline approval fallback?

**Scenario 2: All tier-1 reviewers are unavailable simultaneously (vacation, illness)**
- Does the escalation chain still terminate at an available reviewer?
- Are there reviewer backup assignments documented and current?

**Scenario 3: An agent receives a prompt injection attempt during a high-stakes action**
- Does the input guardrail detect and block the injection?
- If the injection bypasses the guardrail, does the action guardrail catch it before execution?

**Scenario 4: A reviewer approves an action and realizes immediately it was wrong**
- Is there a "cancel within 60 seconds" mechanism for reversible actions?
- Can the reviewer trigger a suspension before execution completes?

---

## Testing Checklist

Before declaring HITL controls production-ready:

- [ ] Trigger verification: approval gates activate at all defined thresholds
- [ ] Trigger verification: actions below thresholds do NOT trigger approval gates
- [ ] Context completeness: all five elements present in every approval request
- [ ] Routing: approvals reach the correct reviewers, not default inboxes
- [ ] Escalation: each level in the chain activates on timeout
- [ ] Escalation termination: chain terminates with rejection (not silent approval) after all levels
- [ ] Override accuracy: modified parameters are applied, not the original
- [ ] Override audit: both original and modified parameters in the log
- [ ] Constraint override expiry: constraint overrides do not persist past the run
- [ ] Partial fallback: incomplete results are explicit, never silent
- [ ] Retry bounds: retries have a defined maximum
- [ ] Approval system unavailability: high-risk actions block when approval system is down

---

## Summary

- HITL testing validates human notification, decision recording, escalation chains, fallback behavior, and override mechanics — not just input/output correctness
- Five test categories: trigger verification, approval context, escalation chains, override mechanisms, fallback behavior
- Tabletop exercises (quarterly) simulate real operational failure scenarios that automated tests cannot cover
- The HITL testing checklist provides a pre-production gate for HITL control readiness

---

*Proceed to the [Module 2 Lab](lab.md) to apply these concepts.*
