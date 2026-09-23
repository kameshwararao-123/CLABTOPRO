import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Code2,
  Plus,
  Search,
  Filter,
  Eye,
  Pencil,
  Trash2,
  CheckCircle,
  Clock3,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { getAllProblems, deleteProblem } from "../../services/problemService";
import Loader from "../../components/common/Loader";

const AdminProblems = () => {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [deletingId, setDeletingId] = useState(null);

  const fetchProblems = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getAllProblems();
      setProblems(data.problems || []);
    } catch (err) {
      console.error("Failed to load problems:", err);
      setError("Failed to load problems. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProblems();
  }, []);

  const handleDelete = async (id, title) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete problem "${title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(id);
      await deleteProblem(id);
      setProblems((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      alert(
        err.response?.data?.message || "Failed to delete problem. Try again."
      );
    } finally {
      setDeletingId(null);
    }
  };

  // Extract unique topics for dropdown
  const uniqueTopics = Array.from(
    new Set(problems.map((p) => p.topic).filter(Boolean))
  );

  // Filtered problems
  const filteredProblems = problems.filter((problem) => {
    const matchesSearch =
      problem.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      problem.topic?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDifficulty =
      difficultyFilter === "all" || problem.difficulty === difficultyFilter;

    const matchesStatus =
      statusFilter === "all" || problem.status === statusFilter;

    const matchesTopic =
      topicFilter === "all" || problem.topic === topicFilter;

    return matchesSearch && matchesDifficulty && matchesStatus && matchesTopic;
  });

  const publishedCount = problems.filter(
    (p) => p.status === "published"
  ).length;
  const draftCount = problems.filter((p) => p.status === "draft").length;

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-slate-800">
              Manage Problems
            </h1>
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              {problems.length}
            </span>
          </div>
          <p className="mt-1 text-slate-500">
            Create, edit, view, and organize all coding problems and test cases.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchProblems}
            title="Refresh"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            to="/admin/problems/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700"
          >
            <Plus size={18} />
            Create Problem
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Problems
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            {problems.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Published
          </p>
          <p className="mt-2 text-2xl font-bold text-green-600">
            {publishedCount}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Drafts
          </p>
          <p className="mt-2 text-2xl font-bold text-yellow-600">
            {draftCount}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Topics
          </p>
          <p className="mt-2 text-2xl font-bold text-indigo-600">
            {uniqueTopics.length}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search by title or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-500 focus:bg-white"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Difficulty */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter size={15} />
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="all">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>

            {/* Topic */}
            {uniqueTopics.length > 0 && (
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="all">All Topics</option>
                {uniqueTopics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            )}

            {(searchQuery ||
              difficultyFilter !== "all" ||
              statusFilter !== "all" ||
              topicFilter !== "all") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDifficultyFilter("all");
                  setStatusFilter("all");
                  setTopicFilter("all");
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Problems Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {filteredProblems.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Code2 size={36} className="mx-auto text-slate-300" />
              <h3 className="mt-3 font-semibold text-slate-800">
                No problems found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {searchQuery ||
                difficultyFilter !== "all" ||
                statusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "No problems have been added to the system yet."}
              </p>
              <Link
                to="/admin/problems/create"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Plus size={16} />
                Create First Problem
              </Link>
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4">Problem</th>
                  <th className="px-6 py-4">Topic</th>
                  <th className="px-6 py-4">Difficulty</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Publish Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredProblems.map((problem) => (
                  <tr
                    key={problem._id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                          <Code2 size={18} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 hover:text-indigo-600">
                            {problem.title}
                          </p>
                          <p className="line-clamp-1 max-w-xs text-xs text-slate-400">
                            {problem.description}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-600">
                      <span className="rounded-lg bg-indigo-50/80 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        {problem.topic || "General"}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          problem.difficulty === "Easy"
                            ? "bg-green-50 text-green-700 border border-green-200/50"
                            : problem.difficulty === "Medium"
                            ? "bg-yellow-50 text-yellow-800 border border-yellow-200/50"
                            : "bg-red-50 text-red-700 border border-red-200/50"
                        }`}
                      >
                        {problem.difficulty}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      {problem.status === "published" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <CheckCircle size={13} />
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                          <Clock3 size={13} />
                          Draft
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500">
                      {problem.publishDate
                        ? new Date(problem.publishDate).toLocaleDateString()
                        : "-"}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          to={`/admin/problems/${problem._id}`}
                          title="View Details"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-indigo-600"
                        >
                          <Eye size={16} />
                        </Link>

                        <Link
                          to={`/admin/problems/${problem._id}/edit`}
                          title="Edit Problem"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600"
                        >
                          <Pencil size={16} />
                        </Link>

                        <button
                          onClick={() =>
                            handleDelete(problem._id, problem.title)
                          }
                          disabled={deletingId === problem._id}
                          title="Delete Problem"
                          className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminProblems;

