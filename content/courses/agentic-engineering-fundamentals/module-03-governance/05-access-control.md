# Lesson 3.5: Access Control and Incident Response

**Module**: 3 — Governance and Compliance
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Access control determines what an agent can access. Done well, it limits the blast radius of agent misbehavior — even if an agent is compromised or acts incorrectly, it can only affect what it was explicitly allowed to access.

This lesson covers agent permissions, least privilege, secret management, and incident response: what to do when governance fails.

---

## Agent Identity

Before you can apply access controls, agents need identity. Each agent should have:

```python
@dataclass
class AgentIdentity:
    agent_id: str           # Stable, unique identifier
    name: str               # Human-readable name
    role: str               # Role (researcher, executor, etc.)
    environment: str        # "development", "staging", "production"
    version: str            # Agent version (changes on config updates)
    created_at: str
    permissions: list[str]  # Explicit permission grants
    credential_scope: str   # What credentials this agent can access
```

Agents should use their identity to authenticate when accessing any resource. Resources should verify the identity before granting access.

---

## Permission Model

### Capability-based permissions

Rather than role-based permissions (which grant broad access based on role), capability-based permissions grant specific rights to specific resources:

```python
@dataclass
class AgentPermission:
    permission_id: str
    agent_id: str
    resource: str                           # What resource this applies to
    actions: list[str]                      # What actions are permitted
    conditions: dict                        # Constraints on the permission
    expires_at: str | None                  # Optional expiry
    granted_by: str                         # Who granted this permission
    purpose: str                            # Why this permission was granted

# Example: Research agent permission
ResearchPermission = AgentPermission(
    permission_id="perm_research_webdb_read",
    agent_id="agt_research_worker_01",
    resource="internal-web-database",
    actions=["read"],
    conditions={
        "max_records_per_query": 1000,
        "allowed_tables": ["public_articles", "research_cache"],
        "denied_columns": ["user_ids", "email_addresses"]
    },
    expires_at="2026-12-31T00:00:00Z",
    granted_by="system-admin",
    purpose="Research agent needs read access to article database for competitive analysis tasks"
)
```

### Least privilege in practice

Least privilege means: grant the minimum access required for the task. Not "the agent might need this someday."

**Common mistakes**:
- Giving all agents production database access "just in case"
- Giving executor agents read/write when they only need read
- Granting organization-wide permissions when task-scoped permissions suffice
- Not revoking permissions after a task completes

**Enforcement pattern**:

```python
class TaskScopedPermissionManager:
    """
    Grants permissions for the duration of a specific task,
    then automatically revokes them when the task completes.
    """
    async def grant_task_permissions(
        self,
        agent_id: str,
        task_id: str,
        required_permissions: list[PermissionSpec]
    ) -> TaskPermissionGrant:
        # Validate that required permissions don't exceed what this task type is allowed to request
        approved = await self.validate_permission_request(required_permissions, task_type=task.type)

        grants = []
        for perm in approved:
            grant = await self.permission_store.create(
                agent_id=agent_id,
                resource=perm.resource,
                actions=perm.actions,
                conditions={**perm.conditions, "task_id": task_id},  # Scope to task
                expires_at=(datetime.utcnow() + timedelta(hours=4)).isoformat()  # Auto-expire
            )
            grants.append(grant)

        return TaskPermissionGrant(task_id=task_id, grants=grants)

    async def revoke_task_permissions(self, grant: TaskPermissionGrant) -> None:
        """Call this when the task completes, regardless of success or failure."""
        for grant_item in grant.grants:
            await self.permission_store.revoke(grant_item.permission_id)
```

---

## Secrets Management

Agents often need credentials to access external services: API keys, database passwords, OAuth tokens. How these are managed determines how severely a compromised agent can damage the broader system.

### Never do this

```python
# WRONG: Credentials in code
API_KEY = "sk-prod-abc123xyz..."

# WRONG: Credentials in environment variables visible to all processes
import os
api_key = os.getenv("OPENAI_API_KEY")  # Available to any process on the machine

# WRONG: Credentials in agent context/prompt
system_prompt = f"Your API key is: {secret_api_key}"  # May be logged or leaked
```

### Do this instead

**Secrets vault with short-lived credentials**:

```python
class AgentCredentialManager:
    def __init__(self, vault: SecretsVault, agent_id: str):
        self.vault = vault
        self.agent_id = agent_id

    async def get_credential(
        self,
        service: str,
        task_id: str
    ) -> TemporaryCredential:
        """
        Retrieves a short-lived credential for the specified service.
        The credential expires when the task completes or after max_ttl_seconds.
        """
        # Verify this agent is permitted to access this service
        await self.verify_access(service)

        # Request short-lived credential
        credential = await self.vault.issue_temporary_credential(
            agent_id=self.agent_id,
            service=service,
            purpose=f"task:{task_id}",
            max_ttl_seconds=3600  # 1-hour maximum
        )

        return credential

    async def revoke_credential(self, credential: TemporaryCredential) -> None:
        await self.vault.revoke(credential.credential_id)
```

