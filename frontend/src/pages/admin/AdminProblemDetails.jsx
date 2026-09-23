import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Calendar,
  CheckCircle,
  Clock3,
  FileCode,
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { getProblemById, deleteProblem } from "../../services/problemService";
import Loader from "../../components/common/Loader";

const AdminProblemDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const loadProblem = async () => {
      try {
        setLoading(true);
        const data = await getProblemById(id);
        setProblem(data.problem);
      } catch (err) {
        console.error("Failed to load problem:", err);
        setError("Problem not found or failed to load.");
      } finally {
        setLoading(false);
      }
    };

    loadProblem();
  }, [id]);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${problem.title}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      await deleteProblem(id);
      navigate("/admin/problems");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete problem");
      setDeleting(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  if (error || !problem) {
    return (
      <div className="mx-auto max-w-4xl p-8 text-center">
        <AlertCircle size={40} className="mx-auto text-red-500" />
        <h2 className="mt-3 text-xl font-bold text-slate-800">
          Problem Not Found
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {error || "The requested problem could not be found."}
        </p>
        <Link
          to="/admin/problems"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          <ArrowLeft size={16} />
          Back to Problems
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Top Breadcrumb & Action bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/admin/problems"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Back to Problems
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to={`/admin/problems/${problem._id}/edit`}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Pencil size={16} />
            Edit Problem
          </Link>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 size={16} />
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {/* Main Details Card */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            {problem.topic || "General"}
          </span>

          <span
            className={`rounded-lg px-3 py-1 text-xs font-semibold ${
              problem.difficulty === "Easy"
                ? "bg-green-50 text-green-700"
                : problem.difficulty === "Medium"
                ? "bg-yellow-50 text-yellow-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            {problem.difficulty}
          </span>

          {problem.status === "published" ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle size={13} />
              Published
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800">
              <Clock3 size={13} />
              Draft
            </span>
          )}

          {problem.publishDate && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 ml-auto">
              <Calendar size={13} />
              Publish Date:{" "}
              {new Date(problem.publishDate).toLocaleDateString()}
            </span>
          )}
        </div>

        <h1 className="mt-4 text-2xl font-bold text-slate-800 sm:text-3xl">
          {problem.title}
        </h1>

        <div className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Description
          </h2>
          <div className="mt-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
            {problem.description}
          </div>
        </div>

        {/* Input & Output Format */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {problem.inputFormat && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Input Format
              </h3>
              <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                {problem.inputFormat}
              </p>
            </div>
          )}

          {problem.outputFormat && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Output Format
              </h3>
              <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                {problem.outputFormat}
              </p>
            </div>
          )}
        </div>

        {/* Constraints */}
        {problem.constraints && (
          <div className="mt-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Constraints
            </h2>
            <div className="mt-2 rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-700 whitespace-pre-wrap">
              {problem.constraints}
            </div>
          </div>
        )}

        {/* Sample Input / Output */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {problem.sampleInput && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Sample Input
              </h3>
              <pre className="mt-2 rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100 overflow-x-auto">
                {problem.sampleInput}
              </pre>
            </div>
          )}

          {problem.sampleOutput && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Sample Output
              </h3>
              <pre className="mt-2 rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100 overflow-x-auto">
                {problem.sampleOutput}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Test Cases Card */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">
              Test Cases ({problem.testCases?.length || 0})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Used for automatic submission grading
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {!problem.testCases || problem.testCases.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              No test cases configured for this problem.
            </p>
          ) : (
            problem.testCases.map((tc, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Test Case #{idx + 1}
                  </span>
                  {tc.isHidden ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <EyeOff size={12} />
                      Hidden Test Case
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                      <Eye size={12} />
                      Public Test Case
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400">
                      Input:
                    </span>
                    <pre className="mt-1 rounded-lg bg-white border border-slate-200 p-2.5 font-mono text-xs text-slate-800 overflow-x-auto">
                      {tc.input}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400">
                      Expected Output:
                    </span>
                    <pre className="mt-1 rounded-lg bg-white border border-slate-200 p-2.5 font-mono text-xs text-slate-800 overflow-x-auto">
                      {tc.expectedOutput}
                    </pre>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminProblemDetails;

