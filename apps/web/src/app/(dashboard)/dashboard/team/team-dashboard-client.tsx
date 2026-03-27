"use client";

import { useState, useTransition } from "react";
import {
  generateInviteLinkAction,
  bulkEnrollAction,
  createTrackAction,
} from "@/actions/organization";

type Member = { userId: string; name: string | null; email: string; role: string };
type Course = { id: string; title: string; slug: string };
type Track = { id: string; name: string };
type BulkRecord = {
  id: string;
  courseId: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
};

type Props = {
  orgId: string;
  members: Member[];
  courses: Course[];
  tracks: Track[];
  bulkHistory: BulkRecord[];
  appUrl: string;
};

export function TeamDashboardClient({
  orgId,
  members,
  courses,
  tracks,
  bulkHistory,
  appUrl,
}: Props) {
  return (
    <div className="space-y-6">
      <InvitePanel orgId={orgId} appUrl={appUrl} />
      <BulkEnrollPanel orgId={orgId} members={members} courses={courses} bulkHistory={bulkHistory} />
      <CreateTrackPanel orgId={orgId} courses={courses} />
    </div>
  );
}

function InvitePanel({ orgId, appUrl }: { orgId: string; appUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function generateLink() {
    startTransition(async () => {
      const result = await generateInviteLinkAction(orgId, "learner");
      if (result.token) setToken(result.token);
    });
  }

  const inviteUrl = token ? `${appUrl}/org/join/${token}` : null;

  function copy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Invite members</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Generate a 7-day invite link for new team members.
        </p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <button
          onClick={generateLink}
          disabled={isPending}
          className="w-full py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Generating..." : "Generate invite link"}
        </button>
        {inviteUrl && (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 truncate"
            />
            <button
              onClick={copy}
              className="shrink-0 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BulkEnrollPanel({
  orgId,
  members,
  courses,
  bulkHistory,
}: {
  orgId: string;
  members: Member[];
  courses: Course[];
  bulkHistory: BulkRecord[];
}) {
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [result, setResult] = useState<{ success?: number; failed?: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedMembers(new Set(members.map((m) => m.userId)));
  }

  function clearAll() {
    setSelectedMembers(new Set());
  }

  function submit() {
    if (!selectedMembers.size || !courseId) return;
    const formData = new FormData();
    formData.set("orgId", orgId);
    formData.set("courseId", courseId);
    formData.set("memberIds", Array.from(selectedMembers).join(","));

    startTransition(async () => {
      const res = await bulkEnrollAction(formData);
      if (res.successCount !== undefined) {
        setResult({ success: res.successCount, failed: res.failedCount });
        setSelectedMembers(new Set());
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Bulk enroll</h3>
        <p className="text-xs text-gray-400 mt-0.5">Enroll multiple members in a course at once.</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        {/* Course picker */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Course</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {/* Member picker */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">
              Members ({selectedMembers.size} selected)
            </label>
            <div className="flex gap-2 text-xs text-brand-600">
              <button onClick={selectAll} className="hover:underline">All</button>
              <button onClick={clearAll} className="hover:underline">None</button>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto divide-y divide-gray-50">
            {members.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.has(m.userId)}
                  onChange={() => toggleMember(m.userId)}
                  className="rounded"
                />
                <span className="text-xs text-gray-700 truncate">{m.name ?? m.email}</span>
              </label>
            ))}
            {members.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">No members yet</div>
            )}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={isPending || !selectedMembers.size || !courseId}
          className="w-full py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Enrolling..." : `Enroll ${selectedMembers.size || ""} members`}
        </button>

        {result && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Done: {result.success} enrolled{result.failed ? `, ${result.failed} failed` : ""}.
          </p>
        )}

        {/* Recent bulk history */}
        {bulkHistory.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Recent bulk enrollments</p>
            <div className="space-y-1">
              {bulkHistory.slice(0, 3).map((b) => (
                <div key={b.id} className="flex items-center justify-between text-xs text-gray-600">
                  <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                  <span className="text-green-700">{b.successCount} enrolled</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTrackPanel({ orgId, courses }: { orgId: string; courses: Course[] }) {
  const [open, setOpen] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleCourse(id: string) {
    setSelectedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("orgId", orgId);
    formData.set("courseIds", Array.from(selectedCourses).join(","));

    startTransition(async () => {
      const res = await createTrackAction(formData);
      if (res.trackId) {
        setSuccess(true);
        setOpen(false);
        setSelectedCourses(new Set());
        form.reset();
        setTimeout(() => setSuccess(false), 3000);
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
      >
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Create learning track</h3>
          <p className="text-xs text-gray-400 mt-0.5">Assign a course sequence by role.</p>
        </div>
        <span className="text-gray-400 text-lg leading-none">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Track name</label>
            <input
              name="name"
              required
              placeholder="Engineering Fundamentals"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Role target{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              name="roleTarget"
              placeholder="software engineer"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Courses ({selectedCourses.size} selected)
            </label>
            <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto divide-y divide-gray-50">
              {courses.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedCourses.has(c.id)}
                    onChange={() => toggleCourse(c.id)}
                    className="rounded"
                  />
                  <span className="text-xs text-gray-700 truncate">{c.title}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={isPending || !selectedCourses.size}
            className="w-full py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? "Creating..." : "Create track"}
          </button>
        </form>
      )}

      {success && (
        <p className="px-5 pb-4 text-xs text-green-700">Track created successfully.</p>
      )}
    </div>
  );
}
