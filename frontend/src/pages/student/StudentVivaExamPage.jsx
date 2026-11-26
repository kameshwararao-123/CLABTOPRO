import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Send,
  ArrowLeft,
  Award,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import {
  getVivaExamInstructions,
  acknowledgeVivaInstructions,
  getVivaExamQuestions,
  saveVivaAnswerDraft,
  submitVivaExam,
  getVivaStudentResults,
} from "../../services/examService";
import Loader from "../../components/common/Loader";
import { isExamProgressCompleted } from "../../utils/examStatus";

const StudentVivaExamPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get("view"); // e.g. "result"

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Student progress state
  const [answers, setAnswers] = useState({}); // { [questionId]: { selectedOption, isMarkedForReview } }
  const [isStarted, setIsStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [vivaResult, setVivaResult] = useState(null);

  // Instructions state
  const [instructionsAcknowledged, setInstructionsAcknowledged] = useState(false);
  const [agreedToRules, setAgreedToRules] = useState(false);

  // Timer & Autosave state
  const [timeLeft, setTimeLeft] = useState(null);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const timerRef = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Fetch initial exam data
  const loadExamData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      // First check instructions & progress
      const instData = await getVivaExamInstructions(examId);
      setExam(instData.exam);

      const prog = instData.progress;
      if (isExamProgressCompleted(prog, instData) || initialView === "result") {
        setIsCompleted(true);
        // Load completed results
        const resData = await getVivaExamQuestions(examId);
        setQuestions(resData.questions || []);
        setVivaResult(resData.vivaResult || prog?.vivaResult);
        setAnswers(resData.vivaAnswers || {});
        setIsStarted(true);
        setLoading(false);
        return;
      }

      if (prog?.instructionsAcknowledged && (prog?.status === "in_progress" || prog?.status === "instructions_acknowledged")) {
        // Exam already in progress: load questions directly
        setInstructionsAcknowledged(true);
        setIsStarted(true);
        await loadQuestions(instData.exam, prog);
      } else {
        // Student needs to acknowledge instructions first
        setInstructionsAcknowledged(false);
        setIsStarted(false);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || "Failed to load examination.");
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (examObj, progressObj) => {
    const qData = await getVivaExamQuestions(examId);
    setQuestions(qData.questions || []);
    setAnswers(qData.vivaAnswers || {});

    if (qData.isCompleted) {
      setIsCompleted(true);
      setVivaResult(qData.vivaResult);
      return;
    }

    // Initialize timer
    const durationMins = examObj?.durationMinutes || 45;
    const startTime = qData.vivaStartedAt ? new Date(qData.vivaStartedAt).getTime() : Date.now();
    const totalMs = durationMins * 60 * 1000;
    const elapsedMs = Date.now() - startTime;
    const remainingSeconds = Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));
    setTimeLeft(remainingSeconds);
  };

  useEffect(() => {
    loadExamData();
  }, [examId]);

  // Timer countdown hook
  useEffect(() => {
    if (!isStarted || isCompleted || timeLeft === null) return;

    if (timeLeft <= 0) {
      // Auto submit when time expires
      handleFinalSubmit(true);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleFinalSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStarted, isCompleted, timeLeft]);

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    if (secs === null || secs < 0) return "--:--";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Start exam after acknowledging instructions
  const handleStartExam = async () => {
    if (!agreedToRules) return;
    try {
      setLoading(true);
      setErrorMessage("");
      await acknowledgeVivaInstructions(examId);
      setInstructionsAcknowledged(true);
      setIsStarted(true);
      await loadQuestions(exam);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || "Failed to start examination.");
    } finally {
      setLoading(false);
    }
  };

  // Select an option for current question
  const handleSelectOption = async (optionId) => {
    if (isCompleted) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const qId = String(currentQ._id);
    const prevAnswer = answers[qId] || {};
    const newSelected = prevAnswer.selectedOption === optionId ? null : optionId; // Toggle selection

    const updated = {
      ...answers,
      [qId]: {
        ...prevAnswer,
        questionId: qId,
        selectedOption: newSelected,
      },
    };
    setAnswers(updated);

    // Autosave in background
    try {
      setIsSaving(true);
      await saveVivaAnswerDraft(examId, qId, newSelected, prevAnswer.isMarkedForReview || false);
      setLastSavedTime(new Date());
    } catch (saveErr) {
      console.warn("Autosave draft failed:", saveErr);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle mark for review
  const handleToggleReview = async () => {
    if (isCompleted) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const qId = String(currentQ._id);
    const prevAnswer = answers[qId] || {};
    const newReview = !prevAnswer.isMarkedForReview;

    const updated = {
      ...answers,
      [qId]: {
        ...prevAnswer,
        questionId: qId,
        isMarkedForReview: newReview,
      },
    };
    setAnswers(updated);

    try {
      setIsSaving(true);
      await saveVivaAnswerDraft(examId, qId, prevAnswer.selectedOption || null, newReview);
      setLastSavedTime(new Date());
    } catch (saveErr) {
      console.warn("Autosave draft failed:", saveErr);
    } finally {
      setIsSaving(false);
    }
  };

  // Clear current question selection
  const handleClearSelection = async () => {
    if (isCompleted) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const qId = String(currentQ._id);
    const prevAnswer = answers[qId] || {};

    const updated = {
      ...answers,
      [qId]: {
        ...prevAnswer,
        selectedOption: null,
      },
    };
    setAnswers(updated);

    try {
      setIsSaving(true);
      await saveVivaAnswerDraft(examId, qId, null, prevAnswer.isMarkedForReview || false);
      setLastSavedTime(new Date());
    } catch (saveErr) {
      console.warn("Autosave draft failed:", saveErr);
    } finally {
      setIsSaving(false);
    }
  };

  // Submit exam
  const handleFinalSubmit = async (isAuto = false) => {
    if (submitting || isCompleted) return;
    try {
      setSubmitting(true);
      setErrorMessage("");
      await submitVivaExam(examId, answersRef.current);
      setIsCompleted(true);
      setShowSubmitModal(false);
    } catch (err) {
      if (err.response?.data?.alreadySubmitted || err.response?.data?.isCompleted) {
        setIsCompleted(true);
        setShowSubmitModal(false);
        return;
      }
      setErrorMessage(err.response?.data?.message || "Failed to submit examination.");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate palette metrics
  const paletteStats = useMemo(() => {
    let answered = 0;
    let marked = 0;
    let answeredAndMarked = 0;
    let notAnswered = 0;

    for (const q of questions) {
      const qId = String(q._id);
      const ans = answers[qId];
      const hasAns = ans?.selectedOption && ans.selectedOption.trim() !== "";
      const isRev = ans?.isMarkedForReview;

      if (hasAns && isRev) {
        answeredAndMarked++;
        answered++;
      } else if (hasAns) {
        answered++;
      } else if (isRev) {
        marked++;
      } else {
        notAnswered++;
      }
    }

    return {
      answered,
      marked,
      answeredAndMarked,
      notAnswered,
      total: questions.length,
    };
  }, [questions, answers]);

  const parsedInstructions = useMemo(() => {
    if (!exam?.instructions) {
      return [
        "This is a Viva Multiple Choice Question (MCQ) Examination.",
        "Each question has multiple choices with one correct answer.",
        "Select your answer and proceed through the questions sequentially or jump using the question palette.",
        "You can mark questions for review and return to them anytime before final submission.",
        "The exam timer runs continuously. Answers are autosaved as you make your selections.",
        "Do not refresh the page or switch tabs during the examination.",
      ];
    }
    if (Array.isArray(exam.instructions)) {
      return exam.instructions.filter(Boolean);
    }
    if (typeof exam.instructions === "string") {
      const lines = exam.instructions
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return lines.length > 0 ? lines : [exam.instructions];
    }
    return [String(exam.instructions)];
  }, [exam?.instructions]);

  if (loading) {
    return <Loader message="Preparing your Viva MCQ Examination..." />;
  }

  // =========================================================================
  // VIEW 1: INSTRUCTIONS SCREEN
  // =========================================================================
  if (!instructionsAcknowledged && !isCompleted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl w-full mx-auto space-y-6">
          <div className="flex items-center gap-2">
            <Link
              to="/exams"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              <ArrowLeft size={14} /> Back to Examinations
            </Link>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full mb-2">
                  <Sparkles size={12} /> Viva MCQ Examination
                </span>
                <h1 className="text-2xl font-bold text-slate-900">{exam?.title}</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Subject: <strong>{exam?.subject}</strong> | Academic Year: {exam?.academicYear} | {exam?.semester}
                </p>
              </div>
            </div>

            {/* Exam Quick Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Duration</span>
                <p className="text-base font-bold text-slate-800 mt-0.5">{exam?.durationMinutes} Mins</p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Questions</span>
                <p className="text-base font-bold text-slate-800 mt-0.5">{exam?.totalQuestions || "—"}</p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Marks</span>
                <p className="text-base font-bold text-slate-800 mt-0.5">{exam?.totalMarks}</p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Negative Mark</span>
                <p className="text-base font-bold text-slate-800 mt-0.5">
                  {exam?.negativeMarkingEnabled ? `-${exam.negativeMarking}` : "None"}
                </p>
              </div>
            </div>

            {/* Examination Guidelines */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <BookOpen size={16} className="text-indigo-600" /> Examination Instructions &amp; Rules
              </h2>
              <ul className="space-y-2 text-xs sm:text-sm text-slate-600 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                {parsedInstructions.map((inst, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="flex-shrink-0 text-indigo-600 font-bold">•</span>
                    <span>{inst}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Agreement Checkbox */}
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  checked={agreedToRules}
                  onChange={(e) => setAgreedToRules(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  I have read and thoroughly understood all the instructions. I promise to uphold academic integrity and adhere to the examination rules.
                </span>
              </label>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Start Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!agreedToRules}
                onClick={handleStartExam}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-40 transition"
              >
                <Sparkles size={16} /> Start Viva Examination
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: SUBMITTED CONFIRMATION SCREEN (Answers & Scores maintained by faculty)
  // =========================================================================
  if (isCompleted) {
    const answeredCount = Object.values(answers).filter(
      (a) => a && a.selectedOption && String(a.selectedOption).trim() !== ""
    ).length;
    const unansweredCount = Math.max(0, (questions.length || 0) - answeredCount);

    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
        <div className="max-w-xl mx-auto w-full space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 mb-1">
              <CheckCircle2 size={44} />
            </div>

            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-0.5 rounded-full mb-1">
                Submitted Successfully
              </span>
              <h1 className="text-2xl font-bold text-slate-900">
                Viva Examination Submitted
              </h1>
              <p className="text-sm text-slate-500">
                {exam?.title} — {exam?.subject}
              </p>
            </div>

            {/* Submission Summary Card */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs text-slate-600 space-y-2.5 text-left">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Total Questions:</span>
                <span className="font-bold text-slate-800">{questions.length || 0}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Questions Attempted:</span>
                <span className="font-bold text-emerald-700">{answeredCount}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Unanswered Questions:</span>
                <span className="font-bold text-slate-600">{unansweredCount}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-indigo-600">Locked for Faculty Review</span>
              </div>
            </div>

            {/* Notice regarding answers and scores */}
            <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 text-left leading-relaxed">
              <strong>Notice: </strong>
              As per examination policy, question answers and final scores are evaluated and reviewed by the course faculty in the live monitoring dashboard.
            </div>

            <div className="pt-2">
              <Link
                to="/exams"
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition"
              >
                <ArrowLeft size={16} /> Return to Examinations
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: ACTIVE EXAM TESTING INTERFACE
  // =========================================================================
  const currentQuestion = questions[currentIndex];
  const currentQId = currentQuestion ? String(currentQuestion._id) : "";
  const currentAnswer = answers[currentQId] || {};
  const currentSelectedOption = currentAnswer.selectedOption;
  const isCurrentMarkedForReview = Boolean(currentAnswer.isMarkedForReview);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                Viva MCQ Exam
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate max-w-[280px] sm:max-w-md">
                {exam?.title}
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {exam?.subject} | Single Choice Mode
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Autosave Status Indicator */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <span className={`w-2 h-2 rounded-full ${isSaving ? "bg-amber-400 animate-ping" : "bg-emerald-500"}`} />
              <span>{isSaving ? "Saving..." : lastSavedTime ? `Autosaved ${lastSavedTime.toLocaleTimeString()}` : "Autosaved"}</span>
            </div>

            {/* Live Countdown Timer */}
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono font-bold text-sm shadow-xs ${
                timeLeft !== null && timeLeft < 300
                  ? "bg-rose-50 border-rose-300 text-rose-700 animate-pulse"
                  : "bg-slate-900 border-slate-800 text-emerald-400"
              }`}
            >
              <Clock size={16} />
              <span>{formatTime(timeLeft)}</span>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-indigo-700 transition"
            >
              <Send size={14} /> Submit Exam
            </button>
          </div>
        </div>
      </header>

      {/* Main Examination Workspace */}
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Question & Options (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
            {/* Question Top Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-indigo-600 px-3 py-1 font-mono text-xs font-bold text-white">
                  Q{currentIndex + 1}
                </span>
                <span className="text-xs text-slate-400">
                  of {questions.length} Questions
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  +{currentQuestion?.marks || exam?.marksPerQuestion || 1} Marks
                </span>
                {exam?.negativeMarkingEnabled && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    -{exam.negativeMarking} on error
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleReview}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${
                  isCurrentMarkedForReview
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Bookmark size={13} className={isCurrentMarkedForReview ? "fill-amber-500 text-amber-500" : ""} />
                <span>{isCurrentMarkedForReview ? "Marked for Review" : "Mark for Review"}</span>
              </button>
            </div>

            {/* Question Statement */}
            <div className="space-y-3">
              <pre className="whitespace-pre-wrap font-mono text-sm bg-slate-900 text-slate-100 p-4 rounded-2xl border border-slate-800 overflow-x-auto leading-relaxed shadow-inner">
                {currentQuestion?.questionText || currentQuestion?.problemStatement || "Question text unavailable"}
              </pre>
            </div>

            {/* Options List */}
            <div className="space-y-2.5 pt-2">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Choose one correct option:
              </span>

              <div className="space-y-2.5">
                {(currentQuestion?.options || []).map((opt) => {
                  const isSelected = currentSelectedOption === opt.optionId;

                  return (
                    <button
                      key={opt.optionId}
                      type="button"
                      onClick={() => handleSelectOption(opt.optionId)}
                      className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border text-left transition ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/30 text-indigo-950 font-semibold"
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold transition ${
                          isSelected
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {opt.optionId}
                      </span>
                      <span className="text-xs sm:text-sm font-mono whitespace-pre-wrap flex-1 leading-relaxed">
                        {opt.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clear selection link */}
            {currentSelectedOption && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600 transition"
                >
                  <RotateCcw size={12} /> Clear my selection
                </button>
              </div>
            )}
          </div>

          {/* Bottom Question Navigation Controls */}
          <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition shadow-xs"
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handleToggleReview();
                  if (currentIndex < questions.length - 1) {
                    setCurrentIndex((p) => p + 1);
                  }
                }}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition shadow-xs"
              >
                <Bookmark size={13} /> Review &amp; Next
              </button>

              <button
                type="button"
                disabled={currentIndex >= questions.length - 1}
                onClick={() => setCurrentIndex((p) => Math.min(questions.length - 1, p + 1))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-40 transition"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Question Palette & Status (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Question Palette</h3>

            {/* Color-coded Legend */}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-emerald-500 flex-shrink-0" />
                <span>Answered ({paletteStats.answered})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-amber-400 flex-shrink-0" />
                <span>Marked ({paletteStats.marked})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-purple-500 flex-shrink-0" />
                <span>Answered &amp; Review ({paletteStats.answeredAndMarked})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-slate-200 flex-shrink-0" />
                <span>Not Visited ({paletteStats.notAnswered})</span>
              </div>
            </div>

            {/* Questions Jump Grid */}
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-[380px] overflow-y-auto p-1">
              {questions.map((q, idx) => {
                const qId = String(q._id);
                const ans = answers[qId];
                const hasAnswer = ans?.selectedOption && ans.selectedOption.trim() !== "";
                const isMarked = ans?.isMarkedForReview;
                const isCurrent = currentIndex === idx;

                let pillColor = "bg-slate-100 text-slate-700 hover:bg-slate-200";
                if (hasAnswer && isMarked) {
                  pillColor = "bg-purple-600 text-white font-bold ring-2 ring-purple-300";
                } else if (hasAnswer) {
                  pillColor = "bg-emerald-600 text-white font-bold";
                } else if (isMarked) {
                  pillColor = "bg-amber-400 text-slate-900 font-bold";
                }

                return (
                  <button
                    key={q._id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 rounded-xl font-mono text-xs font-bold transition flex items-center justify-center ${pillColor} ${
                      isCurrent ? "ring-2 ring-indigo-600 scale-105" : ""
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <Send size={22} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Submit Viva Examination?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to finalize and submit your examination? Once submitted, you cannot change your answers.
              </p>
            </div>

            {/* Submission Status Breakdown */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center text-xs">
              <div>
                <span className="text-slate-400 font-medium">Attempted</span>
                <p className="text-base font-bold text-emerald-600 mt-0.5">{paletteStats.answered}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Unanswered</span>
                <p className="text-base font-bold text-slate-600 mt-0.5">{paletteStats.notAnswered}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">For Review</span>
                <p className="text-base font-bold text-amber-600 mt-0.5">{paletteStats.marked}</p>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel &amp; Continue Exam
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleFinalSubmit(false)}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {submitting ? "Submitting..." : "Yes, Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentVivaExamPage;
