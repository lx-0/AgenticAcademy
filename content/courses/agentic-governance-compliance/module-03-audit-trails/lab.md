# Module 3 Lab: Audit Trail Forensics

**Module**: 3 — Audit Trails and Observability for Compliance
**Estimated time**: 60–75 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

An incident has occurred at HealthCorp: their patient triage agent incorrectly prioritized a patient as "low urgency" who later required emergency care. The compliance team needs your help to reconstruct what happened, identify the audit trail gaps, and produce a compliance report for the hospital's legal team.

You will:
1. **Reconstruct** the incident timeline from available audit data
2. **Identify** audit trail gaps that prevented full reconstruction
3. **Assess** the chain integrity of the available records
4. **Draft** a decision provenance record for the triage decision
5. **Identify** improvements to prevent future audit trail gaps

---

## Scenario: HealthCorp TriageAgent Incident

HealthCorp's `TriageAgent` processes incoming patient intake forms and assigns urgency classifications: `critical`, `urgent`, `moderate`, `low`. Classifications drive how quickly patients are seen.

On March 22, 2026, patient ID P-48291 presented with symptoms consistent with cardiac distress. `TriageAgent` classified the patient as "low urgency." The patient was seen 4 hours later and required emergency intervention.

The compliance team has provided you with the available audit data in `/sandbox/incident-data/`.

---

## Part 1: Incident Timeline Reconstruction (25 minutes)

### Step 1.1: Examine available audit data

```bash
$ audit-lab load --incident-dir /sandbox/incident-data/
```

The sandbox will provide:
- `agent_events.json` — structured audit log for the TriageAgent on March 22
- `tool_call_log.csv` — raw tool call records
- `approval_records.json` — HITL approval records for the day

### Step 1.2: Reconstruct the timeline

In `/workspace/incident-timeline.md`, reconstruct the sequence of events for patient P-48291:

```markdown
## Incident Timeline: Patient P-48291

| Time (UTC) | Event | Source | Confidence |
|------------|-------|--------|------------|
| 09:14:22 | | | |
| ... | | | |
```

Use confidence levels:
- **High**: Event is directly recorded in audit data
- **Medium**: Event is inferred from surrounding records
- **Low**: Event is assumed based on agent design but not recorded

### Step 1.3: Identify what you cannot reconstruct

List the gaps: events that you believe occurred but cannot verify from the audit data. For each gap, note what audit record *should have existed*.

---

## Part 2: Audit Trail Gap Analysis (20 minutes)

### Step 2.1: Check chain integrity

```bash
$ audit-lab verify-integrity --log /sandbox/incident-data/agent_events.json
```

Record what the integrity check reports. If violations are found, document:
- Which records have broken chain links
- The timestamps of the gap
- What this means for the evidentiary value of records before and after the gap

### Step 2.2: Completeness assessment

Review the event types present in the audit data. Based on the compliance log schema from Lesson 3.2, identify missing event types. The triage workflow should include:

- Intake form received
- Patient data accessed (what fields, what values — or hashes)
- Policy criteria evaluated (each criterion separately)
- Classification decision made with reasoning summary
- Patient notified of classification

Which of these are present? Which are absent?

### Step 2.3: Attribution assessment

Review the attribution fields in available records:
- Are all records attributed to a specific agent run?
- Are tool call records linked to the run that triggered them?
- Is the model version recorded for the triage decision?

Document any attribution gaps.

---

## Part 3: Decision Provenance Reconstruction (15 minutes)

Based on the available data, reconstruct as complete a decision provenance record as possible for the P-48291 triage decision.

In `/workspace/provenance-record.json`, fill in as much of this template as the data supports. Mark fields you cannot fill as `"DATA_UNAVAILABLE"`:

```json
{
  "decision_id": "DATA_UNAVAILABLE or value",
  "agent_id": "",
  "run_id": "",
  "timestamp": "",
  "decision_type": "triage_urgency_classification",
  "decision_outcome": "",
  "inputs_considered": [],
  "criteria_applied": [],
  "reasoning_summary": "DATA_UNAVAILABLE or reconstructed summary",
  "policy_version_at_decision": "DATA_UNAVAILABLE or value",
  "model_id": "",
  "model_version_at_decision": ""
}
```

After completing the template, answer:
1. Could this provenance record be used to respond to a GDPR Article 22 request from the patient?
2. Is the provenance record sufficient to determine whether the triage decision was consistent with HealthCorp's triage policy?

---

## Part 4: Compliance Report Draft (15 minutes)

HealthCorp's legal team needs a compliance report to share with their insurer and, potentially, with the patient's legal counsel.

In `/workspace/compliance-report.md`, draft a 400–600 word report including:

1. **Incident summary**: What happened, when, and what we know from the audit data
2. **Audit trail status**: What is confirmed by records vs. what is reconstructed or assumed
3. **Chain integrity status**: Whether the available records are tamper-evident
4. **Decision provenance**: What we can and cannot say about why the agent made its decision
5. **Identified gaps**: What audit infrastructure was missing and what it prevented us from knowing
6. **Recommendations**: Three specific improvements to prevent future audit gaps

**Format requirement**: The report must be written for a non-technical audience (insurance adjusters and legal counsel). Technical implementation details belong in an appendix, not the main report.

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| Incident timeline | 20 | Events correctly ordered; confidence levels accurate; gaps clearly identified |
| Audit trail gap analysis | 30 | Chain integrity interpreted correctly; missing event types identified; attribution gaps documented |
| Decision provenance record | 25 | Template filled to maximum extent possible; DATA_UNAVAILABLE fields are actually unavailable; post-completion questions answered accurately |
| Compliance report | 25 | Non-technical audience appropriate; all 5 sections present; recommendations are specific and implementable |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
audit-lab submit --workspace /workspace/
```

---

## Hints

**"The chain integrity check shows a gap in the middle of the audit log"**
A chain integrity gap means the hash of one record does not match the `previous_event_hash` of the next record. This could indicate: (a) a record was deleted or modified, (b) a record was inserted out of order, or (c) a logging failure caused records to be lost. All three have different implications for the reliability of surrounding records. Document all three possibilities.

**"I can't find the policy criteria that were applied"**
The absence of policy criterion evaluation records is itself a finding. Note it as a gap in the audit trail. If the agent was evaluating criteria but not logging the evaluations, this is a structured logging design failure.

**"The compliance report feels too technical"**
Remove all code, JSON, and implementation terminology. Replace with plain language: "the system has a record of" instead of "the audit log contains an event of type tool_call_executed." The test: would a hospital CFO who has never heard of an audit log understand every sentence?

**"I'm not sure what 'three specific improvements' means"**
Specific means: name the specific audit record type that was missing, explain what it would have contained, and describe where in the agent code it should have been logged. Vague improvements like "improve logging" do not score points.
