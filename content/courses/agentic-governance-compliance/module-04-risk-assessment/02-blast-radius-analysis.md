# Lesson 4.2: Blast Radius Analysis

**Module**: 4 — Risk Assessment and Agent Boundaries
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Overview

Blast radius is the maximum scope of harm a misbehaving agent can cause before it is stopped. Understanding blast radius drives capability design decisions: an agent with a small blast radius can be deployed with less governance overhead than one with a catastrophic blast radius. This lesson provides a systematic method for calculating and reducing blast radius.

---

## The Blast Radius Equation

```
Blast Radius = f(Capability Scope × Reversibility × Detection Latency)
```

**Capability scope**: How much can the agent access and modify?
**Reversibility**: Can the harm be undone?
**Detection latency**: How long before anomalous behavior is detected and the agent is stopped?

The product of these three factors determines the worst-case harm. Reducing any one of them reduces blast radius.

```
Example A:
  Capability scope: 1,000 customer records accessible
  Reversibility: Data can be restored from backup (partial recovery)
  Detection latency: Alert fires within 5 minutes; agent stopped in 7 minutes

  Blast radius: ~1,000 records × partial recovery possible × 7-minute window
  → Medium: significant but recoverable harm

Example B:
  Capability scope: All production databases (millions of records)
  Reversibility: Agent has DELETE permission; no backup for last 24 hours
  Detection latency: Monitoring is checked daily; detection latency ~24 hours

  Blast radius: millions of records × no recovery × 24-hour window
  → Catastrophic: existential risk to the organization
```

---

## Systematic Blast Radius Calculation

### Step 1: Capability Inventory

List every capability and its maximum scope:

```python
@dataclass
class CapabilityScope:
    capability_name: str
    max_records_readable: int | str     # integer or "unlimited"
    max_records_writable: int | str
    max_records_deletable: int | str
    external_systems_reachable: list[str]
    max_api_calls_per_run: int
    max_cost_per_run_usd: float
    irreversible_actions: list[str]

# Example for a payment processing agent
payment_agent_capabilities = [
    CapabilityScope(
        capability_name="read_invoices",
        max_records_readable="unlimited",  # Can query all invoices
        max_records_writable=0,
        max_records_deletable=0,
        external_systems_reachable=[],
        max_api_calls_per_run=1000,
        max_cost_per_run_usd=0,
        irreversible_actions=[]
    ),
    CapabilityScope(
        capability_name="execute_payment",
        max_records_readable=0,
        max_records_writable="unlimited",  # Can write payment records
        max_records_deletable=0,
        external_systems_reachable=["banking_api", "payment_processor"],
        max_api_calls_per_run=500,
        max_cost_per_run_usd=100,  # Platform fee per transaction × 500
        irreversible_actions=["financial_transfer"]  # Cannot be recalled once settled
    ),
]
```

### Step 2: Reversibility Matrix

Classify every action as reversible, partially reversible, or irreversible:

| Action Type | Reversibility | Recovery Method | Recovery Time |
|------------|---------------|-----------------|---------------|
| Read data | N/A (no change) | N/A | N/A |
| Write/update record | Reversible | Revert to previous version | Minutes |
| Soft delete | Reversible | Restore from recycle bin | Minutes |
| Hard delete | Irreversible (unless backup) | Restore from backup | Hours–days |
| Send email | Irreversible | Retraction possible; not guaranteed | N/A |
| Execute financial transfer | Irreversible (after settlement) | Dispute process | Days–weeks |
| Post to external system | Irreversible (may be cached) | Delete request; not guaranteed | Unknown |
| Deploy code | Reversible | Rollback | Minutes–hours |
| Revoke access | Reversible | Re-grant | Minutes |

### Step 3: Detection Latency Estimation

Estimate how long before anomalous behavior triggers an alert and results in agent suspension:

```
Detection latency = Time to alert + Time to triage + Time to suspend

Example: Email exfiltration
  Alert threshold: >10 external email sends in 1 hour
  Alert fire time: 1 hour (volume threshold)
  Triage time: 15 minutes (on-call engineer investigates)
  Suspension time: 5 minutes (engineer suspends agent)

  Detection latency: ~80 minutes

Blast radius window: 80 minutes of potential exfiltration
At 1 email per minute: up to ~80 emails sent
If each email contains a contract: 80 contracts potentially exfiltrated
```

### Step 4: Worst-Case Harm Calculation

