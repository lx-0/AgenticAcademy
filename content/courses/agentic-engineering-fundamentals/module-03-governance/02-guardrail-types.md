# Lesson 3.2: Guardrail Types

**Module**: 3 — Governance and Compliance
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Guardrails are the enforcement layer of your governance architecture. A policy says "don't access production data." A guardrail ensures that accessing production data is impossible, even if the agent's reasoning would lead it there.

This lesson covers the five types of guardrails used in production: input validation, output filtering, action scope limits, dynamic budget caps, and topic restrictions.

---

## The Guardrail Design Principle

Before the types, the principle: **guardrails should be enforced in infrastructure, not in the LLM's reasoning**.

An LLM-based agent can be instructed "never send emails to external addresses" in its system prompt. This is not a guardrail. The model may forget this instruction, reason around it, or be manipulated into violating it via prompt injection.

A true guardrail is a programmatic check that executes independently of the LLM:

```python
# NOT a guardrail (relies on LLM compliance)
system_prompt = "Never send emails to external addresses."

# IS a guardrail (programmatic enforcement)
def validate_email_action(action: EmailAction) -> ValidationResult:
    if not action.recipient.endswith("@company.internal"):
        return ValidationResult(
            allowed=False,
            reason="Email recipients must be internal addresses",
            action="block"
        )
    return ValidationResult(allowed=True)
```

---

## Type 1: Input Validation

Input guardrails check what the agent receives before the LLM processes it.

### Scope

- User-provided inputs
- External data sources (API responses, file contents)
- Messages from other agents
- Tool results fed back into context

### What to check

**Prompt injection detection**: Attempts to manipulate the agent's behavior by embedding instructions in data:

```python
INJECTION_PATTERNS = [
    r"ignore previous instructions",
    r"disregard your system prompt",
    r"you are now a different agent",
    r"pretend you are",
    r"forget everything",
]

def detect_prompt_injection(text: str) -> InjectionScanResult:
    found = []
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            found.append(pattern)

    if found:
        return InjectionScanResult(
            detected=True,
            patterns=found,
            risk_level="high",
            recommendation="sanitize_or_reject"
        )
    return InjectionScanResult(detected=False)
```

Note: Pattern matching is a heuristic, not a complete solution. Sophisticated injections evade patterns. Defense-in-depth (multiple guardrail types) is more effective than any single check.

**PII detection before processing**:

```python
async def scan_for_pii(text: str) -> PIIScanResult:
    pii_patterns = {
        "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
        "credit_card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    }

    found = {}
    for pii_type, pattern in pii_patterns.items():
        matches = re.findall(pattern, text)
        if matches:
            found[pii_type] = len(matches)

    return PIIScanResult(
        contains_pii=bool(found),
        pii_types=found,
        recommendation="redact_before_processing" if found else "safe"
    )
```

**Schema validation of structured inputs**:

```python
from pydantic import BaseModel, validator

class CustomerQueryInput(BaseModel):
    customer_id: str
    query: str
    context_type: Literal["support", "billing", "technical"]

    @validator("customer_id")
    def validate_customer_id(cls, v):
        if not re.match(r"^CUS-\d{8}$", v):
            raise ValueError(f"Invalid customer_id format: {v}")
        return v

    @validator("query")
    def validate_query_length(cls, v):
        if len(v) > 5000:
            raise ValueError("Query exceeds maximum length of 5000 characters")
        return v
```

---

## Type 2: Output Filtering

Output guardrails check what the agent produces before it reaches the world.

### Scope

- Text responses to users
- API calls the agent is about to make
- Documents the agent is about to write
- Messages the agent is about to send to other agents

### What to filter

**PII in bulk output**:

```python
def filter_pii_from_output(text: str) -> FilteredOutput:
    """Remove or redact PII from agent output before delivering to user."""
    redacted = text

    # SSN
    redacted = re.sub(r"\b\d{3}-\d{2}-\d{4}\b", "[SSN REDACTED]", redacted)

    # Credit cards
    redacted = re.sub(r"\b(?:\d{4}[-\s]?){3}\d{4}\b", "[CARD REDACTED]", redacted)

    changes_made = redacted != text

    return FilteredOutput(
        original=text,
        filtered=redacted,
        pii_removed=changes_made,
        audit_entry=f"PII filter applied at {datetime.utcnow().isoformat()}"
    )
```

**Confidential content detection**:

```python
CONFIDENTIAL_INDICATORS = [
    "proprietary", "trade secret", "internal only",
    "not for distribution", "confidential"
]

def check_output_for_confidential_content(output: str, output_destination: str) -> ComplianceCheck:
    if output_destination == "external":
        for indicator in CONFIDENTIAL_INDICATORS:
            if indicator.lower() in output.lower():
                return ComplianceCheck(
                    approved=False,
                    reason=f"Output contains confidential indicator: '{indicator}'",
                    action="block_and_alert"
                )
    return ComplianceCheck(approved=True)
```

