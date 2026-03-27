# Module 5 Lab: Build a Governance Operating Model

**Module**: 5 — Building a Governance Operating Model
**Estimated time**: 60–75 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

RetailCorp has been running three agentic systems in production for 6 months with minimal governance. A recent near-miss (an agent almost sent promotional emails to 50,000 customers with incorrect discount codes before a human noticed) has prompted leadership to invest in governance. You have been brought in to:

1. **Assess** RetailCorp's current governance maturity against the AGMM
2. **Design** a governance board for RetailCorp's context
3. **Draft** a policy-as-code rule for the email campaign agent
4. **Build** the incident response playbook for the near-miss scenario
5. **Produce** a 12-month governance roadmap

---

## Scenario: RetailCorp's Agentic Systems

RetailCorp operates three production agents:

**CampaignAgent**: Generates and sends email marketing campaigns. Can send to customer segments of up to 50,000 recipients. Uses A/B testing. No approval gate — campaigns are auto-approved if predicted open rate exceeds 12%. Current monitoring: weekly log review.

**InventoryAgent**: Manages inventory reordering. Can place purchase orders up to $20,000 without approval. Has access to all product catalog and inventory records. Has sent 3 incorrect purchase orders in 6 months (wrong quantities). Monitoring: daily dashboard.

**SupportAgent**: Handles customer support tickets. Has access to full customer records including order history, payment methods (masked), and personal information. Has sent 2 responses to the wrong customers (data cross-contamination). No guardrails for PII in outputs. Monitoring: none.

**Context**:
- 2 engineers own all three agents
- No dedicated security or compliance staff for AI systems
- DPO was recently hired; first AI governance review scheduled for next month
- EU customers: ~30% of customer base
- No governance board exists

---

## Part 1: AGMM Assessment (15 minutes)

In `/workspace/maturity-assessment.md`, score RetailCorp against the AGMM:

```markdown
## AGMM Assessment: RetailCorp

| Dimension | Current Level | Evidence | Primary Gap |
|-----------|--------------|---------|------------|
| Policy & Design | | | |
| Runtime Controls | | | |
| Audit & Observability | | | |
| Human Oversight | | | |
| Organizational Process | | | |

**Overall Maturity Level**: [the lowest score determines overall level]
**Priority Gap**: [the single highest-risk governance gap]
```

For each dimension, provide 2-3 sentences of evidence from the scenario description that support your rating.

---

## Part 2: Governance Board Design (15 minutes)

In `/workspace/governance-board.md`, design a practical governance board for RetailCorp.

Given that RetailCorp has:
- 2 engineers owning all agents
- A newly hired DPO
- No security staff for AI
- Leadership attention triggered by the near-miss

Design a governance board that:
1. Can function with RetailCorp's current resources
2. Has the minimum required cross-functional membership for the agents in production
3. Defines decision authority for the three specific agents described
4. Has a cadence that is sustainable given that the engineers own all three agents

Include:
- Membership table (role, voting/advisory, currently filled by whom or "TBH")
- Decision authority matrix for at least 6 decisions
- Meeting cadence and agenda structure
- One enforcement mechanism that can be implemented within 30 days

---

## Part 3: Policy-as-Code for CampaignAgent (15 minutes)

The near-miss with CampaignAgent exposed that the auto-approval condition ("predicted open rate > 12%") is insufficient. A discount campaign with incorrect codes would have passed this test.

In `/workspace/campaign-policy.yaml`, write a configuration-as-policy file for CampaignAgent that:
1. Adds a human approval requirement for campaigns with >5,000 recipients
2. Adds a discount code validation check as a required pre-send step
3. Sets a maximum send rate (emails per hour) to limit blast radius
4. Requires all campaigns be logged with full recipient segment specification

Then in `/workspace/campaign-policy-tests.py`, write at least 3 test cases that verify:
- Campaign to 3,000 recipients does NOT trigger approval gate
- Campaign to 10,000 recipients DOES trigger approval gate
- Campaign with discount code "INVALID-CODE-999" is blocked before sending

---

## Part 4: Incident Response Playbook (10 minutes)

The near-miss scenario: CampaignAgent was about to send 50,000 emails with the wrong discount code "SUMMER10" when it should have been "SUMMER15."

In `/workspace/incident-playbook.md`, write the incident response playbook for this specific scenario type: "Campaign with incorrect content about to be sent or already sent."

Required sections:
1. Detection sources (how would this be caught in your new governance system?)
2. Immediate containment steps (ordered list, with specific commands if applicable)
3. Investigation questions (what do you need to determine from the audit trail?)
4. Remediation steps for: (a) caught before send, (b) partially sent to 5,000 recipients
5. Regulatory considerations (is this a GDPR data incident? Why or why not?)
6. Post-incident review action items (3 specific items with owners)

---

## Part 5: 12-Month Governance Roadmap (5 minutes)

In `/workspace/roadmap.md`, produce a prioritized 12-month roadmap for RetailCorp using the AGMM milestone structure.

Given resource constraints (2 engineers, limited budget), prioritize ruthlessly:

```markdown
## RetailCorp Governance Roadmap

### Months 1–3: [Theme]
Priority: [what is most urgent and why]

Must-have milestones:
- [ ] [Milestone]
- [ ] [Milestone]
- [ ] [Milestone]

Success criteria: [How would you know Month 3 is complete?]

### Months 4–6: [Theme]
...

### Months 7–12: [Theme]
...
```

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| AGMM assessment | 20 | Ratings are supported by specific evidence; primary gap is correctly identified |
| Governance board design | 20 | Practical for RetailCorp's resources; decision authority is specific; enforcement mechanism is implementable |
| Policy-as-code + tests | 25 | YAML policy addresses near-miss scenario; tests are specific and pass |
| Incident playbook | 20 | Specific commands where applicable; both scenarios (pre/post send) addressed; regulatory analysis is accurate |
| 12-month roadmap | 15 | Priorities are risk-weighted; milestones are specific; success criteria are measurable |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
governance-lab submit --workspace /workspace/
```

---

## Hints

**"The AGMM assessment feels subjective"**
Ground each rating in specific evidence from the scenario. "No approval gate" → Level 0 for Human Oversight. "Weekly log review with no real-time monitoring" → Level 1 for Audit & Observability. "No governance board exists" → Level 0 for Organizational Process. Be specific.

**"The governance board feels over-staffed for a small team"**
RetailCorp can use a 'light' governance board. The DPO and one of the two engineers, with a business stakeholder from marketing (who is the primary user of CampaignAgent), gives you cross-functional representation. Add CISO capacity if available. A 3-person governance board that actually meets and makes decisions beats a 10-person board that exists on paper.

**"I'm not sure whether the near-miss is a GDPR incident"**
Ask: was personal data disclosed to unauthorized parties? An email with an incorrect discount code, sent to the correct customer, does not involve unauthorized disclosure of personal data. An email sent to the *wrong* customer (as happened with SupportAgent) potentially does. Think carefully about which scenario you're analyzing.

**"The policy tests seem trivial"**
Test the boundary conditions: exactly at the threshold (4,999 recipients, 5,000 recipients, 5,001 recipients). Test that the discount code validation actually rejects the specific code "INVALID-CODE-999" and does NOT reject a valid code.
