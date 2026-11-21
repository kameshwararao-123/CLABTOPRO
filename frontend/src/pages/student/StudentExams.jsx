import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Clock,
  Award,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowRight,
  BookOpen,
  Filter,
} from "lucide-react";
import { getStudentExams } from "../../services/examService";
import Loader from "../../components/common/Loader";

const StudentExams = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [errorMsg, setErrorMsg] = useState("");

  const fetchExams = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const typeParam = filterType === "all" ? undefined : filterType;
      const data = await getStudentExams(typeParam);
      setExams(data.exams || []);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load examinations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, [filterType]);

  const getActionTarget = (exam) => {
    const status = exam.studentStatus;
    if (exam.status === "completed" || status === "completed") {
      return { path: `/exams/${exam._id}/completed`, label: "View Exam Summary", color: "bg-slate-700 hover:bg-slate-800" };
    }
    if (exam.compilerAllowed || status === "execution_allowed") {
      return { path: `/exams/${exam._id}/editor`, label: "Resume Code Editor", color: "bg-indigo-600 hover:bg-indigo-700" };
    }
    if (status === "question_assigned" || status === "answer_in_progress" || status === "correction_required") {
      return { path: `/exams/${exam._id}/paper`, label: "Continue Paper Writing", color: "bg-indigo-600 hover:bg-indigo-700" };
    }
    if (status === "instructions_acknowledged") {
      return { path: `/exams/${exam._id}/question`, label: "View Assigned Question", color: "bg-indigo-600 hover:bg-indigo-700" };
    }
    return { path: `/exams/${exam._id}/instructions`, label: "Start Examination", color: "bg-emerald-600 hover:bg-emerald-700" };
  };

  if (loading) {
    return <Loader message="Loading available examinations..." />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-indigo-600" /> Examinations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Access your scheduled and ongoing internal and external examinations.
          </p>
        </div>

        {/* Filters */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setFilterType("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filterType === "all"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Exams
          </button>
          <button
            onClick={() => setFilterType("internal")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filterType === "internal"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Internal Exams
          </button>
          <button
            onClick={() => setFilterType("external")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filterType === "external"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            External Exams
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {exams.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No Examinations Available</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            You currently do not have any active internal or external examinations assigned. Please check back when your faculty starts an exam.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => {
            const action = getActionTarget(exam);
            const isLive = exam.status === "in_progress";

            return (
              <div
                key={exam._id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                        exam.examType === "internal"
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : "bg-blue-100 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {exam.examType} Exam
                    </span>

                    {isLive ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span> LIVE NOW
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        {exam.status}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition">
                      {exam.title}
                    </h3>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                      Subject: <span className="text-slate-800">{exam.subject}</span>
                    </p>
                    {exam.description && (
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2">
                        {exam.description}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{exam.durationMinutes} Minutes</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      <span>{exam.totalMarks} Marks</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-slate-400">Your Progress: </span>
                    <span className="font-semibold text-slate-700 capitalize">
                      {exam.studentStatus.replace("_", " ")}
                    </span>
                  </div>

                  <button
                    onClick={() => navigate(action.path)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-bold shadow-sm transition ${action.color}`}
                  >
                    <span>{action.label}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentExams;
