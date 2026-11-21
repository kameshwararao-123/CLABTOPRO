import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  FileText,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Code2,
  Save,
  HelpCircle,
  ShieldAlert,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import {
  getMyAssignedQuestion,
  autosaveAnswerDraft,
  evaluatePaperAnswer,
} from "../../services/examService";
import Loader from "../../components/common/Loader";

const PAPER_TEMPLATE = `1. ALGORITHMIC APPROACH:
- Step-by-step description of the algorithm:
- Data structures chosen and why:

2. LOGIC & CONTROL FLOW:
- Initializations:
- Loop conditions and state transitions:
- Termination conditions:

3. EDGE CASES & CONSTRAINTS HANDLING:
- Edge case 1 (e.g., minimum input, zero, negative):
- Edge case 2 (e.g., maximum constraints, duplicates):

4. COMPLEXITY ANALYSIS:
- Time Complexity: O(?)
- Space Complexity: O(?)
`;

const ExamPaperNotepad = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showQuestionPanel, setShowQuestionPanel] = useState(true);
  const [timeLeftStr, setTimeLeftStr] = useState("");

  const autosaveTimerRef = useRef(null);

  // Load question and initial draft
  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await getMyAssignedQuestion(examId);
      setData(res);

      if (res.progress?.lastConceptualAnswer) {
        setAnswerText(res.progress.lastConceptualAnswer);
      }
      if (res.progress?.lastAIEvaluation) {
        setEvaluationResult({
          isApproved: res.progress.compilerAllowed,
          errorPercentage: res.progress.lastAIEvaluation.errorPercentage,
          compilerAllowed: res.progress.compilerAllowed,
          attemptNumber: res.progress.conceptualAttemptsCount,
          maxAttempts: res.exam.maxConceptualAttempts,
          evaluation: res.progress.lastAIEvaluation,
        });
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load examination question.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [examId]);

  // Exam Countdown Timer
  useEffect(() => {
    if (!data?.exam?.startedAt || !data?.exam?.durationMinutes) return;

    const startTime = new Date(data.exam.startedAt).getTime();
    const durationMs = data.exam.durationMinutes * 60 * 1000;
    const endTime = startTime + durationMs;

    const updateTimer = () => {
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeftStr("00:00:00 (Time Up)");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n) => String(n).padStart(2, "0");
      setTimeLeftStr(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [data]);

  // Autosave handler
  const triggerAutosave = useCallback(
    async (text) => {
      if (!text || !text.trim()) return;
      try {
        setSaveStatus("saving");
        await autosaveAnswerDraft(examId, text);
        setSaveStatus("saved");
      } catch (err) {
        setSaveStatus("idle");
      }
    },
    [examId]
  );

  // Debounced Autosave
  const handleTextChange = (e) => {
    const val = e.target.value;
    setAnswerText(val);
    setSaveStatus("idle");

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      triggerAutosave(val);
    }, 4000);
  };

  const handleInsertTemplate = () => {
    if (answerText.trim() && !window.confirm("Insert template? Existing content will be prepended.")) {
      return;
    }
    setAnswerText((prev) => (prev.trim() ? `${PAPER_TEMPLATE}\n\n${prev}` : PAPER_TEMPLATE));
  };

  const handleEvaluateSubmit = async () => {
    if (!answerText.trim() || answerText.trim().length < 40) {
      setErrorMsg("Please write a detailed conceptual solution (minimum 40 characters) before requesting AI evaluation.");
      return;
    }

    try {
      setEvaluating(true);
      setErrorMsg("");
      setEvaluationResult(null);

      const res = await evaluatePaperAnswer(examId, answerText);
      setEvaluationResult(res);
      await fetchData();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "AI evaluation failed. Please try again.");
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) {
    return <Loader message="Setting up your Paper Writing Notepad..." />;
  }

  if (errorMsg && !data) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl border border-rose-200 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600">{errorMsg}</p>
        <Link
          to={`/exams/${examId}/instructions`}
          className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          Return to Exam Instructions
        </Link>
      </div>
    );
  }

  const { exam, question, progress } = data;
  const isCompilerUnlocked = progress?.compilerAllowed || evaluationResult?.compilerAllowed;
  const wordCount = answerText.trim() ? answerText.trim().split(/\s+/).length : 0;
  const charCount = answerText.length;
  const maxAttempts = exam.maxConceptualAttempts || 3;
  const currentAttempts = progress?.conceptualAttemptsCount || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {exam.title}
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Paper Writing Phase
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Assigned: <strong className="text-slate-200">{question.title}</strong>
            </p>
          </div>
        </div>

        {/* Center / Right Controls */}
        <div className="flex items-center gap-4">
          {/* Autosave Status */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            {saveStatus === "saving" && (
              <span className="text-amber-400 animate-pulse flex items-center gap-1">
                <Save className="w-3.5 h-3.5" /> Saving draft...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Draft saved
              </span>
            )}
          </div>

          {/* Timer Display */}
          {timeLeftStr && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
              <Clock className="w-3.5 h-3.5" /> {timeLeftStr}
            </div>
          )}

          {/* Compiler Gate Status Badge */}
          {isCompilerUnlocked ? (
            <button
              onClick={() => navigate(`/exams/${examId}/editor`)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition"
            >
              <Code2 className="w-4 h-4" /> Go to Code Editor
            </button>
          ) : (
            <div className="hidden md:flex items-center gap-1 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-lg">
              <span>Compiler: Locked (&lt;50% error required)</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Question Details (Collapsible on mobile) */}
        <div
          className={`${
            showQuestionPanel ? "lg:w-2/5 w-full flex" : "hidden"
          } flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/60 overflow-y-auto max-h-[45vh] lg:max-h-[calc(100vh-60px)] p-5 space-y-4`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Problem Specification
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-semibold ${
                question.difficulty === "Easy"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : question.difficulty === "Hard"
                  ? "bg-rose-500/10 text-rose-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {question.difficulty} ({question.marks} Marks)
            </span>
          </div>

          <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            {question.problemStatement}
          </div>

          {question.constraints && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Constraints</span>
              <p className="text-xs font-mono text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                {question.constraints}
              </p>
            </div>
          )}

          {/* Structured Matrix Grid if present */}
          {question.matrixData?.values && Array.isArray(question.matrixData.values) && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-indigo-400 uppercase">
                Matrix Grid ({question.matrixData.rows} × {question.matrixData.columns})
              </span>
              <div className="overflow-x-auto p-2 bg-slate-950 rounded-lg border border-indigo-900/40 inline-block">
                <table className="border-collapse font-mono text-xs text-center">
                  <tbody>
                    {question.matrixData.values.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-slate-800 last:border-b-0">
                        {Array.isArray(row) &&
                          row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3 py-1 text-indigo-300 font-bold border-r border-slate-800 last:border-r-0"
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

          {/* Sample Cases */}
          {question.sampleTestCases && question.sampleTestCases.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase">
                Sample Test Cases
              </span>
              {question.sampleTestCases.map((tc, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono space-y-1.5"
                >
                  <div className="text-slate-500 font-bold">Sample #{idx + 1}</div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Input:</span>
                    <pre className="pattern-output whitespace-pre overflow-x-auto text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800">
                      {tc.input || "(Empty)"}
                    </pre>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Output:</span>
                    <pre className="pattern-output whitespace-pre overflow-x-auto text-emerald-400 bg-slate-900/80 p-2 rounded border border-slate-800">
                      {tc.expectedOutput}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rubric Weights Info */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-slate-300 uppercase">Faculty Rubric:</div>
            <div>Logic &amp; Correctness (30%) • Algorithm Approach (25%)</div>
            <div>Syntax &amp; Structure (20%) • Efficiency (15%) • Constraints (10%)</div>
          </div>
        </div>

        {/* Right Side: The Paper Writing Notepad */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {/* Notepad Toolbar */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowQuestionPanel(!showQuestionPanel)}
                className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                {showQuestionPanel ? "Hide Question Panel" : "Show Question Panel"}
              </button>

              <button
                onClick={handleInsertTemplate}
                className="text-xs px-2.5 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition"
              >
                Insert Section Template
              </button>

              <button
                onClick={() => {
                  if (window.confirm("Clear paper answer draft?")) {
                    setAnswerText("");
                  }
                }}
                className="text-xs px-2 py-1 text-slate-400 hover:text-rose-400"
                title="Clear notepad"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{wordCount} Words</span>
              <span>•</span>
              <span>{charCount} Characters</span>
              <span>•</span>
              <span className="font-semibold text-slate-300">
                Attempt {currentAttempts} of {maxAttempts}
              </span>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="bg-rose-950/60 border-b border-rose-800/60 px-4 py-2.5 text-xs text-rose-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg("")} className="text-rose-400 hover:text-white">
                &times;
              </button>
            </div>
          )}

          {/* Notepad Textarea */}
          <div className="flex-1 relative p-4 flex flex-col">
            <textarea
              value={answerText}
              onChange={handleTextChange}
              placeholder="Write your comprehensive conceptual solution here...
- Explain your algorithmic approach in clear logical steps.
- Describe data structures and why they were chosen.
- Detail edge case handling and constraints.
- Provide time and space complexity analysis."
              className="w-full flex-1 bg-slate-950 text-slate-100 placeholder-slate-600 font-mono text-sm leading-relaxed p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none shadow-inner"
            />
          </div>

          {/* AI Evaluation Result Banner / Section */}
          {evaluationResult && (
            <div
              className={`mx-4 mb-4 p-4 rounded-2xl border ${
                evaluationResult.isApproved
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                  : "bg-rose-950/40 border-rose-500/40 text-rose-200"
              } shadow-lg space-y-3 animate-fade-in`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {evaluationResult.isApproved ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                  )}
                  <div>
                    <h3 className="text-sm font-bold">
                      {evaluationResult.isApproved
                        ? "Conceptual Evaluation Passed! Compiler Unlocked"
                        : `Evaluation Error: ${evaluationResult.errorPercentage}% (Threshold: < 50%)`}
                    </h3>
                    <p className="text-xs opacity-90 mt-0.5">
                      {evaluationResult.message}
                    </p>
                  </div>
                </div>

                {evaluationResult.isApproved && (
                  <button
                    onClick={() => navigate(`/exams/${examId}/editor`)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition"
                  >
                    <span>Proceed to Code Editor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Rubric Breakdown */}
              {evaluationResult.evaluation?.rubricBreakdown && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-2 border-t border-slate-800">
                  <div className="p-2 bg-slate-900/60 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Syntax</span>
                    <span className="font-bold text-white">
                      {evaluationResult.evaluation.rubricBreakdown.syntaxStructure?.score}/20
                    </span>
                  </div>
                  <div className="p-2 bg-slate-900/60 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Logic</span>
                    <span className="font-bold text-white">
                      {evaluationResult.evaluation.rubricBreakdown.logicCorrectness?.score}/30
                    </span>
                  </div>
                  <div className="p-2 bg-slate-900/60 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Algorithm</span>
                    <span className="font-bold text-white">
                      {evaluationResult.evaluation.rubricBreakdown.algorithmicApproach?.score}/25
                    </span>
                  </div>
                  <div className="p-2 bg-slate-900/60 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Efficiency</span>
                    <span className="font-bold text-white">
                      {evaluationResult.evaluation.rubricBreakdown.codeEfficiency?.score}/15
                    </span>
                  </div>
                  <div className="p-2 bg-slate-900/60 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">Constraints</span>
                    <span className="font-bold text-white">
                      {evaluationResult.evaluation.rubricBreakdown.constraintsHandling?.score}/10
                    </span>
                  </div>
                </div>
              )}

              {/* Identified Issues & Hints */}
              {!evaluationResult.isApproved && evaluationResult.evaluation?.identifiedMistakes?.length > 0 && (
                <div className="text-xs space-y-1 bg-slate-900/80 p-3 rounded-xl border border-rose-900/50">
                  <span className="font-bold text-rose-300 block">Areas for Conceptual Revision:</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                    {evaluationResult.evaluation.identifiedMistakes.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                  {evaluationResult.evaluation?.conceptualHints?.length > 0 && (
                    <div className="mt-2 text-indigo-300 font-medium">
                      💡 <strong>Hint:</strong> {evaluationResult.evaluation.conceptualHints.join("; ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bottom Action Footer */}
          <div className="bg-slate-900 border-t border-slate-800 px-4 py-3 flex items-center justify-between">
            <Link
              to={`/exams/${examId}/question`}
              className="text-xs text-slate-400 hover:text-slate-200 transition"
            >
              ← Back to Question
            </Link>

            <div className="flex items-center gap-3">
              <button
                onClick={() => triggerAutosave(answerText)}
                className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-xl hover:bg-slate-800 transition"
              >
                Save Draft Now
              </button>

              <button
                onClick={handleEvaluateSubmit}
                disabled={evaluating || !answerText.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition transform active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>{evaluating ? "Evaluating Conceptual Solution..." : "Evaluate Paper Answer"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamPaperNotepad;
