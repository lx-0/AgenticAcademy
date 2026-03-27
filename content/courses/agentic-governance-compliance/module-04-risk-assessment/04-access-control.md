# Lesson 4.4: Access Control and Least Privilege

**Module**: 4 — Risk Assessment and Agent Boundaries
**Estimated reading time**: ~18 minutes
**Level**: Intermediate–Advanced

---

## Overview

Access control for agentic systems is more complex than for traditional software because agent access needs vary dynamically by task context, not just by static role. This lesson covers access control models designed specifically for agents, and how to implement least privilege in practice.

---

## Why Static RBAC Is Insufficient for Agents

Role-Based Access Control (RBAC) assigns permissions to roles, and users are assigned to roles. For traditional software, this works well: a "finance analyst" role has read access to financial reports.

For agents, RBAC falls short because:

**Task-context dependency**: An agent processing invoice A should only have access to data relevant to invoice A — not all invoices, even within the same role. Static RBAC grants access to the entire category.

**Dynamic capability requirements**: Different runs of the same agent may require different capabilities depending on what task they are processing. A customer support agent handling a billing dispute needs payment record access. The same agent handling a product question does not.

**Separation of concerns**: The agent itself is not a user. The human who authorized the agent run, the task the agent is performing, and the data the agent is processing all contribute to what access is appropriate.

---

## The Context-Based Access Model for Agents

Instead of assigning permissions to agent roles, assign permissions to execution contexts:

```python
@dataclass
class AgentExecutionContext:
    """
    Defines what an agent is authorized to do for a specific task instance.
    Created fresh for each run; not a static role assignment.
    """
    run_id: str
    agent_id: str
    agent_role: str             # Still useful as a baseline

    # Task context — drives dynamic permission grants
    task_id: str
    task_type: str              # "invoice_processing" | "customer_support" | etc.
    task_scope_ids: list[str]   # Specific record IDs in scope for this task

    # Human authorization context
    authorized_by_user_id: str
    authorization_level: str    # "self_service" | "manager" | "admin"
    authorization_timestamp: datetime

    # Derived permissions (computed from task context + agent role)
    permitted_tools: list[str]
    permitted_data_scope: DataScope
    permitted_action_types: list[str]

    # Constraints
    max_financial_impact_usd: float
    requires_approval_above_usd: float
    valid_until: datetime        # Context expires with the task
```

The key insight: `permitted_tools` and `permitted_data_scope` are derived from the specific task, not from a static role. An invoice-processing run is granted access to the specific invoice in scope, not all invoices.

---

## Implementing Least Privilege in Practice

### Principle 1: Scope Access to the Current Task

```python
def create_execution_context(
    agent_id: str,
    task: Task,
    authorizing_user: User
) -> AgentExecutionContext:
    """
    Create a minimal-privilege execution context for the specific task.
    """
    # Derive base permissions from agent role
    base_permissions = AGENT_ROLE_PERMISSIONS[agent_id]

    # Narrow permissions based on task type
    task_specific_permissions = TASK_PERMISSION_MAP[task.task_type]

    # Intersect (take the more restrictive set)
    permitted_tools = set(base_permissions.tools) & set(task_specific_permissions.tools)

    # Scope data access to specific records in this task
    data_scope = DataScope(
        invoice_ids=[task.invoice_id] if task.task_type == "invoice_processing" else [],
        customer_ids=[task.customer_id] if task.customer_id else [],
        document_ids=task.document_ids if hasattr(task, 'document_ids') else []
    )

    return AgentExecutionContext(
        run_id=str(uuid.uuid4()),
        agent_id=agent_id,
        task_id=task.id,
        task_type=task.task_type,
        task_scope_ids=data_scope.all_ids(),
        authorized_by_user_id=authorizing_user.id,
        authorization_level=authorizing_user.authorization_level,
        authorization_timestamp=datetime.utcnow(),
        permitted_tools=list(permitted_tools),
        permitted_data_scope=data_scope,
        permitted_action_types=task_specific_permissions.action_types,
        max_financial_impact_usd=task_specific_permissions.max_financial_impact,
        requires_approval_above_usd=task_specific_permissions.approval_threshold,
        valid_until=datetime.utcnow() + timedelta(hours=task.expected_duration_hours * 2)
    )
```

### Principle 2: Time-Bound Access

Agent access should expire automatically when the task completes or the expected duration is exceeded:

