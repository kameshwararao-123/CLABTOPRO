import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
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
  Send,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  getMyAssignedQuestion,
  autosaveAnswerDraft,
  submitPaperAnswer,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showQuestionPanel, setShowQuestionPanel] = useState(true);
  const [timeLeftStr, setTimeLeftStr] = useState("");

  const autosaveTimerRef = useRef(null);
  const currentQId = searchParams.get("questionId");

  // Load question, current progress, and answer draft
  const fetchData = async (qId, isSilent = false) => {
    try {
      if (!isSilent) {
        setLoading(true);
        setErrorMsg("");
      }
      const params = qId ? { questionId: qId } : currentQId ? { questionId: currentQId } : {};
      const res = await getMyAssignedQuestion(examId, params);
      setData(res);

      const prog = res.progress || {};
      const isLockedFromEditing =
        prog.compilerAllowed ||
        prog.status === "awaiting_faculty_evaluation" ||
        prog.conceptualStatus === "submitted" ||
        prog.status === "evaluating" ||
        prog.status === "waiting_faculty_decision";

      // Only update local answerText if initial load or if locked (viewing submitted copy)
      // or if user hasn't typed anything yet
      if (!isSilent || isLockedFromEditing || !answerText.trim()) {
        if (prog.lastConceptualAnswer) {
          setAnswerText(prog.lastConceptualAnswer);
        }
      }

      if (res.question?._id && res.question._id !== currentQId) {
        setSearchParams({ questionId: res.question._id });
      }
    } catch (err) {
      if (!isSilent) {
        setErrorMsg(err.response?.data?.message || "Failed to load examination question.");
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData(currentQId, false);
  }, [examId, currentQId]);

  // Live auto-polling every 4 seconds to detect faculty evaluations & decisions
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(currentQId, true);
    }, 4000);
    return () => clearInterval(interval);
  }, [examId, currentQId]);

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
        await autosaveAnswerDraft(examId, text, data?.question?._id);
        setSaveStatus("saved");
      } catch (err) {
        setSaveStatus("idle");
      }
    },
    [examId, data?.question?._id]
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

  const handleSelectQuestion = async (qId) => {
    if (answerText.trim()) {
      await triggerAutosave(answerText);
    }
    setSearchParams({ questionId: qId });
  };

  const handleInsertTemplate = () => {
    if (answerText.trim() && !window.confirm("Insert template? Existing content will be prepended.")) {
      return;
    }
    setAnswerText((prev) => (prev.trim() ? `${PAPER_TEMPLATE}\n\n${prev}` : PAPER_TEMPLATE));
  };

  // Student Submits Conceptual Answer (NO automatic AI evaluation, NO auto redirect)
  const handleSubmitConceptualAnswer = async () => {
    if (!answerText.trim() || answerText.trim().length < 20) {
      setErrorMsg("Please write a detailed conceptual solution (minimum 20 characters) before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg("");
      setSuccessMsg("");

      const res = await submitPaperAnswer(examId, answerText, data?.question?._id);
      setSuccessMsg(res.message || "Conceptual answer submitted successfully.");
      await fetchData(data?.question?._id, false);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to submit conceptual answer. Please try again.");
    } finally {
      setSubmitting(false);
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
  const wordCount = answerText.trim() ? answerText.trim().split(/\s+/).length : 0;
  const charCount = answerText.length;
  const maxAttempts = exam.maxConceptualAttempts || 3;
  const currentAttempts = progress?.conceptualAttemptsCount || 0;

  // Workflow State Flags
  const isCompilerUnlocked = Boolean(progress?.compilerAllowed);
  const isAwaitingFaculty =
    !isCompilerUnlocked &&
    (progress?.status === "awaiting_faculty_evaluation" ||
      progress?.conceptualStatus === "submitted" ||
      progress?.status === "evaluating" ||
      progress?.conceptualStatus === "evaluating" ||
      progress?.status === "waiting_faculty_decision");

  const isCorrectionRequired =
    !isCompilerUnlocked &&
    !isAwaitingFaculty &&
    (progress?.status === "notepad_correction_required" ||
      progress?.conceptualStatus === "correction_required" ||
      progress?.status === "conceptual_evaluation_failed");

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
              onClick={() => navigate(`/exams/${examId}/editor?questionId=${question._id}`)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition"
            >
              <Code2 className="w-4 h-4" /> Go to Code Editor
            </button>
          ) : isAwaitingFaculty ? (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-lg font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>Awaiting Faculty Review</span>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-1 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-lg">
              <span>Compiler: Locked (Faculty Approval Required)</span>
            </div>
          )}
        </div>
      </header>

      {/* Multi-Question Selector Bar (when assigned questions > 1) */}
      {data.questions && data.questions.length > 1 && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] whitespace-nowrap">
              Questions ({data.questions.length}):
            </span>
            {data.questions.map((qItem, idx) => {
              const isActive = qItem._id === question._id || (data.currentIndex ?? 0) === idx;
              return (
                <button
                  key={qItem._id || idx}
                  type="button"
                  onClick={() => handleSelectQuestion(qItem._id)}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  <span>{qItem.questionNumber || `Q${idx + 1}`}</span>
                  {qItem.isCompleted ? (
                    <span className="text-emerald-400 font-bold">✓</span>
                  ) : qItem.compilerAllowed ? (
                    <span className="text-emerald-400 text-[10px]">●</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="text-slate-400 font-medium whitespace-nowrap hidden sm:block">
            Question {(data.currentIndex ?? 0) + 1} of {data.questions.length}
          </div>
        </div>
      )}

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

        {/* Right Side: Notepad / Waiting State / Unlocked State */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {/* SCENARIO 1: CODE EDITOR UNLOCKED */}
          {isCompilerUnlocked ? (
            <div className="flex-1 overflow-y-auto p-6 sm:p-12 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/5">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="max-w-md space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Approved – Code Editor Unlocked!
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Your conceptual solution has been reviewed and approved by faculty. You are authorized to proceed to the programming environment.
                </p>
              </div>

              <button
                onClick={() => navigate(`/exams/${examId}/editor?questionId=${question._id}`)}
                className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-xl shadow-emerald-600/30 transition transform hover:-translate-y-0.5"
              >
                <Code2 className="w-5 h-5" />
                <span>Proceed to Code Editor</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-left w-full max-w-lg space-y-2 mt-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Approved Conceptual Answer:
                </span>
                <div className="font-mono text-xs text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {progress?.lastConceptualAnswer || answerText}
                </div>
              </div>
            </div>
          ) : isAwaitingFaculty ? (
            /* SCENARIO 2: WAITING FOR FACULTY EVALUATION / DECISION */
            <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/5">
                  <Clock className="w-10 h-10 animate-pulse" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                </span>
              </div>

              <div className="max-w-lg space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Conceptual Answer Submitted Successfully
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Your answer has been submitted and is waiting for faculty evaluation. Please wait until your faculty reviews your answer.
                </p>
              </div>

              {/* Status Badges Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl text-left">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Submission Status
                  </span>
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Evaluation Status
                  </span>
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    {progress?.status === "evaluating" ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 animate-spin" /> AI Evaluation in Progress
                      </>
                    ) : progress?.status === "waiting_faculty_decision" ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" /> Waiting for Faculty Decision
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5" /> Awaiting Faculty Evaluation
                      </>
                    )}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Exam Status
                  </span>
                  <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> Waiting for Faculty Approval
                  </span>
                </div>
              </div>

              {/* Live Polling Indicator */}
              <div className="inline-flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-800">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Auto-refreshing status every 4 seconds. No page refresh needed.</span>
              </div>

              {/* Read-only Submitted Answer Preview */}
              <div className="w-full max-w-xl text-left space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                    Submitted Conceptual Answer (Locked)
                  </span>
                  <span>Attempt #{progress?.conceptualAttemptsCount || 1}</span>
                </div>
                <div className="max-h-60 overflow-y-auto p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {progress?.lastConceptualAnswer || answerText}
                </div>
              </div>
            </div>
          ) : (
            /* SCENARIO 3: ACTIVE NOTEPAD (INITIAL DRAFT OR CORRECTION REQUIRED) */
            <>
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

              {/* Correction Required Banner (if faculty returned answer) */}
              {isCorrectionRequired && (
                <div className="bg-amber-950/60 border-b border-amber-800/80 px-4 py-3 text-xs text-amber-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-amber-300 text-sm">
                        Your Conceptual Answer Requires Improvement
                      </div>
                      <p className="text-amber-200/90">
                        {progress?.facultyFeedback ||
                          "Your conceptual answer requires improvement. Please review the faculty feedback and correct your answer before resubmitting."}
                      </p>
                    </div>
                  </div>

                  {/* Previous AI Evaluation Report / Missing Concepts */}
                  {progress?.lastAIEvaluation && (
                    <div className="mt-2 p-3 rounded-xl bg-slate-900/90 border border-amber-900/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          Error Percentage: {progress.lastAIEvaluation.errorPercentage}% (Threshold: &lt;50%)
                        </span>
                        {progress.lastAIEvaluation.understandingPercentage !== undefined && (
                          <span className="px-2 py-0.5 rounded-md font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Understanding: {progress.lastAIEvaluation.understandingPercentage}%
                          </span>
                        )}
                      </div>

                      {progress.lastAIEvaluation.missingConcepts?.length > 0 && (
                        <div>
                          <span className="text-[11px] font-bold text-rose-300 uppercase block">
                            Missing Concepts:
                          </span>
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                            {progress.lastAIEvaluation.missingConcepts.map((mc, idx) => (
                              <li key={idx}>{mc}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {progress.lastAIEvaluation.suggestions?.length > 0 && (
                        <div>
                          <span className="text-[11px] font-bold text-indigo-300 uppercase block">
                            Suggestions for Improvement:
                          </span>
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                            {progress.lastAIEvaluation.suggestions.map((sug, idx) => (
                              <li key={idx}>{sug}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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

              {/* Success Banner */}
              {successMsg && (
                <div className="bg-emerald-950/60 border-b border-emerald-800/60 px-4 py-2.5 text-xs text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                  <button onClick={() => setSuccessMsg("")} className="text-emerald-400 hover:text-white">
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
                  className="w-full flex-1 bg-slate-950 text-slate-100 placeholder-slate-600 font-mono text-sm leading-relaxed p-4 rounded-xl border border-slate-800 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none shadow-inner"
                />
              </div>

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
                    onClick={handleSubmitConceptualAnswer}
                    disabled={submitting || !answerText.trim() || currentAttempts >= maxAttempts}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition transform active:scale-95"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                        <span>Submitting Answer...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-indigo-200" />
                        <span>
                          {isCorrectionRequired ? "Resubmit Corrected Answer" : "Submit Conceptual Answer"}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamPaperNotepad;
