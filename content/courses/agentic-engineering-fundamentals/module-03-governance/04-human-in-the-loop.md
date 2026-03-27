# Lesson 3.4: Human-in-the-Loop Patterns

**Module**: 3 — Governance and Compliance
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Human-in-the-loop (HITL) is the mechanism by which high-stakes agent actions require human approval before proceeding. It's the safety valve in your governance architecture — when guardrails and policies aren't sufficient alone, a human reviews and decides.

Designing HITL well is a balance: too many approval gates make your system too slow to be useful; too few create unacceptable risk. This lesson covers approval flows, escalation triggers, veto patterns, and timeout handling.

---

## When HITL is Required

Not every agent action needs human approval. HITL is appropriate when:

**Actions are irreversible**: Deleting production data, sending external communications, financial transactions, deployment to production. These can't be "undone" by re-running — they require human review before execution.

**Actions exceed a risk threshold**: An agent that's about to modify 10,000 customer records should require approval even if that was the intended action. Scale changes the risk profile.

**Situations are novel**: When an agent encounters a scenario significantly different from its training context, a human should verify the agent's proposed action before it proceeds.

**Regulatory requirements**: Some regulations explicitly require human oversight for specific decisions (hiring, credit, healthcare diagnoses).

**Cost threshold**: When a single action would incur cost above a defined threshold (e.g., "any API call expected to cost >$50 requires approval").

---

## The Approval Flow

A basic approval flow:

```
Agent proposes action
        │
        ▼
┌─────────────────────────┐
│   Risk Classifier       │
│   Does this need HITL?  │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
No approval       Approval required
needed            │
    │             ▼
    │    ┌──────────────────┐
    │    │ Approval Request │
    │    │ sent to reviewer │
    │    └────────┬─────────┘
    │             │
    │      ┌──────┴──────┐
    │      │             │
    │      ▼             ▼
    │   Approved      Rejected
    │      │             │
    └──────┘             │
    │                    ▼
    ▼                Agent stops,
Proceed              logs rejection
```

### Approval request schema

```python
@dataclass
class ApprovalRequest:
    request_id: str
    agent_id: str
    task_id: str
    run_id: str

    # What the agent wants to do
    action_type: str                    # "data.delete", "email.send", etc.
    action_description: str            # Human-readable description
    action_payload: dict               # Full details of the proposed action

    # Context for the reviewer
    why_agent_wants_this: str          # Agent's reasoning
    alternatives_considered: list[str] # Other approaches the agent considered
    risk_assessment: str               # Agent's assessment of risks
    reversibility: Literal["reversible", "partial", "irreversible"]
    estimated_impact: str              # What happens if approved / rejected

    # Approval metadata
    escalation_trigger: str            # Why HITL was triggered
    priority: Literal["low", "medium", "high", "critical"]
    requested_by_deadline: str | None  # When the agent needs an answer
    timeout_action: str                # What happens if no response by deadline
    requested_reviewers: list[str]     # Specific humans to notify

    created_at: str
```

### Notification and routing

Approval requests need to reach reviewers promptly. Common patterns:

```python
class ApprovalRouter:
    async def route_approval(self, request: ApprovalRequest) -> None:
        # Select reviewers based on action type and risk level
        reviewers = await self.select_reviewers(request)

        # Notify via configured channels
        for reviewer in reviewers:
            await self.notify_reviewer(reviewer, request)

    async def select_reviewers(self, request: ApprovalRequest) -> list[Reviewer]:
        routing_rules = {
            "data.delete": ["data-owners", "security-team"],
            "financial.transaction": ["finance-team", "cfo"],
            "deployment.production": ["platform-team", "service-owner"],
            "external.communication": ["legal-team", "comms-team"],
        }

        roles = routing_rules.get(request.action_type, ["default-approvers"])

        # Critical actions always include senior reviewer
        if request.priority == "critical":
            roles.append("senior-on-call")

        return await self.resolve_reviewers(roles)
```

---

## Veto Patterns

A veto pattern allows any designated reviewer to block an action, while an approval pattern requires at least one approval.

### Single approval

One reviewer can approve. Fast, but creates a single point of bypass.

```python
class SingleApprovalPolicy:
    async def evaluate_responses(
        self,
        responses: list[ReviewerResponse]
    ) -> ApprovalDecision:
        if any(r.decision == "approved" for r in responses):
            return ApprovalDecision(approved=True)
        if any(r.decision == "rejected" for r in responses):
            return ApprovalDecision(
                approved=False,
                reason=next(r.reason for r in responses if r.decision == "rejected")
            )
        return ApprovalDecision(approved=None, status="pending")
```

### Unanimous approval (high-stakes)

All designated reviewers must approve. Provides strong oversight but slower:

```python
class UnanimousApprovalPolicy:
    def __init__(self, required_count: int):
        self.required_count = required_count

    async def evaluate_responses(
        self,
        responses: list[ReviewerResponse]
    ) -> ApprovalDecision:
        approvals = [r for r in responses if r.decision == "approved"]
        rejections = [r for r in responses if r.decision == "rejected"]

        if rejections:
            # Any rejection blocks the action
            return ApprovalDecision(
                approved=False,
                reason=f"Rejected by {rejections[0].reviewer_id}: {rejections[0].reason}"
            )

        if len(approvals) >= self.required_count:
            return ApprovalDecision(approved=True)

        return ApprovalDecision(
            approved=None,
            status=f"pending ({len(approvals)}/{self.required_count} approvals received)"
        )
```

---

## Escalation Triggers

What causes an agent to request HITL? Escalation triggers are programmatic rules:

