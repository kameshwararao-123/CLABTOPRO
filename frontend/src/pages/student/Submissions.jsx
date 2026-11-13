import { useEffect, useState } from "react";
import { Eye, X, Code, CheckCircle2, XCircle, Lock } from "lucide-react";
import { getMySubmissions } from "../../services/submissionService";
import Loader from "../../components/common/Loader";

const Submissions = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  useEffect(() => {
    const loadSubmissions = async () => {
      try {
        const data = await getMySubmissions();
        setSubmissions(data.submissions || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadSubmissions();
  }, []);

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-bold text-slate-800">My Submissions</h1>
      <p className="mt-1 text-slate-500">
        Review your previous code submissions and AI evaluation feedback.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {submissions.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              No submissions recorded yet.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-4">Problem</th>
                  <th className="px-6 py-4">Likely Tests</th>
                  <th className="px-6 py-4">Submitted Date</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {submissions.map((submission) => (
                  <tr
                    key={submission._id}
                    className="hover:bg-slate-50/70 transition"
                  >
                    <td className="px-6 py-4 font-medium text-slate-800">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {submission.problem?.title || "Problem"}
                        </p>
                        <span className="text-xs text-slate-400">
                          {submission.language?.toUpperCase() || "C"}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-600 text-xs">
                      {submission.testCasesPassed || 0} /{" "}
                      {submission.totalTestCases || 0}
                    </td>

                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(
                        submission.submittedAt || submission.createdAt
                      ).toLocaleDateString()}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedSubmission(submission)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Submission Detail & AI Feedback Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {selectedSubmission.problem?.title || "Submission Details"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submitted on{" "}
                  {new Date(
                    selectedSubmission.submittedAt ||
                      selectedSubmission.createdAt
                  ).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setSelectedSubmission(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Test Cases Passed Summary */}
            {(() => {
              const passedCount = selectedSubmission.testCasesPassed ?? 0;
              const totalCount =
                selectedSubmission.totalTestCases ??
                selectedSubmission.testCases?.length ??
                0;
              const isAccepted =
                selectedSubmission.status === "accepted" ||
                (totalCount > 0 && passedCount === totalCount);

              return (
                <div
                  className={`mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${
                    isAccepted
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-rose-200 bg-rose-50 text-rose-900"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    {isAccepted ? (
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle size={18} className="text-rose-600 shrink-0" />
                    )}
                    <span>
                      Test Cases Passed: {passedCount} / {totalCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {selectedSubmission.executionTime > 0 && (
                      <span className="opacity-80">
                        {selectedSubmission.executionTime} ms
                      </span>
                    )}
                    <span className="rounded-full bg-white/80 px-2.5 py-0.5 uppercase text-[11px] border border-current/15">
                      {(selectedSubmission.status || "evaluated").replaceAll("_", " ")}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Submitted Code Preview */}
            <div className="mt-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                <Code size={15} />
                Submitted Code
              </div>
              <pre className="rounded-xl bg-slate-950 p-4 font-mono text-xs text-green-300 overflow-x-auto max-h-64">
                {selectedSubmission.code || "// No code recorded"}
              </pre>
            </div>

            {/* Test Cases Breakdown */}
            <div className="mt-6 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Test Cases
              </div>

              {selectedSubmission.status === "compile_error" &&
                selectedSubmission.compilerOutput && (
                  <pre className="rounded-xl border border-rose-200 bg-rose-950 p-3.5 font-mono text-xs text-rose-200 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {selectedSubmission.compilerOutput}
                  </pre>
                )}

              {Array.isArray(selectedSubmission.testCases) &&
              selectedSubmission.testCases.length > 0 ? (
                <div className="space-y-2">
                  {selectedSubmission.testCases.map((tc, idx) => {
                    const isPassed = tc.status === "passed";
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3 text-xs ${
                          isPassed
                            ? "border-emerald-200 bg-emerald-50/50"
                            : "border-rose-200 bg-rose-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            {isPassed ? (
                              <CheckCircle2 size={15} className="text-emerald-600" />
                            ) : (
                              <XCircle size={15} className="text-rose-600" />
                            )}
                            <span>Test Case #{tc.testCaseNumber || idx + 1}</span>
                            {tc.isHidden && (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                <Lock size={10} />
                                Hidden
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {tc.executionTime > 0 && (
                              <span className="text-[11px] text-slate-500">
                                {tc.executionTime} ms
                              </span>
                            )}
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                isPassed
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {isPassed ? "Passed" : (tc.status || "Failed").replaceAll("_", " ")}
                            </span>
                          </div>
                        </div>

                        {!tc.isHidden && (
                          <div className="mt-2.5 grid gap-2 sm:grid-cols-3 font-mono text-[11px]">
                            <div className="rounded-lg border border-slate-200 bg-white p-2">
                              <span className="block font-sans text-[10px] font-bold text-slate-400">
                                Input
                              </span>
                              <pre className="whitespace-pre-wrap text-slate-700 mt-0.5">
                                {tc.input || "<empty>"}
                              </pre>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-2">
                              <span className="block font-sans text-[10px] font-bold text-slate-400">
                                Expected
                              </span>
                              <pre className="whitespace-pre-wrap text-slate-800 mt-0.5">
                                {tc.expectedOutput || "<empty>"}
                              </pre>
                            </div>
                            <div
                              className={`rounded-lg border bg-white p-2 ${
                                isPassed ? "border-emerald-200" : "border-rose-200"
                              }`}
                            >
                              <span
                                className={`block font-sans text-[10px] font-bold ${
                                  isPassed ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                Your Output
                              </span>
                              <pre
                                className={`whitespace-pre-wrap mt-0.5 ${
                                  isPassed ? "text-emerald-800" : "text-rose-700"
                                }`}
                              >
                                {tc.actualOutput || tc.error || "<empty output>"}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-500">
                  No individual test case breakdown recorded for this submission.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Submissions;