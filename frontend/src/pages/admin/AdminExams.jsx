import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  GraduationCap,
  Plus,
  Calendar,
  Clock,
  Users,
  FileQuestion,
  AlertCircle,
  Trash2,
  Eye,
  SlidersHorizontal,
  Search,
  RefreshCw,
  BookOpen,
  Activity,
  Layers,
} from "lucide-react";
import { getFacultyExams, deleteExam } from "../../services/examService";
import Loader from "../../components/common/Loader";

const AdminExams = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  const activeType = ["external", "viva"].includes(typeParam) ? typeParam : "internal";

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchExams = async (type = activeType) => {
    try {
      setLoading(true);
      setError("");
      const res = await getFacultyExams({ examType: type });
      setExams(res.exams || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load examinations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams(activeType);
  }, [activeType]);

  const handleTypeChange = (type) => {
    setSearchParams({ type });
  };

  const handleDelete = async (examId, title) => {
    if (!window.confirm(`Are you sure you want to delete draft exam "${title}"? This cannot be undone.`)) {
      return;
    }
    try {
      setActionLoading(true);
      await deleteExam(examId);
      await fetchExams(activeType);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete exam.");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        exam.title?.toLowerCase().includes(q) ||
        exam.subject?.toLowerCase().includes(q) ||
        exam.academicYear?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" || exam.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [exams, searchQuery, statusFilter]);

  const totalExamsCount = exams.length;
  const inProgressCount = exams.filter((e) => e.status === "in_progress").length;
  const allocatedCount = exams.filter((e) => e.status === "allocated").length;
  const completedCount = exams.filter((e) => e.status === "completed").length;

  const renderStatusBadge = (status) => {
    switch (status) {
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            In Progress
          </span>
        );
      case "allocated":
        return (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
            Allocated
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            Completed
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            Scheduled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold text-slate-800">
              Examination Management
            </h1>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700 capitalize">
              {totalExamsCount} {activeType === "viva" ? "Viva MCQ" : activeType}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Create, allocate questions, schedule, and monitor Internal, External, and AI-powered Viva MCQ exams.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchExams(activeType)}
            title="Refresh examination list"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 shadow-xs"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            to={`/admin/exams/create?type=${activeType}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700"
          >
            <Plus size={17} />
            Create {activeType === "internal" ? "Internal" : activeType === "external" ? "External" : "Viva"} Exam
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-indigo-50 p-2 sm:p-2.5 text-indigo-600">
              <GraduationCap size={20} />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {activeType}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">Total Exams</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totalExamsCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-emerald-50 p-2 sm:p-2.5 text-emerald-600">
              <Activity size={20} />
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
              Live
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">In Progress</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{inProgressCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-indigo-50 p-2 sm:p-2.5 text-indigo-600">
              <Layers size={20} />
            </div>
            <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">
              Ready
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">Allocated</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{allocatedCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-slate-100 p-2 sm:p-2.5 text-slate-600">
              <BookOpen size={20} />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Past
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">Completed</p>
          <p className="mt-1 text-2xl font-bold text-slate-700">{completedCount}</p>
        </div>
      </div>

      {/* Internal vs External Tabs and Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 pb-2">
          <button
            type="button"
            onClick={() => handleTypeChange("internal")}
            className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-bold transition -mb-[9px] ${
              activeType === "internal"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>Internal Exams</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeType === "internal"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {activeType === "internal" ? totalExamsCount : "•"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange("external")}
            className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-bold transition -mb-[9px] ${
              activeType === "external"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>External Exams</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeType === "external"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {activeType === "external" ? totalExamsCount : "•"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange("viva")}
            className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-bold transition -mb-[9px] ${
              activeType === "viva"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>Viva Exams (MCQ)</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeType === "viva"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {activeType === "viva" ? totalExamsCount : "•"}
            </span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
          <div className="relative flex-1">
            <Search
              size={17}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search exam by title, subject, or year..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-600 outline-none transition focus:border-indigo-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="allocated">Allocated</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Exam Content Area */}
      {loading ? (
        <Loader />
      ) : filteredExams.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <GraduationCap size={24} />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {searchQuery || statusFilter !== "all"
              ? "No matching examinations found"
              : `No ${activeType === "internal" ? "Internal" : "External"} Exams Found`}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== "all"
              ? "Try adjusting your search criteria or filter options."
              : `Get started by scheduling your first ${activeType} examination for students.`}
          </p>
          <div className="mt-4">
            <Link
              to={`/admin/exams/create?type=${activeType}`}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
            >
              <Plus size={14} />
              Create {activeType === "internal" ? "Internal" : "External"} Exam
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredExams.map((exam) => (
            <div
              key={exam._id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition"
            >
              <div>
                {/* Header Strip */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {exam.subject}
                  </span>
                  {renderStatusBadge(exam.status)}
                </div>

                {/* Exam Title & Description */}
                <h3 className="text-base font-bold text-slate-800 line-clamp-1" title={exam.title}>
                  {exam.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 line-clamp-2 min-h-[32px]">
                  {exam.description || "No description provided."}
                </p>

                {/* Metadata Pills */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>{new Date(exam.examDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    <span>{exam.durationMinutes} mins</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileQuestion size={13} className="text-slate-400" />
                    <span>{exam.questionCount || 0} Questions</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users size={13} className="text-slate-400" />
                    <span>{exam.studentCount || 0} Students</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-50 pt-2">
                  <span>Year: {exam.academicYear} • Sem: {exam.semester}</span>
                  <span className="font-semibold text-slate-600 uppercase">{exam.examType || "internal"}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-3.5">
                <Link
                  to={`/admin/exams/${exam._id}`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  <SlidersHorizontal size={13} />
                  Manage Exam
                </Link>

                <Link
                  to={`/admin/exams/${exam._id}?tab=monitoring`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  title="Live Monitoring & Results"
                >
                  <Eye size={13} />
                  Monitor
                </Link>

                {exam.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => handleDelete(exam._id, exam.title)}
                    disabled={actionLoading}
                    className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-600 hover:bg-rose-100 transition"
                    title="Delete Draft Examination"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminExams;
