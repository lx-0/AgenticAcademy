# Module 3 Lab: Contain the Rogue Agent

**Module**: 3 — Governance and Compliance
**Estimated time**: 75–90 minutes
**Environment**: Cloud sandbox (no local setup required)

---

## Lab Overview

You receive a pre-built "rogue agent" scenario: an agent that attempts to send emails, modify files outside its authorized scope, and invoke APIs it was not granted access to. Your job is to:

1. **Implement** a policy enforcement layer that blocks all 5 unauthorized action types
2. **Produce** a structured audit log for each blocked attempt
3. **Route** a designated high-risk action to a human approval queue with a 5-minute timeout and fallback behavior

---

## Scenario

A customer data processing agent has been deployed with overly broad capabilities. Security review identified 5 unauthorized action types it is attempting to perform:

1. `email.send_external` — Sending emails to addresses outside @company.internal
2. `file.write` — Writing files outside `/workspace/output/` (its designated output directory)
3. `database.query_pii_table` — Querying the `customers` table (not in its authorized table list)
4. `api.call_competitor` — Calling the competitor price-monitoring API (unauthorized external service)
5. `agent.delegate_to_unverified` — Delegating tasks to agents not in the approved delegation list

The rogue agent script is pre-loaded in your sandbox and runs on demand. Your enforcement layer must intercept all 5 action types and block/log them.

---

## Setup

```bash
$ governance-lab status
✓ RogueAgent: loaded (will attempt all 5 unauthorized actions when triggered)
✓ Enforcement layer scaffold: /workspace/enforcement/
✓ Audit log store: ready
✓ Approval queue: ready (connected to mock reviewer)
✓ Test harness: ready

# Run the rogue agent WITHOUT enforcement (observe the unauthorized actions)
$ governance-lab run --no-enforcement --verbose
```

You'll see the agent successfully perform all 5 unauthorized actions. Your job is to implement the enforcement layer so none of them succeed.

---

## Part 1: Implement the Policy Enforcement Layer (45 minutes)

### Step 1.1: Define the policy

In `/workspace/enforcement/policy.py`, define the tool use policy for this agent:

```python
AGENT_POLICY = {
    "agent_id": "agt_customer_data_processor",

    # Email: only internal recipients
    "email.send": {
        "allowed": True,
        "conditions": {
            "recipient_domain_must_match": "@company.internal"
        }
    },

    # File writes: only in designated output directory
    "file.write": {
        "allowed": True,
        "conditions": {
            "path_must_start_with": "/workspace/output/"
        }
    },

    # Database: specific tables only, read-only
    "database.query": {
        "allowed": True,
        "conditions": {
            "allowed_tables": ["orders", "products", "categories"],
            "operations_allowed": ["SELECT"],
            "denied_tables": ["customers", "users", "employees", "payments"]
        }
    },

    # External API: whitelist of approved services only
    "api.call_external": {
        "allowed": True,
        "conditions": {
            "approved_services": ["analytics-api.company.internal", "reporting-api.company.internal"]
        }
    },

    # Delegation: only to pre-approved agents
    "agent.delegate": {
        "allowed": True,
        "conditions": {
            "approved_agent_ids": [
                "agt_formatter_01",
                "agt_validator_02",
                "agt_notifier_internal_03"
            ]
        }
    }
}
```

### Step 1.2: Implement the enforcement layer

In `/workspace/enforcement/enforcer.py`, implement the `PolicyEnforcer` class:

```python
class PolicyEnforcer:
    def __init__(self, policy: dict, audit_logger: AuditLogger):
        self.policy = policy
        self.audit = audit_logger

    async def check_action(
        self,
        action_type: str,
        action_params: dict,
        agent_id: str,
        task_id: str,
        run_id: str
    ) -> EnforcementDecision:
        """
        Check whether the proposed action is allowed under policy.
        Log all decisions — allowed and blocked.
        """
        # TODO: Look up the policy rule for action_type
        # TODO: If no rule found, DENY (default-deny)
        # TODO: Check each condition in the rule
        # TODO: Log the decision with full context
        # TODO: Return EnforcementDecision(allowed=bool, reason=str, audit_id=str)
        pass
```

Implement enforcement for each of the 5 action types:

- `email.send_external`: Check that `params["recipient"]` ends with `@company.internal`
- `file.write`: Check that `params["path"]` starts with `/workspace/output/`
- `database.query_pii_table`: Check that `params["table"]` is in `allowed_tables` and not in `denied_tables`
- `api.call_competitor`: Check that `params["service"]` is in `approved_services`
- `agent.delegate_to_unverified`: Check that `params["target_agent_id"]` is in `approved_agent_ids`

### Step 1.3: Connect the enforcer to the rogue agent

The rogue agent makes action requests through a hook system. Connect your enforcer to the hook:

```python
# In /workspace/enforcement/hooks.py
from enforcement.enforcer import PolicyEnforcer

enforcer = PolicyEnforcer(
    policy=AGENT_POLICY,
    audit_logger=AuditLogger(store=audit_log_store)
)

async def pre_action_hook(action_type: str, params: dict, context: ActionContext) -> HookResult:
    """Called before every agent action."""
    decision = await enforcer.check_action(
        action_type=action_type,
        action_params=params,
        agent_id=context.agent_id,
        task_id=context.task_id,
        run_id=context.run_id
    )

    if not decision.allowed:
        return HookResult(
            proceed=False,
            response=f"Action blocked by policy: {decision.reason}",
            audit_id=decision.audit_id
        )

    return HookResult(proceed=True)
```

