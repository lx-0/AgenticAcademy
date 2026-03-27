# Lesson 3.5: Compliance Dashboards and Reporting

**Module**: 3 — Audit Trails and Observability for Compliance
**Estimated reading time**: ~18 minutes
**Level**: Intermediate–Advanced

---

## Overview

Audit data is only valuable if it can be accessed, queried, and reported on by the people who need it. This lesson covers how to design compliance dashboards that serve three distinct audiences: compliance officers, engineers, and regulators. Each audience has different needs, different technical proficiency, and different cadences.

---

## The Three Audiences

### Audience 1: Compliance Officers

**What they need**: Overview of system behavior against policy; trends over time; exception reports that surface anomalies requiring review.

**Cadence**: Weekly review, with real-time alerting for critical anomalies.

**Technical proficiency**: Low-to-medium. Can use dashboards but cannot write queries.

**Key metrics**:
- Agent decision volume by type and outcome
- Approval gate activation rate and approval/rejection rates
- Policy exception count (decisions that matched an exception clause)
- Human oversight coverage (what % of high-risk actions had HITL)
- Escalation resolution time (how long escalations take to resolve)

### Audience 2: Engineers / Platform Teams

**What they need**: Technical metrics for debugging, performance, and anomaly detection. The ability to drill into specific runs and trace execution sequences.

**Cadence**: Continuous monitoring with real-time dashboards.

**Technical proficiency**: High. Can write queries and read raw logs.

**Key metrics**:
- Agent latency (p50, p95, p99 per agent)
- Error rates by agent, tool, and error type
- Token usage per run (cost management)
- Guardrail trigger rate (how often guardrails fire)
- Run abandonment rate (runs that failed to complete)

### Audience 3: Regulators / Auditors

**What they need**: Evidence that specific controls were in place and functioning during a specific time period. Ability to investigate specific incidents.

**Cadence**: Ad hoc, typically triggered by an inquiry or scheduled audit.

**Technical proficiency**: Varies widely. Assume they cannot write queries. Reports must be self-contained.

**Key exports**:
- Audit log extract for a specified date range and agent
- Decision provenance records for specific decisions
- Approval record export
- Incident report with full execution trace

---

## Compliance Dashboard Design

### Panel 1: System Health Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  AGENT GOVERNANCE DASHBOARD — Last 7 days                       │
├──────────────────┬──────────────────┬───────────────────────────┤
│  Decisions made  │  Approval gates  │  Policy exceptions        │
│     12,483       │  activated: 247  │  raised: 14               │
│   ▲ 3% vs last   │  approved: 228   │  resolved: 11             │
│   week           │  rejected: 9     │  pending: 3               │
│                  │  expired: 10     │                            │
├──────────────────┴──────────────────┴───────────────────────────┤
│  Human oversight coverage                                        │
│  High-risk actions with HITL: 98.4%  (target: >95%)  ✓        │
│  Critical actions with HITL: 100%    (target: 100%)   ✓        │
├─────────────────────────────────────────────────────────────────┤
│  Active alerts: 2                                               │
│  ⚠ Escalation unresolved >48h: payment-agent (1 pending)       │
│  ⚠ Approval expiry rate elevated: invoice-agent (8% this week) │
└─────────────────────────────────────────────────────────────────┘
```

### Panel 2: Decision Trend Chart

A time-series chart of:
- Total decisions per day
- Approval-required decisions per day
- Rejected decisions per day (flagged in red)
- Policy exceptions per day

Spikes in any of these metrics are early warning signs of either agent misbehavior or unusual input volume.

### Panel 3: Agent-Level Breakdown

A table showing per-agent metrics for the current period:

| Agent | Decisions | Approval Rate | Rejection Rate | Exception Rate | HITL Coverage |
|-------|-----------|---------------|----------------|----------------|---------------|
| payment-agent | 1,204 | 12.4% | 0.8% | 0.1% | 100% |
| invoice-agent | 4,891 | 3.2% | 0.2% | 0.3% | 98.1% |
| onboarding-agent | 89 | 45.0% | 2.2% | 0.0% | 100% |

The onboarding agent's 45% approval rate is high — this should trigger a threshold calibration review.

### Panel 4: Escalation Tracker

A live tracker of open escalations with:
- Escalation ID
- Agent and action type
- Time open
- Current tier
- Deadline

Sorted by deadline (most urgent first). Color-coded: green (>24h remaining), yellow (4–24h), red (<4h).

---

## Regulatory Report Generation

When a regulator or auditor requests an audit report, the compliance system should generate it automatically from the audit data — not require manual reconstruction.

### Report Template: Agent Activity Report

```python
def generate_agent_activity_report(
    agent_id: str,
    start_date: datetime,
    end_date: datetime
) -> AuditReport:
    """
    Generate a self-contained audit report for a specific agent and time period.
    """
    # Fetch all events for this agent in the date range
    events = audit_store.query(
        agent_id=agent_id,
        start=start_date,
        end=end_date
    )

    # Verify chain integrity
    integrity_result = verify_chain_integrity(events)

    return AuditReport(
        report_id=str(uuid.uuid4()),
        generated_at=datetime.utcnow(),
        generated_by="compliance-reporting-system",
        period_start=start_date,
        period_end=end_date,
        agent_id=agent_id,
        agent_version=events[0].agent_version if events else "unknown",

        # Summary statistics
        total_runs=count_unique_runs(events),
        total_decisions=count_events_by_type(events, "decision_made"),
        total_approvals_requested=count_events_by_type(events, "approval_requested"),
        total_approvals_granted=count_by_outcome(events, "approved"),
        total_rejections=count_by_outcome(events, "rejected"),
        total_guardrail_triggers=count_events_by_type(events, "guardrail_triggered"),

        # Integrity status
        chain_integrity_verified=integrity_result.is_valid,
        integrity_violations=integrity_result.violations,

        # Full event log (sanitized)
        event_log=sanitize_events_for_report(events),

        # Decision provenance records
        significant_decisions=get_decision_provenance_records(events),

        # Incidents
        incidents=get_incident_records(agent_id, start_date, end_date)
    )
