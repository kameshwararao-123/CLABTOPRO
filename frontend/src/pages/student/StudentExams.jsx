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
  KeyRound,
  Check,
  Hourglass,
} from "lucide-react";
import { getStudentExams, enrollStudentWithCode } from "../../services/examService";
import Loader from "../../components/common/Loader";
import useVisibilityPolling from "../../hooks/useVisibilityPolling";

const StudentExams = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Exam Code Enrollment state
  const [examCodeInput, setExamCodeInput] = useState("");
  const [enrolling, setEnrolling] = useState(false);

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

  // Visibility-aware refresh every 12s so students see when faculty starts an exam without flooding the backend
  useVisibilityPolling(
    () => {
      const typeParam = filterType === "all" ? undefined : filterType;
      return getStudentExams(typeParam)
        .then((data) => setExams(data.exams || []))
        .catch(() => {});
    },
    12000,
    true
  );

  const handleJoinExam = async (e) => {
    e.preventDefault();
    if (!examCodeInput.trim()) {
      setErrorMsg("Please enter an Exam Code.");
      return;
    }

    try {
      setEnrolling(true);
      setErrorMsg("");
      setSuccessMsg("");
      const res = await enrollStudentWithCode(examCodeInput.trim());
      setSuccessMsg(res.message || "You have successfully joined the exam. Please wait for your faculty to start the exam.");
      setExamCodeInput("");
      await fetchExams();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Invalid Exam Code. Please check and try again.");
    } finally {
      setEnrolling(false);
    }
  };

  const getActionTarget = (exam) => {
    const status = exam.studentStatus;
    const isExamLive = exam.status === "in_progress";
    const isExamWaiting = exam.status === "draft" || exam.status === "allocated" || exam.status === "scheduled";

    if (isExamWaiting) {
      return {
        path: "#",
        label: "Waiting for Faculty to Start",
        color: "bg-amber-600 cursor-not-allowed opacity-90",
        disabled: true,
      };
    }

    if (exam.examType === "viva") {
      if (exam.status === "completed" || status === "completed" || status === "successfully_completed") {
        return { path: `/exams/${exam._id}/viva?view=result`, label: "View Submission", color: "bg-slate-700 hover:bg-slate-800", disabled: false };
      }
      return { path: `/exams/${exam._id}/viva`, label: status === "in_progress" ? "Resume Viva Exam" : "Start Viva Exam", color: "bg-emerald-600 hover:bg-emerald-700", disabled: false };
    }
    if (status === "completed" || status === "successfully_completed") {
      return { path: `/exams/${exam._id}/completed`, label: "View Exam Summary", color: "bg-emerald-700 hover:bg-emerald-800", disabled: false };
    }
    if (exam.status === "completed" || status === "time_expired") {
      return { path: `/exams/${exam._id}/completed`, label: "View Exam Status", color: "bg-slate-700 hover:bg-slate-800", disabled: false };
    }
    if (exam.compilerAllowed || status === "compiler_access_granted" || status === "execution_allowed" || status === "coding_in_progress") {
      return { path: `/exams/${exam._id}/editor`, label: "Resume Code Editor", color: "bg-indigo-600 hover:bg-indigo-700", disabled: false };
    }
    if (
      status === "question_assigned" ||
      status === "notepad_pending" ||
      status === "answer_in_progress" ||
      status === "correction_required" ||
      status === "conceptual_evaluation_failed"
    ) {
      return { path: `/exams/${exam._id}/paper`, label: "Continue Paper Writing", color: "bg-indigo-600 hover:bg-indigo-700", disabled: false };
    }
    if (status === "instructions_acknowledged") {
      return { path: `/exams/${exam._id}/question`, label: "View Assigned Question", color: "bg-indigo-600 hover:bg-indigo-700", disabled: false };
    }
    return { path: `/exams/${exam._id}/instructions`, label: "Start Examination", color: "bg-emerald-600 hover:bg-emerald-700", disabled: false };
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
          <button
            onClick={() => setFilterType("viva")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              filterType === "viva"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Viva Exams (MCQ)
          </button>
        </div>
      </div>

      {/* Enter Exam Code Card */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-white p-5 shadow-xs">
        <form onSubmit={handleJoinExam} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-2.5 text-white shadow-xs">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Enroll via Exam Code</h2>
              <p className="text-xs text-slate-500">
                Enter the official examination code shared by your faculty to join.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 max-w-md w-full sm:w-auto">
            <input
              type="text"
              placeholder="e.g. CLAB2026 or INT9482"
              value={examCodeInput}
              onChange={(e) => setExamCodeInput(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold tracking-wider text-slate-800 uppercase outline-none transition focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            />
            <button
              type="submit"
              disabled={enrolling || !examCodeInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enrolling ? (
                <>
                  <Hourglass className="w-4 h-4 animate-spin" />
                  <span>Joining...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Join Exam</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg("")}
            className="text-rose-500 hover:text-rose-800 text-lg leading-none font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg("")}
            className="text-emerald-500 hover:text-emerald-800 text-lg leading-none font-bold"
          >
            &times;
          </button>
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
                        exam.examType === "viva"
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : exam.examType === "internal"
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : "bg-blue-100 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {exam.examType === "viva" ? "Viva MCQ" : `${exam.examType} Exam`}
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

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{exam.durationMinutes} Minutes</span>
                    </div>
                  </div>
                </div>

                {/* Waiting State Notice */}
                {!isLive && exam.status !== "completed" && (
                  <div className="bg-amber-50/70 border-t border-amber-100 p-3 text-xs text-amber-800 flex items-center gap-2">
                    <Hourglass className="w-4 h-4 flex-shrink-0 text-amber-600 animate-pulse" />
                    <span>You have successfully joined the exam. Please wait for your faculty to start the exam.</span>
                  </div>
                )}

                <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-slate-400">Your Progress: </span>
                    <span
                      className={`font-semibold ${
                        exam.isCompleted
                          ? "text-emerald-700 font-bold"
                          : exam.studentStatus === "in_progress"
                          ? "text-indigo-600 font-bold"
                          : "text-slate-700"
                      }`}
                    >
                      {exam.displayProgress || exam.studentStatus?.replace("_", " ") || "Not Started"}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      if (!action.disabled) navigate(action.path);
                    }}
                    disabled={action.disabled}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-bold shadow-sm transition ${action.color}`}
                  >
                    <span>{action.label}</span>
                    {!action.disabled && <ArrowRight className="w-3.5 h-3.5" />}
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
