"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCredential } from "@/actions/credential";

const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Education",
  "Manufacturing",
  "Retail / E-commerce",
  "Professional Services",
  "Government / Public Sector",
  "Non-profit",
  "Media / Entertainment",
  "Logistics / Supply Chain",
  "Other",
] as const;

type Module = { id: string; title: string; courseTitle: string };

interface Props {
  enrolledModules: Module[];
  parentId?: string;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function SubmissionForm({ enrolledModules, parentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [beforeState, setBeforeState] = useState("");
  const [whatChanged, setWhatChanged] = useState("");
  const [outcomeEvidence, setOutcomeEvidence] = useState("");
  const [governanceStatement, setGovernanceStatement] = useState("");
  const [submitterRole, setSubmitterRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [implementationDate, setImplementationDate] = useState("");
  const [consentToPublish, setConsentToPublish] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const totalWords = countWords(
    [beforeState, whatChanged, outcomeEvidence, governanceStatement].join(" ")
  );
  const wordCountOk = totalWords >= 300;

  const maxDate = new Date().toISOString().split("T")[0];
  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return d.toISOString().split("T")[0];
  })();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Upload failed");
      } else {
        setAttachmentUrl(json.url);
      }
    } catch {
      setUploadError("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  }

  function toggleModule(id: string) {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wordCountOk) return;

    setError(null);
    startTransition(async () => {
      const result = await submitCredential({
        beforeState,
        whatChanged,
        outcomeEvidence,
        governanceStatement,
        submitterRole,
        industry,
        modulesCompleted: selectedModules,
        implementationDate,
        attachmentUrl,
        consentToPublish,
        parentId,
      });

      if (result.ok) {
        router.push(`/credentials?submitted=1`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Metadata */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          About You &amp; Your Submission
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Job Title / Role *
            </label>
            <input
              type="text"
              required
              value={submitterRole}
              onChange={(e) => setSubmitterRole(e.target.value)}
              placeholder="e.g. ML Engineer, Operations Manager"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Industry *
            </label>
            <select
              required
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select industry…</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Implementation Date *
            </label>
            <input
              type="date"
              required
              value={implementationDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setImplementationDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Must be within the last 180 days.
            </p>
          </div>
        </div>

        {/* Modules completed */}
        {enrolledModules.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modules Completed (select all that informed this submission) *
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
              {enrolledModules.map((mod) => (
                <label key={mod.id} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedModules.includes(mod.id)}
                    onChange={() => toggleModule(mod.id)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">{mod.title}</span>
                    <span className="text-gray-500"> — {mod.courseTitle}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 1 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Section 1 — Before State *
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Describe your workflow <em>before</em> applying agentic AI. What task
          were you performing? How long did it take, or what was the friction?
        </p>
        <textarea
          required
          rows={6}
          value={beforeState}
          onChange={(e) => setBeforeState(e.target.value)}
          placeholder="Our team spent 3 hours each morning manually reviewing…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </section>

      {/* Section 2 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Section 2 — What You Changed *
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Describe the specific workflow transformation you implemented. What
          agentic approach? Which modules from AgenticAcademy informed this?
          What did you build, configure, or redesign?
        </p>
        <textarea
          required
          rows={6}
          value={whatChanged}
          onChange={(e) => setWhatChanged(e.target.value)}
          placeholder="I built a lightweight agentic triage loop that…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </section>

      {/* Section 3 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Section 3 — Outcome Evidence *
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Describe what changed as a result. Include at least one of: a
          quantitative metric, a qualitative outcome, or a before/after
          artifact.
        </p>
        <textarea
          required
          rows={6}
          value={outcomeEvidence}
          onChange={(e) => setOutcomeEvidence(e.target.value)}
          placeholder="Processing time reduced from 3 hours to 20 minutes…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </section>

      {/* Section 4 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Section 4 — Governance Awareness Statement *
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Describe how you accounted for governance, oversight, or compliance in
          your implementation (audit logging, reversibility, human review gates,
          compliance communication, etc.).
        </p>
        <textarea
          required
          rows={5}
          value={governanceStatement}
          onChange={(e) => setGovernanceStatement(e.target.value)}
          placeholder="Every agent decision is written to an immutable audit log…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </section>

      {/* Word count indicator */}
      <div
        className={`flex items-center gap-2 text-sm font-medium ${
          wordCountOk ? "text-green-700" : "text-amber-700"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            wordCountOk ? "bg-green-500" : "bg-amber-500"
          }`}
        />
        {totalWords} / 300 words minimum
        {!wordCountOk && (
          <span className="text-amber-600">
            — {300 - totalWords} more words needed
          </span>
        )}
      </div>

      {/* Attachment */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Supporting Attachment <span className="text-gray-400 font-normal">(optional)</span>
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Upload a PDF or image (screenshots, process diagrams, before/after
          artifacts). Max 10 MB.
        </p>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileChange}
          disabled={uploading}
          className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
        />
        {uploading && (
          <p className="mt-1 text-sm text-gray-500">Uploading…</p>
        )}
        {uploadError && (
          <p className="mt-1 text-sm text-red-600">{uploadError}</p>
        )}
        {attachmentUrl && (
          <p className="mt-1 text-sm text-green-700">
            ✓ File uploaded successfully
          </p>
        )}
      </section>

      {/* Consent */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentToPublish}
            onChange={(e) => setConsentToPublish(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-gray-700">
            I consent to AgenticAcademy potentially publishing my submission as
            an anonymized sample artifact to help other learners calibrate their
            submissions.
          </span>
        </label>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isPending || !wordCountOk || uploading || !industry || !submitterRole || !implementationDate || selectedModules.length === 0}
          className="px-6 py-2.5 rounded-lg bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Submitting…" : "Submit for Review"}
        </button>
        {!wordCountOk && (
          <span className="text-sm text-amber-700">
            Minimum 300 words required across all sections.
          </span>
        )}
      </div>
    </form>
  );
}