---

## Type 3: Action Scope Limits

Action scope limits control what tools the agent can invoke and with what parameters.

### Per-agent tool restrictions

Rather than giving all agents access to all tools, define a tool set per agent role:

```python
AGENT_TOOL_POLICIES = {
    "research-agent": {
        "allowed_tools": ["web_search", "read_document", "query_knowledge_base"],
        "denied_tools": ["send_email", "write_file", "run_code", "delete_record"],
    },
    "writing-agent": {
        "allowed_tools": ["read_document", "write_document", "run_spell_check"],
        "denied_tools": ["send_email", "delete_record", "query_database"],
    },
    "executor-agent": {
        "allowed_tools": ["run_code", "read_file", "write_file"],
        "denied_tools": ["send_email", "access_production_db"],
        "resource_constraints": {
            "max_file_size_mb": 100,
            "allowed_file_paths": ["/tmp/", "/workspace/"],
        }
    }
}

def enforce_tool_policy(agent_id: str, tool_call: ToolCall) -> PolicyDecision:
    policy = AGENT_TOOL_POLICIES.get(agent_id)
    if not policy:
        return PolicyDecision(allowed=False, reason="No policy found for agent")

    if tool_call.tool_name in policy.get("denied_tools", []):
        return PolicyDecision(
            allowed=False,
            reason=f"Tool '{tool_call.tool_name}' is denied for agent '{agent_id}'"
        )

    if tool_call.tool_name not in policy.get("allowed_tools", []):
        return PolicyDecision(
            allowed=False,
            reason=f"Tool '{tool_call.tool_name}' is not in allowed list for '{agent_id}'"
        )

    return PolicyDecision(allowed=True)
```

### Parameter-level restrictions

Even for allowed tools, restrict the parameters:

```python
def enforce_database_query_policy(
    agent_id: str,
    query: SQLQuery
) -> PolicyDecision:
    # Only SELECT allowed (no INSERT, UPDATE, DELETE, DROP)
    if not query.is_read_only():
        return PolicyDecision(
            allowed=False,
            reason="Only read-only queries allowed for this agent"
        )

    # No access to tables containing PII for non-privileged agents
    NON_PRIVILEGED_BLOCKED_TABLES = ["customers", "users", "employees", "payments"]
    for table in query.referenced_tables():
        if table in NON_PRIVILEGED_BLOCKED_TABLES and not agent_has_pii_access(agent_id):
            return PolicyDecision(
                allowed=False,
                reason=f"Access to table '{table}' requires PII clearance"
            )

    return PolicyDecision(allowed=True)
```

---

## Type 4: Dynamic Budget Caps

Budget caps prevent agents from consuming unlimited resources. They apply to:
- **Token budgets**: How many input/output tokens the agent can use
- **Monetary budgets**: How much the agent can spend on API calls
- **Action quotas**: How many of a specific action type the agent can perform
- **Time budgets**: How long the agent can run

```python
class BudgetTracker:
    def __init__(self, limits: BudgetLimits):
        self.limits = limits
        self.spent = BudgetUsage()

    async def check_and_charge(self, charge: BudgetCharge) -> BudgetDecision:
        # Check if this charge would exceed any limit
        if self.spent.tokens + charge.tokens > self.limits.max_tokens:
            return BudgetDecision(
                approved=False,
                reason=f"Token budget exceeded: {self.spent.tokens}/{self.limits.max_tokens}",
                action="fail_gracefully"
            )

        if self.spent.usd_cents + charge.usd_cents > self.limits.max_usd_cents:
            return BudgetDecision(
                approved=False,
                reason=f"Cost budget exceeded: ${self.spent.usd_cents/100:.2f}/${self.limits.max_usd_cents/100:.2f}",
                action="fail_gracefully"
            )

        # Charge is within limits — approve and record
        self.spent.tokens += charge.tokens
        self.spent.usd_cents += charge.usd_cents
        return BudgetDecision(approved=True, remaining=self.limits - self.spent)

    def get_utilization(self) -> BudgetUtilization:
        return BudgetUtilization(
            token_pct=self.spent.tokens / self.limits.max_tokens,
            cost_pct=self.spent.usd_cents / self.limits.max_usd_cents,
            is_near_limit=self.get_token_pct() > 0.8
        )
```

### Graceful degradation at budget limits

Agents that hit budget limits should fail gracefully, not crash:

