import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  HelpCircle,
  FileText,
  Clock,
  Award,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Lock,
  AlertCircle,
  Code2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getMyAssignedQuestion } from "../../services/examService";
import Loader from "../../components/common/Loader";
import { isExamProgressCompleted } from "../../utils/examStatus";

const ExamAssignedQuestion = () => {
  const { examId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const currentQId = searchParams.get("questionId");

  const fetchQuestion = async (qId) => {
    try {
      setLoading(true);
      setErrorMsg("");
      const params = qId ? { questionId: qId } : currentQId ? { questionId: currentQId } : {};
      const res = await getMyAssignedQuestion(examId, params);

      if (isExamProgressCompleted(res.progress, res)) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }

      setData(res);
      if (res.question?._id && res.question._id !== currentQId) {
        setSearchParams({ questionId: res.question._id });
      }
    } catch (err) {
      if (err.response?.data?.isCompleted) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }
      setErrorMsg(
        err.response?.data?.message || "Failed to load assigned question."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestion(currentQId);
  }, [examId, currentQId]);

  if (loading && !data) {
    return <Loader message="Loading your assigned examination question(s)..." />;
  }

  if (errorMsg || !data) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl border border-rose-200 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Unable to Access Question</h2>
        <p className="text-sm text-slate-600">{errorMsg || "Question record unavailable."}</p>
        <Link
          to={`/exams/${examId}/instructions`}
          className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          View Instructions First
        </Link>
      </div>
    );
  }

  const { exam, question, progress, questions = [], currentIndex = 0 } = data;
  const isCompilerAllowed = progress?.compilerAllowed;

  const handleSelectQuestion = (qId) => {
    setSearchParams({ questionId: qId });
  };

  const handlePrevQuestion = () => {
    if (currentIndex > 0 && questions[currentIndex - 1]) {
      handleSelectQuestion(questions[currentIndex - 1]._id);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1 && questions[currentIndex + 1]) {
      handleSelectQuestion(questions[currentIndex + 1]._id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-8 px-4 sm:px-6 flex flex-col justify-between">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Top Header Card */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-400">
                Assigned Problem {questions.length > 1 ? `#${currentIndex + 1}` : ""}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  question.difficulty === "Easy"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-400/30"
                    : question.difficulty === "Hard"
                    ? "bg-rose-500/10 text-rose-400 border border-rose-400/30"
                    : "bg-amber-500/10 text-amber-400 border border-amber-400/30"
                }`}
              >
                {question.difficulty}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              <span className="font-mono text-indigo-400 mr-2">
                {question.questionNumber ? `${question.questionNumber}:` : ""}
              </span>
              {question.title}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Exam: <span className="text-slate-300 font-medium">{exam.title}</span> ({exam.subject})
            </p>
          </div>

          <div className="flex sm:flex-col items-end gap-2 text-right">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-400" /> Marks: {question.marks}
            </span>
            {isCompilerAllowed ? (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Compiler Unlocked
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                <Lock className="w-3 h-3" /> Compiler Locked (&lt;50% Error Required)
              </span>
            )}
          </div>
        </div>

        {/* Multi-Question Navigation Tabs (Visible when faculty assigned > 1 question) */}
        {questions.length > 1 && (
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              <span className="text-xs font-bold text-slate-400 px-2 uppercase tracking-wider whitespace-nowrap">
                Questions ({questions.length}):
              </span>
              {questions.map((qItem, idx) => {
                const isActive = qItem._id === question._id || currentIndex === idx;
                return (
                  <button
                    key={qItem._id || idx}
                    type="button"
                    onClick={() => handleSelectQuestion(qItem._id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/40"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    <span>{qItem.questionNumber || `Q${idx + 1}`}</span>
                    {qItem.isCompleted ? (
                      <span className="text-emerald-400 font-bold">✓</span>
                    ) : qItem.compilerAllowed ? (
                      <span className="text-indigo-300 text-[10px]">●</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-400">
              <button
                type="button"
                onClick={handlePrevQuestion}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="px-1 font-medium">
                {currentIndex + 1} / {questions.length}
              </span>
              <button
                type="button"
                onClick={handleNextQuestion}
                disabled={currentIndex === questions.length - 1}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Problem Statement Card */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-2xl p-6 space-y-5 shadow-xl">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Problem Description
            </h2>
            <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-line bg-slate-900/60 p-4 rounded-xl border border-slate-700/60">
              {question.problemStatement}
            </div>
          </div>

          {/* Formats and Constraints */}
          <div className="grid sm:grid-cols-2 gap-4">
            {question.inputFormat && (
              <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Input Format
                </h3>
                <p className="text-xs text-slate-300">{question.inputFormat}</p>
              </div>
            )}
            {question.outputFormat && (
              <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Output Format
                </h3>
                <p className="text-xs text-slate-300">{question.outputFormat}</p>
              </div>
            )}
          </div>

          {question.constraints && (
            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Constraints
              </h3>
              <p className="text-xs text-slate-300 font-mono">{question.constraints}</p>
            </div>
          )}

          {/* Visible Sample Test Cases */}
          {question.sampleTestCases && question.sampleTestCases.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Sample Test Cases ({question.sampleTestCases.length})
                </h3>
                <span className="text-[10px] text-slate-500">
                  Evaluated in Code Editor mode
                </span>
              </div>

              <div className="space-y-3">
                {question.sampleTestCases.map((tc, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900/80 border border-slate-700/70 rounded-xl p-4 space-y-2"
                  >
                    <div className="text-xs font-bold text-indigo-400">
                      Sample Case #{idx + 1}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 text-xs font-mono">
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                          Input
                        </span>
                        <pre className="pattern-output whitespace-pre overflow-x-auto text-slate-300">{tc.input || "(Empty input)"}</pre>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                          Expected Output
                        </span>
                        <pre className="pattern-output whitespace-pre overflow-x-auto text-emerald-400">{tc.expectedOutput}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6">
          <Link
            to="/exams"
            className="text-xs text-slate-400 hover:text-slate-200 transition"
          >
            ← Back to Exam List
          </Link>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isCompilerAllowed && (
              <button
                onClick={() => navigate(`/exams/${examId}/editor?questionId=${question._id}`)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold shadow-md transition"
              >
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span>Jump to Code Editor</span>
              </button>
            )}

            <button
              onClick={() => navigate(`/exams/${examId}/paper?questionId=${question._id}`)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition transform active:scale-95"
            >
              <FileText className="w-4 h-4" />
              <span>{isCompilerAllowed ? "Review Conceptual Paper" : "Proceed to Paper Writing Notepad"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamAssignedQuestion;
