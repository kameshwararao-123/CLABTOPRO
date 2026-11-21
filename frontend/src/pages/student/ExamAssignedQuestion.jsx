import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  HelpCircle,
  FileText,
  Clock,
  Award,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
  AlertCircle,
  Code2,
} from "lucide-react";
import { getMyAssignedQuestion } from "../../services/examService";
import Loader from "../../components/common/Loader";

const ExamAssignedQuestion = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const fetchQuestion = async () => {
      try {
        setLoading(true);
        setErrorMsg("");
        const res = await getMyAssignedQuestion(examId);
        setData(res);
      } catch (err) {
        setErrorMsg(
          err.response?.data?.message || "Failed to load assigned question."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchQuestion();
  }, [examId]);

  if (loading) {
    return <Loader message="Loading your assigned question..." />;
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

  const { exam, question, progress } = data;
  const isCompilerAllowed = progress?.compilerAllowed;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-8 px-4 sm:px-6 flex flex-col justify-between">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Top Bar */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-400">
                Assigned Problem
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
            <h1 className="text-xl sm:text-2xl font-bold text-white">{question.title}</h1>
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

          {/* Structured Matrix Grid if present */}
          {question.matrixData?.values && Array.isArray(question.matrixData.values) && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Matrix Grid ({question.matrixData.rows} × {question.matrixData.columns})
              </span>
              <div className="overflow-x-auto p-3 bg-slate-950 rounded-xl border border-indigo-900/40 inline-block">
                <table className="border-collapse font-mono text-xs text-center">
                  <tbody>
                    {question.matrixData.values.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-slate-800 last:border-b-0">
                        {Array.isArray(row) &&
                          row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3.5 py-1.5 text-indigo-300 font-bold border-r border-slate-800 last:border-r-0"
                            >
                              {cell}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sample Test Cases (Visible) */}
          {question.sampleTestCases && question.sampleTestCases.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Visible Sample Test Cases
                </h2>
                <span className="text-[11px] text-slate-500">
                  Hidden test cases are protected and evaluated upon submission
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

          {/* AI Rubric Overview */}
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-400/20 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" /> Conceptual Evaluation Criteria
            </h3>
            <p className="text-xs text-indigo-200/80">
              Your paper answer will be evaluated against: Logic &amp; Correctness (30%), Algorithmic Approach (25%), Syntax &amp; Structure (20%), Code Efficiency (15%), and Constraints (10%).
              You must achieve an error rate <strong className="text-white">below 50%</strong> to unlock the code compiler.
            </p>
          </div>
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
                onClick={() => navigate(`/exams/${examId}/editor`)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold shadow-md transition"
              >
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span>Jump to Code Editor</span>
              </button>
            )}

            <button
              onClick={() => navigate(`/exams/${examId}/paper`)}
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