```python
async def execute_with_budget(
    agent: Agent,
    task: Task,
    budget: BudgetTracker
) -> TaskResult:
    try:
        result = await agent.execute(task)

        # Charge actual usage after execution
        charge_decision = await budget.check_and_charge(
            BudgetCharge(tokens=result.token_usage, usd_cents=result.cost_cents)
        )

        if not charge_decision.approved:
            # Over budget post-execution — flag but return result
            result.budget_warning = charge_decision.reason

        return result

    except BudgetExceededError:
        # Agent hit budget limit mid-execution
        return TaskResult(
            success=False,
            error="BUDGET_EXCEEDED",
            partial_result=agent.get_partial_result(),
            message="Task terminated due to budget limit. Partial results may be available."
        )
```

---

## Type 5: Topic Restrictions

Some agents should only discuss certain topics. A customer support agent should not provide medical advice. A coding assistant should not engage with requests for content generation outside its scope.

### LLM-based topic classification

```python
TOPIC_CLASSIFICATION_PROMPT = """Classify the following message into one or more of these categories:
{allowed_topics}

Message: {message}

Return a JSON object with:
- "categories": list of matched categories (empty list if none match)
- "on_topic": true if at least one category matches, false otherwise
- "confidence": float 0.0-1.0

Respond with only valid JSON."""

async def classify_topic(
    message: str,
    allowed_topics: list[str],
    classifier_llm: LLM
) -> TopicClassification:
    result = await classifier_llm.complete(
        TOPIC_CLASSIFICATION_PROMPT.format(
            allowed_topics="\n".join(f"- {t}" for t in allowed_topics),
            message=message
        ),
        max_tokens=100,
        temperature=0.0
    )

    parsed = json.loads(result)
    return TopicClassification(**parsed)
```

### Hard-coded topic blocks (for known prohibited content)

For topics that should never be engaged with regardless of context, use programmatic blocking rather than LLM classification:

```python
ALWAYS_BLOCKED_TOPICS = [
    "instructions for illegal activities",
    "personal data of individuals not part of current session",
    "competitor product recommendations",  # company policy
]

def enforce_topic_policy(message: str, agent_config: AgentConfig) -> TopicDecision:
    # Hard-coded blocks first (fast, reliable)
    for blocked in ALWAYS_BLOCKED_TOPICS:
        if topic_matches(message, blocked):
            return TopicDecision(
                allowed=False,
                reason=f"Message matches blocked topic: {blocked}",
                response_template="I'm not able to help with that topic."
            )

    # Then check allowed topics (LLM classification)
    classification = classify_topic(message, agent_config.allowed_topics)
    if not classification.on_topic:
        return TopicDecision(
            allowed=False,
            reason="Message is outside this agent's topic scope",
            response_template=agent_config.off_topic_response
        )

    return TopicDecision(allowed=True)
```

---

## Composing Guardrails

Production agents need a guardrail pipeline — multiple guardrails applied in sequence:

```python
class GuardrailPipeline:
    def __init__(self, guardrails: list[Guardrail]):
        self.guardrails = guardrails

    async def check_input(self, input: AgentInput) -> PipelineResult:
        for guardrail in self.guardrails:
            result = await guardrail.check_input(input)
            if not result.approved:
                return PipelineResult(
                    approved=False,
                    blocking_guardrail=guardrail.name,
                    reason=result.reason,
                    audit_entry=result.audit_entry
                )
        return PipelineResult(approved=True)

    async def check_action(self, action: AgentAction) -> PipelineResult:
        for guardrail in self.guardrails:
            result = await guardrail.check_action(action)
            if not result.approved:
                return PipelineResult(
                    approved=False,
                    blocking_guardrail=guardrail.name,
                    reason=result.reason
                )
        return PipelineResult(approved=True)

# Example pipeline
pipeline = GuardrailPipeline([
    PromptInjectionGuardrail(),
    PIIInputScanGuardrail(),
    TopicRestrictionGuardrail(allowed_topics=AGENT_TOPICS),
    ToolScopeGuardrail(policy=AGENT_TOOL_POLICY),
    BudgetGuardrail(tracker=budget_tracker),
    PIIOutputFilterGuardrail(),
])
```

---

## Summary

- Guardrails must be enforced in infrastructure, not in LLM instructions
- Five guardrail types: input validation (check what comes in), output filtering (check what goes out), action scope limits (restrict tool use), dynamic budget caps (prevent resource exhaustion), topic restrictions (keep agents on-task)
- Compose guardrails into a pipeline — each type catches different failure modes
- Hard-coded blocks for absolutely prohibited actions; LLM classification for nuanced topic restrictions

---

*Next: [Lesson 3.3 — Audit Trails](03-audit-trails.md)*
