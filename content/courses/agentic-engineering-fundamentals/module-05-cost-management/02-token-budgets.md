# Lesson 5.2: Token Budgets and Spending Limits

**Module**: 5 — Cost Management and Optimization
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Uncapped agent spending is a production risk. Without budgets, a single runaway agent — one that enters an infinite loop, processes more data than expected, or is given an unusually complex task — can consume thousands of dollars in a single run.

Token budgets are programmatic spending limits that prevent this. They enforce spending boundaries and define what happens when those boundaries are reached: graceful degradation, not catastrophic failure.

---

## Why Agents Need Budgets

Unlike traditional software where compute is cheap and predictable, agentic systems have:

**Variable cost per task**: The same task description might cost $0.05 on a simple input and $2.00 on a complex one, depending on how much research and reasoning is needed.

**Runaway potential**: An agent in a loop will keep spending until stopped. Without a budget, there's no automatic stop.

**Cascade effects**: In multi-agent systems, one expensive agent triggers others. An orchestrator that spawns 10 workers has multiplied its cost by 10. If each worker spawns 3 sub-agents... the cost grows combinatorially.

**Shared infrastructure**: In enterprise environments, multiple teams share agent infrastructure. Without per-agent budgets, one team's runaway job can exhaust the shared quota.

---

## Budget Types

### Per-task token budget

The most granular: each task has a token limit.

```python
@dataclass
class TaskBudget:
    task_id: str
    max_input_tokens: int        # Limit on total input tokens consumed
    max_output_tokens: int       # Limit on total output tokens generated
    max_total_tokens: int        # Combined limit
    max_tool_calls: int          # Limit on number of tool invocations
    warning_threshold: float = 0.8  # Alert when 80% consumed
```

### Per-agent budget

Each agent has a monthly or daily budget:

```python
@dataclass
class AgentBudget:
    agent_id: str
    period: Literal["hourly", "daily", "monthly"]
    max_spend_usd_cents: int    # Total budget for the period
    current_spend_usd_cents: int  # Current consumption
    reset_at: str               # When the counter resets
```

### System-level budget

Organization-wide cap on total agent spending:

```python
@dataclass
class SystemBudget:
    organization_id: str
    period: str
    max_spend_usd_cents: int
    allocated_spend_usd_cents: int  # Allocated to specific agents/teams
    reserved_spend_usd_cents: int   # Reserved for critical tasks
```

---

## Implementing Per-Task Token Budgets

```python
class TokenBudgetedAgent:
    def __init__(self, agent_id: str, llm_client):
        self.agent_id = agent_id
        self.llm = llm_client

    async def execute_with_budget(
        self,
        task: Task,
        budget: TaskBudget
    ) -> TaskResult:
        tracker = BudgetTracker(budget)

        messages = self.build_initial_messages(task)

        for turn in range(MAX_TURNS):
            # Check budget before calling LLM
            estimated_input = count_tokens(messages)
            if not tracker.can_afford_input(estimated_input):
                return self._graceful_budget_exceeded(tracker, messages, "pre_call")

            # Make LLM call
            response = await self.llm.complete(messages, tools=self.tools)

            # Record actual usage
            tracker.charge(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens
            )

            # Check after (actual may exceed estimate)
            if tracker.is_exceeded():
                return self._graceful_budget_exceeded(tracker, messages, "post_call")

            # Warn if near limit
            if tracker.utilization > budget.warning_threshold:
                self.logger.warn(
                    "budget.near_limit",
                    utilization=tracker.utilization,
                    remaining_tokens=tracker.remaining_tokens
                )

            # Check if done
            if response.stop_reason == "end_turn":
                return TaskResult(success=True, content=response.content, budget_used=tracker.to_summary())

            # Process tool calls
            messages = await self.process_tool_calls(response, messages)

        return self._graceful_max_turns_exceeded(messages)

    def _graceful_budget_exceeded(
        self,
        tracker: BudgetTracker,
        messages: list,
        phase: str
    ) -> TaskResult:
        """Return the best partial result we have, not an error."""

        # Extract any useful partial output from the messages so far
        partial_content = self.extract_partial_output(messages)

        return TaskResult(
            success=False,
            error_code="BUDGET_EXCEEDED",
            content=partial_content,
            budget_used=tracker.to_summary(),
            message=(
                f"Task terminated at {phase} due to token budget limit "
                f"({tracker.utilization*100:.0f}% of {tracker.budget.max_total_tokens} tokens used). "
                "Partial results may be available above."
            )
        )
```