**Credential scoping**: Each agent should access only the credentials for the services it needs, and those credentials should have the minimum permissions for the service (read-only API key, not write key).

**Audit all credential accesses**: Every time an agent retrieves a credential, log it. If an agent accesses credentials it shouldn't need for its current task, that's a governance signal.

---

## Incident Response

When governance fails — an agent acts outside its permitted scope, accesses data it shouldn't, or causes unintended side effects — you need a response playbook.

### Step 1: Detect

Detection should be automated where possible:

```python
class GovernanceAnomalyDetector:
    async def scan_recent_activity(self, window_minutes: int = 60) -> list[Anomaly]:
        anomalies = []

        # Check for tool calls outside permission scope
        unauthorized_calls = await self.audit_log.query(
            event_type="tool.invoked",
            filter="NOT EXISTS (SELECT 1 FROM permissions WHERE ...)",
            since=datetime.utcnow() - timedelta(minutes=window_minutes)
        )
        if unauthorized_calls:
            anomalies.append(Anomaly(
                type="unauthorized_tool_access",
                severity="critical",
                entries=unauthorized_calls
            ))

        # Check for unusual data access volume
        data_access_counts = await self.audit_log.get_access_counts_per_agent(window_minutes)
        for agent_id, count in data_access_counts.items():
            baseline = await self.get_baseline_access_count(agent_id)
            if count > baseline * 5:  # 5x baseline is anomalous
                anomalies.append(Anomaly(
                    type="unusual_data_access_volume",
                    agent_id=agent_id,
                    severity="high",
                    details=f"{count} accesses vs baseline of {baseline}"
                ))

        return anomalies
```

### Step 2: Contain

When an incident is detected, the first priority is limiting further damage:

```python
async def contain_incident(agent_id: str, incident: GovernanceIncident) -> None:
    # 1. Suspend the agent (no new task assignments)
    await agent_registry.suspend(agent_id, reason=f"Incident: {incident.id}")

    # 2. Terminate active runs
    active_runs = await run_manager.get_active_runs(agent_id)
    for run in active_runs:
        await run_manager.terminate(run.id, reason="Governance incident containment")

    # 3. Revoke all credentials
    credentials = await credential_manager.get_active_credentials(agent_id)
    for credential in credentials:
        await credential_manager.revoke(credential.credential_id)

    # 4. Preserve evidence (don't delete logs)
    await audit_log.freeze(agent_id)  # Mark as incident-related, prevent deletion

    # 5. Alert
    await incident_notifier.alert(
        severity=incident.severity,
        summary=f"Agent {agent_id} suspended: {incident.description}",
        audit_trail_url=f"/audit/{incident.id}"
    )
```

### Step 3: Investigate

With the agent contained, investigate what happened:

**Forensic audit trail query**:

```sql
-- Reconstruct complete timeline of agent actions during incident window
SELECT
    timestamp,
    event_type,
    payload->>'tool_name' as tool,
    payload->>'input' as input_summary,
    payload->>'output_summary' as output_summary
FROM audit_log
WHERE agent_id = 'agt_compromised_agent'
AND timestamp BETWEEN '2026-03-25T10:00:00Z' AND '2026-03-25T12:00:00Z'
ORDER BY timestamp ASC;
```

**Impact assessment**:
- What data was accessed?
- What external systems were called?
- What was written or deleted?
- Were other agents involved (did this agent delegate work or share state)?

### Step 4: Recover

```python
async def recover_from_incident(incident: GovernanceIncident) -> RecoveryReport:
    recovery_actions = []

    # Reverse reversible actions
    reversible_actions = [a for a in incident.agent_actions if a.is_reversible]
    for action in reversible_actions:
        await action.rollback()
        recovery_actions.append(f"Rolled back: {action.description}")

    # Notify affected parties
    affected_users = await identify_affected_users(incident)
    if affected_users:
        await send_incident_notifications(affected_users, incident)
        recovery_actions.append(f"Notified {len(affected_users)} affected users")

    # Update guardrails to prevent recurrence
    root_cause = await analyze_root_cause(incident)
    await update_guardrails(root_cause)
    recovery_actions.append(f"Updated guardrails for root cause: {root_cause.description}")

    return RecoveryReport(
        incident_id=incident.id,
        actions_taken=recovery_actions,
        root_cause=root_cause,
        recurrence_prevention=root_cause.prevention_measures
    )
```

---

## Module 3 Key Takeaways

1. Governance is a stack: policy → guardrails → audit → HITL → incident response
2. Guardrails are enforced in infrastructure, not LLM instructions — 5 types: input validation, output filtering, action scope limits, budget caps, topic restrictions
3. Audit trails are structured, complete, tamper-evident, attributable, and queryable
4. HITL uses escalation triggers to route high-risk actions to human reviewers, with explicit timeout handling
5. Least privilege: agents access only what they need, only for the duration of the task
6. Incident response: detect, contain, investigate, recover — in that order

---

*Module 3 complete. Proceed to the [Module 3 Assessment](assessment.json) and [Module 3 Lab](lab.md) before continuing to Module 4.*
