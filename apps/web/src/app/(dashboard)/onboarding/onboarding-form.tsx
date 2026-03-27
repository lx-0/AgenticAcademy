"use client";

import { useFormState, useFormStatus } from "react-dom";
import { upsertProfileAction } from "@/actions/personalization";

const ROLES = [
  "Software Engineer",
  "Data Scientist",
  "Product Manager",
  "Engineering Manager",
  "DevOps / Platform Engineer",
  "Solutions Architect",
  "Technical Lead",
  "Other",
];

const GOALS = [
  "Build and deploy agentic AI systems",
  "Understand AI governance and compliance",
  "Lead teams through AI transformation",
  "Evaluate and select AI tooling",
  "Design multi-agent orchestration patterns",
  "Measure ROI of AI initiatives",
];

interface Props {
  existing: {
    role: string;
    experienceLevel: string;
    learningGoals: string[];
    preferredPace: string;
  } | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Saving..." : "Save and continue"}
    </button>
  );
}

export function OnboardingForm({ existing }: Props) {
  const [state, action] = useFormState(upsertProfileAction, null);

  return (
    <form action={action} className="space-y-8">
      {state?.error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
          {state.error}
        </div>
      )}

      {/* Role */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          What is your role?
        </label>
        <select
          name="role"
          defaultValue={existing?.role ?? ""}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          required
        >
          <option value="" disabled>
            Select your role
          </option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Experience level */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-3">
          How experienced are you with AI and agentic systems?
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(["beginner", "intermediate", "advanced"] as const).map((level) => (
            <label
              key={level}
              className="relative flex flex-col items-center gap-1 border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-brand-400 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 transition-colors"
            >
              <input
                type="radio"
                name="experienceLevel"
                value={level}
                defaultChecked={existing ? existing.experienceLevel === level : level === "beginner"}
                className="sr-only"
                required
              />
              <span className="text-xl">
                {level === "beginner" ? "🌱" : level === "intermediate" ? "🌿" : "🌳"}
              </span>
              <span className="text-sm font-medium text-gray-900 capitalize">{level}</span>
              <span className="text-xs text-gray-500 text-center">
                {level === "beginner"
                  ? "New to AI systems"
                  : level === "intermediate"
                  ? "Some AI project experience"
                  : "Production AI deployments"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Learning goals */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-1">
          What are your learning goals? <span className="text-gray-500 font-normal">(select all that apply)</span>
        </label>
        <p className="text-xs text-gray-500 mb-3">These shape your personalized learning path.</p>
        <div className="space-y-2">
          {GOALS.map((goal) => (
            <label
              key={goal}
              className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-brand-400 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 transition-colors"
            >
              <input
                type="checkbox"
                name="learningGoals"
                value={goal}
                defaultChecked={existing?.learningGoals.includes(goal)}
                className="mt-0.5 accent-brand-600"
              />
              <span className="text-sm text-gray-800">{goal}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Preferred pace */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-3">
          How do you prefer to learn?
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(["slow", "moderate", "fast"] as const).map((pace) => (
            <label
              key={pace}
              className="relative flex flex-col items-center gap-1 border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-brand-400 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 transition-colors"
            >
              <input
                type="radio"
                name="preferredPace"
                value={pace}
                defaultChecked={existing ? existing.preferredPace === pace : pace === "moderate"}
                className="sr-only"
                required
              />
              <span className="text-xl">
                {pace === "slow" ? "🐢" : pace === "moderate" ? "🚶" : "🚀"}
              </span>
              <span className="text-sm font-medium text-gray-900 capitalize">{pace}</span>
              <span className="text-xs text-gray-500 text-center">
                {pace === "slow"
                  ? "Deep dives, no rush"
                  : pace === "moderate"
                  ? "Balanced progression"
                  : "Move fast, get to advanced topics"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          You can update this at any time from your profile settings.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
