# Lesson 3.3: Decision Provenance and Reasoning Traces

**Module**: 3 — Audit Trails and Observability for Compliance
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Overview

Decision provenance answers "why did the agent decide what it decided?" It is the difference between an audit trail that shows *what* happened and one that shows *why*. For agentic systems making decisions that affect people — loan approvals, HR routing, medical triage, legal classification — decision provenance is a regulatory requirement and an operational necessity.

---

## What Decision Provenance Is Not

Before defining what decision provenance is, clarify what it is not:

**It is not the raw LLM output**: The full chain-of-thought of an LLM is not decision provenance. It is noisy, non-deterministic, and often inconsistent. Recording thousands of tokens of LLM reasoning per action is expensive and not useful for compliance.

**It is not just logging the output**: Recording "the agent approved the loan" is not provenance. It is a fact. Provenance explains why the agent approved the loan.

**It is not reproducible execution**: Decision provenance is not the ability to re-run the agent and get the same result. Due to non-determinism, you cannot replay an LLM-based agent's exact reasoning. Provenance is the record of the reasoning at the time it occurred.

---

## What Decision Provenance Is

Decision provenance is a structured record of the factors that materially influenced a significant agent decision:

1. **The inputs considered**: What data the agent accessed and incorporated into the decision
2. **The criteria applied**: Which rules, policies, or thresholds were checked
3. **The outcome**: What the agent decided
4. **The reasoning summary**: A concise plain-language explanation connecting inputs to outcome
5. **The policy basis**: The specific policy or rule that authorized the outcome

```json
{
  "decision_id": "dec-uuid",
  "agent_id": "loan-processing-agent",
  "run_id": "run-uuid",
  "timestamp": "2026-03-15T14:23:07Z",
  "decision_type": "loan_application_decision",
  "decision_outcome": "approved",

  "inputs_considered": [
    {"field": "credit_score", "value_hash": "abc123", "summary": "above threshold"},
    {"field": "debt_to_income_ratio", "value_hash": "def456", "summary": "within acceptable range"},
    {"field": "employment_status", "value_hash": "ghi789", "summary": "employed full-time"},
    {"field": "loan_amount", "value_hash": "jkl012", "summary": "within approved range"}
  ],

  "criteria_applied": [
    {
      "rule": "credit_score_minimum",
      "policy_ref": "Lending Policy v5.2, Section 3.1",
      "result": "PASS"
    },
    {
      "rule": "dti_maximum",
      "policy_ref": "Lending Policy v5.2, Section 3.2",
      "result": "PASS"
    },
    {
      "rule": "employment_stability",
      "policy_ref": "Lending Policy v5.2, Section 3.4",
      "result": "PASS"
    }
  ],

  "reasoning_summary": "Application meets all three minimum criteria: credit score above threshold, debt-to-income ratio within policy limits, applicant employed full-time for 24+ months. No exceptional risk factors identified. Decision: approved at standard rate.",

  "policy_version_at_decision": "Lending Policy v5.2 (effective 2026-01-01)",
  "model_id": "claude-sonnet-4-6",
  "model_version_at_decision": "2025-08-01"
}
```

---

## Capturing Reasoning Summaries Reliably

The challenge with reasoning summaries: the agent reasons in natural language, and extracting a structured provenance record from unstructured reasoning requires deliberate design.

### Approach 1: Structured Output Schema

Design the agent to produce structured decision records as output for significant decisions, rather than free-form text:

```python
from pydantic import BaseModel
from typing import Literal

class PolicyCriterion(BaseModel):
    rule: str
    policy_ref: str
    result: Literal["PASS", "FAIL", "EXCEPTION"]
    notes: str = ""

class DecisionRecord(BaseModel):
    decision_type: str
    decision_outcome: str
    criteria_applied: list[PolicyCriterion]
    reasoning_summary: str  # Max 200 words
    requires_human_review: bool
    escalation_reason: str | None = None

# Prompt engineering for structured decisions
DECISION_PROMPT = """
You are evaluating a loan application. After reviewing the applicant data,
produce a structured decision record in the following JSON format:

{schema}

Rules:
- reasoning_summary must be 1-3 sentences, plain language, suitable for
  the applicant to read
- criteria_applied must reference the specific policy section for each check
- If any criterion fails, decision_outcome must be "declined"
- If any criterion is ambiguous, set requires_human_review=true
"""
```

### Approach 2: Post-Processing Extraction