```

### Report Delivery Formats

Regulatory reports need to be in formats auditors can actually use:

**PDF**: For human review and formal submissions. Includes charts, tables, and narrative.

**CSV**: For auditors who want to analyze the data themselves.

**JSON**: For technical auditors and regulatory systems that consume structured data.

**Signed package**: For high-stakes submissions, the report package (PDF + JSON + raw log export) should be digitally signed to prove it was generated from unmodified audit data.

---

## Alerting for Compliance Anomalies

Real-time alerts allow compliance teams to respond to anomalies before they become incidents. Key alert definitions:

```python
COMPLIANCE_ALERTS = [
    Alert(
        name="hitl_coverage_below_threshold",
        condition="hitl_coverage_rate < 0.95 AND time_window = '1h'",
        severity="critical",
        recipients=["compliance-team", "ciso"],
        message="Human oversight coverage fell below 95% in the last hour. "
                "Review agent configuration immediately."
    ),
    Alert(
        name="escalation_unresolved_24h",
        condition="escalation_open AND time_since_creation > '24h'",
        severity="high",
        recipients=["compliance-team", "agent-system-owner"],
        message="Escalation {escalation_id} has been unresolved for over 24 hours."
    ),
    Alert(
        name="approval_expiry_rate_elevated",
        condition="approval_expiry_rate > 0.05 AND time_window = '1h'",
        severity="medium",
        recipients=["compliance-team"],
        message="More than 5% of approval requests expired without a decision. "
                "Reviewer availability or routing may be misconfigured."
    ),
    Alert(
        name="guardrail_triggered_repeatedly",
        condition="guardrail_triggers_for_same_agent > 10 AND time_window = '30m'",
        severity="high",
        recipients=["security-team", "compliance-team"],
        message="Agent {agent_id} has triggered guardrails 10+ times in 30 minutes. "
                "Possible prompt injection or misconfiguration."
    ),
    Alert(
        name="audit_log_gap_detected",
        condition="chain_integrity_broken",
        severity="critical",
        recipients=["ciso", "compliance-team", "engineering-lead"],
        message="Audit log chain integrity violation detected for agent {agent_id}. "
                "This may indicate tampering or a logging system failure."
    )
]
```

---

## Summary

- Three compliance dashboard audiences: compliance officers (weekly overview, exception reports), engineers (real-time technical metrics), regulators (ad hoc investigation and audit export)
- Key compliance metrics: decision volume, approval gate activation/rejection rates, HITL coverage, escalation resolution time, guardrail trigger rate
- Regulatory reports must be auto-generated from audit data with chain integrity verification — not manually reconstructed
- Report delivery formats: PDF for human review, CSV for data analysis, JSON for technical auditors, signed packages for high-stakes submissions
- Compliance alerting covers HITL coverage drops, unresolved escalations, elevated expiry rates, repeated guardrail triggers, and audit log integrity violations

---

*Proceed to the [Module 3 Lab](lab.md) to apply these concepts.*
