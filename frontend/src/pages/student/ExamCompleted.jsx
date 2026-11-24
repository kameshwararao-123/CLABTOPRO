import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  XCircle,
  FileText,
  Code2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { getStudentExamCompletion } from "../../services/examService";
import Loader from "../../components/common/Loader";

const ExamCompleted = () => {
  const { examId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompletion = async () => {
      try {
        setLoading(true);
        const res = await getStudentExamCompletion(examId);
        setData(res);
      } catch (err) {
        console.error("Failed to load completion details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompletion();
  }, [examId]);

  if (loading) {
    return <Loader message="Validating examination completion status..." />;
  }

  const isCompleted = Boolean(data?.isSuccessfullyCompleted);
  const exam = data?.exam;
  const progress = data?.progress;
  const submission = data?.submission;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl text-center space-y-8 animate-fade-in">
        {/* Header Icon */}
        {isCompleted ? (
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-10 h-10" />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
            <AlertTriangle className="w-10 h-10" />
          </div>
        )}

        {/* Headings */}
        <div className="space-y-2">
          {isCompleted ? (
            <>
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                Examination Complete
              </span>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                Exam Completed Successfully!
              </h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {data?.message ||
                  "You have successfully completed and submitted your examination. All responses have been logged in the audit registry."}
              </p>
            </>
          ) : (
            <>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                Action Required
              </span>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                Exam Incomplete
              </h1>
              <p className="text-sm text-amber-300/90 max-w-md mx-auto">
                {data?.message ||
                  "Your conceptual answer has not been completed. Please complete the required steps to finish your examination."}
              </p>
            </>
          )}
        </div>

        {/* Status Callout if Incomplete */}
        {!isCompleted && data?.pendingStep && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-left flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Pending Requirement: {data.pendingStep}
              </div>
              <p className="text-xs text-slate-300">
                Current Examination Status:{" "}
                <span className="font-semibold text-white">
                  {data?.finalExamStatus || data?.examStatus || "Incomplete"}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Exam Information Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-left space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h2 className="text-base font-bold text-white">
                {data?.examTitle || exam?.title || "Examination"}
              </h2>
              <p className="text-xs text-slate-400">
                Subject: {data?.subject || exam?.subject || "Programming"}
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-400/20 capitalize">
              {data?.examType || exam?.examType} Exam
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-slate-400">Candidate Name:</span>
              <div className="font-semibold text-white">
                {data?.studentName || "Student"}
                {data?.rollNo && data.rollNo !== "N/A" && (
                  <span className="text-slate-400 font-mono ml-1">({data.rollNo})</span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Final Exam Status:</span>
              <div className="font-bold">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isCompleted
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {data?.finalExamStatus || (isCompleted ? "Successfully Completed" : "Incomplete")}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Conceptual Notepad Status:</span>
              <div
                className={`flex items-center gap-1.5 font-bold ${
                  data?.conceptualAnswerStatus?.includes("Passed")
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{data?.conceptualAnswerStatus || "Not Completed / Pending"}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Code Submission Status:</span>
              <div
                className={`flex items-center gap-1.5 font-bold ${
                  data?.codeSubmissionStatus?.includes("Passed All")
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                <FileCheck2 className="w-4 h-4 shrink-0" />
                <span>{data?.codeSubmissionStatus || "Pending"}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Test Cases Evaluated:</span>
              <div className="text-slate-200 font-mono font-bold">
                {data?.totalTestCases > 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="text-emerald-400">{data?.testCasesPassed ?? 0} Passed</span>
                    <span className="text-slate-500">/</span>
                    <span className={data?.testCasesFailed > 0 ? "text-rose-400" : "text-slate-400"}>
                      {data?.testCasesFailed ?? 0} Failed
                    </span>
                    <span className="text-slate-500">({data.totalTestCases} Total)</span>
                  </span>
                ) : (
                  <span className="text-slate-400 font-sans font-normal">
                    0 Evaluated (No solution submitted)
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Submission Timestamp:</span>
              <div className="text-slate-300 font-mono">
                {data?.submissionTime
                  ? new Date(data.submissionTime).toLocaleString()
                  : "Not Submitted"}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          {!isCompleted && data?.examStatus !== "Time Expired" && (
            <>
              {(!data?.conceptualAnswerStatus ||
                !data.conceptualAnswerStatus.includes("Passed")) && (
                <Link
                  to={`/exams/${examId}/paper`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-600/30 transition transform active:scale-95"
                >
                  <FileText className="w-4 h-4" />
                  <span>Complete Conceptual Notepad</span>
                </Link>
              )}

              {data?.conceptualAnswerStatus?.includes("Passed") && (
                <Link
                  to={`/exams/${examId}/editor`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition transform active:scale-95"
                >
                  <Code2 className="w-4 h-4" />
                  <span>Resume Code Editor</span>
                </Link>
              )}
            </>
          )}

          <Link
            to="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold transition"
          >
            Go to Student Dashboard
          </Link>

          <Link
            to="/exams"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold border border-slate-700 transition"
          >
            <span>Back to Examinations</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ExamCompleted;
