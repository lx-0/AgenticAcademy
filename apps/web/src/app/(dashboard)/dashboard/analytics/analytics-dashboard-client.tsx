"use client";

import { useState } from "react";

type FunnelRow = {
  stage: string;
  uniqueUsers: number;
  dropoffRate: number;
  threshold: number | null;
  breached: boolean;
};

function FunnelPanel({ funnelRows, overallConversion, days }: { funnelRows: FunnelRow[]; overallConversion: number; days: number }) {
  const STAGE_LABELS: Record<string, string> = {
    signup: "Signup",
    profile_setup: "Profile Setup",
    pre_assessment_started: "Pre-Assessment Started",
    pre_assessment_completed: "Pre-Assessment Completed",
    course_enrolled: "Course Enrolled",
    module_started: "Module Started",
    module_completed: "Module Completed",
    course_completed: "Course Completed",
    cert_downloaded: "Certificate Downloaded",
  };

  const maxUsers = funnelRows[0]?.uniqueUsers ?? 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Enrollment Funnel</h2>
          <p className="text-sm text-gray-500 mt-0.5">Last {days} days · unique users per stage</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-brand-600">{Math.round(overallConversion * 100)}%</div>
          <div className="text-xs text-gray-500">signup → cert</div>
        </div>
      </div>

      <div className="space-y-3">
        {funnelRows.map((row) => {
          const width = maxUsers > 0 ? (row.uniqueUsers / maxUsers) * 100 : 0;
          return (
            <div key={row.stage}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-700 font-medium">{STAGE_LABELS[row.stage] ?? row.stage}</span>
                  {row.breached && (
                    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                      ⚠ Drop-off alert
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">{row.uniqueUsers.toLocaleString()} users</span>
                  {row.dropoffRate > 0 && (
                    <span className={`font-medium ${row.breached ? "text-red-600" : "text-gray-400"}`}>
                      -{Math.round(row.dropoffRate * 100)}%
                      {row.threshold !== null && (
                        <span className="text-gray-400 font-normal"> (max {Math.round(row.threshold * 100)}%)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-gray-100 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${row.breached ? "bg-red-400" : "bg-brand-500"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Learner = {
  enrollmentId: string;
  userName: string;
  userEmail: string;
  enrolledAt: string;
  completedAt: string | null;
  status: string;
  modulesCompleted: number;
  totalModules: number;
  hasCertificate: boolean;
  preScore: number | null;
  postScore: number | null;
  improvement: number | null;
};

type SkillBreakdown = {
  skillName: string;
  avgPre: number | null;
  avgPost: number | null;
};

type CourseData = {
  course: { id: string; title: string; slug: string };
  totalEnrollments: number;
  completedCount: number;
  completionRate: number;
  avgTimeToCompletion: number | null;
  avgPreScore: number | null;
  avgPostScore: number | null;
  avgImprovementPct: number | null;
  preAssessmentCount: number;
  postAssessmentCount: number;
  skillBreakdown: SkillBreakdown[];
  learners: Learner[];
};

function pct(val: number) {
  return `${Math.round(val * 100)}%`;
}

function BarChart({ label, pre, post }: { label: string; pre: number | null; post: number | null }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500 font-medium truncate" title={label}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-8 text-right shrink-0">Pre</span>
        <div className="flex-1 bg-gray-100 rounded-full h-3 relative">
          <div
            className="bg-gray-400 h-3 rounded-full"
            style={{ width: `${pre ?? 0}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-8 shrink-0">
          {pre !== null ? `${pre}%` : "—"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-brand-500 w-8 text-right shrink-0">Post</span>
        <div className="flex-1 bg-gray-100 rounded-full h-3 relative">
          <div
            className="bg-brand-500 h-3 rounded-full"
            style={{ width: `${post ?? 0}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-8 shrink-0">
          {post !== null ? `${post}%` : "—"}
        </span>
      </div>
    </div>
  );
}

function exportCsv(courseTitle: string, learners: Learner[]) {
  const headers = [
    "Name",
    "Email",
    "Enrolled",
    "Completed",
    "Status",
    "Modules Done",
    "Total Modules",
    "Certificate",
    "Pre Score (%)",
    "Post Score (%)",
    "Improvement (pts)",
  ];
  const rows = learners.map((l) => [
    l.userName,
    l.userEmail,
    new Date(l.enrolledAt).toLocaleDateString(),
    l.completedAt ? new Date(l.completedAt).toLocaleDateString() : "",
    l.status,
    l.modulesCompleted,
    l.totalModules,
    l.hasCertificate ? "Yes" : "No",
    l.preScore ?? "",
    l.postScore ?? "",
    l.improvement ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${courseTitle.replace(/\s+/g, "-")}-learners.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CourseCard({ data }: { data: CourseData }) {
  const [showLearners, setShowLearners] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Course header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{data.course.title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {data.totalEnrollments} enrolled · {data.preAssessmentCount} pre-assessments ·{" "}
              {data.postAssessmentCount} post-assessments
            </p>
          </div>
          {data.avgImprovementPct !== null && (
            <div
              className={`shrink-0 px-3 py-1 rounded-full text-sm font-bold ${
                data.avgImprovementPct > 0
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {data.avgImprovementPct > 0 ? "+" : ""}
              {Math.round(data.avgImprovementPct)}pts avg improvement
            </div>
          )}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y md:divide-y-0 divide-gray-100 border-b border-gray-100">
        {[
          {
            label: "Completion Rate",
            value: pct(data.completionRate),
            sub: `${data.completedCount}/${data.totalEnrollments} learners`,
            color: data.completionRate >= 0.4 ? "text-green-600" : "text-orange-500",
          },
          {
            label: "Avg Pre-Score",
            value: data.avgPreScore !== null ? `${data.avgPreScore}%` : "—",
            sub: data.preAssessmentCount > 0 ? `${data.preAssessmentCount} responses` : "No data yet",
            color: "text-gray-600",
          },
          {
            label: "Avg Post-Score",
            value: data.avgPostScore !== null ? `${data.avgPostScore}%` : "—",
            sub: data.postAssessmentCount > 0 ? `${data.postAssessmentCount} responses` : "No data yet",
            color: "text-brand-600",
          },
          {
            label: "Avg Time to Complete",
            value:
              data.avgTimeToCompletion !== null
                ? `${data.avgTimeToCompletion.toFixed(1)}d`
                : "—",
            sub: "from enrollment",
            color: "text-gray-600",
          },
        ].map((stat) => (
          <div key={stat.label} className="p-5 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs font-medium text-gray-700 mt-0.5">{stat.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Skill breakdown bar charts */}
      <div className="p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Skill-level improvement (pre vs post)
        </h3>
        {data.skillBreakdown.every((s) => s.avgPre === null && s.avgPost === null) ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No assessment data yet. Learners who complete pre/post assessments will appear here.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {data.skillBreakdown.map((s) => (
              <BarChart
                key={s.skillName}
                label={s.skillName}
                pre={s.avgPre}
                post={s.avgPost}
              />
            ))}
          </div>
        )}
      </div>

      {/* Per-learner breakdown */}
      <div className="border-t border-gray-100">
        <div className="px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setShowLearners((v) => !v)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            {showLearners ? "▲ Hide" : "▼ Show"} per-learner breakdown (
            {data.learners.length})
          </button>
          <button
            onClick={() => exportCsv(data.course.title, data.learners)}
            className="text-sm px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <span>⬇</span> Export CSV
          </button>
        </div>

        {showLearners && (
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Learner
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Pre
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Post
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Change
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Cert
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.learners.map((l) => (
                  <tr key={l.enrollmentId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate max-w-[160px]">
                        {l.userName}
                      </div>
                      <div className="text-xs text-gray-400 truncate max-w-[160px]">
                        {l.userEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              l.status === "completed" ? "bg-green-500" : "bg-brand-500"
                            }`}
                            style={{
                              width: `${
                                l.totalModules > 0
                                  ? Math.round((l.modulesCompleted / l.totalModules) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {l.modulesCompleted}/{l.totalModules}
                        </span>
                      </div>
                      <span
                        className={`mt-1 inline-block text-xs px-1.5 py-0.5 rounded-full ${
                          l.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : l.status === "active"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {l.preScore !== null ? `${l.preScore}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-gray-900">
                      {l.postScore !== null ? `${l.postScore}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.improvement !== null ? (
                        <span
                          className={`font-semibold ${
                            l.improvement > 0
                              ? "text-green-600"
                              : l.improvement < 0
                              ? "text-red-500"
                              : "text-gray-400"
                          }`}
                        >
                          {l.improvement > 0 ? "+" : ""}
                          {l.improvement}pts
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.hasCertificate ? (
                        <span className="text-green-500" title="Certificate issued">
                          ✓
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AnalyticsDashboardClient({
  courseData,
  funnelRows,
  overallConversion,
  funnelDays,
}: {
  courseData: CourseData[];
  funnelRows: FunnelRow[];
  overallConversion: number;
  funnelDays: number;
}) {
  // Top-line summary across all courses
  const totalEnrollments = courseData.reduce((s, c) => s + c.totalEnrollments, 0);
  const totalCompleted = courseData.reduce((s, c) => s + c.completedCount, 0);
  const overallCompletionRate =
    totalEnrollments > 0 ? totalCompleted / totalEnrollments : 0;
  const coursesWithImprovement = courseData.filter(
    (c) => c.avgImprovementPct !== null && c.avgImprovementPct > 0
  );
  const avgImprovement =
    coursesWithImprovement.length > 0
      ? Math.round(
          coursesWithImprovement.reduce((s, c) => s + (c.avgImprovementPct ?? 0), 0) /
            coursesWithImprovement.length
        )
      : null;

  return (
    <div className="space-y-8">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Enrollments",
            value: totalEnrollments,
            color: "text-brand-600",
          },
          {
            label: "Completion Rate",
            value: pct(overallCompletionRate),
            color: overallCompletionRate >= 0.4 ? "text-green-600" : "text-orange-500",
          },
          {
            label: "Avg Skill Improvement",
            value: avgImprovement !== null ? `+${avgImprovement}pts` : "—",
            color: "text-green-600",
          },
          {
            label: "Courses Tracked",
            value: courseData.length,
            color: "text-gray-700",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm"
          >
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Enrollment funnel */}
      {funnelRows.length > 0 && (
        <FunnelPanel funnelRows={funnelRows} overallConversion={overallConversion} days={funnelDays} />
      )}

      {/* Per-course cards */}
      {courseData.map((data) => (
        <CourseCard key={data.course.id} data={data} />
      ))}
    </div>
  );
}