### Step 1.4: Run the enforcement test

```bash
governance-lab run --enforcement-enabled --verbose
```

Expected output:
```
Action: email.send to external@competitor.com
→ BLOCKED: recipient must be @company.internal | audit_id: evt_001
Action: file.write to /etc/cron.d/malicious
→ BLOCKED: path must start with /workspace/output/ | audit_id: evt_002
Action: database.query on table=customers
→ BLOCKED: table 'customers' is in denied_tables | audit_id: evt_003
Action: api.call to competitor-prices.io
→ BLOCKED: service not in approved list | audit_id: evt_004
Action: agent.delegate to agt_unknown_external
→ BLOCKED: target agent not in approved delegation list | audit_id: evt_005

Blocked 5/5 unauthorized actions ✓
```

---

## Part 2: Audit Log Output (15 minutes)

### Step 2.1: Verify audit log entries

```bash
governance-lab show-audit-log --run-id <your-run-id>
```

Each blocked action should produce a compliant audit log entry. Check that each entry includes:

- `event_type`: `"guardrail.triggered"`
- `agent_id`, `task_id`, `run_id`
- `timestamp` in ISO 8601 UTC
- `payload.guardrail_name`: which policy rule fired
- `payload.action_attempted`: the action type
- `payload.blocked_params`: the parameters that violated policy (without any secrets)
- `payload.block_reason`: human-readable explanation
- `payload.severity`: "high" or "critical"

### Step 2.2: Fix any non-compliant entries

The test harness will check each entry against the required schema. Fix any fields that are missing or incorrectly formatted.

```bash
governance-lab validate-audit-log --run-id <your-run-id>
```

Expected: `5/5 audit entries pass schema validation ✓`

---

## Part 3: Human-in-the-Loop for High-Risk Action (20 minutes)

The `database.query_pii_table` action has been re-classified as a potential HITL case rather than a hard block: in some emergency scenarios, a supervisor might need to authorize a PII table query.

### Step 3.1: Implement the HITL flow

Modify your enforcer to route `database.query_pii_table` to the approval queue:

```python
# When the blocked action type is "database.query" and table is in denied_tables:
# Instead of immediately blocking, route to HITL if it's a "pii_access_request"

async def handle_pii_query_attempt(
    self,
    params: dict,
    context: ActionContext
) -> EnforcementDecision:
    """
    Route PII table access requests to human approval queue.
    Auto-reject after 5 minutes if no response.
    """
    # TODO: Create approval request with full context
    # TODO: Send to approval queue
    # TODO: Wait for approval decision with 5-minute timeout
    # TODO: If approved: return EnforcementDecision(allowed=True, approved_by=reviewer_id)
    # TODO: If rejected/timeout: return EnforcementDecision(allowed=False, reason=...)
    pass
```

### Step 3.2: Test with mock reviewer

The sandbox includes a mock reviewer that will automatically approve or reject based on configuration:

```bash
# Test auto-reject (default — simulates no reviewer response)
governance-lab run-hitl-test --reviewer-response timeout

# Expected: PII query auto-rejected after 5 minutes
# Audit log should show: event_type="hitl.timeout", action="auto_rejected"

# Test manual approval
governance-lab run-hitl-test --reviewer-response approve --reviewer-id "mock-supervisor"

# Expected: PII query approved
# Audit log should show: event_type="hitl.approved", approved_by="mock-supervisor"
```

---

## Grading Rubric

| Component | Points | Criteria |
|-----------|--------|----------|
| Blocks 5/5 unauthorized actions | 40 | All 5 action types correctly blocked |
| Audit log — 5/5 entries pass schema | 20 | Each entry has required fields and correct format |
| HITL implementation — timeout rejects | 20 | PII query auto-rejected after 5 minutes |
| HITL implementation — approval works | 10 | PII query proceeds when mock reviewer approves |
| Default-deny policy | 10 | Actions not in policy are denied, not allowed |
| **Total** | **100** | **Passing: 70/100** |

---

## Submission

```bash
governance-lab submit \
  --enforcement /workspace/enforcement/ \
  --audit-log-run-id <your-run-id>
```

---

## Hints

**"My enforcer passes the first 4 actions but fails on delegate"**
Check that you're looking up `params["target_agent_id"]`, not `params["agent_id"]` or `params["delegate_to"]`. Run `governance-lab show-action-params --type agent.delegate` to see exact parameter names.

**"My audit entries fail schema validation on severity field"**
The `severity` field must be one of: `"low"`, `"medium"`, `"high"`, `"critical"`. Email and file path violations = `"high"`. Database PII access = `"critical"`. API external call = `"high"`. Unverified delegation = `"critical"`.

**"My HITL times out instantly instead of waiting 5 minutes"**
Check that your timeout is set to `300` seconds (not `5` or `0.5`). The mock reviewer introduces realistic delays.

**"I want to test what happens when an action is NOT in the policy at all"**
Add a custom action type to the rogue agent: `governance-lab add-custom-action --type unknown.custom`. Your enforcer should deny it by default. If it allows it, your default-deny logic needs fixing.
