import { complete, MODEL_SONNET, MODEL_HAIKU } from "./index";

export interface LearnerContext {
  role: string;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  learningGoals: string[];
  preferredPace: "slow" | "moderate" | "fast";
}

export interface ModuleContext {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  hasAssessment: boolean;
  completionStatus?: "not_started" | "in_progress" | "completed" | "failed";
  score?: number | null; // 0–100 if assessed
}

export interface PathGenerationResult {
  moduleSequence: string[]; // ordered module IDs
  rationale: string;
}

export interface NextRecommendation {
  moduleId: string;
  reasoning: string;
}

/**
 * Generate an adaptive module sequence for a learner using Claude Sonnet.
 * Two learners with different profiles will receive different orderings.
 */
export async function generateLearningPath(
  learner: LearnerContext,
  modules: ModuleContext[]
): Promise<PathGenerationResult> {
  const moduleList = modules
    .map(
      (m) =>
        `- id: ${m.id} | title: "${m.title}" | order: ${m.order}${m.description ? ` | description: "${m.description.slice(0, 120)}"` : ""}`
    )
    .join("\n");

  const prompt = `You are an adaptive learning path engine. Given a learner's profile and a list of course modules, generate a personalized module sequence and explain why.

## Learner Profile
- Role: ${learner.role}
- Experience level: ${learner.experienceLevel}
- Learning goals: ${learner.learningGoals.join(", ") || "none specified"}
- Preferred pace: ${learner.preferredPace}

## Available Modules (default order shown)
${moduleList}

## Instructions
Return a JSON object with two fields:
1. "moduleSequence": array of module IDs in the recommended order for this learner
2. "rationale": 2-3 sentence explanation of why this order suits the learner

Rules:
- All module IDs must be present in the output exactly once
- Adapt to the learner's experience: advanced learners may skip foundational content early; beginners need scaffolding
- Fast-paced learners can tackle harder modules sooner; slow-paced learners benefit from more gradual progression
- Align module order with learning goals when possible

Respond with ONLY the JSON object, no markdown fences.`;

  const response = await complete(prompt, { model: MODEL_SONNET, maxTokens: 1024 });

  try {
    const parsed = JSON.parse(response.trim()) as {
      moduleSequence: string[];
      rationale: string;
    };
    // Validate all IDs are present
    const inputIds = new Set(modules.map((m) => m.id));
    const validSequence = parsed.moduleSequence.filter((id) => inputIds.has(id));
    // Add any missing IDs at the end (safety net)
    for (const id of inputIds) {
      if (!validSequence.includes(id)) validSequence.push(id);
    }
    return { moduleSequence: validSequence, rationale: parsed.rationale ?? "" };
  } catch {
    // Fallback: return default order
    return {
      moduleSequence: modules.sort((a, b) => a.order - b.order).map((m) => m.id),
      rationale: "Using default module order.",
    };
  }
}

/**
 * Recommend the next best module given current progress using Claude Sonnet.
 * Takes into account assessment scores to skip mastered content or insert remedial modules.
 */
export async function recommendNextModule(
  learner: LearnerContext,
  modules: ModuleContext[],
  currentPathSequence: string[]
): Promise<NextRecommendation | null> {
  const notStarted = currentPathSequence.filter((id) => {
    const m = modules.find((mod) => mod.id === id);
    return m && (!m.completionStatus || m.completionStatus === "not_started");
  });

  const failed = modules.filter((m) => m.completionStatus === "failed");
  const completed = modules.filter((m) => m.completionStatus === "completed");

  if (notStarted.length === 0 && failed.length === 0) return null;

  const progressSummary = modules
    .map((m) => {
      const status = m.completionStatus ?? "not_started";
      const scoreStr = m.score != null ? ` (score: ${m.score}%)` : "";
      return `- "${m.title}" [${status}${scoreStr}]`;
    })
    .join("\n");

  const prompt = `You are an adaptive learning recommendation engine.

## Learner Profile
- Role: ${learner.role}
- Experience: ${learner.experienceLevel}
- Goals: ${learner.learningGoals.join(", ") || "none"}

## Module Progress
${progressSummary}

## Planned Sequence (in order)
${currentPathSequence
  .map((id) => {
    const m = modules.find((mod) => mod.id === id);
    return m ? `- ${m.title} [${m.id}]` : null;
  })
  .filter(Boolean)
  .join("\n")}

## Completed modules: ${completed.length} / ${modules.length}

Recommend the single best next module to work on. Consider:
- If a learner failed a module (score < passing), recommend revisiting it before moving on, unless the score is close (>= 60%) and the learner is advanced, in which case moving forward is fine
- If a learner scored very high (>= 90%) on prerequisites, they may skip introductory follow-up modules
- Prioritize modules aligned with learning goals

Return JSON: {"moduleId": "<id>", "reasoning": "<1-2 sentence explanation>"}
Respond with ONLY the JSON, no markdown fences.`;

  const response = await complete(prompt, { model: MODEL_SONNET, maxTokens: 512 });

  try {
    const parsed = JSON.parse(response.trim()) as {
      moduleId: string;
      reasoning: string;
    };
    const valid = modules.some((m) => m.id === parsed.moduleId);
    return valid ? { moduleId: parsed.moduleId, reasoning: parsed.reasoning ?? "" } : null;
  } catch {
    // Fallback: first not-started in sequence
    if (notStarted.length > 0) {
      return { moduleId: notStarted[0]!, reasoning: "Continuing with the next module in your learning path." };
    }
    return null;
  }
}

/**
 * Classify which skills a module teaches using Claude Haiku (lightweight).
 */
export async function classifyModuleSkills(
  moduleTitle: string,
  moduleDescription: string,
  availableSkills: { id: string; name: string }[]
): Promise<string[]> {
  if (availableSkills.length === 0) return [];

  const skillList = availableSkills.map((s) => `- ${s.id}: ${s.name}`).join("\n");

  const prompt = `Given a course module, identify which skills from the list it teaches.

Module: "${moduleTitle}"
Description: "${moduleDescription.slice(0, 300)}"

Available skills:
${skillList}

Return a JSON array of skill IDs that this module covers. Return an empty array if none apply.
Respond with ONLY the JSON array.`;

  const response = await complete(prompt, { model: MODEL_HAIKU, maxTokens: 256 });

  try {
    const parsed = JSON.parse(response.trim()) as string[];
    const validIds = new Set(availableSkills.map((s) => s.id));
    return parsed.filter((id) => validIds.has(id));
  } catch {
    return [];
  }
}
