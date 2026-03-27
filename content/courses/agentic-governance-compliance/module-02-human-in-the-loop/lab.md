# Module 2 Lab: Design and Implement a HITL Control System

**Module**: 2 — Designing Human-in-the-Loop Controls
**Estimated time**: 75–90 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

You are inheriting an HR onboarding agent that has no HITL controls. The agent automates several steps of employee onboarding, including some high-stakes actions. Your job is to:

1. **Classify** the agent's actions using the Impact × Uncertainty matrix
2. **Design** a HITL control plan with appropriate approval gates and escalation paths
3. **Implement** approval gate triggers and context packages for the two highest-risk actions
4. **Write** tests verifying the HITL controls activate correctly

---

## Scenario: OnboardingAgent at TalentCorp

TalentCorp uses `OnboardingAgent` to automate new employee onboarding. The agent has the following capabilities:

```python
ONBOARDING_AGENT_TOOLS = [
    # Identity and access
    "create_employee_record(name, email, start_date, department, salary)",
    "provision_sso_account(employee_id, email, role)",
    "assign_role_permissions(employee_id, permission_groups: list)",
    "revoke_access(employee_id, reason)",

    # Communication
    "send_welcome_email(employee_id, template)",
    "send_it_setup_instructions(employee_id)",
    "notify_manager(manager_id, message)",
    "notify_payroll(employee_id, start_date, salary)",

    # Equipment and facilities
    "submit_equipment_request(employee_id, items: list)",
    "assign_desk(employee_id, building, floor)",

    # HR systems
    "enroll_benefits(employee_id, plan_selections)",
    "set_probation_period(employee_id, duration_days)",
    "update_employee_status(employee_id, status)",  # active, on_leave, terminated
]
```

The agent processes onboarding tickets submitted by HR coordinators. Each ticket includes: employee details, role, department, manager, and start date.

---

## Part 1: Action Classification (20 minutes)

### Step 1.1: Complete the action classification matrix

In `/workspace/action-classification.md`, classify each of the 14 tools above using the Impact × Uncertainty matrix from Lesson 2.1:

```markdown
| Tool | Impact (Low/Med/High) | Uncertainty (Low/High) | Treatment |
|------|----------------------|----------------------|-----------|
| create_employee_record | | | |
| provision_sso_account | | | |
| assign_role_permissions | | | |
| revoke_access | | | |
| send_welcome_email | | | |
| send_it_setup_instructions | | | |
| notify_manager | | | |
| notify_payroll | | | |
| submit_equipment_request | | | |
| assign_desk | | | |
| enroll_benefits | | | |
| set_probation_period | | | |
| update_employee_status | | | |
```

Fill in the Treatment column with: `auto-approve`, `auto+log`, `require-approval`, or `escalate`.

**Hint**: Pay special attention to `revoke_access` and `update_employee_status`. These affect an employee's ability to work. Think about the consequences of the agent calling these with incorrect parameters.

### Step 1.2: Identify the two highest-risk actions

Write a 100-word justification for each of your two selected highest-risk actions in `/workspace/action-classification.md`. Include:
- Why the impact is High
- What specifically could go wrong
- Why this warrants a HITL gate rather than just logging

---

## Part 2: HITL Control Plan (25 minutes)

In `/workspace/hitl-plan.md`, design the HITL control system for OnboardingAgent.

### Step 2.1: Approval threshold design

For each "require-approval" action, define the threshold configuration:

```markdown
### Action: [tool name]

**Threshold type**: [value-based / action-type / combination / frequency-based]
**Threshold definition**: [the specific condition that triggers approval]
**Auto-approve conditions**: [if any — when would this action NOT require approval?]
**Escalation trigger**: [what condition escalates beyond tier-1 review?]
```

### Step 2.2: Escalation routing table

Define the escalation routing for each approval-required action:

```markdown
| Action | Tier-1 Reviewer | Tier-1 Timeout | Tier-2 Reviewer | Terminal Behavior |
|--------|----------------|----------------|----------------|------------------|
| | | | | |
```