```python
@dataclass
class EscalationTrigger:
    name: str
    check: Callable[[AgentAction], bool]
    reason_template: str
    priority: str

ESCALATION_TRIGGERS = [
    EscalationTrigger(
        name="irreversible_action",
        check=lambda a: a.reversibility == "irreversible",
        reason_template="Action '{action_type}' is irreversible and requires approval before proceeding.",
        priority="high"
    ),
    EscalationTrigger(
        name="high_cost_action",
        check=lambda a: a.estimated_cost_usd > 100,
        reason_template="Action estimated to cost ${cost:.2f}, exceeding $100 threshold.",
        priority="medium"
    ),
    EscalationTrigger(
        name="bulk_data_modification",
        check=lambda a: a.estimated_records_affected > 1000,
        reason_template="Action would affect {records} records, exceeding 1,000-record threshold.",
        priority="high"
    ),
    EscalationTrigger(
        name="external_communication",
        check=lambda a: a.action_type == "message.send" and a.is_external_recipient,
        reason_template="External communication to {recipient} requires legal review.",
        priority="high"
    ),
    EscalationTrigger(
        name="production_deployment",
        check=lambda a: a.target_environment == "production",
        reason_template="Production deployment requires platform team approval.",
        priority="critical"
    ),
]

async def evaluate_escalation_triggers(
    action: AgentAction,
    triggers: list[EscalationTrigger]
) -> EscalationDecision:
    fired_triggers = [t for t in triggers if t.check(action)]

    if not fired_triggers:
        return EscalationDecision(requires_hitl=False)

    highest_priority = max(fired_triggers, key=lambda t: PRIORITY_RANK[t.priority])

    return EscalationDecision(
        requires_hitl=True,
        triggers=fired_triggers,
        priority=highest_priority.priority,
        combined_reason="; ".join(
            t.reason_template.format(**action.__dict__)
            for t in fired_triggers
        )
    )
```

---

## Timeout Handling

Approval requests that go unanswered can block agent execution indefinitely. Design explicit timeout behavior:

```python
class ApprovalTimeoutPolicy:
    def __init__(
        self,
        timeout_seconds: int,
        timeout_action: Literal["approve", "reject", "escalate", "hold"]
    ):
        self.timeout_seconds = timeout_seconds
        self.timeout_action = timeout_action

async def wait_for_approval_with_timeout(
    request: ApprovalRequest,
    policy: ApprovalTimeoutPolicy
) -> ApprovalDecision:
    try:
        decision = await asyncio.wait_for(
            approval_system.wait_for_decision(request.request_id),
            timeout=policy.timeout_seconds
        )
        return decision

    except asyncio.TimeoutError:
        match policy.timeout_action:
            case "approve":
                # Auto-approve after timeout (use for low-risk actions with clear deadlines)
                return ApprovalDecision(
                    approved=True,
                    reason=f"Auto-approved after {policy.timeout_seconds}s timeout",
                    auto_approved=True
                )
            case "reject":
                # Auto-reject after timeout (use for high-risk actions — safer default)
                return ApprovalDecision(
                    approved=False,
                    reason=f"Auto-rejected: no response within {policy.timeout_seconds}s"
                )
            case "escalate":
                # Escalate to senior reviewer
                await escalate_to_senior(request)
                return await wait_for_approval_with_timeout(
                    request,
                    ApprovalTimeoutPolicy(
                        timeout_seconds=policy.timeout_seconds * 2,
                        timeout_action="reject"  # Final fallback: reject
                    )
                )
            case "hold":
                # Pause the agent and surface to dashboard
                await hold_agent_pending_review(request)
                return ApprovalDecision(
                    approved=None,
                    status="on_hold",
                    reason="Agent paused pending approval — see dashboard"
                )
```

### Default timeout behavior by risk level

| Risk Level | Timeout | Timeout Action |
|-----------|---------|----------------|
| Low | 4 hours | Auto-approve |
| Medium | 1 hour | Escalate, then reject |
| High | 15 minutes | Escalate, then reject |
| Critical | 5 minutes | Hold with alert |

---

## The Feedback Loop: Learning from HITL Decisions

HITL creates a valuable feedback loop: every approval or rejection is data about your guardrail and escalation trigger configuration.

```python
class HITLFeedbackAnalyzer:
    async def analyze_approval_patterns(self, period_days: int = 30) -> HITLReport:
        decisions = await self.approval_db.get_decisions(period_days)

        approval_rate = len([d for d in decisions if d.approved]) / len(decisions)

        # High approval rate on a trigger = trigger may be too sensitive
        trigger_analysis = Counter(d.trigger_name for d in decisions if not d.approved)

        return HITLReport(
            total_requests=len(decisions),
            approval_rate=approval_rate,
            auto_approved=len([d for d in decisions if d.auto_approved]),
            rejection_reasons=trigger_analysis,
            recommendations=[
                "Consider relaxing trigger X if approval rate >95%",
                "Consider tightening trigger Y if rejection rate >50%"
            ]
        )
```

A HITL system that approves 99% of requests suggests either the triggers are too sensitive (creating approval fatigue) or the agents are well-governed. A HITL system that rejects 50% of requests suggests either the agents are misbehaving or the triggers are mis-calibrated.

---

## Summary

- HITL is appropriate for irreversible actions, high-risk situations, novel scenarios, regulated decisions, and high-cost operations
- Approval requests should include full context: what the agent wants to do, why, what alternatives were considered, and what happens on approval vs. rejection
- Veto patterns range from single approval (fast) to unanimous (strongest protection)
- Escalation triggers are programmatic rules — not LLM judgment
- Timeouts must have defined behavior: auto-approve (low risk), auto-reject (high risk), escalate, or hold
- HITL feedback loops inform guardrail and trigger refinement

---

*Next: [Lesson 3.5 — Access Control and Secrets Management](05-access-control.md)*
