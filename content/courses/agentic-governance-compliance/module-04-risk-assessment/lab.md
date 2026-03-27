# Module 4 Lab: Threat Model and Blast Radius Assessment

**Module**: 4 — Risk Assessment and Agent Boundaries
**Estimated time**: 75–90 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

InsureCo is deploying a claims processing agent. You have been brought in as a governance consultant to produce a threat model and blast radius assessment before deployment authorization is granted.

You will:
1. **Produce** a complete threat model for the agent using the agentic threat model framework
2. **Calculate** blast radius for the two highest-risk capabilities
3. **Design** containment controls for the identified threats
4. **Write** the deployment authorization document

---

## Scenario: ClaimsAgent at InsureCo

InsureCo processes 2,000 insurance claims per day. `ClaimsAgent` automates the initial processing of new claims:

```python
CLAIMS_AGENT_CAPABILITIES = [
    # Data access
    "get_claim(claim_id: str) → Claim",
    "get_policy(policy_id: str) → Policy",
    "get_claimant_record(claimant_id: str) → ClaimantRecord",  # Full medical + financial history
    "search_claims(claimant_id: str, date_range: tuple) → list[Claim]",

    # External verifications
    "verify_hospital(provider_id: str) → ProviderVerification",
    "check_fraud_database(claimant_id: str, claim_type: str) → FraudCheckResult",
    "request_medical_records(provider_id: str, claimant_id: str, date_range: tuple) → MedicalRecords",

    # Processing actions
    "approve_claim(claim_id: str, amount: float, reason: str) → Confirmation",
    "deny_claim(claim_id: str, reason: str) → Confirmation",
    "request_additional_info(claim_id: str, required_docs: list) → Confirmation",
    "flag_for_investigation(claim_id: str, flags: list[str]) → Confirmation",
    "adjust_claim_amount(claim_id: str, new_amount: float, reason: str) → Confirmation",

    # Communications
    "send_claimant_notification(claimant_id: str, template: str, data: dict) → Confirmation",
    "send_provider_request(provider_id: str, message: str) → Confirmation",
    "escalate_to_adjuster(claim_id: str, notes: str, adjuster_id: str = None) → Confirmation",
]
```

Additional context:
- Claims data includes full medical histories, financial records, and personal identifiers (SSN, DOB, address)
- Some claims involve minors
- The agent processes claims for EU residents (GDPR applies)
- Auto-approval limit: $5,000 (configured in system prompt)
- Agent uses a third-party LLM API (not on-premises)
- Current monitoring: daily log review, no real-time alerts

---

## Part 1: Threat Model (30 minutes)

In `/workspace/threat-model.md`:

### Step 1.1: Capability analysis

For each of the 15 capabilities, identify what it *allows* (not just what it was *intended for*). Pay special attention to capabilities that have broader access than they appear.

Complete this table:

```markdown
| Capability | Intended Use | What It Actually Allows |
|-----------|-------------|------------------------|
| get_claimant_record | | |
| approve_claim | | |
| send_claimant_notification | | |
| ... | | |
```

### Step 1.2: Threat rating matrix

Fill in a threat matrix for all 15 capabilities across the agentic threat categories:

```markdown
| Capability | Goal Misalignment | Prompt Injection | Scope Creep | Data Exfiltration | Resource Exhaustion |
|-----------|-------------------|-----------------|-------------|------------------|---------------------|
```

Rate each cell: Low, Medium, High, Critical.

### Step 1.3: Top 3 threats

For each of your top 3 rated threats, write a detailed threat analysis:

```markdown
### Threat: [Name]

**Capability**: [which capability]
**Category**: [threat category]
**Probability**: [Low / Medium / High] — [2-sentence rationale]
**Impact**: [Low / Medium / High / Critical] — [2-sentence rationale]
**Risk Rating**: [Low / Medium / High / Critical]

**Attack scenario**: [Describe specifically how this threat would manifest —
walk through the exact sequence of agent actions that would cause harm]

**Mitigations**:
1. [Specific control]
2. [Specific control]
3. [Specific control]
```

---

## Part 2: Blast Radius Analysis (20 minutes)

In `/workspace/blast-radius.md`:

### Step 2.1: Calculate blast radius for the two highest-risk capabilities

