# Module 1 Lab: Governance Gap Analysis

**Module**: 1 — Governance Foundations for Agentic Systems
**Estimated time**: 60–75 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

You receive a real-world enterprise agentic deployment scenario: a financial services firm has deployed an expense management agent that processes employee expense reports. Your job is to:

1. **Classify** the system under EU AI Act risk tiers
2. **Identify** the governance gaps by analyzing the provided system design
3. **Prioritize** remediation with a risk-weighted action plan
4. **Draft** the compliance-engineering translation layer for the top 3 gaps

This is the governance exercise that should happen before a production deployment — you're doing it on a system that already shipped, which is where most teams find themselves.

---

## Scenario: ExpenseAgent at FinCorp

FinCorp, a mid-size financial services firm, has deployed `ExpenseAgent`. Here is what their team shared in the design document:

```
System: ExpenseAgent v1.2
Purpose: Automatically process employee expense reports

What it does:
- Reads submitted expense reports from the HR portal (PDF + receipt images)
- Classifies expenses by category (travel, meals, equipment, etc.)
- Checks expenses against company policy (dollar limits, category rules)
- Auto-approves expenses under $500 that match policy
- Flags expenses over $500 or that appear unusual for manager review
- Writes approval/rejection status back to the HR portal

Model: GPT-4o (via OpenAI API)
Tools available:
  - read_expense_report(report_id)
  - read_employee_profile(employee_id) — full employee record
  - check_policy_database(category, amount)
  - approve_expense(report_id, reason)
  - reject_expense(report_id, reason)
  - email_employee(employee_id, subject, body)
  - email_manager(manager_id, subject, body)
  - query_expense_history(employee_id, date_range) — all historical expenses

Logging: Standard application logs to CloudWatch
Human oversight: Manager review for flagged items (>$500 or unusual)
Data: Employee PII + financial data, stored in AWS us-east-1
EU employees: ~200 employees in Germany and France use this system
```

---

## Part 1: EU AI Act Risk Classification (15 minutes)

Using the risk tiers from Lesson 1.2, classify `ExpenseAgent`.

### Step 1.1: Identify the use case characteristics

Answer these questions in `/workspace/classification.md`:

1. Does this system make decisions that significantly affect individuals? What decisions specifically?
2. Does it fall into any explicitly listed high-risk categories in the EU AI Act?
3. Are the ~200 EU employees subject to EU AI Act protections as data subjects?
4. Does the auto-approval/rejection capability constitute "automated decision-making" under GDPR Article 22?

### Step 1.2: Assign the risk tier

Complete this template:

```markdown
## EU AI Act Classification: ExpenseAgent

Risk tier: [Unacceptable / High / Limited / Minimal]

Justification:
[2–3 sentences explaining the classification]

Specific obligations triggered (if High):
- [ ] Risk management system
- [ ] Automatic logging
- [ ] Human oversight mechanism
- [ ] Technical documentation
- [ ] Transparency to deployers

GDPR Article 22 applicability:
[Yes/No + justification]
```

### Expected output
A completed `/workspace/classification.md`.

---

## Part 2: Governance Gap Analysis (30 minutes)

The sandbox provides a governance checklist tool. Run it against the ExpenseAgent design:

```bash
$ governance-lab analyze --system expense-agent --output gap-report.md
```

This will generate a structured gap report comparing the design against the five-layer governance stack.

Review the output and complete your own analysis in `/workspace/gap-analysis.md`:

### Step 2.1: Layer-by-layer gap assessment

For each of the five governance layers, answer:
- What is in place?
- What is missing?
- What is the risk if this gap is not addressed?

Use this template for each layer:

```markdown
### Layer [N]: [Layer Name]

**In place:**
- [list]

**Missing:**
- [list]

**Risk if unaddressed:**
[1–2 sentences describing the specific failure mode]
```

Specific gaps to look for (without giving away the answers):
- Look at the `tools available` list critically. Does least privilege apply?
- Look at the logging setup. Is it sufficient for a GDPR audit trail?
- Look at where the data is stored vs. who uses it. Any data residency issues?
- Look at the auto-approval threshold. Any HITL concerns?
- Look at what happens when `ExpenseAgent` makes a wrong decision. Is there a documented response path?

### Step 2.2: Identify the most critical gap

Choose the single gap that poses the highest risk to FinCorp. Write a 200-word explanation of why this gap is the most critical, what specifically could go wrong, and what the regulatory exposure is.

---

## Part 3: Prioritized Remediation Plan (15 minutes)

Not all gaps can be fixed at once. Use a risk-weighted prioritization model.

In `/workspace/remediation-plan.md`, rank your top 5 gaps and fill in this table:

```markdown
| Gap | Severity (Critical/High/Medium/Low) | Effort (Days) | Owner | Deadline |
|-----|--------------------------------------|---------------|-------|----------|
| [gap 1] | | | | |
| [gap 2] | | | | |
| [gap 3] | | | | |
| [gap 4] | | | | |
| [gap 5] | | | | |
```

Severity definitions:
- **Critical**: Regulatory violation likely if not addressed; incident probable
- **High**: Significant risk of harm; compliance evidence inadequate
- **Medium**: Non-ideal but defensible; should be addressed within 90 days
- **Low**: Best-practice improvement; no immediate risk

---

## Part 4: Compliance-Engineering Translation (15 minutes)

For your top 3 gaps, produce a compliance-engineering translation document in `/workspace/translation.md`.

For each gap:

```markdown
### Gap: [Gap Name]

**Compliance requirement (legal language):**
[Write what a compliance officer would require — 2–4 sentences in policy language]

**Engineering implementation:**
[Write what needs to be built — specific, technical, implementable. Include:
- What component is modified or added
- What it checks or enforces
- How the result is logged
- What the failure mode is if the control is bypassed]

**Verification criteria:**
[How does a compliance officer verify this is implemented? What evidence exists?]
```

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| EU AI Act classification | 20 | Correct tier with justified reasoning; GDPR Article 22 addressed |
| Gap analysis — layers 1–5 | 40 | Identifies all critical gaps; risk assessment is specific and accurate |
| Critical gap identification | 15 | Most critical gap is correctly identified with correct regulatory exposure |
| Remediation prioritization | 10 | Priorities are risk-weighted; estimates are realistic |
| Compliance-engineering translations | 15 | Translations are specific, implementable, and verifiable |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
governance-lab submit --workspace /workspace/
```

Submission includes:
- `/workspace/classification.md`
- `/workspace/gap-analysis.md`
- `/workspace/remediation-plan.md`
- `/workspace/translation.md`

---

## Hints

**"I'm not sure about the EU AI Act tier"**
Focus on whether the system makes employment-related decisions. The EU AI Act's high-risk categories include AI used in "employment, workers management and access to self-employment." Auto-approving expense reports affects employees' access to reimbursement — that's an employment-adjacent decision.

**"I can't find all the gaps"**
Systematically check each tool in the tools list: does the agent actually need this tool? `read_employee_profile` returns the *full* employee record — what does it need from that record? Think about data minimization.

**"The translations feel like I'm restating the gap"**
The compliance requirement should be in policy language ("the system must maintain..."). The engineering implementation should describe a specific code change or architectural addition ("add an append-only audit table with these fields..."). They should read differently.

**"I'm not sure about data residency"**
Look at where the data is stored (AWS us-east-1 = US) and who uses the system (employees in Germany and France = EU residents). Research what GDPR says about data transfers to the US in 2026.