```python
class ContextExpiryEnforcer:
    def check_context_validity(self, context: AgentExecutionContext) -> bool:
        if datetime.utcnow() > context.valid_until:
            audit_log.record(
                event_type="access_context_expired",
                run_id=context.run_id,
                agent_id=context.agent_id,
                valid_until=context.valid_until.isoformat()
            )
            return False
        return True

    def extend_context(
        self,
        context: AgentExecutionContext,
        additional_hours: float,
        authorized_by: str
    ) -> AgentExecutionContext:
        """
        Context extension requires explicit authorization —
        does not happen automatically.
        """
        audit_log.record(
            event_type="access_context_extended",
            run_id=context.run_id,
            original_expiry=context.valid_until.isoformat(),
            new_expiry=(context.valid_until + timedelta(hours=additional_hours)).isoformat(),
            authorized_by=authorized_by
        )
        return replace(
            context,
            valid_until=context.valid_until + timedelta(hours=additional_hours)
        )
```

### Principle 3: Credential Isolation

Agents should use distinct service credentials, not shared human user credentials:

```python
# BAD: Shared admin credentials
AGENT_DB_USER = "admin"
AGENT_DB_PASSWORD = os.environ["ADMIN_DB_PASSWORD"]

# GOOD: Per-agent service account with minimal permissions
class AgentCredentialProvider:
    def get_credentials(
        self,
        agent_id: str,
        task_type: str
    ) -> Credentials:
        # Each agent has its own service account
        # Each service account has only the database permissions needed for its task type
        service_account = SERVICE_ACCOUNTS[agent_id][task_type]
        return self.vault.get_credentials(service_account)
```

Per-agent credentials mean:
- Compromising one agent's credentials does not expose other agents' access
- Access logs are attributable to specific agents
- Credential rotation for one agent does not affect others

### Principle 4: Read-Only by Default, Write on Exception

Default all agent data access to read-only. Grant write access only for specific operations that require it, scoped to specific records:

```python
class DataAccessFactory:
    @staticmethod
    def create_read_only_access(context: AgentExecutionContext) -> DataAccessLayer:
        return DataAccessLayer(
            db_credentials=credential_provider.get_readonly_credentials(context.agent_id),
            scope=context.permitted_data_scope,
            allow_writes=False
        )

    @staticmethod
    def create_write_access(
        context: AgentExecutionContext,
        record_id: str,
        write_permission: WritePermission
    ) -> DataAccessLayer:
        """
        Write access is granted for specific records only,
        when explicitly required by the task.
        """
        if record_id not in context.task_scope_ids:
            raise AccessDeniedError(f"Record {record_id} not in task scope")

        if write_permission.action not in context.permitted_action_types:
            raise AccessDeniedError(f"Action {write_permission.action} not permitted for this context")

        return DataAccessLayer(
            db_credentials=credential_provider.get_write_credentials(
                context.agent_id,
                record_id=record_id,  # Scoped to specific record
                action=write_permission.action
            ),
            scope=DataScope(record_ids=[record_id]),  # Narrowed to single record
            allow_writes=True
        )
```

---

## Access Control Anti-Patterns

**The "Super Agent"**: One agent is given access to everything "to avoid permission errors." This is the least-privilege antipattern and creates catastrophic blast radius.

**Credential sharing**: Multiple agents share the same service account. When auditing, you cannot determine which agent made which database call. When rotating credentials, all agents are disrupted simultaneously.

**Implicit scope**: The agent's scope is determined by whatever data the query returns, not by an explicitly defined scope. An agent that can query "all invoices for my customer" can trivially be made to query all invoices by manipulating the customer context.

**Permanent elevation**: An emergency access grant ("give it admin access, we'll fix it later") is never revoked. The access expires the emergency but the permission doesn't.

---

## Summary

- Static RBAC is insufficient for agents — permissions must reflect task context, not just agent role
- The context-based access model creates a per-run execution context with permissions derived from both agent role and task-specific scope
- Four least-privilege implementation principles: scope access to the current task, time-bound access with explicit extension, per-agent credential isolation, read-only by default with write on exception
- Anti-patterns: super agent, credential sharing, implicit scope, permanent elevation — all increase blast radius and undermine auditability

---

*Next: [Lesson 4.5 — Agent Sandboxing and Isolation](05-agent-sandboxing.md)*
