# Lesson 5.2: Policy-as-Code

**Module**: 5 — Building a Governance Operating Model
**Estimated reading time**: ~22 minutes
**Level**: Intermediate–Advanced

---

## Overview

Policy-as-code translates written governance policies into machine-executable rules. Instead of a policy document that engineers must interpret and implement correctly, policy-as-code produces rules that are version-controlled, automatically enforced, and testable. This lesson covers how to design and implement policy-as-code for agentic systems.

---

## Why Policy-as-Code

Written policies have three fundamental weaknesses:

**Interpretation gap**: "Agents must not access unauthorized data" is a policy. An engineer interprets "unauthorized" to mean "data outside the agent's RBAC role." A DPO interprets it to mean "data outside the current task's scope." Both are reasonable interpretations. The implementation reflects the engineer's interpretation, which may not match the governance intent.

**Drift**: Policies are written once and reviewed annually. Agent configurations change weekly. The implementation drifts from the policy with each change. The drift is invisible until an incident reveals it.

**Untestable**: A written policy cannot be run against a test case. You cannot write an automated test that verifies "this agent is compliant with the data access policy." With policy-as-code, you can.

Policy-as-code solves all three: rules are explicit (no interpretation gap), version-controlled (drift is tracked), and machine-executable (testable).

---

## Policy-as-Code Levels

### Level 1: Configuration-as-Policy

The simplest form: governance parameters are expressed as configuration rather than hardcoded values.

```yaml
# policies/payment-agent.yaml
agent_id: payment-processing-agent
version: "2.1"
effective_from: "2026-01-01"
approved_by: "governance-board-2026-01-15"

access_policy:
  permitted_tools:
    - get_invoice
    - get_vendor
    - execute_payment
    - send_confirmation
  prohibited_tools:
    - delete_invoice
    - modify_vendor_bank_account  # High-risk capability never permitted

data_scope:
  invoice_access: "assigned_to_current_run_only"
  vendor_access: "approved_vendor_list_only"
  financial_records: "read_only"

thresholds:
  auto_approve_max_usd: 5000
  requires_manager_approval_usd: 25000
  requires_cfo_approval_usd: 100000
  max_payments_per_run: 50
  max_payments_per_hour: 10

audit:
  retention_days: 2555  # 7 years (SOX requirement)
  pii_fields_in_logs: "hashed"
  log_storage: "append_only_audit_bucket"
```

This configuration file is version-controlled in Git, reviewed by the governance board, and loaded by the agent framework at startup. Changing an approval threshold requires a pull request that goes through governance review — not an ad hoc configuration change.

### Level 2: Rule Engine Policies

For more complex governance rules, a rule engine evaluates policies against runtime data:

```python
from dataclasses import dataclass
from typing import Any

@dataclass
class PolicyRule:
    rule_id: str
    description: str
    applies_to: str       # agent_id or "*" for all agents
    condition: str        # Python expression evaluated against context
    action: str           # "block" | "require_approval" | "flag_for_review" | "log"
    severity: str         # "critical" | "high" | "medium" | "low"
    policy_reference: str # Link to the written policy this implements

# Payment policy rules
PAYMENT_POLICY_RULES = [
    PolicyRule(
        rule_id="PAY-001",
        description="Payments above auto-approve limit require approval",
        applies_to="payment-processing-agent",
        condition="action.amount > policy.auto_approve_max_usd",
        action="require_approval",
        severity="high",
        policy_reference="Payment Policy v5.2, Section 3.4"
    ),
    PolicyRule(
        rule_id="PAY-002",
        description="Payments to unapproved vendors are prohibited",
        applies_to="payment-processing-agent",
        condition="action.vendor_id not in context.approved_vendor_list",
        action="block",
        severity="critical",
        policy_reference="Vendor Management Policy v2.1, Section 2.1"
    ),
    PolicyRule(
        rule_id="PAY-003",
        description="More than 10 payments per hour triggers velocity alert",
        applies_to="payment-processing-agent",
        condition="context.payments_this_hour > 10",
        action="flag_for_review",
        severity="medium",
        policy_reference="Fraud Prevention Policy v3.0, Section 4.2"
    ),
    PolicyRule(
        rule_id="DATA-001",
        description="Accessing invoices outside current task scope is prohibited",
        applies_to="*",
        condition="action.invoice_id not in context.task_scope_ids",
        action="block",
        severity="critical",
        policy_reference="Data Access Policy v1.8, Section 3.1"
    ),
]


class PolicyEngine:
    def __init__(self, rules: list[PolicyRule]):
        self.rules = rules

    def evaluate(
        self,
        agent_id: str,
        action: dict,
        context: dict,
        policy: dict
    ) -> list[PolicyEvaluation]:
        """
        Evaluate all applicable rules for this action.
        Returns list of evaluation results, one per triggered rule.
        """
        results = []
        for rule in self.rules:
            if rule.applies_to != "*" and rule.applies_to != agent_id:
                continue

            try:
                triggered = eval(
                    rule.condition,
                    {"action": action, "context": context, "policy": policy}
                )
            except Exception as e:
                # Rule evaluation error is itself a finding
                triggered = False
                audit_log.record(event_type="policy_rule_error", rule_id=rule.rule_id, error=str(e))

            if triggered:
                results.append(PolicyEvaluation(
                    rule_id=rule.rule_id,
                    rule_description=rule.description,
                    triggered=True,
                    action=rule.action,
                    severity=rule.severity,
                    policy_reference=rule.policy_reference
                ))

        return results
```