---

## Dynamic Budget Allocation

In multi-agent systems, the orchestrator can allocate budget dynamically based on task complexity:

```python
class DynamicBudgetAllocator:
    def __init__(self, system_budget: SystemBudget):
        self.system_budget = system_budget

    async def allocate_for_task(
        self,
        task: Task,
        priority: str
    ) -> TaskBudget:
        # Estimate task complexity
        complexity = await self.estimate_complexity(task)

        # Base allocation
        base_tokens = {
            "simple": 5_000,
            "moderate": 20_000,
            "complex": 50_000,
            "very_complex": 100_000
        }[complexity]

        # Priority multiplier
        multipliers = {
            "critical": 2.0,
            "high": 1.5,
            "medium": 1.0,
            "low": 0.7
        }
        allocated_tokens = int(base_tokens * multipliers[priority])

        # Check system budget
        if not self.system_budget.can_allocate(allocated_tokens):
            if priority in ("critical", "high"):
                # High-priority tasks can borrow from reserved budget
                allocated_tokens = min(
                    allocated_tokens,
                    self.system_budget.available_including_reserved
                )
            else:
                # Low-priority tasks wait
                raise InsufficientSystemBudget(
                    f"System budget insufficient for {priority} task. Try again later."
                )

        self.system_budget.allocate(allocated_tokens, task.id)

        return TaskBudget(
            task_id=task.id,
            max_total_tokens=allocated_tokens,
            max_tool_calls=allocated_tokens // 1000  # Rough heuristic
        )
```

---

## Budget Alerts and Escalation

Budgets without alerts are incomplete. Define three alert thresholds:

```python
BUDGET_ALERT_THRESHOLDS = [
    {
        "threshold": 0.70,
        "action": "log_warning",
        "message": "Task at 70% of token budget"
    },
    {
        "threshold": 0.90,
        "action": "alert_and_compress_context",
        "message": "Task at 90% of token budget — compressing context"
    },
    {
        "threshold": 1.00,
        "action": "graceful_termination",
        "message": "Task at 100% of token budget — terminating gracefully"
    }
]

async def check_budget_thresholds(
    tracker: BudgetTracker,
    agent: Agent
) -> None:
    for threshold_config in BUDGET_ALERT_THRESHOLDS:
        if tracker.utilization >= threshold_config["threshold"]:
            if threshold_config["action"] == "log_warning":
                agent.logger.warn("budget.threshold", utilization=tracker.utilization)

            elif threshold_config["action"] == "alert_and_compress_context":
                await agent.compress_context()  # Summarize old context to free tokens
                agent.logger.warn(
                    "budget.context_compressed",
                    utilization=tracker.utilization
                )

            elif threshold_config["action"] == "graceful_termination":
                raise BudgetExceededError(threshold_config["message"])
```

---

## Reporting Budget Utilization

Budget data is valuable for capacity planning and cost optimization:

```python
class BudgetReporter:
    async def generate_daily_report(self) -> DailyBudgetReport:
        tasks = await self.task_db.get_tasks_for_period(period="today")

        by_agent = defaultdict(BudgetSummary)
        for task in tasks:
            by_agent[task.agent_id].add(task.budget_used)

        return DailyBudgetReport(
            date=today(),
            total_spend_usd=sum(s.total_cost_usd for s in by_agent.values()),
            by_agent=dict(by_agent),
            over_budget_tasks=[t for t in tasks if t.budget_exceeded],
            most_expensive_task_types=self.rank_by_cost(tasks),
            budget_efficiency_score=self.compute_efficiency(tasks)
        )
```

---

## Summary

- Uncapped agent spending is a production risk: variable cost, runaway potential, cascade effects, shared quotas
- Three budget types: per-task (most granular), per-agent (operational), system-level (organizational)
- Token budget implementation: check before calling LLM, charge after, warn at thresholds, terminate gracefully at limit
- Dynamic budget allocation bases limits on estimated task complexity and priority
- Three alert thresholds: 70% (warn), 90% (compress context), 100% (graceful termination)

---

*Next: [Lesson 5.3 — Caching Strategies](03-caching-strategies.md)*