For each, complete the calculation using the framework from Lesson 4.2:

```markdown
### Blast Radius: [capability_name]

**Capability scope**:
- Max records accessible: [number or "unlimited"]
- Max records modifiable: [number or "unlimited"]
- Max financial impact per action: [amount]
- External systems reachable: [list]

**Reversibility**:
- Is this action reversible? [Yes / Partial / No]
- If yes, recovery method and time: [description]
- If no, what is the permanent impact?

**Detection latency** (current monitoring):
- How is anomalous behavior detected? [current monitoring description]
- Estimated time from anomaly start to agent suspension: [minutes]

**Worst-case calculation**:
- Actions possible in detection window: [actions per minute × detection minutes]
- Worst-case harm: [description with numbers]

**Severity**: [low / medium / high / critical / catastrophic]
```

### Step 2.2: Blast radius reduction recommendations

For each capability, recommend two specific measures that would reduce blast radius. For each recommendation, explain which factor (scope, reversibility, or detection latency) it addresses and by how much.

---

## Part 3: Containment Design (20 minutes)

In `/workspace/containment-controls.md`:

### Step 3.1: Design action guardrails

For the `approve_claim` capability, implement a guardrail check:

```python
class ClaimApprovalGuardrail(ActionGuardrail):
    def check(
        self,
        tool_name: str,
        tool_params: dict,
        context: AgentExecutionContext
    ) -> GuardrailResult:
        # TODO: Implement checks for:
        # 1. Amount within auto-approve limit
        # 2. Claim is in scope for this run
        # 3. Not flagged for investigation
        # 4. Claimant is not on fraud watchlist
        pass
```

### Step 3.2: Design scope enforcement

Write a `ScopedClaimsDataLayer` that enforces:
- Agent can only access the specific claim assigned to this run
- `get_claimant_record` returns only fields necessary for claims processing (not full medical history)

### Step 3.3: Sandboxing recommendation

Given that ClaimsAgent sends data to a third-party LLM API and processes sensitive medical and financial data:
- What sandboxing level is appropriate?
- What specific network controls would you implement?
- Are there any capabilities that should require a higher sandboxing level than the rest?

---

## Part 4: Deployment Authorization Document (10 minutes)

In `/workspace/deployment-auth.md`, draft a deployment authorization document that could be presented to InsureCo's CISO and DPO for sign-off.

Required sections:
1. System description and intended use
2. Risk classification (EU AI Act tier + GDPR implications)
3. Blast radius summary (top 2 worst-case scenarios)
4. Controls in place (containment, HITL, audit trail)
5. Residual risks
6. Conditions for authorization (pre-conditions that must be met before production deployment)
7. Recommended sign-off authorities

Maximum length: 500 words. Written for a CISO and DPO — not for engineers.

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| Capability analysis | 15 | "What it allows" is significantly more specific than "intended use" for at least 5 capabilities |
| Threat matrix | 20 | Ratings are justified; high-risk capabilities correctly identified |
| Top 3 threat analyses | 25 | Attack scenarios are specific and realistic; mitigations are implementable |
| Blast radius calculations | 20 | Calculations use the correct framework; worst-case is mathematically derived |
| Containment design | 10 | Guardrail and scope enforcement address identified threats |
| Deployment authorization | 10 | Appropriate for CISO/DPO audience; residual risks are honest |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
risk-lab submit --workspace /workspace/
```

---

## Hints

**"I'm not sure what `get_claimant_record` 'actually allows'"**
The capability returns the *full* claimant record — including medical history, financial records, and personal identifiers. The agent only needs a subset for claims processing. Think about what could happen if the agent combined `get_claimant_record` for many claimants with `send_provider_request` to an external system.

**"My blast radius for `approve_claim` seems too small"**
The $5,000 auto-approve limit is configured in the system prompt. A prompt injection attack could change this limit. What is the blast radius if the limit is bypassed? Recalculate with no limit.

**"The deployment authorization document sounds too technical"**
A CISO/DPO needs to understand: what can go wrong, what is protecting against it, and what they are accepting responsibility for. Remove all code references. Use plain language: "the agent can approve payments up to $5,000 without human review" is CISO language. "The approve_claim tool has an amount threshold parameter" is not.
