# Lesson 3.4: Reproducibility Requirements

**Module**: 3 — Audit Trails and Observability for Compliance
**Estimated reading time**: ~18 minutes
**Level**: Intermediate–Advanced

---

## Overview

Reproducibility in agentic systems means being able to understand what happened in a past run with sufficient fidelity to audit it, explain it, and detect anomalies — even though exact re-execution is impossible due to non-determinism. This lesson covers what regulators and auditors mean by reproducibility, and how to design systems that satisfy those requirements.

---

## The Reproducibility Misconception

A common misconception: "reproducibility" means you can re-run the agent and get the same result. For deterministic software, this is true. For LLM-based agents, it is not — and regulators know this.

What reproducibility actually means for agentic systems:

**Regulatory reproducibility**: You can reconstruct what the agent did and why from the audit record, without needing to re-run the agent.

**Forensic reproducibility**: Given an incident, you can determine the exact sequence of events, the agent's state at each step, and the inputs that led to the problematic action.

**Consistency reproducibility**: You can verify that agents running in the same conditions produce results that are consistent with each other and with policy expectations — even if they are not byte-for-byte identical.

---

## What Must Be Captured for Regulatory Reproducibility

To reconstruct what an agent did without re-running it, the audit record must contain:

### 1. The Initial Conditions

Everything that was true when the run started:
- The agent's system prompt (versioned)
- The tool configuration (what tools were available and with what parameters)
- The initial input (the task or goal)
- Any context that was pre-loaded (documents, data)

```python
@dataclass
class RunInitialConditions:
    run_id: str
    agent_id: str
    agent_version: str
    system_prompt_version: str   # A version identifier, not the full prompt
    system_prompt_hash: str      # Hash of the full prompt for integrity
    tool_config_version: str
    tool_config_hash: str
    initial_input: str           # The task/goal
    initial_context_hash: str    # Hash of any pre-loaded context
    model_id: str
    model_version: str
    timestamp: str
    user_id: str | None
```

### 2. The Execution Sequence

Every action in the order it occurred, with enough detail to understand the agent's state at each step:

```json
{
  "run_id": "run-uuid",
  "sequence": [
    {
      "step": 1,
      "event_type": "reasoning",
      "reasoning_summary": "Task received: process invoice INV-001. First step: retrieve invoice details.",
      "timestamp": "2026-03-15T14:23:00Z"
    },
    {
      "step": 2,
      "event_type": "tool_call",
      "tool": "get_invoice",
      "input_summary": "invoice_id=INV-001",
      "output_summary": "Invoice retrieved: vendor=FinCorp, amount=15000, status=pending",
      "timestamp": "2026-03-15T14:23:01Z"
    },
    {
      "step": 3,
      "event_type": "decision",
      "decision_type": "payment_approval_check",
      "decision_outcome": "requires_approval",
      "reasoning_summary": "Amount $15,000 exceeds auto-approve limit of $10,000. Requesting approval.",
      "timestamp": "2026-03-15T14:23:02Z"
    }
  ]
}
```

### 3. The External State at Each Step

Tool outputs encode the external world's state at the time each tool was called. Since external data changes, the tool output at the time of the call is the ground truth for what the agent knew:

```python
# Do NOT just log that the tool was called.
# Log what the tool returned at the time of the call.

audit_log.record(
    event_type="tool_call_executed",
    tool_name="get_customer_credit_score",
    input_summary=f"customer_id={customer_id}",
    input_hash=sha256(customer_id),
    # CRITICAL: capture what was returned, not just that it was called
    output_summary="credit_score=742, score_date=2026-03-15, bureau=Equifax",
    output_hash=sha256(json.dumps(result)),
    timestamp=datetime.utcnow().isoformat()
)
```

This is important because the customer's credit score may change. The audit record proves what score the agent saw at decision time — which is the only fact that matters for the decision audit.

---

## Model Versioning for Reproducibility

LLM behavior changes when model versions change. For decisions with audit requirements, you must record which model version was used:

```python
# Track model version at decision time
@dataclass
class ModelMetadata:
    model_id: str           # "claude-sonnet-4-6"
    model_version: str      # "2025-08-01" or similar version identifier
    temperature: float      # Sampling parameters affect output
    max_tokens: int
    system_prompt_hash: str # The exact prompt used

# Record in audit
audit_log.record(
    event_type="decision_made",
    model_metadata=asdict(ModelMetadata(
        model_id="claude-sonnet-4-6",
        model_version="2025-08-01",
        temperature=0.0,
        max_tokens=1024,
        system_prompt_hash=sha256(system_prompt)
    )),
    ...
)
```

