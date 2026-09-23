import { useEffect, useState } from "react";
import { Eye, X, Code } from "lucide-react";
import { getMySubmissions } from "../../services/submissionService";
import Loader from "../../components/common/Loader";
import AIEvaluationResult from "../../components/problem/AIEvaluationResult";

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

  const renderAIStatusBadge = (aiEvaluation) => {
    if (!aiEvaluation || !aiEvaluation.overallStatus) {
      return (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
          Pending Analysis
        </span>
      );
    }

    switch (aiEvaluation.overallStatus) {
      case "likely_correct":
        return (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            ✓ Likely Correct
          </span>
        );
      case "likely_incorrect":
        return (
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
            ⚠ Likely Incorrect
          </span>
        );
      case "needs_verification":
        return (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
            ? Needs Verification
          </span>
        );
      default:
        return (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Unavailable
          </span>
        );
    }
  };

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
                  <th className="px-6 py-4">AI Prediction</th>
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

                    <td className="px-6 py-4">
                      {renderAIStatusBadge(submission.aiEvaluation)}
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
                        View Feedback
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

            {/* Submitted Code Preview */}
            <div className="mt-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                <Code size={15} />
                Submitted Code
              </div>
              <pre className="rounded-xl bg-slate-950 p-4 font-mono text-xs text-green-300 overflow-x-auto max-h-52">
                {selectedSubmission.code}
              </pre>
            </div>

            {/* AI Evaluation */}
            <div className="mt-6">
              {selectedSubmission.aiEvaluation ? (
                <AIEvaluationResult
                  evaluation={selectedSubmission.aiEvaluation}
                />
              ) : (
                <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No AI evaluation recorded for this submission.
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