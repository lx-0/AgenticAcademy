# Capstone: Enterprise Governance Audit

**Course**: Agentic Governance & Compliance for Enterprise Teams
**Prerequisite**: Pass all 5 module assessments (≥70% each)
**Estimated time**: 5–7 hours
**Submission**: Written governance audit report (2,500–5,000 words) + policy-as-code artifact

---

## Overview

The capstone integrates all five course modules into a single deliverable: a professional governance audit of an enterprise agentic system. You will play the role of a governance consultant brought in to assess an organization's agentic deployment, identify risks, and produce actionable recommendations.

Completion of this capstone (combined with passing all 5 module assessments) earns your **Agentic Governance & Compliance Certificate**.

---

## The Audit Subject: MediClaim Processing System

MedAssist Corp is a mid-size healthcare insurance company that deployed an agentic claims processing system 8 months ago. The system has processed 45,000 claims and auto-approved $127M in payments without a dedicated governance review.

An upcoming regulatory audit by the state insurance commissioner has prompted MedAssist's board to commission an independent governance audit before the regulator arrives. You are that auditor.

### System Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   MediClaim System                          │
│                                                            │
│  TriageAgent ──→ EligibilityAgent ──→ PaymentAgent         │
│       │               │                    │               │
│       ▼               ▼                    ▼               │
│  ClaimsDB         PolicyDB            PaymentLedger        │
│                                                            │
│  FraudDetectionAgent (runs independently on all claims)    │
└────────────────────────────────────────────────────────────┘
```

**TriageAgent**: Receives incoming claims, classifies by type (medical, dental, vision, pharmacy), assesses initial completeness, and routes to EligibilityAgent.

**EligibilityAgent**: Verifies claimant eligibility, checks deductibles and coverage limits, and determines payable amount. Has access to full policy database and claimant medical history.

**PaymentAgent**: Executes approved payments, generates explanation-of-benefits documents, and notifies claimants. Has access to payment processing API and claimant financial information.

**FraudDetectionAgent**: Runs asynchronously on all claims. Can flag claims for investigation or, for high-confidence fraud cases, automatically deny and block the claimant account.

### Existing Governance Documentation

MedAssist provided the following during onboarding:

1. **System design document** (dated 8 months ago): Describes intended architecture. Notes "governance controls to be added before production" — these were not added before production launch.

2. **Audit log**: CloudWatch logs with unstructured text entries. Sample: `2026-03-01 14:23:07 INFO [payment-agent] Processing payment for claim CLM-48291`. No structured schema, no chain integrity.

3. **Approval thresholds**: Payments under $10,000 are auto-approved. Payments over $10,000 require "manager review" — but no formal approval system exists; the manager receives a daily email digest and replies "ok" to approve.

4. **Access controls**: All four agents share a single database service account (`mediclaim_db_user`) with read/write access to all tables. No per-task scoping.

5. **Monitoring**: The engineering team reviews agent error logs weekly. No real-time alerts. No HITL controls for individual claims.

6. **Incident history**: Three documented incidents in 8 months: (1) EligibilityAgent approved coverage for a lapsed policy (caught by claimant's doctor), (2) FraudDetectionAgent blocked 127 legitimate claims from elderly claimants who lived in the same zip code as a fraud cluster, (3) PaymentAgent sent EOB documents to the wrong claimant email address for 11 claims (possible GDPR/HIPAA breach).

---

## Deliverable Requirements

Your audit report must address all five sections below, plus the policy-as-code artifact.

---

### Section 1: Regulatory Risk Assessment (Module 1)

**Required**:

1. **Regulatory framework analysis**: For each applicable framework (EU AI Act, GDPR, HIPAA, state insurance regulations), identify the specific obligations the MediClaim system triggers. Be precise: name the specific article, section, or provision.

2. **Liability analysis**: Apply the three-tier liability model (developer/operator/system designer) to the three documented incidents. Who bears accountability for each incident, and why?

3. **Current compliance status**: For each regulatory obligation identified, assess whether MedAssist is currently compliant or in violation. Use the compliance-engineering translation layer: translate each obligation into a specific technical requirement and assess whether that requirement is met.

4. **Regulatory exposure prioritization**: Rank the top 3 regulatory risks in order of urgency (likelihood of regulatory action × potential penalty). Justify each ranking with specific evidence from the system description.

**Minimum**: All applicable frameworks addressed; all 3 incidents analyzed; compliance gap table with specific technical requirements; ranked top-3 regulatory risks with justification.

---

### Section 2: Governance Gap Analysis (Modules 1 & 5)

**Required**:

1. **AGMM assessment**: Score MedAssist across all 5 AGMM dimensions with specific evidence for each rating.

2. **Governance stack analysis**: For each of the 5 governance layers, identify:
   - What is in place (if anything)
   - What is missing
   - What specific harm the gap enables (reference the documented incidents where applicable)

3. **Critical path to minimum compliance**: Identify the minimum set of governance controls that must be in place before the regulatory audit. What can wait; what cannot. Justify this triage based on regulatory risk.

4. **Governance debt register**: List all identified governance gaps as a prioritized register with risk ratings.

**Minimum**: AGMM table with evidence; 5-layer gap analysis; critical path list with justification; governance debt register with at least 8 specific gaps.

---

### Section 3: Audit Trail and Incident Forensics (Module 3)

**Required**:

1. **Incident 3 forensic assessment**: For the EOB misdirection incident (11 claimants received other claimants' documents):
   - What audit evidence would be needed to determine the scope and cause?
   - Does the current audit infrastructure support this investigation?
   - Is this a reportable breach under HIPAA and/or GDPR? Justify your answer with reference to the specific breach notification rules.

2. **Audit trail design**: Design a compliance-grade audit trail for the MediClaim system that would:
   - Support forensic investigation of all three documented incidents
   - Meet HIPAA audit trail requirements (access to ePHI must be logged)
   - Satisfy the "what happened, why, and was it justifiable" test for payment decisions

3. **Provenance for denial decisions**: FraudDetectionAgent automatically denies claims and blocks claimant accounts. Design a decision provenance record for auto-denial decisions that supports GDPR Article 22 compliance (right to explanation) and HIPAA appeals processes.

**Minimum**: Forensic assessment with breach notification conclusion; complete audit trail schema; decision provenance design for FraudDetectionAgent.

---

### Section 4: Risk Assessment and Controls (Module 4)

**Required**:

1. **Blast radius analysis**: Calculate blast radius for FraudDetectionAgent's auto-denial capability. Include: current capability scope, reversibility classification, detection latency (based on existing monitoring), and worst-case harm calculation.

2. **Threat model**: Apply the agentic threat model framework to EligibilityAgent. Enumerate capabilities, apply threat categories, and identify the top 2 threats with full analysis (probability, impact, attack scenario, mitigations).

3. **Immediate containment redesign**: The shared database service account is the highest-risk access control gap. Design a context-based access model for the four agents that replaces the shared account, with specific data scope definitions for each agent and task type.

4. **HITL requirement for FraudDetectionAgent**: The automatic account blocking capability is irreversible. Design an approval gate for this action, including the full approval request schema (all 5 elements) and escalation routing.

**Minimum**: Blast radius calculation; EligibilityAgent threat model with top-2 analysis; context-based access model for all 4 agents; FraudDetectionAgent approval gate with all 5 elements.

---

### Section 5: Governance Operating Model Recommendations (Module 5)

**Required**:

1. **Governance board design**: Design a governance board for MedAssist. Given the regulatory context (healthcare insurance, state commissioner audit pending), include at least one domain-specific member not covered in the generic board template. Define the decision authority matrix for the 4 MediClaim agents specifically.

2. **Policy-as-code artifact**: Write a production-ready policy configuration for FraudDetectionAgent that encodes the governance constraints identified in your audit. Must include:
   - Permitted and prohibited actions
   - Auto-denial threshold (score at which denial is permitted without approval)
   - Approval requirements for account blocking
   - Data access scope constraints
   - Audit requirements

3. **Pre-audit remediation plan**: Given that the regulatory audit is in 60 days, produce a prioritized remediation plan. What can realistically be implemented in 60 days with a team of 3 engineers? What will be in-progress but not complete? What residual risks will you accept with documentation?

4. **Post-incident board report**: Write the governance board report on Incident 3 (EOB misdirection). This is the report the board would have received if a governance board existed. Format it for a board audience (non-technical). Include: incident summary, regulatory exposure, immediate actions taken, root cause, and control improvements.

**Minimum**: Governance board design with domain-specific member and MediClaim-specific RACI; FraudDetectionAgent policy YAML; 60-day remediation plan with explicit residual risk acceptance; 300–500 word board report on Incident 3.

---

## Evaluation Rubric

| Section | Points | Passing |
|---------|--------|---------|
| Regulatory Risk Assessment (Section 1) | 20 | 14/20 |
| Governance Gap Analysis (Section 2) | 20 | 14/20 |
| Audit Trail and Incident Forensics (Section 3) | 20 | 14/20 |
| Risk Assessment and Controls (Section 4) | 25 | 17/25 |
| Governance Operating Model (Section 5) | 15 | 10/15 |
| **Total** | **100** | **70/100** |

### Scoring Criteria

**Section 1 (20 points)**:
- All applicable regulatory frameworks identified with specific article/section references: 6 pts
- Liability analysis correctly assigns accountability for all 3 incidents: 5 pts
- Compliance gap table is specific and technically accurate: 5 pts
- Top-3 ranking is justified with evidence: 4 pts

**Section 2 (20 points)**:
- AGMM scores are evidence-based: 5 pts
- Governance stack analysis identifies specific gaps (not generic observations): 8 pts
- Critical path correctly prioritizes regulatory-risk gaps: 4 pts
- Governance debt register is specific and risk-weighted: 3 pts

**Section 3 (20 points)**:
- Forensic assessment correctly determines what's knowable and what isn't: 5 pts
- Breach notification conclusion is legally accurate and justified: 5 pts
- Audit trail schema meets HIPAA + compliance requirements: 5 pts
- Provenance design supports Article 22 and HIPAA appeals: 5 pts

**Section 4 (25 points)**:
- Blast radius calculation is mathematically derived and specific: 7 pts
- Threat model covers all applicable categories; top-2 analysis is specific and realistic: 8 pts
- Context-based access model replaces shared account with per-task scoping: 6 pts
- Approval gate includes all 5 elements and realistic escalation: 4 pts

**Section 5 (15 points)**:
- Governance board is healthcare-context appropriate with domain-specific member: 4 pts
- Policy YAML is syntactically valid and addresses identified risks: 4 pts
- 60-day plan is realistic; residual risks are explicitly accepted: 4 pts
- Board report is non-technical and audience-appropriate: 3 pts

---

## Submission

Submit a single document plus the policy YAML artifact:

```bash
course-platform submit-capstone \
  --document /path/to/your-audit-report.md \
  --artifact /path/to/fraud-agent-policy.yaml \
  --course agentic-governance-compliance
