import { complete, MODEL_HAIKU } from "./index";

export interface TriageScores {
  scoreWorkflow: number;    // 0–3
  scoreOutcome: number;     // 0–3
  scoreGovernance: number;  // 0–3
  scoreRole: number;        // 0–3
  totalScore: number;
  bucket: "auto_approve" | "standard_review" | "flag_rejection";
  flagReason: string | null;
}

const TRIAGE_SYSTEM = `You are reviewing credential artifact submissions for AgenticAcademy's Tier 1 Workflow Certified credential.

The credential assesses whether the learner has implemented a real agentic AI workflow transformation in their professional work — not whether they understand the theory.

Score each criterion on a 0–3 scale:
1. Workflow Change Specificity (scoreWorkflow): Is a specific before/after change described?
   - 3: Before/after clearly described; specific tool/agent pattern/workflow redesign named; reviewers could replicate it
   - 2: Change is described but either before or after is vague; reviewable but thin
   - 1: Change is implied but not stated directly; heavy use of course vocabulary without real-work connection
   - 0: No workflow change; course reflection, theoretical, or sandbox exercise

2. Outcome Evidence (scoreOutcome): Is there measurable or observable evidence of impact?
   - 3: Quantitative metric (time, volume, error rate, cost) with context; or before/after artifact
   - 2: Qualitative outcome clearly described and plausible; or rough quantitative estimate with explanation
   - 1: Outcome stated but not substantiated ("it saved time" with no evidence)
   - 0: No outcome stated; describes implementation only

3. Governance & Compliance Awareness (scoreGovernance): Does the learner show awareness of oversight/auditability/compliance?
   - 3: Specific governance design: reversibility, audit logging, human review gates, compliance communication
   - 2: Governance acknowledged: noted a compliance consideration or communicated about agent behavior
   - 1: Generic statement ("I made sure it was secure") without specifics
   - 0: No mention of governance; or learner worked around governance processes

4. Role-Appropriate Application (scoreRole): Is this a real professional context, not sandbox or hypothetical?
   - 3: Clearly tied to learner's role and industry; organizational relevance (affects team/process/system)
   - 2: Plausible for the role; individual-only impact acceptable
   - 1: Generic; could apply to any professional without role-specific insight
   - 0: Sandbox/demo only; personal/hobby project; no professional context

Bucket assignment:
- "auto_approve": totalScore >= 10 AND no auto-fail signals
- "flag_rejection": any auto-fail signal present (hypothetical language, AI-generated generic content, course reflection only, no real workflow)
- "standard_review": everything else

Auto-fail signals (flag for rejection regardless of score):
- Submission describes planned/imagined workflow, not implemented (uses "would", "could", "plan to", "will implement")
- Generic AI description with no workflow specificity ("AI helps businesses automate tasks...")
- Course reflection only — summarizes course content without real-world application
- Near-identical to sample artifacts (plagiarism)

Respond ONLY with valid JSON matching this exact schema:
{"scoreWorkflow": N, "scoreOutcome": N, "scoreGovernance": N, "scoreRole": N, "totalScore": N, "bucket": "auto_approve"|"standard_review"|"flag_rejection", "flagReason": "string or null"}`;

export async function triageSubmission(
  narrative: string
): Promise<TriageScores> {
  const raw = await complete(narrative, {
    model: MODEL_HAIKU,
    maxTokens: 512,
    system: TRIAGE_SYSTEM,
  });

  // Parse JSON response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Triage model returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    scoreWorkflow: number;
    scoreOutcome: number;
    scoreGovernance: number;
    scoreRole: number;
    totalScore: number;
    bucket: string;
    flagReason: string | null;
  };

  // Clamp scores to 0–3
  const clamp = (n: number) => Math.max(0, Math.min(3, Math.round(n)));
  const scoreWorkflow = clamp(parsed.scoreWorkflow);
  const scoreOutcome = clamp(parsed.scoreOutcome);
  const scoreGovernance = clamp(parsed.scoreGovernance);
  const scoreRole = clamp(parsed.scoreRole);
  const totalScore = scoreWorkflow + scoreOutcome + scoreGovernance + scoreRole;

  const validBuckets = ["auto_approve", "standard_review", "flag_rejection"];
  const bucket = validBuckets.includes(parsed.bucket)
    ? (parsed.bucket as TriageScores["bucket"])
    : "standard_review";

  return {
    scoreWorkflow,
    scoreOutcome,
    scoreGovernance,
    scoreRole,
    totalScore,
    bucket,
    flagReason: parsed.flagReason ?? null,
  };
}

/**
 * Build the narrative string to send for triage from submission fields.
 */
export function buildTriageNarrative(submission: {
  submitterRole: string;
  industry: string;
  beforeState: string;
  whatChanged: string;
  outcomeEvidence: string;
  governanceStatement: string;
}): string {
  return `Submitter Role: ${submission.submitterRole}
Industry: ${submission.industry}

--- Section 1: Before State ---
${submission.beforeState}

--- Section 2: What I Changed ---
${submission.whatChanged}

--- Section 3: Outcome Evidence ---
${submission.outcomeEvidence}

--- Section 4: Governance Awareness Statement ---
${submission.governanceStatement}`;
}
