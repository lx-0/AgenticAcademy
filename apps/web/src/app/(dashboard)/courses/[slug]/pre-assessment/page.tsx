import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SkillAssessmentQuiz } from "./skill-assessment-quiz";
import { trackFunnelEvent } from "@/lib/funnel";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: "Pre-Assessment — AgenticAcademy" };
}

const SKILL_QUESTIONS = [
  {
    skillName: "Agent Architecture",
    question:
      "Which pattern best describes a multi-agent orchestration where a central agent delegates sub-tasks to specialist agents?",
    options: [
      "Peer-to-peer mesh",
      "Hierarchical orchestrator-worker",
      "Event-driven publish-subscribe",
      "Shared memory pool",
    ],
  },
  {
    skillName: "Observability",
    question:
      "What is the primary purpose of structured trace logging in agentic workflows?",
    options: [
      "Reduce LLM token usage",
      "Enable replay and root-cause analysis of agent decisions",
      "Encrypt agent-to-agent communication",
      "Cache tool call results",
    ],
  },
  {
    skillName: "Governance",
    question:
      "Which control mechanism prevents an agent from executing irreversible actions without human approval?",
    options: [
      "Rate limiting",
      "Human-in-the-loop checkpoint",
      "Output caching",
      "Prompt compression",
    ],
  },
  {
    skillName: "Cost Management",
    question:
      "What strategy most effectively reduces LLM API costs in a long-running agentic workflow?",
    options: [
      "Increasing max_tokens to avoid truncation",
      "Using a single large model for all sub-tasks",
      "Routing simple sub-tasks to cheaper, smaller models",
      "Disabling streaming responses",
    ],
  },
  {
    skillName: "Prompt Engineering",
    question: "In a ReAct-style agent loop, what does the 'Observation' step represent?",
    options: [
      "The agent's internal chain-of-thought reasoning",
      "The result returned by executing a tool call",
      "The user's original instruction",
      "The agent's final answer to the user",
    ],
  },
];

export default async function PreAssessmentPage({ params }: { params: { slug: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const course = await db.course.findUnique({ where: { slug: params.slug } });
  if (!course || course.status !== "published") notFound();

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
  });
  if (!enrollment) redirect(`/courses/${params.slug}`);

  // Already completed the pre-assessment? Skip to course.
  const existing = await db.skillAssessment.findUnique({
    where: { enrollmentId_phase: { enrollmentId: enrollment.id, phase: "pre" } },
  });
  if (existing?.completedAt) redirect(`/courses/${params.slug}`);

  trackFunnelEvent({ userId: session.user.id, stage: "pre_assessment_started", courseId: course.id });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="flex items-center gap-2 hover:text-gray-900">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">AA</span>
              </div>
            </Link>
            <span>/</span>
            <Link href={`/courses/${params.slug}`} className="hover:text-gray-900">
              {course.title}
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Skill Assessment</span>
          </div>
          <Link
            href={`/courses/${params.slug}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Skip for now →
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-sm font-medium px-4 py-1.5 rounded-full mb-4">
            <span>📊</span> Pre-Course Skill Assessment
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Where are you starting from?
          </h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Answer 5 questions to benchmark your current knowledge. We&apos;ll compare
            your results after the course to measure how much you&apos;ve improved.
          </p>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: "⏱️", label: "~3 minutes", sub: "Quick diagnostic" },
            { icon: "🔒", label: "No pressure", sub: "Wrong answers = better insights" },
            { icon: "📈", label: "ROI proof", sub: "Compare before & after" },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-gray-200 p-4 text-center"
            >
              <div className="text-2xl mb-1">{card.icon}</div>
              <div className="font-semibold text-gray-900 text-sm">{card.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>

        <SkillAssessmentQuiz
          questions={SKILL_QUESTIONS}
          enrollmentId={enrollment.id}
          courseId={course.id}
          courseSlug={params.slug}
          phase="pre"
          redirectPath={`/courses/${params.slug}`}
        />
      </main>
    </div>
  );
}
