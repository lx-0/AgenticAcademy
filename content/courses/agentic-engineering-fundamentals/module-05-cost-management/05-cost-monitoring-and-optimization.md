# Lesson 5.5: Cost Monitoring, Alerting, and Optimization Workflows

**Module**: 5 — Cost Management and Optimization
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Applying cost optimization techniques without measuring their impact is guesswork. This lesson covers cost monitoring infrastructure, real-time spend attribution, budget alerts, and the workflow for iterative cost reduction in production.

---

## Cost Attribution: Who's Spending What?

Cost attribution answers: "Which agents, tasks, and users are responsible for the most spending?"

Without attribution, you know your total bill but not where to focus optimization efforts. With attribution, you can identify that 5% of tasks account for 40% of cost, or that one team's agents are 3x more expensive than another's.

### Attribution dimensions

```python
@dataclass
class CostRecord:
    # When
    timestamp: str

    # Who
    organization_id: str
    team_id: str
    user_id: str | None

    # Which agent
    agent_id: str
    agent_name: str
    agent_version: str

    # What task
    task_id: str
    task_type: str
    workflow_id: str | None  # Parent workflow if applicable

    # How much
    model: str
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int    # Tokens served from cache
    total_tokens: int
    input_cost_usd_cents: int
    output_cost_usd_cents: int
    cache_savings_usd_cents: int
    total_cost_usd_cents: int

    # Quality signal
    task_success: bool
    cost_per_unit_output: float  # e.g., cost per word in generated summary
```

### Building the attribution pipeline

```python
class CostAttributionService:
    async def record(self, task: CompletedTask) -> None:
        record = CostRecord(
            timestamp=task.completed_at,
            organization_id=task.org_id,
            team_id=task.team_id,
            agent_id=task.agent_id,
            task_id=task.id,
            task_type=task.type,
            model=task.model_used,
            input_tokens=task.token_usage.input,
            output_tokens=task.token_usage.output,
            cached_input_tokens=task.token_usage.cache_read,
            total_cost_usd_cents=calculate_cost(task),
            task_success=task.success
        )
        await self.db.insert(record)

    async def get_top_cost_drivers(
        self,
        period_days: int = 7,
        group_by: str = "task_type"
    ) -> list[CostBreakdown]:
        return await self.db.query(f"""
            SELECT
                {group_by},
                SUM(total_cost_usd_cents) / 100.0 as total_cost_usd,
                COUNT(*) as task_count,
                AVG(total_cost_usd_cents) / 100.0 as avg_cost_per_task,
                SUM(total_tokens) as total_tokens
            FROM cost_records
            WHERE timestamp > NOW() - INTERVAL '{period_days} days'
            GROUP BY {group_by}
            ORDER BY total_cost_usd DESC
            LIMIT 20
        """)
```

---

## Real-Time Spend Dashboards

### Dashboard panels for production cost monitoring

**Panel 1: Current spend rate**
```
Today's spend: $47.23
Month-to-date: $892.11
Projected month-end: $1,342
Budget: $2,000 (monthly)
Budget consumed: 44.6%
```

**Panel 2: Spend by agent (last 24h)**
```
ResearchAgent:      $18.42 (39%)  ████████████████████
AnalysisAgent:      $12.15 (26%)  ████████████
WriterAgent:        $8.73 (18%)   █████████
OrchestratorAgent:  $4.22 (9%)    ████
[Other]:            $3.71 (8%)    ████
```

**Panel 3: Cost efficiency trend**
```
Avg cost per task (7-day rolling):
Week 1: $0.18
Week 2: $0.16  ↓ 11% (caching rollout)
Week 3: $0.12  ↓ 25% (model right-sizing)
Week 4: $0.09  ↓ 25% (prompt compression)
```

**Panel 4: Token efficiency**
```
Cache hit rate: 42%  (target: 50%)
Context utilization: 65% (target: <80%)
Avg tokens per task: 4,200 (baseline: 7,100 - 41% reduction)
```

---

## Budget Alerts

### Alert configuration

```python
COST_ALERTS = [
    BudgetAlert(
        name="daily_spend_75pct",
        condition=lambda: daily_spend / daily_budget > 0.75,
        severity="warning",
        message="Daily spend at 75% of budget — {spend:.2f}/{budget:.2f}",
        notify=["on-call-engineer"]
    ),
    BudgetAlert(
        name="daily_spend_95pct",
        condition=lambda: daily_spend / daily_budget > 0.95,
        severity="critical",
        message="Daily spend at 95% — auto-throttling non-critical tasks",
        notify=["on-call-engineer", "engineering-manager"],
        action="throttle_non_critical"
    ),
    BudgetAlert(
        name="unexpected_cost_spike",
        condition=lambda: current_hour_spend > hourly_baseline * 3,
        severity="critical",
        message="Hourly spend 3x above baseline — potential runaway agent",
        notify=["on-call-engineer"],
        action="investigate_top_spenders"
    ),
    BudgetAlert(
        name="single_task_cost_limit",
        condition=lambda task: task.cost_usd > 5.00,
        severity="high",
        message="Single task cost ${cost:.2f} — above $5 threshold",
        notify=["task_owner"]
    )
]
```