### Level 3: Open Policy Agent (OPA)

For organizations with multiple agent systems, Open Policy Agent (OPA) provides a centralized policy evaluation service. Agents query OPA with their proposed actions; OPA evaluates against centrally maintained policies and returns allow/deny decisions.

```python
# Agent queries OPA before executing an action
import httpx

async def check_policy(
    action: dict,
    context: dict
) -> PolicyDecision:
    response = await httpx.post(
        "http://opa-service:8181/v1/data/agents/payment/allow",
        json={
            "input": {
                "action": action,
                "context": context,
                "agent_id": AGENT_ID
            }
        }
    )
    result = response.json()
    return PolicyDecision(
        allowed=result["result"]["allow"],
        reason=result["result"].get("reason"),
        required_action=result["result"].get("required_action")
    )
```

OPA advantages:
- Central policy management — update policies without redeploying agents
- Consistent evaluation across all agents in the organization
- Policy testing framework built-in (OPA's `rego` language supports unit tests)
- Audit trail of every policy evaluation

---

## Policy Testing

Policy-as-code enables automated testing of governance rules:

```python
# Test suite for payment policies
class PaymentPolicyTests:

    def test_payment_above_limit_requires_approval(self):
        result = policy_engine.evaluate(
            agent_id="payment-processing-agent",
            action={"type": "execute_payment", "amount": 6000, "vendor_id": "approved-vendor"},
            context={"approved_vendor_list": ["approved-vendor"], "task_scope_ids": []},
            policy={"auto_approve_max_usd": 5000}
        )
        assert any(r.rule_id == "PAY-001" and r.action == "require_approval" for r in result)

    def test_payment_to_unapproved_vendor_blocked(self):
        result = policy_engine.evaluate(
            agent_id="payment-processing-agent",
            action={"type": "execute_payment", "amount": 100, "vendor_id": "unknown-vendor"},
            context={"approved_vendor_list": ["approved-vendor"]},
            policy={"auto_approve_max_usd": 5000}
        )
        assert any(r.rule_id == "PAY-002" and r.action == "block" for r in result)

    def test_payment_below_limit_to_approved_vendor_passes(self):
        result = policy_engine.evaluate(
            agent_id="payment-processing-agent",
            action={"type": "execute_payment", "amount": 500, "vendor_id": "approved-vendor"},
            context={"approved_vendor_list": ["approved-vendor"], "payments_this_hour": 2},
            policy={"auto_approve_max_usd": 5000}
        )
        assert len(result) == 0  # No rules triggered

    def test_policy_boundary_exact_limit(self):
        """Edge case: payment exactly at the limit."""
        at_limit = policy_engine.evaluate(
            agent_id="payment-processing-agent",
            action={"type": "execute_payment", "amount": 5000, "vendor_id": "approved-vendor"},
            context={"approved_vendor_list": ["approved-vendor"]},
            policy={"auto_approve_max_usd": 5000}
        )
        # At the limit: depends on whether condition is > or >=
        # Policy must be explicit: "above $5,000" vs "at or above $5,000"
        assert len(at_limit) == 0  # If condition is "amount > 5000"
```

Run policy tests in CI/CD. A policy change that breaks a test requires explicit approval, triggering governance review.

---

## Policy Versioning and Change Management

Every policy change must be tracked:

```
policies/
  payment-agent.yaml          ← Current policy
  CHANGELOG.md                ← Human-readable change history
  tests/
    test_payment_policy.py    ← Automated tests
  history/
    payment-agent-v2.0.yaml   ← Previous versions
    payment-agent-v1.5.yaml
```

Policy changes flow through a formal change process:
1. Pull request with the policy change and updated tests
2. Automated test suite runs (must pass)
3. Governance board review for significant changes (approval threshold changes, new prohibited actions)
4. Merge triggers policy deployment to all affected agents
5. Deployment generates an audit record linking the new policy version to the deployment event

---

## Summary

- Policy-as-code solves the interpretation gap, drift, and untestability of written policies
- Three levels: configuration-as-policy (YAML governance parameters), rule engine policies (code-evaluated conditions), Open Policy Agent (centralized evaluation for multi-agent organizations)
- Policy testing: automated test suites that run on every policy change, including boundary condition tests
- Policy change management: version-controlled, tested, governance-reviewed, deployed with audit records linking policy version to deployment event

---

*Next: [Lesson 5.3 — Continuous Monitoring and Alerting](03-continuous-monitoring.md)*
