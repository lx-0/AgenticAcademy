# Capstone Project: Design a Production-Grade Agentic System

**Course**: Agentic Engineering Fundamentals
**Prerequisite**: Pass all 5 module assessments
**Estimated time**: 4–6 hours
**Submission**: Written design document (2,000–4,000 words) + optional implementation artifact

---

## Overview

The capstone project integrates all five course modules into a single, cohesive deliverable: a production-grade agentic system design. You will design a system from scratch, applying architecture, orchestration, governance, observability, and cost management principles you've learned.

Completion of this capstone (combined with passing all 5 module assessments) earns your **Agentic Engineering Fundamentals Certificate**.

---

## The Problem Statement

**You are designing an Agentic Research Assistant for an enterprise legal team.**

The system must:
1. Accept complex legal research questions from attorneys
2. Search internal case law databases, regulatory filings, and public legal databases
3. Synthesize findings into structured research memos
4. Ensure all outputs meet attorney-client privilege and data handling requirements
5. Operate within a $500/month budget for 200 attorneys making ~5 research requests each per month (1,000 requests/month total)

This is not a toy problem. Legal research has real stakes (incorrect research could harm clients), real regulatory requirements (attorney-client privilege, data protection), and real cost constraints.

---

## Deliverable Requirements

Your design document must address all five sections:

### Section 1: Architecture (Module 1)

**Required**:

1. **System diagram**: A complete architecture diagram showing all agents, their roles, and communication patterns. Use the patterns from Module 1.

2. **Agent inventory**: For each agent, define:
   - Name and role
   - Input contract (what it accepts)
   - Output contract (what it produces)
   - Tools available
   - State requirements (ephemeral vs. persistent)

3. **Pattern justification**: Which multi-agent pattern(s) did you choose (orchestrator/worker, pipeline, hierarchical)? Why? What alternatives did you consider and reject?

4. **Failure handling at the architecture level**: What happens if the primary research agent fails mid-task? How does the architecture ensure the attorney gets a useful response?

**Minimum**: 1 diagram, 4+ agents with full contracts, 200+ word pattern justification

---

### Section 2: Orchestration (Module 2)

**Required**:

1. **Task routing strategy**: How does the system determine which agent handles a legal research question? (Consider: patent law vs. employment law vs. contract review — these require different expertise.)

2. **Handoff design**: A research question may require 3+ agents in sequence. Design the handoff schema for at least one critical handoff in your system. Include all required fields from Lesson 2.2.

3. **Concurrency approach**: Can some research tasks run in parallel? Which ones? Describe your fan-out/fan-in design.

4. **State management**: The system needs to track research progress across multiple concurrent attorneys. Describe your state management approach. What type of state (from Lesson 2.4) does each component use?

**Minimum**: Routing rationale, 1 complete handoff schema, concurrency description, state type mapping

---

### Section 3: Governance and Compliance (Module 3)

This is the enterprise-critical section. Legal systems have unique compliance requirements.

**Required**:

1. **Attorney-client privilege protection**: Attorneys' research queries and the resulting memos contain privileged information. Design guardrails that prevent:
   - Research content from being logged in readable form outside the secure audit store
   - Any agent from accessing one attorney's work product when processing another attorney's request (context bleed prevention)
   - External API calls that might expose privileged query content

2. **Guardrail implementation**: Define at least 3 guardrails from Lesson 3.2 that are specific to this legal context (not generic examples from the lesson).

3. **Audit trail design**: Legal research requires a complete record for malpractice defense. What do you log? In what format? With what retention policy? Reference the attorney-client privilege constraints.

4. **Human-in-the-loop**: Define escalation triggers specific to legal research. When should an attorney be required to review before the system proceeds? Include at least 3 specific triggers.

5. **Access control**: Attorneys should only see their own research. Associates can see partner research in their practice group. Partners can see all research. Design the permission model.

**Minimum**: 3 specific guardrails, complete audit trail schema, 3 HITL triggers, permission model diagram

---

### Section 4: Observability (Module 4)

**Required**:

1. **Instrumentation plan**: What spans will you create in your OTel implementation? List the 5 most important spans for debugging this system. For each span, list 3–5 key attributes.

2. **Agent health dashboard**: Design the key panels for your production dashboard. What metrics do attorneys (or their IT administrators) need to see? What metrics do platform engineers need?

3. **Failure scenario analysis**: Choose one of the failure modes from Module 4 and describe how it would manifest in this legal research system. How would you detect it? How would you fix it?

4. **SLA definition**: Define the service level objectives (SLOs) for this system:
   - Availability target
   - Latency target (p95 response time)
   - Accuracy target (% of research memos rated satisfactory by attorneys)

