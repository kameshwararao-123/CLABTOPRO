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
  logExamSecurityEvent,
  endStudentExam,
  expireStudentExam,
} from "../../services/examService";
import Loader from "../../components/common/Loader";
import { isExamProgressCompleted } from "../../utils/examStatus";
import useVisibilityPolling from "../../hooks/useVisibilityPolling";
import { PHASE3_SECURITY_ENABLED } from "../../configs/securityConfig";

const extractCleanProblemDescription = (rawText) => {
  if (!rawText || typeof rawText !== "string") return "";
  let cleaned = rawText
    .replace(/^\s*(?:Difficulty\s*:\s*[^\n]*|Marks\s*:\s*[^\n]*)\s*$/gim, "")
    .replace(/\r\n/g, "\n");
  const sampleSectionMatch = cleaned.match(
    /(?:^|\n)\s*(?:Sample\s+Test\s+Cases?|Sample\s+Test\s+Case\s*#?\d*|Sample\s*#\d+)\b/i
  );
  if (sampleSectionMatch && typeof sampleSectionMatch.index === "number") {
    cleaned = cleaned.slice(0, sampleSectionMatch.index);
  }
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || rawText.trim();
};

const PAPER_TEMPLATE = `1. Algorithm


2. Code Logic


3. Expected Output

`;

const ExamPaperNotepad = () => {
  const { examId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | unsaved | saving | saved | failed
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isEditingResubmit, setIsEditingResubmit] = useState(false);
  const isEditingResubmitRef = useRef(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showQuestionPanel, setShowQuestionPanel] = useState(true);
  const [showAIFeedback, setShowAIFeedback] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState("");

  // Tab switch & copy-paste security
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [endingExam, setEndingExam] = useState(false);

  const autosaveTimerRef = useRef(null);
  const currentQId = searchParams.get("questionId");

  // Security: Tab-switch, Page Visibility & Blur Detection during notepad phase
  useEffect(() => {
    // If Phase 3 security is disabled, do not attach tab-switch or blur listeners
    if (!PHASE3_SECURITY_ENABLED) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount((prev) => {
          const nextCount = prev + 1;
          setWarningMessage(
            `Warning: Tab switching or navigating away is strictly prohibited during exams! Violation #${nextCount} recorded.`
          );
          setShowWarningModal(true);
          logExamSecurityEvent(examId, "notepad_tab_switch_hidden", {
            switchCount: nextCount,
          });
          return nextCount;
        });
      }
    };

    const handleWindowBlur = () => {
      setTabSwitchCount((prev) => {
        const nextCount = prev + 1;
        setWarningMessage(
          `Warning: Focus lost from the exam environment. Violation #${nextCount} recorded.`
        );
        setShowWarningModal(true);
        logExamSecurityEvent(examId, "notepad_window_blur", {
          switchCount: nextCount,
        });
        return nextCount;
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [examId]);

  const activeQuestionIdRef = useRef(null);
  const answersCacheRef = useRef(new Map());
  const draftVersionRef = useRef(new Map());
  const dirtyQuestionsRef = useRef(new Set());
  const answerTextRef = useRef(answerText);
  answerTextRef.current = answerText;
  const fetchSeqRef = useRef(0);
  const isLockedRef = useRef(false);

  // Load question, current progress, and answer draft
  const fetchData = async (qId, isSilent = false) => {
    const reqSeq = ++fetchSeqRef.current;
    try {
      if (!isSilent) {
        setLoading(true);
        setErrorMsg("");
      }
      const params = qId ? { questionId: qId } : currentQId ? { questionId: currentQId } : {};
      const res = await getMyAssignedQuestion(examId, params);

      // Ignore stale responses if a newer fetch or question switch occurred
      if (reqSeq !== fetchSeqRef.current) {
        return;
      }

      if (isExamProgressCompleted(res.progress, res)) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }

      setData(res);

      const loadedQId = res.question?._id ? res.question._id.toString() : null;
      activeQuestionIdRef.current = loadedQId;

      const prog = res.progress || {};
      const thisQProg = (res.questions || []).find((q) => q._id?.toString() === loadedQId);
      const isThisQCompilerAllowed = Boolean(
        thisQProg?.compilerAllowed !== undefined ? thisQProg.compilerAllowed : prog.compilerAllowed
      );
      const thisQStatus = thisQProg?.status || prog.status;
      const thisQConceptualStatus = thisQProg?.conceptualStatus || prog.conceptualStatus;

      const isLockedFromEditing =
        isThisQCompilerAllowed ||
        ((thisQStatus === "awaiting_faculty_evaluation" ||
          thisQConceptualStatus === "submitted" ||
          thisQStatus === "evaluating" ||
          thisQConceptualStatus === "evaluating" ||
          thisQStatus === "waiting_faculty_decision") &&
          !isEditingResubmitRef.current);

      isLockedRef.current = isLockedFromEditing;

      // Sync monotonic version floor from backend
      if (loadedQId && typeof prog.answerDraftVersion === "number") {
        const prevVer = draftVersionRef.current.get(loadedQId) || 0;
        if (prog.answerDraftVersion > prevVer) {
          draftVersionRef.current.set(loadedQId, prog.answerDraftVersion);
        }
      }

      // Restore draft:
      // - On silent background poll, NEVER overwrite unsaved local typing unless locked by faculty
      // - On fresh load or question switch (!isSilent), use local unsaved cache if dirty, else backend source of truth
      if (!isSilent || isLockedFromEditing) {
        if (loadedQId && dirtyQuestionsRef.current.has(loadedQId) && answersCacheRef.current.has(loadedQId) && !isLockedFromEditing) {
          const cachedVal = answersCacheRef.current.get(loadedQId);
          setAnswerText(cachedVal);
          answerTextRef.current = cachedVal;
        } else {
          const serverAnswer = prog.lastConceptualAnswer ?? "";
          setAnswerText(serverAnswer);
          answerTextRef.current = serverAnswer;
          if (loadedQId) {
            answersCacheRef.current.set(loadedQId, serverAnswer);
            dirtyQuestionsRef.current.delete(loadedQId);
          }
          if (!isSilent) {
            setSaveStatus(serverAnswer ? "saved" : "idle");
            setSaveError("");
          }
        }
      }

      if (res.question?._id && res.question._id !== currentQId) {
        setSearchParams({ questionId: res.question._id });
      }
    } catch (err) {
      if (err.response?.data?.isCompleted) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }
      if (!isSilent) {
        setErrorMsg(err.response?.data?.message || "Failed to load examination question.");
      }
    } finally {
      if (!isSilent && reqSeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData(currentQId, false);
  }, [examId, currentQId]);

  // Visibility-aware polling every 12 seconds to detect faculty evaluations & decisions
  useVisibilityPolling(() => fetchData(currentQId, true), 12000, true);

  const timerExpiredRef = useRef(false);

  // Exam Countdown Timer
  useEffect(() => {
    if (!data?.exam?.startedAt || (!data?.exam?.durationMinutes && !data?.exam?.officialEndTime)) return;

    const startTime = new Date(data.exam.startedAt).getTime();
    const durationMs = Number(data.exam.durationMinutes || 180) * 60 * 1000;
    const endTime = data.exam.officialEndTime
      ? new Date(data.exam.officialEndTime).getTime()
      : startTime + durationMs;

    if (endTime > Date.now()) {
      timerExpiredRef.current = false;
    }

    const updateTimer = async () => {
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeftStr("00:00:00 (Time Up)");
        if (!timerExpiredRef.current) {
          timerExpiredRef.current = true;
          try {
            if (autosaveTimerRef.current) {
              clearTimeout(autosaveTimerRef.current);
              autosaveTimerRef.current = null;
            }
            if (answerTextRef.current !== undefined && activeQuestionIdRef.current && !isLockedRef.current) {
              await triggerAutosave(answerTextRef.current, activeQuestionIdRef.current).catch(() => {});
            }
            await expireStudentExam(examId).catch(() => {});
          } finally {
            navigate(`/exams/${examId}/completed`, { replace: true });
          }
        }
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

  // Autosave handler with monotonic versioning and question isolation
  const triggerAutosave = useCallback(
    async (textToSave, qId) => {
      const targetQuestionId = qId || activeQuestionIdRef.current || data?.question?._id;
      if (!targetQuestionId || textToSave === undefined || textToSave === null) return;
      if (isLockedRef.current) return;

      const qKey = targetQuestionId.toString();
      answersCacheRef.current.set(qKey, textToSave);

      const currentVer = (draftVersionRef.current.get(qKey) || 0) + 1;
      draftVersionRef.current.set(qKey, currentVer);

      try {
        setSaveStatus("saving");
        setSaveError("");
        const res = await autosaveAnswerDraft(examId, textToSave, targetQuestionId, currentVer);
        if (draftVersionRef.current.get(qKey) === currentVer) {
          dirtyQuestionsRef.current.delete(qKey);
          setSaveStatus("saved");
        }
        return res;
      } catch (err) {
        if (draftVersionRef.current.get(qKey) === currentVer) {
          setSaveStatus("failed");
          setSaveError(err.response?.data?.message || "Save failed");
        }
        throw err;
      }
    },
    [examId, data?.question?._id]
  );

  // Flush pending debounced save on unmount (navigating away to Code Editor, Dashboard, etc.)
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
        const activeQ = activeQuestionIdRef.current;
        if (activeQ && !isLockedRef.current && answerTextRef.current !== undefined) {
          const qKey = activeQ.toString();
          const nextVer = (draftVersionRef.current.get(qKey) || 0) + 1;
          draftVersionRef.current.set(qKey, nextVer);
          autosaveAnswerDraft(examId, answerTextRef.current, activeQ, nextVer).catch(() => {});
        }
      }
    };
  }, [examId]);

  // Debounced Autosave (700ms)
  const handleTextChange = (e) => {
    const val = e.target.value;
    setAnswerText(val);
    answerTextRef.current = val;
    setSaveStatus("unsaved");
    setSaveError("");

    const currentTargetQId = activeQuestionIdRef.current || data?.question?._id;
    if (currentTargetQId) {
      const qKey = currentTargetQId.toString();
      answersCacheRef.current.set(qKey, val);
      dirtyQuestionsRef.current.add(qKey);
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      triggerAutosave(val, currentTargetQId).catch(() => {});
    }, 700);
  };

  const handleSelectQuestion = async (qId) => {
    if (!qId) return;
    const targetQIdStr = qId.toString();
    const currentQIdStr = activeQuestionIdRef.current || data?.question?._id?.toString();
    if (targetQIdStr === currentQIdStr) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (currentQIdStr && !isLockedRef.current && answerTextRef.current !== undefined) {
      answersCacheRef.current.set(currentQIdStr, answerTextRef.current);
      try {
        await triggerAutosave(answerTextRef.current, currentQIdStr);
      } catch {
        // Keep local cache even if network fails so returning still preserves content
      }
    }

    setSearchParams({ questionId: targetQIdStr });
  };

  const handleInsertTemplate = () => {
    if (answerText.trim() && !window.confirm("Insert template? Existing content will be prepended.")) {
      return;
    }
    const nextVal = answerText.trim() ? `${PAPER_TEMPLATE}\n\n${answerText}` : PAPER_TEMPLATE;
    setAnswerText(nextVal);
    answerTextRef.current = nextVal;
    const currentTargetQId = activeQuestionIdRef.current || data?.question?._id;
    if (currentTargetQId) {
      const qKey = currentTargetQId.toString();
      answersCacheRef.current.set(qKey, nextVal);
      dirtyQuestionsRef.current.add(qKey);
    }
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    triggerAutosave(nextVal, currentTargetQId).catch(() => {});
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
      isEditingResubmitRef.current = false;
      setIsEditingResubmit(false);
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

  if (!data || !data.exam || !data.question) {
    return <Loader message="Setting up your Paper Writing Notepad..." />;
  }

  const handleEndExam = async () => {
    if (
      !window.confirm(
        "Are you sure you want to finish and submit your entire examination? You will not be able to return to this exam."
      )
    ) {
      return;
    }

    try {
      setEndingExam(true);
      // Autosave current draft before concluding
      if (answerTextRef.current !== undefined && activeQuestionIdRef.current && !isLockedRef.current) {
        if (autosaveTimerRef.current) {
          clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = null;
        }
        await triggerAutosave(answerTextRef.current, activeQuestionIdRef.current);
      }
      await endStudentExam(examId);
      navigate(`/exams/${examId}/completed`, { replace: true });
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to finalize examination.");
      setEndingExam(false);
    }
  };

  const { exam, question, progress } = data;
  const wordCount = answerText.trim() ? answerText.trim().split(/\s+/).length : 0;
  const charCount = answerText.length;

  // Multi-question per-question state: check active question's compilerAllowed
  const activeQKey = question?._id?.toString();
  const qProg = data.questions?.find((q) => q._id?.toString() === activeQKey);
  const isCompilerUnlocked = Boolean(
    qProg?.compilerAllowed !== undefined ? qProg.compilerAllowed : progress?.compilerAllowed
  );
  const currentQStatus = qProg?.status || progress?.status;
  const currentQConceptualStatus = qProg?.conceptualStatus || progress?.conceptualStatus;
  const isAwaitingFaculty =
    !isCompilerUnlocked &&
    (currentQStatus === "awaiting_faculty_evaluation" ||
      currentQConceptualStatus === "submitted" ||
      currentQStatus === "evaluating" ||
      currentQConceptualStatus === "evaluating" ||
      currentQStatus === "waiting_faculty_decision");

  const isCorrectionRequired =
    !isCompilerUnlocked &&
    !isAwaitingFaculty &&
    (currentQStatus === "notepad_correction_required" ||
      currentQStatus === "correction_required" ||
      currentQConceptualStatus === "correction_required" ||
      currentQStatus === "conceptual_evaluation_failed");

  const hasAIFeedback = Boolean(
    progress?.lastAIEvaluation || (isCorrectionRequired && progress?.facultyFeedback)
  );

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
                <Save className="w-3.5 h-3.5" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            {saveStatus === "unsaved" && (
              <span className="text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Unsaved
              </span>
            )}
            {saveStatus === "failed" && (
              <button
                type="button"
                onClick={() => triggerAutosave(answerTextRef.current, activeQuestionIdRef.current).catch(() => {})}
                className="text-rose-400 hover:text-rose-300 flex items-center gap-1 underline cursor-pointer"
                title={saveError || "Failed to save draft. Click to retry."}
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Save failed – Retry
              </button>
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
          ) : isAwaitingFaculty && !isEditingResubmit ? (
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

          {/* Conclude Exam Button */}
          <button
            onClick={handleEndExam}
            disabled={endingExam}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/40 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 rounded-lg text-xs font-bold transition disabled:opacity-50"
            title="Conclude and finish examination"
          >
            <span>{endingExam ? "Ending..." : "Finish Exam"}</span>
          </button>
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
          </div>

          <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            {extractCleanProblemDescription(question.problemStatement)}
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
              {question.sampleTestCases.map((tc, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono space-y-1.5"
                >
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
            <div>1. Algorithmic Approach – 50%</div>
            <div>2. Code Logic &amp; Correctness – 50%</div>
            <div className="text-slate-400 pt-0.5">
              Students are not required to provide written explanations. Evaluation is based on the correctness of the algorithm steps, code logic, and expected output. Correctness of the algorithm and code is sufficient for full marks.
            </div>
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
          ) : isAwaitingFaculty && !isEditingResubmit ? (
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
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Latest Submission Saved
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {progress?.lastConceptualAnswer || answerText}
                </div>
                {currentQStatus !== "evaluating" && currentQConceptualStatus !== "evaluating" && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setAnswerText(progress?.lastConceptualAnswer || answerText);
                        isEditingResubmitRef.current = true;
                        setIsEditingResubmit(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition"
                    >
                      Edit & Resubmit Answer
                    </button>
                  </div>
                )}
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
                        answerTextRef.current = "";
                        const currentTargetQId = activeQuestionIdRef.current || data?.question?._id;
                        if (currentTargetQId) {
                          const qKey = currentTargetQId.toString();
                          answersCacheRef.current.set(qKey, "");
                          dirtyQuestionsRef.current.add(qKey);
                        }
                        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
                        triggerAutosave("", currentTargetQId).catch(() => {});
                      }
                    }}
                    className="text-xs px-2 py-1 text-slate-400 hover:text-rose-400"
                    title="Clear notepad"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {hasAIFeedback && (
                    <button
                      type="button"
                      onClick={() => setShowAIFeedback((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded font-semibold border transition ${
                        showAIFeedback
                          ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
                          : "bg-amber-950/60 hover:bg-amber-900/70 text-amber-300 border-amber-700/70"
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>{showAIFeedback ? "Hide AI Feedback" : "View AI Feedback"}</span>
                    </button>
                  )}
                  <span>{wordCount} Words</span>
                  <span>•</span>
                  <span>{charCount} Characters</span>
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

              {/* Notepad Textarea & Collapsible AI Feedback Side Panel */}
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                <div className="flex-1 relative p-4 flex flex-col min-w-0">
                  <textarea
                    value={answerText}
                    onChange={handleTextChange}
                    onContextMenu={(e) => {
                      if (PHASE3_SECURITY_ENABLED) {
                        e.preventDefault();
                        setWarningMessage("Security Policy: Context menu is disabled during exams.");
                        setShowWarningModal(true);
                      }
                    }}
                    onCopy={(e) => {
                      if (PHASE3_SECURITY_ENABLED) {
                        e.preventDefault();
                        setWarningMessage("Security Policy: Copying text is strictly disabled.");
                        setShowWarningModal(true);
                      }
                    }}
                    onPaste={(e) => {
                      if (PHASE3_SECURITY_ENABLED) {
                        e.preventDefault();
                        setWarningMessage("Security Policy: Pasting answers is strictly disabled. Please type your answer.");
                        setShowWarningModal(true);
                        logExamSecurityEvent(examId, "notepad_paste_blocked");
                      }
                    }}
                    onCut={(e) => {
                      if (PHASE3_SECURITY_ENABLED) {
                        e.preventDefault();
                        setWarningMessage("Security Policy: Cutting text is disabled.");
                        setShowWarningModal(true);
                      }
                    }}
                    placeholder={PAPER_TEMPLATE}
                    className="w-full flex-1 bg-slate-950 text-slate-100 placeholder-slate-600 font-mono text-sm leading-relaxed p-4 rounded-xl border border-slate-800 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none shadow-inner"
                  />
                </div>

                {hasAIFeedback && showAIFeedback && (() => {
                  const aiEval = progress?.lastAIEvaluation || null;
                  const evalSummary = aiEval?.overallFeedback || aiEval?.feedbackSummary || "";
                  const correctList = aiEval?.correctConcepts || aiEval?.strengths || [];
                  const missingList = aiEval?.missingConcepts || [];
                  const incorrectList = aiEval?.incorrectConcepts || [];
                  const suggestionsList = aiEval?.improvementSuggestions || aiEval?.suggestions || [];

                  return (
                    <div className="lg:w-96 w-full border-t lg:border-t-0 lg:border-l border-amber-800/60 bg-amber-950/40 overflow-y-auto p-4 text-xs text-amber-200 space-y-3">
                      <div className="flex items-start justify-between gap-2 pb-2 border-b border-amber-800/50">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span className="font-bold text-amber-300 text-sm">
                            AI Evaluation Feedback
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAIFeedback(false)}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-semibold transition"
                        >
                          Close
                        </button>
                      </div>

                      {(isCorrectionRequired || progress?.facultyFeedback || evalSummary) && (
                        <p className="text-amber-200/90 leading-relaxed">
                          <strong>{isCorrectionRequired ? "Corrections Required:" : "Summary:"}</strong>{" "}
                          {progress?.facultyFeedback ||
                            evalSummary ||
                            "Your conceptual answer requires improvement. Please review the feedback below and correct your answer before resubmitting."}
                        </p>
                      )}

                      {aiEval && (
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-900/50 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              Error Percentage: {aiEval.errorPercentage}% (Threshold: &lt;50%)
                            </span>
                            {aiEval.understandingPercentage !== undefined && (
                              <span className="px-2 py-0.5 rounded-md font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                Understanding: {aiEval.understandingPercentage}%
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                              Marks: {aiEval.totalMarks ?? Math.round(((aiEval.understandingPercentage ?? (100 - aiEval.errorPercentage)) / 100) * (aiEval.maximumMarks || question?.marks || 10) * 10) / 10} / {aiEval.maximumMarks || question?.marks || 10}
                            </span>
                          </div>

                          {evalSummary && (
                            <p className="text-xs text-slate-300 pt-1 italic">
                              &ldquo;{evalSummary}&rdquo;
                            </p>
                          )}

                          {incorrectList.length > 0 && (
                            <div>
                              <span className="text-[11px] font-bold text-rose-400 uppercase block">
                                Incorrect Concepts:
                              </span>
                              <ul className="list-disc pl-4 space-y-0.5 text-rose-200">
                                {incorrectList.map((ic, idx) => (
                                  <li key={idx}>{ic}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {missingList.length > 0 && (
                            <div>
                              <span className="text-[11px] font-bold text-rose-300 uppercase block">
                                Missing Concepts:
                              </span>
                              <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                                {missingList.map((mc, idx) => (
                                  <li key={idx}>{mc}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {suggestionsList.length > 0 && (
                            <div>
                              <span className="text-[11px] font-bold text-indigo-300 uppercase block">
                                Suggestions:
                              </span>
                              <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                                {suggestionsList.map((sug, idx) => (
                                  <li key={idx}>{sug}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {correctList.length > 0 && (
                            <div>
                              <span className="text-[11px] font-bold text-emerald-300 uppercase block">
                                Correct Points / Strengths:
                              </span>
                              <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                                {correctList.map((cp, idx) => (
                                  <li key={idx}>{cp}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                  {isAwaitingFaculty && isEditingResubmit && (
                    <button
                      type="button"
                      onClick={() => {
                        isEditingResubmitRef.current = false;
                        setIsEditingResubmit(false);
                      }}
                      className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-xl hover:bg-slate-800 transition"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    onClick={() => triggerAutosave(answerText)}
                    className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-xl hover:bg-slate-800 transition"
                  >
                    Save Draft Now
                  </button>

                  <button
                    onClick={handleSubmitConceptualAnswer}
                    disabled={submitting || !answerText.trim()}
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
                          {isCorrectionRequired
                            ? "Resubmit Corrected Answer"
                            : isAwaitingFaculty
                            ? "Resubmit Conceptual Answer"
                            : "Submit Conceptual Answer"}
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

      {/* Security Warning Modal (Active only when Phase 3 Security is enabled) */}
      {PHASE3_SECURITY_ENABLED && showWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white tracking-wide">
                Security Warning Notice
              </h3>
              <p className="text-xs text-rose-300 font-medium">
                {warningMessage}
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 text-left space-y-1">
              <div>• Tab switching and external browsing are prohibited during exams.</div>
              <div>• Pasting or copying conceptual solutions is strictly prevented.</div>
              <div>• All activity is logged and monitored in the faculty registry.</div>
            </div>
            <button
              onClick={() => setShowWarningModal(false)}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/30"
            >
              I Understand &amp; Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamPaperNotepad;