Terminal behavior options: `auto-reject`, `auto-approve` (only for low-risk), `alert-system-owner`.

### Step 2.3: Fallback design

For each approval-required action, define what happens if:
- The approval system is unavailable
- The approval request expires without a response
- The reviewer rejects the action

---

## Part 3: Implement the Two Highest-Risk HITL Gates (30 minutes)

The sandbox provides a base `OnboardingAgent` class. In `/workspace/hitl-implementation.py`, implement approval gate logic for your two highest-risk actions.

### Step 3.1: Implement the approval gate triggers

```python
# Base implementation — add your HITL gates here
class OnboardingAgent:
    def __init__(self, approval_gate, audit_log):
        self.approval_gate = approval_gate
        self.audit_log = audit_log

    def revoke_access(self, employee_id: str, reason: str):
        # TODO: Implement HITL gate for this action
        # 1. Build an ApprovalRequest with all five elements
        # 2. Submit to approval_gate
        # 3. Pause execution until approved/rejected
        # 4. Log the outcome
        pass

    def update_employee_status(self, employee_id: str, status: str):
        # TODO: Implement HITL gate for this action
        # Consider: does this gate need different thresholds for different
        # status values? (setting 'on_leave' vs setting 'terminated')
        pass
```

### Step 3.2: Implement the approval context packages

For each gate, implement the `_build_approval_request` helper:

```python
def _build_revoke_access_approval_request(
    self,
    employee_id: str,
    reason: str,
    run_id: str
) -> ApprovalRequest:
    # TODO: Build an ApprovalRequest with:
    # - Plain language action description
    # - Agent's reasoning context
    # - Consequences if approved (including irreversibility note)
    # - Consequences if rejected (fallback behavior)
    # - Deadline based on urgency
    # - Priority level
    pass
```

Validate your implementation runs without errors:

```bash
$ hitl-lab validate --implementation /workspace/hitl-implementation.py
```

---

## Part 4: Write HITL Tests (15 minutes)

In `/workspace/test_hitl_controls.py`, write tests covering:

1. **Trigger test**: verify your gate activates for the action
2. **Context test**: verify the approval request contains all five elements
3. **No-trigger test**: verify a safe version of the action does NOT trigger the gate (if applicable)
4. **Fallback test**: verify the action blocks (not auto-executes) when the approval system is unavailable

Run your tests:

```bash
$ hitl-lab test --test-file /workspace/test_hitl_controls.py
```

All 4 tests must pass.

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| Action classification matrix | 20 | All 14 tools correctly classified; justification is specific |
| Top-2 risk justification | 15 | Impact and failure mode analysis is accurate and specific |
| HITL control plan | 25 | Thresholds defined; routing table complete; fallback behavior specified for all scenarios |
| Approval gate implementation | 25 | Gates trigger correctly; ApprovalRequest has all 5 elements; execution pauses for approval |
| HITL tests | 15 | All 4 test categories present and passing |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
hitl-lab submit --workspace /workspace/
```

---

## Hints

**"I'm not sure whether `revoke_access` or `update_employee_status` is higher risk"**
Think about reversibility and scope of impact. Revoking an active employee's access locks them out immediately. Setting status to "terminated" may trigger payroll and benefits terminations across multiple systems. Both are high-impact and require approval. Write your justification around the specific failure scenario.

**"My approval context package feels generic"**
Include the employee's name, role, and department in the action description. Include what the agent's reasoning was for this decision (not just what it wants to do). Generic approvals get rubber-stamped; specific ones get reviewed.

**"My test for 'approval system unavailable' is failing"**
Check that your implementation handles `ApprovalSystemUnavailableError` specifically and returns a blocked status rather than catching all exceptions silently. Silent exception handling is the anti-pattern here.

**"I'm not sure what terminal behavior to use"**
For high-impact irreversible actions, terminal behavior must be `auto-reject`. Never `auto-approve` for actions that cannot be undone.