**Minimum**: 5 spans with attributes, dashboard description, 1 failure analysis, 3 SLOs

---

### Section 5: Cost Management (Module 5)

**Required**:

1. **Cost model**: Estimate the cost per research request at baseline (before optimization). Show your work: which agents use which models, how many tokens per agent, total cost estimate.

2. **Budget allocation**: The system has $500/month for 1,000 requests. That's $0.50/request budget. If your baseline estimate exceeds this, identify which optimizations you'll apply. If it doesn't, describe what you'd do if usage doubled.

3. **Optimization strategy**: Apply at least 2 optimization strategies from Module 5. For each, estimate the savings and any quality trade-offs.

4. **Cost monitoring plan**: Define the alerts and dashboards you'd build to prevent cost overruns in this system. What would trigger an on-call alert? What would trigger an automatic throttle?

**Minimum**: Cost estimate with calculations, 2 applied optimizations, monitoring plan

---

## Evaluation Rubric

| Section | Points | Passing |
|---------|--------|---------|
| Architecture (Section 1) | 25 | 17/25 |
| Orchestration (Section 2) | 20 | 14/20 |
| Governance & Compliance (Section 3) | 25 | 17/25 |
| Observability (Section 4) | 15 | 10/15 |
| Cost Management (Section 5) | 15 | 10/15 |
| **Total** | **100** | **70/100** |

### Scoring criteria

**Architecture (25 points)**:
- Diagram is complete and accurate: 8 pts
- Agent contracts are well-defined with input/output schemas: 8 pts
- Pattern choice is justified with trade-offs acknowledged: 5 pts
- Failure handling is realistic and specific: 4 pts

**Orchestration (20 points)**:
- Routing strategy addresses the complexity of legal domains: 6 pts
- Handoff schema is complete and production-realistic: 6 pts
- Concurrency design is sound (correct fan-out/fan-in): 4 pts
- State management is correctly typed and described: 4 pts

**Governance (25 points)**:
- Attorney-client privilege protection is specific and implementable: 8 pts
- 3 guardrails are relevant to legal context and correctly designed: 7 pts
- Audit trail design is complete with retention and format: 5 pts
- HITL triggers are specific and escalation behavior is defined: 5 pts

**Observability (15 points)**:
- Spans cover critical execution paths: 5 pts
- Dashboard addresses both user and platform engineer needs: 5 pts
- Failure analysis is specific and actionable: 5 pts

**Cost Management (15 points)**:
- Cost model is reasonable and calculation is shown: 6 pts
- Optimizations are specific with estimated savings: 5 pts
- Monitoring plan prevents overruns proactively: 4 pts

---

## Submission Format

Submit a single document containing:

1. **Executive Summary** (200 words): What does the system do and what makes your design production-grade?

2. **Sections 1–5** as described above

3. **Optional Implementation Artifact**: If you choose to implement any component (e.g., the guardrail layer, the cost estimation model, an OTel instrumentation example), include it as an appendix. Partial implementations that demonstrate understanding are valued.

Submit via:
```bash
course-platform submit-capstone \
  --document /path/to/your-capstone.md \
  --course agentic-engineering-fundamentals
```

---

## Tips for a Strong Capstone

**Be specific, not generic**. "We will implement guardrails" scores 0. "We will implement an output filter that scans for case names and docket numbers before returning results to ensure privileged information isn't exposed through the system prompt of other requests" scores well.

**Show the trade-offs**. Every design decision has alternatives. Mentioning that you considered an alternative and explaining why you rejected it demonstrates architectural maturity.

**Connect to real failure modes**. The course taught you what can go wrong. Apply that knowledge: "We use handoff acknowledgment because in testing we found that dropped handoffs resulted in attorneys receiving 'still in progress' responses that never resolved."

**Address the legal-specific requirements genuinely**. Attorney-client privilege is not just a compliance checkbox. Think through the actual mechanism by which a research memo could inadvertently expose privileged content and design specifically against it.

**Make your cost model show its work**. An estimate without calculations is a guess. Show: agent × calls × tokens × price = cost.

---

## Certificate

Upon submitting a passing capstone (70+ points) with all 5 module assessments passed, you receive the **Agentic Engineering Fundamentals Certificate** from AgenticAcademy.

This certificate demonstrates:
- Ability to design production-grade multi-agent architectures
- Understanding of orchestration, state management, and failure handling
- Governance and compliance knowledge for enterprise agentic deployments
- Practical observability and debugging skills
- Cost management discipline for production systems

---

*Good luck. Build something production-worthy.*