### Auto-throttling on budget pressure

```python
class CostAwarePriorityQueue:
    def __init__(self, daily_budget: float):
        self.daily_budget = daily_budget

    async def enqueue(self, task: Task) -> QueuePosition:
        daily_consumed = await self.get_daily_spend()
        budget_utilization = daily_consumed / self.daily_budget

        if budget_utilization > 0.95:
            if task.priority in ("low", "medium"):
                # Defer non-critical work to next day
                return QueuePosition(
                    status="deferred",
                    reason="Daily budget at 95% — deferring non-critical tasks",
                    retry_after=tomorrow_midnight()
                )

        # Adjust task priority based on current budget pressure
        if budget_utilization > 0.80:
            task.max_tokens = int(task.max_tokens * 0.7)  # Reduce token budget
            task.model = downgrade_model(task.model)       # Use cheaper model

        return await self.queue.enqueue(task)
```

---

## The Cost Optimization Workflow

Systematic cost reduction follows a cycle:

### Step 1: Measure baseline

Run your system for 1 week without optimization. Collect:
- Total cost
- Cost per task by type
- Token breakdown (input/output/cached)
- Top 10 most expensive tasks

### Step 2: Identify top opportunities

```python
def identify_optimization_opportunities(
    baseline_metrics: BaselineMetrics
) -> list[OptimizationOpportunity]:
    opportunities = []

    # Check cache hit rate
    if baseline_metrics.cache_hit_rate < 0.30:
        opportunities.append(OptimizationOpportunity(
            strategy="response_caching",
            estimated_savings_pct=baseline_metrics.cache_hit_rate_potential * 0.8,
            effort="medium",
            confidence="high"
        ))

    # Check model mix
    frontier_pct = baseline_metrics.frontier_model_pct
    if frontier_pct > 0.50:
        # More than 50% of requests on frontier model — likely over-provisioned
        opportunities.append(OptimizationOpportunity(
            strategy="model_right_sizing",
            estimated_savings_pct=0.40,  # Assuming 50% can be downgraded
            effort="medium",
            confidence="medium"  # Depends on quality testing
        ))

    # Check prompt length
    if baseline_metrics.avg_system_prompt_tokens > 2000:
        opportunities.append(OptimizationOpportunity(
            strategy="prompt_compression",
            estimated_savings_pct=0.15,
            effort="low",
            confidence="high"
        ))

    return sorted(opportunities, key=lambda o: o.estimated_savings_pct, reverse=True)
```

### Step 3: Implement one change at a time

Don't combine multiple optimizations in the same experiment. You won't know which change drove the result (or which broke quality).

### Step 4: Measure impact

```python
def measure_optimization_impact(
    before_metrics: PeriodMetrics,
    after_metrics: PeriodMetrics
) -> OptimizationImpact:
    return OptimizationImpact(
        cost_reduction_pct=(before_metrics.cost - after_metrics.cost) / before_metrics.cost,
        quality_change_pct=(after_metrics.quality_score - before_metrics.quality_score) / before_metrics.quality_score,
        latency_change_pct=(after_metrics.p95_latency - before_metrics.p95_latency) / before_metrics.p95_latency,
        net_benefit=cost_reduction_usd - quality_regression_cost,  # Cost savings minus cost of any quality regression
    )
```

### Step 5: Validate quality hasn't regressed

Cost savings that degrade user experience are not real savings. Always include quality metrics in your measurement.

---

## Module 5 Key Takeaways

1. Token costs: input (grows with context), output (3-5x more expensive), cached (10% of input cost)
2. Per-task and per-agent token budgets prevent runaway costs — terminate gracefully, not catastrophically
3. Three caching levels: provider-level prompt caching, response caching, semantic deduplication
4. Model right-sizing: test on 50+ examples, use cheapest model meeting quality threshold, monitor in production
5. Prompt optimization: compress verbose prompts, reduce examples, use structured inputs, compress context
6. Batch processing: 40-50% discount for non-time-sensitive workloads
7. Cost monitoring: attribution by agent/task/team, real-time dashboards, budget alerts with auto-throttling

---

*Module 5 complete. Proceed to the [Module 5 Assessment](assessment.json) and [Module 5 Lab](lab.md), then complete the [Capstone Project](../capstone.md) for certificate eligibility.*
