import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
import { getStudentExamCompletion, endStudentExam } from "../../services/examService";
import Loader from "../../components/common/Loader";
import useVisibilityPolling from "../../hooks/useVisibilityPolling";

const ExamCompleted = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");

  const fetchCompletion = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setLoadError("");
      }
      const res = await getStudentExamCompletion(examId);
      setData(res);
    } catch (err) {
      console.error("Failed to load completion details:", err);
      if (!silent) {
        setLoadError(
          err.response?.data?.message ||
            "Unable to load examination completion summary. Please retry."
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompletion(false);
  }, [examId]);

  // Visibility-aware poll while on an intermediate screen so faculty End Exam or timer expiry transitions
  const shouldPollIntermediate =
    Boolean(data) &&
    !data.isSuccessfullyCompleted &&
    Boolean(data.hasRemainingQuestions || data.readyToFinish);
  useVisibilityPolling(() => fetchCompletion(true), 12000, shouldPollIntermediate);

  if (loading) {
    return <Loader message="Validating examination completion status..." />;
  }

  if (loadError && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="max-w-md w-full bg-slate-900 border border-rose-800/60 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-white">Failed to Load Completion Report</h1>
          <p className="text-sm text-rose-300">{loadError}</p>
          <button
            type="button"
            onClick={() => fetchCompletion(false)}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const isCompleted = Boolean(data?.isSuccessfullyCompleted);
  const isFacultyEnded = data?.completionReason === "faculty_ended" || Boolean(data?.facultyEndedExam);
  const isTimeExpired = data?.completionReason === "time_expired" || Boolean(data?.timeExpired);
  const exam = data?.exam;
  const assignedCount = data?.assignedQuestionCount ?? 1;
  const submittedCount = data?.submittedQuestionCount ?? (isCompleted ? assignedCount : 0);
  const remainingCount = data?.remainingQuestionCount ?? Math.max(0, assignedCount - submittedCount);
  const hasRemainingQuestions = Boolean(data?.hasRemainingQuestions) && !isCompleted && !isFacultyEnded && !isTimeExpired && remainingCount > 0;
  const readyToFinish = Boolean(data?.readyToFinish) && !isCompleted && !isFacultyEnded && !isTimeExpired;
  const nextQuestion = data?.nextQuestion || null;

  const handleFinishExam = async () => {
    try {
      setFinishing(true);
      setFinishError("");
      await endStudentExam(examId);
      await fetchCompletion(false);
    } catch (err) {
      setFinishError(err.response?.data?.message || "Failed to finish examination. Please try again.");
    } finally {
      setFinishing(false);
    }
  };

  // Intermediate Screen 2: All Assigned Questions Submitted -> Show Finish Exam button
  if (readyToFinish) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              All Questions Submitted Successfully!
            </h1>
            <p className="text-base font-bold text-emerald-400">
              Questions Submitted: {submittedCount} of {assignedCount}
            </p>
          </div>

          {finishError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {finishError}
            </div>
          )}

          <button
            type="button"
            disabled={finishing}
            onClick={handleFinishExam}
            className="w-full inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition transform active:scale-95 disabled:opacity-50"
          >
            <span>{finishing ? "Finalizing Examination..." : "Finish Exam"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Intermediate Question Submitted Success Screen (only when more assigned questions remain & faculty hasn't ended exam)
  if (hasRemainingQuestions && submittedCount > 0) {
    const handleNextQuestion = () => {
      if (!nextQuestion?._id) {
        navigate(`/exams/${examId}/paper`, { replace: true });
        return;
      }
      if (nextQuestion.compilerAllowed) {
        navigate(`/exams/${examId}/editor?questionId=${nextQuestion._id}`, { replace: true });
      } else {
        navigate(`/exams/${examId}/paper?questionId=${nextQuestion._id}`, { replace: true });
      }
    };

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Question Submitted Successfully!
            </h1>
            <p className="text-base font-bold text-emerald-400">
              {submittedCount} of {assignedCount} Questions Submitted Successfully
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-1.5 text-sm text-slate-300">
            <p>
              You have successfully submitted{" "}
              <strong className="text-white">{submittedCount}</strong>{" "}
              {submittedCount === 1 ? "question" : "questions"}.
            </p>
            <p className="text-amber-300 font-semibold">
              {remainingCount} {remainingCount === 1 ? "question" : "questions"} remaining.
            </p>
          </div>

          <button
            type="button"
            onClick={handleNextQuestion}
            className="w-full inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/30 transition transform active:scale-95"
          >
            <span>Next Question</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl text-center space-y-8 animate-fade-in">
        {/* Header Icon */}
        {isCompleted ? (
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-lg ${
              isFacultyEnded
                ? "bg-indigo-500/10 border-2 border-indigo-500/30 text-indigo-400 shadow-indigo-500/10"
                : "bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10"
            }`}
          >
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
              <span
                className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${
                  isFacultyEnded
                    ? "text-indigo-300 bg-indigo-500/10 border-indigo-500/20"
                    : isTimeExpired
                    ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
                    : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                }`}
              >
                {isFacultyEnded
                  ? "Examination Ended by Faculty"
                  : isTimeExpired
                  ? "Exam Timer Expired"
                  : "Examination Completed"}
              </span>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                {isFacultyEnded
                  ? "Examination Ended by Faculty"
                  : isTimeExpired
                  ? "Examination Time Expired"
                  : "Exam Completed Successfully!"}
              </h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {data?.message ||
                  (isFacultyEnded
                    ? `The faculty has ended the examination. You submitted ${submittedCount} out of ${assignedCount} assigned question(s).`
                    : "Congratulations! You have successfully completed all assigned questions.")}
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
              <span className="text-slate-400">AI Evaluation Status:</span>
              <div
                className={`flex items-center gap-1.5 font-bold ${
                  (data?.aiEvaluationStatus || data?.conceptualAnswerStatus)?.includes("Passed")
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{data?.aiEvaluationStatus || data?.conceptualAnswerStatus || "Not Completed / Pending"}</span>
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
              <span className="text-slate-400">Completion Reason:</span>
              <div className="font-semibold text-slate-200">
                {isFacultyEnded
                  ? "Examination ended by faculty"
                  : isTimeExpired
                  ? "Exam timer expired"
                  : isCompleted
                  ? "All assigned questions submitted"
                  : "In Progress / Pending"}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Questions Progress:</span>
              <div className="font-mono font-bold text-slate-200">
                <span className="text-indigo-300">{data?.questionsAttempted ?? submittedCount} Attempted</span>
                <span className="text-slate-500"> / </span>
                <span className="text-emerald-400">{submittedCount} Completed</span>
                <span className="text-slate-500"> / </span>
                <span>{assignedCount} Total</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Completion / End Timestamp:</span>
              <div className="text-slate-300 font-mono">
                {data?.completedAt || data?.submissionTime
                  ? new Date(data.completedAt || data.submissionTime).toLocaleString()
                  : "Not Submitted"}
              </div>
            </div>

            {data?.marks !== null && data?.marks !== undefined && (
              <div className="space-y-1">
                <span className="text-slate-400">Score / Marks:</span>
                <div className="text-emerald-400 font-mono font-bold">
                  {data.marks} / {data.totalMarks ?? exam?.totalMarks ?? 100}
                </div>
              </div>
            )}
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
