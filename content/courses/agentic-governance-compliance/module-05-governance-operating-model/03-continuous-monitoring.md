# Lesson 5.3: Continuous Monitoring and Alerting

**Module**: 5 — Building a Governance Operating Model
**Estimated reading time**: ~18 minutes
**Level**: Intermediate–Advanced

---

## Overview

Continuous monitoring is the bridge between governance controls and human awareness. It detects when controls are not working, when agent behavior deviates from expected patterns, and when governance indicators are trending in the wrong direction. This lesson covers designing a monitoring program that is actionable rather than just noisy.

---

## The Three Monitoring Purposes

Governance monitoring serves three distinct purposes, each requiring different metric designs:

**1. Control effectiveness monitoring**: Are the governance controls working? Are guardrails firing as expected? Is the audit trail complete? Is HITL coverage meeting targets?

**2. Behavioral anomaly detection**: Is the agent behaving within expected parameters? Anomalous behavior may indicate a governance failure, an attack, or an agent that has drifted outside its design envelope.

**3. Trend monitoring for governance board**: Are governance metrics improving over time? Are certain agents consistently triggering escalations? Where is governance debt accumulating?

---

## The Governance Metrics Hierarchy

Not all metrics are equally important. The hierarchy:

```
Tier 1: Critical governance signals (alert immediately, on-call response)
  - HITL coverage below threshold
  - Audit log chain integrity violation
  - Agent suspended or terminated by incident response
  - Guardrail triggered >N times for the same agent in M minutes

Tier 2: Operational governance signals (alert within 1 hour, next-business-day review)
  - Approval expiry rate elevated
  - Escalation unresolved >24 hours
  - Policy rule trigger rate spike for specific agent
  - Agent error rate spike

Tier 3: Trend indicators (weekly governance board review)
  - Approval rate trends per agent (calibration needed if consistently near 100%)
  - Escalation resolution time trends
  - Guardrail trigger distribution (which rules fire most)
  - Control coverage gaps (agents deployed without required controls)
```

---

## Key Metric Definitions

### HITL Coverage Rate

```
HITL coverage rate =
    (high_risk_actions_with_approval / total_high_risk_actions)

Target: ≥ 95% for high-risk actions, 100% for critical actions

Alert: HITL coverage rate < 95% in any 1-hour window
```

### Approval Quality Score

Approval quality measures whether reviewers are actually reviewing — not just rubber-stamping:

```
approval_quality_score =
    (approvals_with_modification + rejections) / total_approvals

A score approaching 0% indicates approval fatigue.
Target range: 5-20% (some modifications or rejections expected)
Alert: approval_quality_score < 2% over 30-day rolling window
```

### Blast Radius Exposure

The aggregate blast radius across all running agents at a point in time:

```
blast_radius_exposure =
    Σ(active_agent.blast_radius_score × active_agent.run_count)

Alert: blast_radius_exposure > organizational_risk_tolerance_threshold
```

### Governance Debt Indicator

Agents running without required controls:

```
governance_debt =
    agents_without_complete_controls / total_agents

Target: 0%
Alert: any agent enters production without documented blast_radius_assessment,
       audit_trail_operational, and hitl_controls_verified
```

---

## Behavioral Anomaly Detection

Beyond governance metrics, detect when agents behave outside expected patterns:

### Baseline Establishment

For each agent in production, establish behavioral baselines over the first 30 days:

```python
@dataclass
class AgentBehavioralBaseline:
    agent_id: str
    baseline_period_days: int = 30

    # Tool call patterns
    avg_tool_calls_per_run: float
    std_dev_tool_calls_per_run: float
    common_tool_sequences: list[tuple]

    # Timing patterns
    avg_run_duration_seconds: float
    std_dev_run_duration_seconds: float
    typical_active_hours: list[int]  # Hours of day (UTC)

    # Data access patterns
    avg_records_accessed_per_run: float
    std_dev_records_accessed_per_run: float
    typical_data_types_accessed: list[str]

    # Output patterns
    avg_output_token_count: float
    typical_decision_distribution: dict  # e.g., {"approved": 0.85, "rejected": 0.15}
```

### Anomaly Detection Rules