If a model provider changes behavior without changing the version identifier (a "silent update"), your audit records will be inconsistent with re-execution attempts. This is why recording the exact version at decision time is essential.

---

## Policy Versioning for Reproducibility

Decisions must be evaluated against the policy in effect at the time of the decision — not the current policy.

**The policy change problem**: An agent approved a loan in January using Policy v5.1. In March, Policy v6.0 changes the credit score threshold. An auditor in April asks "was this loan correctly approved?" The answer depends on which policy is used to evaluate it.

**Solution**: Record the policy version alongside every decision, and maintain an immutable history of policy versions.

```python
class PolicyVersionRegistry:
    def get_policy_at_time(
        self,
        policy_name: str,
        timestamp: datetime
    ) -> PolicyVersion:
        """Return the policy version that was in effect at the given timestamp."""
        return self.db.query(
            "SELECT * FROM policy_versions "
            "WHERE policy_name = ? AND effective_from <= ? "
            "ORDER BY effective_from DESC LIMIT 1",
            policy_name, timestamp
        )

    def record_policy_change(
        self,
        policy_name: str,
        new_version: str,
        content_hash: str,
        effective_from: datetime,
        changed_by: str
    ):
        self.db.insert("policy_versions", {
            "policy_name": policy_name,
            "version": new_version,
            "content_hash": content_hash,
            "effective_from": effective_from,
            "changed_by": changed_by,
            "recorded_at": datetime.utcnow()
        })
```

---

## Consistency Testing

Since exact re-execution is impossible, use consistency testing to validate that the agent behaves consistently with its documented policy:

```python
class ConsistencyTestSuite:
    """
    Tests that agent decisions are consistent with policy documentation,
    not necessarily identical across runs.
    """

    def test_credit_decision_consistency(self):
        """
        For a given applicant profile, the agent should produce the same
        accept/decline decision across multiple runs, even if the reasoning
        varies in phrasing.
        """
        applicant = create_test_applicant(
            credit_score=780,
            dti_ratio=0.28,
            employment_status="full_time"
        )

        outcomes = []
        for _ in range(10):
            result = agent.evaluate_loan_application(applicant)
            outcomes.append(result.decision_outcome)

        # Consistency check: same outcome across all runs
        unique_outcomes = set(outcomes)
        assert len(unique_outcomes) == 1, (
            f"Inconsistent outcomes across runs: {unique_outcomes}"
        )
        assert outcomes[0] == "approved", (
            "Expected approval for profile meeting all criteria"
        )

    def test_policy_boundary_consistency(self):
        """
        Applicants just below the credit score threshold must consistently
        receive 'declined'. This tests the policy boundary.
        """
        threshold = CREDIT_POLICY.minimum_credit_score
        borderline_applicant = create_test_applicant(
            credit_score=threshold - 1,  # Just below threshold
            dti_ratio=0.25,
            employment_status="full_time"
        )

        outcomes = [
            agent.evaluate_loan_application(borderline_applicant).decision_outcome
            for _ in range(10)
        ]

        # Should always be declined — policy boundary must be consistently enforced
        assert all(o == "declined" for o in outcomes), (
            f"Policy boundary not consistently enforced: {set(outcomes)}"
        )
```

Run consistency tests:
- Before deploying a new model version
- After any prompt change
- As part of the regression test suite for policy changes

---

## Summary

- Regulatory reproducibility means reconstructing past agent behavior from audit records — not re-running the agent
- Three components required: initial conditions (versioned agent config, prompt, tools), execution sequence (ordered step-by-step record), external state (what tool calls returned at the time)
- Model versioning: record the exact model version at decision time; behavior changes with model updates
- Policy versioning: record the policy version in effect at decision time; maintain immutable policy history for retrospective evaluation
- Consistency testing: validate that the agent produces consistent decisions for given profiles across multiple runs — tests policy enforcement even when exact output varies

---

*Next: [Lesson 3.5 — Compliance Dashboards and Reporting](05-compliance-reporting.md)*
