# Lesson 4.3: Containment Patterns

**Module**: 4 — Risk Assessment and Agent Boundaries
**Estimated reading time**: ~20 minutes
**Level**: Intermediate–Advanced

---

## Overview

Containment patterns limit the damage when an agent misbehaves. They are the technical implementation of blast radius reduction: mechanisms that prevent a misbehaving agent from causing harm beyond its intended scope. This lesson covers the core containment patterns and how to implement them.

---

## The Four Containment Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Rate Limits                                        │
│  (How fast can the agent act?)                               │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Scope Enforcement                                  │
│  (What data can the agent touch?)                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Action Guardrails                                  │
│  (What actions can the agent take?)                          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Network/System Isolation                           │
│  (What systems can the agent reach?)                         │
└─────────────────────────────────────────────────────────────┘
```

Each layer is independently enforced. An agent that bypasses Layer 2 (action guardrails) is still contained by Layer 3 (scope enforcement) and Layer 4 (rate limits).

---

## Layer 1: Network and System Isolation

The lowest-level containment: restrict what systems the agent can reach at the network level.

### Allowlisting Approach

The agent's process is only permitted to reach explicitly allowlisted endpoints. Any network call to a non-allowlisted destination fails at the network layer, before the agent's code can handle it:

```yaml
# Example: network policy for document-processing-agent
# Blocks all traffic except explicitly allowlisted destinations

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: document-agent-network-policy
spec:
  podSelector:
    matchLabels:
      agent: document-processing-agent
  egress:
    - to:
        - ipBlock:
            cidr: 10.0.0.0/8  # Internal network only
      ports:
        - port: 443
    # Explicitly allowlisted external APIs
    - to:
        - namespaceSelector:
            matchLabels:
              name: document-api
      ports:
        - port: 8080
  # No internet access — all external API calls blocked at network layer
```

This containment is independent of the agent's code. Even if the agent's LLM produces a tool call pointing to an external malicious endpoint, the network policy blocks the connection before it is established.

### Process Isolation

Run each agent in a separate process or container:
- Process-level isolation prevents one agent from directly accessing another agent's memory
- Container-level isolation prevents one agent's filesystem access from reaching another agent's working directory
- Separate service accounts for each agent ensure credential compromise of one agent does not expose others

---

## Layer 2: Action Guardrails

Guardrails validate proposed actions before execution. Three types:

### Input Guardrails

Validate the agent's input before it enters the agent loop:

```python
class InputGuardrailChain:
    def __init__(self, guardrails: list[InputGuardrail]):
        self.guardrails = guardrails

    def validate(self, input_text: str, context: ExecutionContext) -> GuardrailResult:
        for guardrail in self.guardrails:
            result = guardrail.check(input_text, context)
            if result.blocked:
                audit_log.record(
                    event_type="guardrail_triggered",
                    guardrail_name=guardrail.name,
                    input_hash=sha256(input_text),
                    block_reason=result.reason
                )
                return result
        return GuardrailResult(blocked=False)


class PromptInjectionGuardrail(InputGuardrail):
    name = "prompt_injection_detector"

    INJECTION_PATTERNS = [
        r"ignore (all |previous |above )?(instructions|prompt)",
        r"you are now (in |a )?",
        r"system (override|maintenance mode)",
        r"new (task|instructions|goal):",
        r"forget everything",
        r"disregard (all |previous )?",
    ]

    def check(self, input_text: str, context: ExecutionContext) -> GuardrailResult:
        text_lower = input_text.lower()
        for pattern in self.INJECTION_PATTERNS:
            if re.search(pattern, text_lower):
                return GuardrailResult(
                    blocked=True,
                    reason=f"Potential prompt injection detected (pattern: {pattern})",
                    severity="high"
                )
        return GuardrailResult(blocked=False)
```

### Action Guardrails

Validate proposed tool calls before they execute:

```python
class ActionGuardrail:
    def check(
        self,
        tool_name: str,
        tool_params: dict,
        context: ExecutionContext
    ) -> GuardrailResult:
        raise NotImplementedError


class ScopeEnforcementGuardrail(ActionGuardrail):
    """Verify that the tool call is within the agent's authorized scope."""

    def check(self, tool_name: str, tool_params: dict, context: ExecutionContext) -> GuardrailResult:
        authorized_scope = context.authorized_scope

        # Check: is this tool in the authorized tool list?
        if tool_name not in authorized_scope.allowed_tools:
            return GuardrailResult(
                blocked=True,
                reason=f"Tool '{tool_name}' not in authorized tool list",
                severity="high"
            )

        # Check: are the parameters within scope?
        if "customer_id" in tool_params:
            if tool_params["customer_id"] != context.current_customer_id:
                return GuardrailResult(
                    blocked=True,
                    reason=f"customer_id {tool_params['customer_id']} does not match authorized customer {context.current_customer_id}",
                    severity="critical"
                )

        return GuardrailResult(blocked=False)