If the agent produces free-form reasoning, extract the structured provenance record as a post-processing step:

```python
def extract_decision_provenance(
    agent_reasoning: str,
    decision_outcome: str,
    policy_context: dict
) -> DecisionRecord:
    """
    Extract structured provenance from agent's free-form reasoning.
    Used when the agent cannot produce structured output directly.
    """
    extraction_prompt = f"""
    Given this agent reasoning:
    {agent_reasoning}

    And this decision outcome: {decision_outcome}

    Extract a structured decision provenance record. For each criterion mentioned,
    identify:
    1. The rule being checked
    2. The policy reference (from: {policy_context})
    3. Whether the check passed or failed

    Output JSON matching this schema: {DecisionRecord.schema_json()}
    """
    return llm_call(extraction_prompt, output_schema=DecisionRecord)
```

### Approach 3: Instrumentation Points

For rule-based components within an otherwise LLM-driven agent, instrument the rule evaluation directly:

```python
class PolicyEvaluator:
    def __init__(self, audit_logger):
        self.logger = audit_logger

    def evaluate(self, criterion_name: str, value: Any, threshold: Any) -> bool:
        result = value >= threshold  # or whatever the rule logic is

        # Log the evaluation at the point where it occurs
        self.logger.log(AuditEvent(
            event_type="policy_criterion_evaluated",
            criterion_name=criterion_name,
            value_hash=sha256(str(value)),
            threshold=threshold,  # Threshold is policy config, not PII — log plaintext
            result="PASS" if result else "FAIL",
            policy_ref=POLICY_REFERENCES[criterion_name]
        ))

        return result
```

---

## Provenance for GDPR Article 22 Compliance

GDPR Article 22 gives individuals the right to an explanation of automated decisions that significantly affect them. Decision provenance is the data that makes this possible.

An explanation for a declined loan application, derived from provenance data:

```
Your loan application was reviewed automatically on March 15, 2026.

The following criteria were evaluated:
✗ Credit score: Your score did not meet the minimum threshold required by our
  lending policy (Lending Policy v5.2, Section 3.1).
✓ Debt-to-income ratio: Within acceptable range.
✓ Employment status: Meets full-time employment requirement.

Because one or more criteria were not met, your application was declined.

You have the right to request human review of this decision. To do so,
contact lending@example.com within 30 days of this notice.
```

This explanation is generated from the structured provenance record — not from the LLM's free-form reasoning. The structured record guarantees accuracy; the generation step only handles presentation.

**Implementation**:

```python
def generate_article_22_explanation(decision: DecisionRecord, template: str) -> str:
    """
    Generate a GDPR Article 22-compliant explanation from a decision provenance record.
    """
    failed_criteria = [c for c in decision.criteria_applied if c.result == "FAIL"]
    passed_criteria = [c for c in decision.criteria_applied if c.result == "PASS"]

    return template.format(
        decision_date=decision.timestamp,
        outcome=decision.decision_outcome,
        failed_criteria="\n".join(
            f"✗ {c.rule}: {c.notes or 'Did not meet requirements.'}"
            for c in failed_criteria
        ),
        passed_criteria="\n".join(
            f"✓ {c.rule}: {c.notes or 'Met requirements.'}"
            for c in passed_criteria
        ),
        reasoning=decision.reasoning_summary
    )
```

---

## Provenance Completeness Requirements

Not all decisions need full provenance. Apply provenance capture proportionally:

| Decision Significance | Provenance Required |
|----------------------|---------------------|
| Significant automated decision (Article 22 scope) | Full provenance record with all five elements |
| Irreversible action | Full provenance record |
| High-risk action requiring approval | Full provenance record + approval linkage |
| Routine automated action (low impact, reversible) | Criteria applied + outcome (abbreviated) |
| Routine read operation | No provenance required beyond action log entry |

---

## Summary

- Decision provenance records the inputs considered, criteria applied, outcome, reasoning summary, and policy basis for significant agent decisions
- Provenance is distinct from raw LLM output (too noisy) and from action logging (records what, not why)
- Three capture approaches: structured output schema (preferred), post-processing extraction, instrumentation points for rule-based components
- Provenance enables GDPR Article 22-compliant explanations — generate from structured records, not from LLM free-form text
- Apply provenance capture proportionally: full records for significant automated decisions, abbreviated for routine actions

---

*Next: [Lesson 3.4 — Reproducibility Requirements](04-reproducibility.md)*