```python
class BehavioralAnomalyDetector:
    def check(
        self,
        agent_id: str,
        current_run: RunMetrics,
        baseline: AgentBehavioralBaseline
    ) -> list[Anomaly]:
        anomalies = []

        # Check: unusual number of tool calls
        z_score_tool_calls = (
            (current_run.tool_call_count - baseline.avg_tool_calls_per_run) /
            baseline.std_dev_tool_calls_per_run
        )
        if abs(z_score_tool_calls) > 3.0:
            anomalies.append(Anomaly(
                type="unusual_tool_call_count",
                severity="medium",
                description=f"Tool calls ({current_run.tool_call_count}) is {z_score_tool_calls:.1f} std deviations from baseline ({baseline.avg_tool_calls_per_run:.1f})"
            ))

        # Check: unusual active time
        current_hour = datetime.utcnow().hour
        if current_hour not in baseline.typical_active_hours and current_run.is_in_progress:
            anomalies.append(Anomaly(
                type="unusual_active_time",
                severity="low",
                description=f"Agent active at hour {current_hour} UTC, outside typical window {baseline.typical_active_hours}"
            ))

        # Check: decision distribution shift
        current_approval_rate = current_run.approvals / max(current_run.total_decisions, 1)
        baseline_rate = baseline.typical_decision_distribution.get("approved", 0.5)
        if abs(current_approval_rate - baseline_rate) > 0.3:
            anomalies.append(Anomaly(
                type="decision_distribution_shift",
                severity="high",
                description=f"Approval rate ({current_approval_rate:.0%}) significantly differs from baseline ({baseline_rate:.0%})"
            ))

        return anomalies
```

---

## Alert Routing and Response Time Expectations

Define explicit response time expectations for each severity level:

```python
ALERT_RESPONSE_REQUIREMENTS = {
    "critical": {
        "acknowledgment_sla": timedelta(minutes=15),
        "resolution_sla": timedelta(hours=4),
        "escalation_if_no_ack": timedelta(minutes=30),
        "recipients": ["on-call-security", "on-call-engineering", "ciso"],
        "channels": ["pagerduty", "slack-incidents"]
    },
    "high": {
        "acknowledgment_sla": timedelta(hours=1),
        "resolution_sla": timedelta(hours=24),
        "escalation_if_no_ack": timedelta(hours=2),
        "recipients": ["on-call-engineering", "compliance-team"],
        "channels": ["slack-governance-alerts"]
    },
    "medium": {
        "acknowledgment_sla": timedelta(hours=4),
        "resolution_sla": timedelta(days=3),
        "escalation_if_no_ack": timedelta(hours=8),
        "recipients": ["compliance-team"],
        "channels": ["slack-governance-alerts"]
    },
    "low": {
        "acknowledgment_sla": timedelta(hours=24),
        "resolution_sla": timedelta(days=7),
        "escalation_if_no_ack": None,  # Reviewed at next governance board meeting
        "recipients": ["compliance-team"],
        "channels": ["weekly-governance-digest"]
    }
}
```

---

## The Monitoring Anti-Pattern: Alert Fatigue

Alert fatigue is as damaging to governance monitoring as approval fatigue is to HITL controls. Signs:
- More than 20 alerts per week per on-call engineer
- Alert acknowledgment time consistently near the SLA limit
- Alerts routinely acknowledged but not investigated
- On-call engineers mute or silence alerts

Calibrate alert thresholds against production data, same as HITL thresholds:

```python
# Weekly alert calibration review
def calibration_report(week_start: datetime, week_end: datetime):
    alerts = get_alerts(week_start, week_end)
    return {
        "total_alerts": len(alerts),
        "acknowledged_within_sla": sum(1 for a in alerts if a.acknowledged_within_sla),
        "resulted_in_action": sum(1 for a in alerts if a.action_taken),
        "false_positive_rate": sum(1 for a in alerts if not a.action_taken) / len(alerts),
        "high_false_positive_rules": [
            rule for rule, rate in rule_false_positive_rates(alerts).items()
            if rate > 0.3  # >30% false positive rate → recalibrate
        ]
    }
```

---

## Summary

- Three monitoring purposes: control effectiveness, behavioral anomaly detection, trend monitoring for governance board
- Governance metrics hierarchy: Tier 1 (immediate on-call alerts), Tier 2 (within-hour alerts), Tier 3 (weekly board review)
- Key metrics: HITL coverage rate, approval quality score, blast radius exposure, governance debt indicator
- Behavioral baselines established over 30 days; anomaly detection fires on statistical deviations from baseline
- Alert routing defines response time SLAs per severity, with escalation for missed SLAs
- Alert fatigue degrades governance monitoring — calibrate thresholds and review false positive rates weekly

---

*Next: [Lesson 5.4 — Incident Response for Agent Failures](04-incident-response.md)*