class DestructiveActionGuardrail(ActionGuardrail):
    """Block destructive actions that should require explicit approval."""

    DESTRUCTIVE_PATTERNS = {
        "delete": ["delete", "remove", "drop", "truncate", "destroy"],
        "bulk_operation": ["_all", "batch_", "bulk_"]
    }

    def check(self, tool_name: str, tool_params: dict, context: ExecutionContext) -> GuardrailResult:
        tool_lower = tool_name.lower()

        for category, patterns in self.DESTRUCTIVE_PATTERNS.items():
            if any(p in tool_lower for p in patterns):
                if not context.has_approval_for(tool_name):
                    return GuardrailResult(
                        blocked=True,
                        reason=f"Destructive action '{tool_name}' requires explicit approval",
                        severity="high"
                    )
        return GuardrailResult(blocked=False)
```

### Output Guardrails

Filter the agent's output before it is returned to the caller or used to trigger actions:

```python
class PIIOutputGuardrail:
    """Block outputs containing more PII fields than allowed."""

    MAX_PII_FIELDS_IN_OUTPUT = 2

    PII_FIELD_PATTERNS = [
        (r'\b\d{3}-\d{2}-\d{4}\b', 'SSN'),
        (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', 'email'),
        (r'\b(?:\d{4}[-\s]?){3}\d{4}\b', 'credit_card'),
        (r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', 'phone_number'),
    ]

    def check(self, output: str) -> GuardrailResult:
        detected_pii = []
        for pattern, pii_type in self.PII_FIELD_PATTERNS:
            matches = re.findall(pattern, output)
            if matches:
                detected_pii.append((pii_type, len(matches)))

        if len(detected_pii) > self.MAX_PII_FIELDS_IN_OUTPUT:
            return GuardrailResult(
                blocked=True,
                reason=f"Output contains {len(detected_pii)} PII field types: {detected_pii}",
                severity="high"
            )
        return GuardrailResult(blocked=False)
```

---

## Layer 3: Scope Enforcement

Scope enforcement ensures the agent can only access data within its authorized scope, even if action guardrails are bypassed.

### Context-Injected Scoping

Instead of letting the agent specify which data to access, inject the scope from the authorization context:

```python
class ScopedDataAccessLayer:
    """
    Wraps all data access with scope enforcement.
    The agent cannot access data outside its authorized scope,
    regardless of what parameters it passes.
    """

    def __init__(self, db, auth_context: AuthorizationContext):
        self.db = db
        self.scope = auth_context.data_scope

    def get_customer(self, customer_id: str) -> Customer:
        # Enforce: can only access the authorized customer
        if customer_id not in self.scope.authorized_customer_ids:
            raise ScopeViolationError(
                f"Agent not authorized to access customer {customer_id}"
            )
        return self.db.get_customer(customer_id)

    def get_invoices(self, **filters) -> list[Invoice]:
        # Inject scope filter regardless of what the agent requested
        return self.db.get_invoices(
            **filters,
            customer_id__in=self.scope.authorized_customer_ids,
            status__in=self.scope.authorized_invoice_statuses
        )
```

---

## Layer 4: Rate Limits

Rate limits bound how fast the agent can act, directly reducing blast radius by limiting actions-per-unit-time.

```python
class AgentRateLimiter:
    def __init__(self, limits: dict[str, RateLimit], store):
        self.limits = limits
        self.store = store  # Redis or similar for distributed rate limiting

    def check_and_record(
        self,
        agent_id: str,
        action_type: str
    ) -> RateLimitResult:
        limit = self.limits.get(action_type) or self.limits.get("default")
        if not limit:
            return RateLimitResult(allowed=True)

        key = f"rate_limit:{agent_id}:{action_type}"
        current_count = self.store.incr_with_expiry(key, limit.window_seconds)

        if current_count > limit.max_per_window:
            return RateLimitResult(
                allowed=False,
                reason=f"Rate limit exceeded: {current_count}/{limit.max_per_window} in {limit.window_seconds}s",
                current_count=current_count,
                limit=limit.max_per_window,
                window=limit.window_seconds
            )

        if current_count > limit.alert_threshold:
            alert_manager.fire(
                alert_name="rate_limit_approaching",
                agent_id=agent_id,
                action_type=action_type,
                current_count=current_count,
                limit=limit.max_per_window
            )

        return RateLimitResult(allowed=True, current_count=current_count)


# Rate limit configuration
AGENT_RATE_LIMITS = {
    "financial_transfer": RateLimit(max_per_window=5, window_seconds=3600, alert_threshold=3),
    "send_email": RateLimit(max_per_window=20, window_seconds=3600, alert_threshold=10),
    "delete_record": RateLimit(max_per_window=10, window_seconds=3600, alert_threshold=5),
    "default": RateLimit(max_per_window=100, window_seconds=60, alert_threshold=80)
}
```

---

## Summary

- Four containment layers: network/system isolation (what systems can the agent reach), action guardrails (what actions can it take), scope enforcement (what data can it touch), rate limits (how fast can it act)
- Each layer is independently enforced — bypassing one layer does not bypass others
- Input guardrails detect prompt injection; action guardrails block out-of-scope or destructive actions; output guardrails prevent PII leakage
- Context-injected scoping is more reliable than parameter validation — the agent cannot request data outside its scope even if it tries
- Rate limits directly bound blast radius: limiting actions per unit time caps worst-case harm within the detection latency window

---

*Next: [Lesson 4.4 — Access Control and Least Privilege](04-access-control.md)*