```

---

## What Makes a Strong Capstone

**Be the auditor, not the engineer**. Section 1 should read like a compliance risk report, not a technical design document. Write for the MedAssist board, not for a developer.

**Reference the incidents, specifically**. All three documented incidents are evidence for your findings. Use them. "FraudDetectionAgent blocked 127 legitimate claims" is evidence of missing safeguards against false positives. Connect it to the governance gap you're identifying.

**Be honest about residual risk**. The 60-day plan will not address everything. That's fine. What's not fine is pretending it does. Explicit residual risk acceptance with a named accountable owner is better governance than an unrealistic plan.

**Make the policy YAML operational**. A policy file that cannot be deployed is not a governance artifact — it is a governance wish. The YAML must be syntactically valid and contain specific, enforceable rules.

**Connect modules to each other**. The strongest capstone submissions show how a single governance gap (e.g., missing audit trail) manifests across multiple dimensions: it prevents forensic investigation (Module 3), makes blast radius unquantifiable (Module 4), and prevents meaningful AGMM assessment (Module 5). Integration demonstrates system-level governance thinking.

---

## Certificate

Upon submitting a passing capstone (70+ points) with all 5 module assessments passed, you receive the **Agentic Governance & Compliance Certificate** from AgenticAcademy.

This certificate demonstrates:
- Ability to assess agentic systems against regulatory frameworks (EU AI Act, GDPR, HIPAA)
- Governance gap analysis and risk prioritization skills
- Design capability for audit trails, HITL controls, and access control appropriate to enterprise contexts
- Threat modeling and blast radius analysis for agentic workloads
- Ability to design and communicate a governance operating model for a cross-functional audience

---

*The governance of agentic systems is not a technical problem. It is a systems problem — one that requires understanding technology, regulation, organizational behavior, and risk. This capstone tests all four. Good luck.*