```python
@dataclass
class BlastRadiusAssessment:
    agent_id: str
    capability: str
    worst_case_scope: str           # Plain language description
    reversibility: str              # reversible | partial | irreversible
    detection_latency_minutes: int
    worst_case_actions_in_window: int
    worst_case_harm_description: str
    severity: str                   # low | medium | high | critical | catastrophic
    risk_score: float               # 0.0 to 10.0

def calculate_blast_radius(
    capability: CapabilityScope,
    detection_latency_minutes: int,
    actions_per_minute: int = 1
) -> BlastRadiusAssessment:
    actions_in_window = detection_latency_minutes * actions_per_minute
    irreversible = len(capability.irreversible_actions) > 0

    # Score based on factors
    scope_score = min(10.0, capability.max_records_writable / 100)
    if capability.max_records_writable == "unlimited":
        scope_score = 10.0

    reversibility_multiplier = 2.0 if irreversible else 1.0
    detection_multiplier = min(3.0, detection_latency_minutes / 60)

    risk_score = min(10.0, scope_score * reversibility_multiplier * detection_multiplier)

    severity = (
        "catastrophic" if risk_score >= 9.0 else
        "critical" if risk_score >= 7.0 else
        "high" if risk_score >= 5.0 else
        "medium" if risk_score >= 3.0 else
        "low"
    )

    return BlastRadiusAssessment(
        agent_id=capability.capability_name,
        capability=capability.capability_name,
        worst_case_scope=f"{actions_in_window} actions in {detection_latency_minutes} minutes",
        reversibility="irreversible" if irreversible else "reversible",
        detection_latency_minutes=detection_latency_minutes,
        worst_case_actions_in_window=actions_in_window,
        worst_case_harm_description=f"Up to {actions_in_window} {capability.irreversible_actions[0] if irreversible else 'modifications'}",
        severity=severity,
        risk_score=risk_score
    )
```

---

## Blast Radius Reduction Strategies

### Strategy 1: Reduce Capability Scope

The most effective strategy: reduce what the agent can access or modify.

```python
# Before: Agent can access all invoices
def get_invoices(status: str = None) -> list[Invoice]:
    return db.query("SELECT * FROM invoices WHERE status = ?", status)

# After: Agent can only access invoices assigned to it
def get_invoices(status: str = None, agent_assignment_id: str = None) -> list[Invoice]:
    return db.query(
        "SELECT * FROM invoices WHERE status = ? AND assigned_agent = ?",
        status,
        agent_assignment_id  # Injected from execution context; cannot be overridden by agent
    )
```

### Strategy 2: Reduce Reversibility Risk

Where possible, add reversibility to actions that are currently irreversible:

```python
# Before: Hard delete
def delete_record(record_id: str):
    db.execute("DELETE FROM records WHERE id = ?", record_id)

# After: Soft delete with recovery window
def delete_record(record_id: str, reason: str):
    db.execute(
        "UPDATE records SET deleted_at = ?, deleted_reason = ?, "
        "deleted_by_agent = ? WHERE id = ?",
        datetime.utcnow(), reason, current_agent_id(), record_id
    )
    # Hard delete scheduled after 30-day review window
    cleanup_scheduler.schedule(record_id, days=30)
```

### Strategy 3: Reduce Detection Latency

The faster anomalous behavior is detected and stopped, the smaller the blast radius window:

```python
# Real-time anomaly alert — fires immediately on threshold breach
# vs. daily log review — 24-hour detection latency
RATE_LIMIT_ALERTS = [
    RateLimitAlert(
        metric="financial_transfers_per_hour",
        threshold=10,
        window_minutes=60,
        action="suspend_agent",
        alert_recipients=["security-team", "finance-team"]
    ),
    RateLimitAlert(
        metric="external_api_calls_per_minute",
        threshold=30,
        window_minutes=1,
        action="throttle_agent",
        alert_recipients=["engineering-team"]
    )
]
```

### Strategy 4: Require Approval for High-Blast-Radius Actions

If the blast radius of a single action is catastrophically high, require human approval regardless of other factors:

```python
APPROVAL_REQUIRED_BY_BLAST_RADIUS = {
    "bulk_delete": {
        "threshold_records": 10,  # Any deletion of >10 records requires approval
        "reason": "blast_radius_critical"
    },
    "financial_transfer": {
        "threshold_usd": 5000,
        "reason": "irreversible_high_value"
    }
}
```

---

## Documenting Blast Radius for Governance

Every agent deployed in production should have a documented blast radius assessment. This document is reviewed by:
- Security teams before deployment authorization
- Risk officers as part of the risk management system (EU AI Act requirement for high-risk)
- Insurance underwriters when coverage for AI systems is evaluated

**Minimum blast radius documentation**:
```markdown
## Blast Radius Assessment: PaymentProcessingAgent

**Maximum records modifiable**: 10,000 (per batch run limit)
**Maximum financial impact**: $50,000 (per-run payment limit)
**Irreversible actions**: financial_transfer (after settlement, ~1 business day)
**External systems**: banking-api, payment-processor
**Detection latency (current)**: ~15 minutes (real-time monitoring + on-call rotation)
**Worst-case window**: 15 minutes × 2 payments/minute = 30 payments
**Worst-case financial exposure**: 30 × $5,000 max per payment = $150,000

**Severity**: High
**Risk score**: 6.8 / 10

**Mitigations in place**:
1. Per-payment approval gate for amounts >$5,000
2. Rate limit: max 2 payments per minute; alert at >3
3. Daily reconciliation check against bank statement
4. All payments soft-reversible via dispute process (7-business-day window)
```

---

## Summary

- Blast radius = Capability Scope × Reversibility × Detection Latency
- Systematic calculation: inventory capabilities, classify reversibility, estimate detection latency, compute worst-case harm
- Four reduction strategies: reduce scope, add reversibility (soft deletes, review windows), reduce detection latency (real-time alerts over log review), require approval for catastrophic-blast-radius actions
- Every production agent must have documented blast radius assessment reviewed by security, risk, and (for high-risk systems) insurance underwriters

---

*Next: [Lesson 4.3 — Containment Patterns](03-containment-patterns.md)*
