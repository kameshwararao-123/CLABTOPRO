import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import {
  Code2,
  Play,
  Send,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Terminal,
  Loader2,
  FileText,
  Save,
  CheckCircle2,
  Maximize2,
  ShieldAlert,
  LogOut,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  getMyAssignedQuestion,
  runExamCode,
  submitExamCode,
  autosaveCodeDraft,
  logExamSecurityEvent,
  endStudentExam,
  expireStudentExam,
} from "../../services/examService";
import Loader from "../../components/common/Loader";
import { initMonacoC } from "../../utils/cLanguageSupport";
import { PHASE3_SECURITY_ENABLED } from "../../configs/securityConfig";
import { isExamProgressCompleted } from "../../utils/examStatus";
import useVisibilityPolling from "../../hooks/useVisibilityPolling";

initMonacoC();

const DEFAULT_C_CODE = `#include <stdio.h>

int main() {
    // Write your C code here
    
    return 0;
}
`;

const ExamCodeEditorPage = () => {
  const { examId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [code, setCode] = useState(DEFAULT_C_CODE);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [endingExam, setEndingExam] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved"); // saving | saved | failed | unsaved
  const [saveError, setSaveError] = useState("");
  const [runResult, setRunResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("run"); // 'run' | 'submit'
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [expandedCases, setExpandedCases] = useState({});
  const [expandedHiddenCases, setExpandedHiddenCases] = useState({});

  const toggleCaseExpand = (idx) => {
    setExpandedCases((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const toggleHiddenCaseExpand = (idx) => {
    setExpandedHiddenCases((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  // Exam Security & Tab-switch tracking state
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const editorRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  // Track draft per question in local cache to guarantee zero loss during rapid question switching
  const draftsCacheRef = useRef(new Map());
  // Monotonically increasing version counter per question
  const draftVersionRef = useRef(new Map());
  // Track active question ID directly in ref to prevent stale closures
  const activeQuestionIdRef = useRef(null);
  // Prevent concurrent duplicate autosave network requests and stop autosave once submitted
  const inFlightSaveRef = useRef(false);
  const retryTimerRef = useRef(null);
  const examLockedRef = useRef(false);

  const currentQId = searchParams.get("questionId");

  const getLocalDraftKey = useCallback(
    (qKey) => `clabto_exam_code_draft:${examId}:${qKey}`,
    [examId]
  );

  const readLocalDraft = useCallback(
    (qKey) => {
      try {
        const raw = window.localStorage.getItem(getLocalDraftKey(qKey));
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    [getLocalDraftKey]
  );

  const writeLocalDraft = useCallback(
    (qKey, payload) => {
      try {
        window.localStorage.setItem(getLocalDraftKey(qKey), JSON.stringify(payload));
      } catch {
        // Ignore storage quota errors
      }
    },
    [getLocalDraftKey]
  );

  // Save Code Draft with Monotonic Versioning, Offline Backup, and Question Isolation
  const triggerCodeAutosave = useCallback(
    async (codeToSave, qId, { isRetry = false } = {}) => {
      if (examLockedRef.current) return;
      const targetQuestionId = qId || activeQuestionIdRef.current || data?.question?._id;
      if (!targetQuestionId || codeToSave === undefined) return;

      const qKey = targetQuestionId.toString();
      // Keep local cache and localStorage updated immediately
      draftsCacheRef.current.set(qKey, codeToSave);

      const currentVer = isRetry
        ? draftVersionRef.current.get(qKey) || 1
        : (draftVersionRef.current.get(qKey) || 0) + 1;
      draftVersionRef.current.set(qKey, currentVer);

      writeLocalDraft(qKey, {
        code: codeToSave,
        version: currentVer,
        updatedAt: Date.now(),
        synced: false,
      });

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSaveStatus("offline");
        setSaveError("You are offline. Changes are saved locally and will sync when reconnected.");
        return;
      }

      if (inFlightSaveRef.current) {
        return;
      }

      inFlightSaveRef.current = true;
      try {
        setSaveStatus(isRetry ? "retrying" : "saving");
        setSaveError("");
        const res = await autosaveCodeDraft(examId, codeToSave, targetQuestionId, currentVer);

        writeLocalDraft(qKey, {
          code: codeToSave,
          version: currentVer,
          updatedAt: Date.now(),
          synced: true,
        });

        // Only mark "saved" if this was the latest save version for this question
        if (draftVersionRef.current.get(qKey) === currentVer) {
          setSaveStatus("saved");
        }
        return res;
      } catch (err) {
        console.warn("Autosave code draft failed", err);
        if (err.response?.data?.isCompleted) {
          examLockedRef.current = true;
          navigate(`/exams/${examId}/completed`, { replace: true });
          return;
        }
        if (err.response?.status === 403 || err.response?.data?.alreadySubmitted) {
          examLockedRef.current = true;
          setSaveStatus("failed");
          setSaveError(err.response?.data?.message || "Code edits are locked.");
          return;
        }
        if (draftVersionRef.current.get(qKey) === currentVer) {
          const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
          setSaveStatus(isOffline ? "offline" : "failed");
          setSaveError(err.response?.data?.message || "Failed to save draft. Retrying...");
          if (!isOffline) {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              const latestCode = draftsCacheRef.current.get(qKey);
              if (latestCode !== undefined && !examLockedRef.current) {
                triggerCodeAutosave(latestCode, qKey, { isRetry: true }).catch(() => {});
              }
            }, 5000);
          }
        }
        throw err;
      } finally {
        inFlightSaveRef.current = false;
      }
    },
    [examId, data?.question?._id, navigate, writeLocalDraft]
  );

  const handleCodeChange = (newCode) => {
    if (examLockedRef.current) return;
    const nextCode = newCode ?? "";
    setCode(nextCode);

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    setSaveStatus(isOffline ? "offline" : "unsaved");

    const currentTargetQId = activeQuestionIdRef.current || data?.question?._id;
    if (currentTargetQId) {
      const qKey = currentTargetQId.toString();
      draftsCacheRef.current.set(qKey, nextCode);
      const nextVer = (draftVersionRef.current.get(qKey) || 0) + 1;
      draftVersionRef.current.set(qKey, nextVer);
      writeLocalDraft(qKey, {
        code: nextCode,
        version: nextVer,
        updatedAt: Date.now(),
        synced: false,
      });
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      triggerCodeAutosave(nextCode, currentTargetQId).catch(() => {});
    }, 3000);
  };

  const fetchExamInfo = async (qId) => {
    try {
      setLoading(true);
      setErrorMsg("");
      // Reset execution results when loading or switching questions
      setRunResult(null);
      setSubmitResult(null);

      const params = qId ? { questionId: qId } : currentQId ? { questionId: currentQId } : {};
      const res = await getMyAssignedQuestion(examId, params);

      if (isExamProgressCompleted(res.progress, res)) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }

      setData(res);

      const loadedQId = res.question?._id ? res.question._id.toString() : null;
      activeQuestionIdRef.current = loadedQId;

      if (loadedQId) {
        const serverCode = res.progress?.currentCode ?? "";
        const serverVer = Number(res.progress?.codeDraftVersion ?? 0);
        const cachedDraft = draftsCacheRef.current.get(loadedQId);
        const localDraft = readLocalDraft(loadedQId);

        const hasNewerUnsyncedLocal =
          localDraft &&
          typeof localDraft.code === "string" &&
          !localDraft.synced &&
          (Number(localDraft.version || 0) > serverVer || localDraft.code !== serverCode);

        if (cachedDraft !== undefined && cachedDraft !== null) {
          setCode(cachedDraft);
          draftVersionRef.current.set(loadedQId, Math.max(serverVer, draftVersionRef.current.get(loadedQId) || 0));
        } else if (hasNewerUnsyncedLocal) {
          setCode(localDraft.code);
          draftsCacheRef.current.set(loadedQId, localDraft.code);
          draftVersionRef.current.set(loadedQId, Math.max(serverVer, Number(localDraft.version || 0)));
          triggerCodeAutosave(localDraft.code, loadedQId, { isRetry: true }).catch(() => {});
        } else if (serverCode !== "") {
          setCode(serverCode);
          draftsCacheRef.current.set(loadedQId, serverCode);
          draftVersionRef.current.set(loadedQId, serverVer);
          writeLocalDraft(loadedQId, { code: serverCode, version: serverVer, updatedAt: Date.now(), synced: true });
        } else {
          setCode(DEFAULT_C_CODE);
          draftsCacheRef.current.set(loadedQId, DEFAULT_C_CODE);
          draftVersionRef.current.set(loadedQId, serverVer);
        }
      } else {
        setCode(res.progress?.currentCode || DEFAULT_C_CODE);
      }

      setSaveStatus("saved");

      const thisQProg = (res.questions || []).find((q) => q._id?.toString() === loadedQId);
      const isThisQCompilerAllowed = Boolean(
        thisQProg?.compilerAllowed !== undefined ? thisQProg.compilerAllowed : res.progress?.compilerAllowed
      );

      if (!isThisQCompilerAllowed) {
        navigate(`/exams/${examId}/paper?questionId=${res.question?._id}`, { replace: true });
        return;
      }

      if (res.question?._id && res.question._id !== currentQId) {
        setSearchParams({ questionId: res.question._id });
      }
    } catch (err) {
      if (err.response?.data?.isCompleted) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }
      setErrorMsg(
        err.response?.data?.message || "Failed to load examination question."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExamInfo(currentQId);
  }, [examId, currentQId]);

  // Handle offline / online transitions and flush pending local drafts upon reconnection
  useEffect(() => {
    const handleOffline = () => {
      setSaveStatus("offline");
      setSaveError("You are offline. Changes are saved locally.");
    };
    const handleOnline = () => {
      const qKey = activeQuestionIdRef.current;
      if (!qKey || examLockedRef.current) return;
      const localDraft = readLocalDraft(qKey);
      const pendingCode = localDraft && !localDraft.synced ? localDraft.code : draftsCacheRef.current.get(qKey);
      if (pendingCode !== undefined && localDraft && !localDraft.synced) {
        triggerCodeAutosave(pendingCode, qKey, { isRetry: true }).catch(() => {});
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [readLocalDraft, triggerCodeAutosave]);

  // Visibility-aware polling every 15s to detect if faculty ends the examination
  useVisibilityPolling(
    async () => {
      try {
        const res = await getMyAssignedQuestion(examId, currentQId ? { questionId: currentQId } : {});
        if (isExamProgressCompleted(res.progress, res)) {
          navigate(`/exams/${examId}/completed`, { replace: true });
        }
      } catch (err) {
        if (err.response?.data?.isCompleted) {
          navigate(`/exams/${examId}/completed`, { replace: true });
        }
      }
    },
    15000,
    true
  );

  // Security: Fullscreen, Tab-switch, Page Visibility & Blur Detection
  useEffect(() => {
    // If Phase 3 security is disabled, do not attach tab-switch, blur or fullscreen listeners
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
          logExamSecurityEvent(examId, "tab_switch_hidden", {
            switchCount: nextCount,
            url: window.location.href,
          });
          return nextCount;
        });
      }
    };

    const handleWindowBlur = () => {
      setTabSwitchCount((prev) => {
        const nextCount = prev + 1;
        setWarningMessage(
          `Warning: Focus lost from the exam environment. Remaining outside may invalidate your exam! Violation #${nextCount} recorded.`
        );
        setShowWarningModal(true);
        logExamSecurityEvent(examId, "window_blur", {
          switchCount: nextCount,
        });
        return nextCount;
      });
    };

    const handleFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull) {
        logExamSecurityEvent(examId, "fullscreen_exit", {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [examId]);

  const requestFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const timerExpiredRef = useRef(false);

  // Exam Countdown Timer
  useEffect(() => {
    if (!data?.exam?.startedAt || !data?.exam?.durationMinutes) return;

    const startTime = new Date(data.exam.startedAt).getTime();
    const durationMs = data.exam.durationMinutes * 60 * 1000;
    const endTime = startTime + durationMs;

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
            if (codeRef.current !== undefined && activeQuestionIdRef.current) {
              await triggerCodeAutosave(codeRef.current, activeQuestionIdRef.current).catch(() => {});
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

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Explicitly flag the Monaco model as an Examination model to suppress language provider completions
    const model = editor.getModel();
    if (model) {
      model.isExamMode = true;
    }

    // Intercept and neutralize manual suggestion trigger shortcuts (e.g. Ctrl+Space, Ctrl+I)
    try {
      if (monaco?.KeyMod && monaco?.KeyCode) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {});
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {});
        editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Space, () => {});
      }
    } catch {
      // Ignore keybinding interception errors
    }

    // STRICT EXAMINATION SECURITY: Block Copy, Paste, Cut keyboard shortcuts (Only if Phase 3 Security is active)
    if (PHASE3_SECURITY_ENABLED) {
      editor.onKeyDown((e) => {
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        if (
          isCtrlOrCmd &&
          (e.code === "KeyC" || e.code === "KeyV" || e.code === "KeyX" || e.code === "Insert")
        ) {
          e.preventDefault();
          e.stopPropagation();
          setWarningMessage("Security Policy: Copy, Paste, and Cut are strictly disabled during examinations.");
          setShowWarningModal(true);
          logExamSecurityEvent(examId, "clipboard_violation_blocked", { code: e.code });
        }
      });
    }
  };

  const handleRun = async () => {
    if (running || submitting) return;
    if (!code.trim()) {
      setErrorMsg("Cannot run empty code.");
      return;
    }

    try {
      setRunning(true);
      setErrorMsg("");
      setRunResult(null);
      setActiveTab("run");

      const res = await runExamCode(examId, code, data?.question?._id);
      setRunResult(res);
    } catch (err) {
      if (err.response?.data?.isCompleted) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }
      setErrorMsg(err.response?.data?.message || "Code execution failed.");
    } finally {
      setRunning(false);
    }
  };

  const handleSelectQuestion = async (qId) => {
    if (!qId) return;
    const targetQIdStr = qId.toString();
    const currentQIdStr = activeQuestionIdRef.current || data?.question?._id?.toString();

    if (targetQIdStr === currentQIdStr) return;

    // Clear pending debounce timer
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    // Immediately save current question's code to local cache and backend
    if (currentQIdStr && code !== undefined) {
      draftsCacheRef.current.set(currentQIdStr, code);
      // Fire save in background or await cleanly
      triggerCodeAutosave(code, currentQIdStr).catch(() => {});
    }

    // Switch question in query param
    setSearchParams({ questionId: targetQIdStr });
  };

  const handleEndExam = async () => {
    if (
      !window.confirm(
        "Are you sure you want to finish and submit your entire examination? You will not be able to return to the editor."
      )
    ) {
      return;
    }

    try {
      setEndingExam(true);
      // Autosave current code before concluding
      if (code && data?.question?._id) {
        await triggerCodeAutosave(code, data.question._id);
      }
      await endStudentExam(examId);
      examLockedRef.current = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      navigate(`/exams/${examId}/completed`, { replace: true });
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to finalize examination.");
      setEndingExam(false);
    }
  };

  const handleSubmit = async () => {
    if (running || submitting) return;
    if (!code.trim()) {
      setErrorMsg("Cannot submit empty code.");
      return;
    }

    if (
      !window.confirm(
        "Are you ready to submit your code for final evaluation? This will test your solution against all visible and hidden test cases."
      )
    ) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg("");
      setSubmitResult(null);
      setExpandedHiddenCases({});
      setActiveTab("submit");

      const res = await submitExamCode(examId, code, data?.question?._id);
      setSubmitResult(res);

      if (res.allPassed) {
        examLockedRef.current = true;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        setTimeout(() => {
          navigate(`/exams/${examId}/completed`, { replace: true });
        }, 800);
      }
    } catch (err) {
      if (err.response?.data?.isCompleted) {
        navigate(`/exams/${examId}/completed`, { replace: true });
        return;
      }
      setErrorMsg(err.response?.data?.message || "Submission grading failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigateToNextQuestion = async (nextQ) => {
    if (!nextQ?._id) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const currentQIdStr = activeQuestionIdRef.current || data?.question?._id?.toString();
    if (currentQIdStr && codeRef.current !== undefined) {
      draftsCacheRef.current.set(currentQIdStr, codeRef.current);
      triggerCodeAutosave(codeRef.current, currentQIdStr).catch(() => {});
    }
    if (nextQ.compilerAllowed) {
      setSearchParams({ questionId: nextQ._id });
    } else {
      navigate(`/exams/${examId}/paper?questionId=${nextQ._id}`);
    }
  };

  if (loading) {
    return <Loader message="Setting up C Code Execution Environment..." />;
  }

  if (errorMsg && !data) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl border border-rose-200 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-sm text-slate-600">{errorMsg}</p>
        <Link
          to={`/exams/${examId}/paper`}
          className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          Return to Paper Writing
        </Link>
      </div>
    );
  }

  if (!data || !data.exam || !data.question) {
    return <Loader message="Setting up C Code Execution Environment..." />;
  }

  const { exam, question } = data;

  // Normalized metrics for Run Samples
  const runSummary = runResult?.summary || runResult?.runResult?.summary || {};
  const runPassedCount =
    runSummary.passedTests ??
    runResult?.testCasesPassed ??
    runResult?.passedTests ??
    runResult?.passedSampleCases ??
    runResult?.runResult?.testCasesPassed ??
    0;

  const runTotalCount =
    runSummary.totalTests ??
    runResult?.totalTestCases ??
    runResult?.totalTests ??
    runResult?.totalSampleCases ??
    runResult?.runResult?.totalTestCases ??
    0;

  const runFailedCount =
    runSummary.failedTests ??
    runResult?.failedTests ??
    Math.max(0, runTotalCount - runPassedCount);

  const runCases =
    runResult?.testResults ||
    runResult?.testCases ||
    runResult?.results ||
    runResult?.runResult?.testResults ||
    runResult?.runResult?.testCases ||
    runResult?.runResult?.results ||
    [];

  const runCompileError =
    runResult?.compilationError ||
    (runResult?.status === "compile_error" ? runResult?.compilerOutput : "") ||
    runResult?.runResult?.compilerOutput ||
    "";

  const runRuntimeError =
    runResult?.runtimeError ||
    (runResult?.status === "runtime_error" || runResult?.status === "time_limit"
      ? runResult?.compilerOutput || runCases.find((c) => c.status === "runtime_error" || c.status === "time_limit")?.error
      : "") ||
    "";

  // Normalized metrics for Submit Grading
  const submitSummary =
    submitResult?.summary || submitResult?.submission?.summary || {};

  const submitPassedCount =
    submitSummary.passedTests ??
    submitResult?.testCasesPassed ??
    submitResult?.passedTests ??
    submitResult?.submission?.testCasesPassed ??
    submitResult?.submission?.passedTests ??
    0;

  const submitTotalCount =
    submitSummary.totalTests ??
    submitResult?.totalTestCases ??
    submitResult?.totalTests ??
    submitResult?.submission?.totalTestCases ??
    submitResult?.submission?.totalTests ??
    0;

  const submitFailedCount =
    submitSummary.failedTests ??
    submitResult?.failedTests ??
    Math.max(0, submitTotalCount - submitPassedCount);

  const submitCases =
    submitResult?.testResults ||
    submitResult?.testCases ||
    submitResult?.testCaseResults ||
    submitResult?.submission?.testResults ||
    submitResult?.submission?.testCases ||
    submitResult?.submission?.testCaseResults ||
    [];

  const submitCompileError =
    submitResult?.compilationError ||
    (submitResult?.status === "compile_error" ? submitResult?.compilerOutput : "") ||
    (submitResult?.submission?.status === "compile_error"
      ? submitResult?.submission?.compilerOutput
      : "") ||
    "";

  const isSubmitAllPassed =
    Boolean(submitResult?.allPassed) ||
    Boolean(submitResult?.submission?.allPassed) ||
    (submitTotalCount > 0 && submitPassedCount === submitTotalCount);

  const visibleSubmitCases = submitCases.filter(
    (tc) => !(tc.isHidden || tc.visibility === "hidden")
  );
  const hiddenSubmitCases = submitCases.filter((tc) =>
    Boolean(tc.isHidden || tc.visibility === "hidden")
  );
  const submitRuntimeCase = submitCases.find(
    (tc) => tc.status === "runtime_error" || tc.status === "time_limit"
  );
  const submitRuntimeError =
    submitResult?.runtimeError ||
    (submitResult?.status === "runtime_error" || submitResult?.status === "time_limit"
      ? submitRuntimeCase?.error || "Runtime error occurred during execution."
      : "");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-tight">
                {exam.title}
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                Compiler Unlocked
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Problem: <strong className="text-slate-200">{question.title}</strong> ({question.difficulty})
            </p>
          </div>
        </div>

        {/* Center / Right Toolbar */}
        <div className="flex items-center gap-3">
          {/* Autosave Status Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs">
            {saveStatus === "saving" && (
              <span className="text-amber-400 flex items-center gap-1 animate-pulse" title="Saving your code draft...">
                <Save className="w-3.5 h-3.5" /> Saving...
              </span>
            )}
            {saveStatus === "retrying" && (
              <span className="text-amber-300 flex items-center gap-1 animate-pulse" title="Retrying autosave...">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Retrying...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-emerald-400 flex items-center gap-1" title="Draft saved automatically">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved successfully
              </span>
            )}
            {saveStatus === "offline" && (
              <span className="text-slate-300 flex items-center gap-1" title={saveError || "Offline - saved locally"}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Offline
              </span>
            )}
            {saveStatus === "failed" && (
              <span className="text-rose-400 flex items-center gap-1" title={saveError || "Failed to save draft. Check connection."}>
                <AlertTriangle className="w-3.5 h-3.5" /> Save failed
              </span>
            )}
            {saveStatus === "unsaved" && (
              <span className="text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Unsaved
              </span>
            )}
          </div>

          {/* Fullscreen Button (Shown only when Phase 3 Security is active) */}
          {PHASE3_SECURITY_ENABLED && !isFullscreen && (
            <button
              onClick={requestFullscreen}
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 transition"
              title="Enter Fullscreen Mode"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
            </button>
          )}

          <Link
            to={`/exams/${examId}/paper?questionId=${question._id}`}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 transition"
          >
            <FileText className="w-3.5 h-3.5" /> Paper Notes
          </Link>

          {timeLeftStr && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
              <Clock className="w-3.5 h-3.5" /> {timeLeftStr}
            </div>
          )}

          {/* Action Buttons */}
          <button
            onClick={handleRun}
            disabled={running || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg text-xs font-bold shadow transition disabled:opacity-50"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{running ? "Running..." : "Run Samples"}</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={running || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 transform active:scale-95"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{submitting ? "Submitting..." : "Submit Code"}</span>
          </button>

          <button
            onClick={handleEndExam}
            disabled={endingExam}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/40 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 rounded-lg text-xs font-bold transition"
            title="Conclude and finish examination"
          >
            {endingExam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            <span>Finish Exam</span>
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
                  ) : (
                    <span className="text-amber-400 text-[10px]">🔒</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-slate-400 font-medium whitespace-nowrap hidden sm:block">
            Question {(data.currentIndex ?? 0) + 1} of {data.questions.length}
          </div>
        </div>
      )}

      {/* Main Split Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Question Specifications */}
        <div className="lg:w-2/5 w-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/60 overflow-y-auto max-h-[40vh] lg:max-h-[calc(100vh-55px)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Problem Description
            </span>
            <span className="text-xs text-slate-400">Marks: {question.marks}</span>
          </div>

          <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line bg-slate-950 p-4 rounded-xl border border-slate-800/80">
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
        </div>

        {/* Right Side: Monaco Editor and Execution Output */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {/* Top Monaco Editor Pane */}
          <div
            className="flex-1 min-h-[320px] relative"
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
                setWarningMessage("Security Policy: Pasting code is strictly disabled.");
                setShowWarningModal(true);
              }
            }}
            onCut={(e) => {
              if (PHASE3_SECURITY_ENABLED) {
                e.preventDefault();
                setWarningMessage("Security Policy: Cutting code is disabled.");
                setShowWarningModal(true);
              }
            }}
          >
            <Editor
              height="100%"
              defaultLanguage="c"
              theme="vs-dark"
              value={code}
              onChange={handleCodeChange}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 14,
                lineHeight: 22,
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
                minimap: { enabled: false },
                lineNumbers: "on",
                glyphMargin: true,
                folding: true,
                showFoldingControls: "mouseover",
                scrollBeyondLastLine: false,
                tabSize: 4,
                insertSpaces: true,
                detectIndentation: false,
                autoIndent: "full",
                matchBrackets: "always",
                bracketPairColorization: { enabled: true },
                autoClosingBrackets: "always",
                autoClosingQuotes: "always",
                autoSurround: "languageDefined",
                wordWrap: "on",
                padding: { top: 12, bottom: 12 },
                automaticLayout: true,

                // STRICT EXAMINATION RESTRICTIONS:
                // 1. Disable automatic code suggestions & completion popups
                quickSuggestions: false,
                suggestOnTriggerCharacters: false,
                acceptSuggestionOnEnter: "off",
                tabCompletion: "off",

                // 2. Disable code snippets
                snippetSuggestions: "none",

                // 3. Disable word-based suggestions
                wordBasedSuggestions: "off",

                // 4. Disable parameter hints
                parameterHints: { enabled: false },

                // 5. Disable inline / ghost text suggestions
                inlineSuggest: { enabled: false },

                // 6. Disable suggestion categories & filtering popups
                suggest: {
                  showWords: false,
                  showSnippets: false,
                  showFunctions: false,
                  showVariables: false,
                  showKeywords: false,
                  showModules: false,
                  showClasses: false,
                  showInterfaces: false,
                  showStructs: false,
                  showConstants: false,
                  showConstructors: false,
                  showFields: false,
                  showMethods: false,
                  showProperties: false,
                  showValues: false,
                  showUnits: false,
                  showUsers: false,
                  showIssues: false,
                  showEvents: false,
                  showOperators: false,
                  showTypeParameters: false,
                  filterGraceful: false,
                  snippetsPreventQuickSuggestions: true,
                },

                // 7. Disable hover popups and extension lightbulbs
                hover: { enabled: false },
                lightbulb: { enabled: "off" },

                // 8. Disable editor context menu
                contextmenu: false,
              }}
            />
          </div>

          {/* Bottom Execution Panel */}
          <div className="h-64 border-t border-slate-800 bg-slate-900 flex flex-col">
            {/* Panel Tabs Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-950">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab("run")}
                  className={`text-xs font-semibold px-3 py-1 rounded-md transition ${
                    activeTab === "run"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Run Output
                </button>
                <button
                  onClick={() => setActiveTab("submit")}
                  className={`text-xs font-semibold px-3 py-1 rounded-md transition ${
                    activeTab === "submit"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Submission Grading
                </button>
              </div>

              {errorMsg && (
                <span className="text-xs text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {errorMsg}
                </span>
              )}
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-slate-300">
              {activeTab === "run" && (
                <div>
                  {!runResult && !running && (
                    <div className="text-slate-500 flex items-center gap-2 py-4">
                      <Terminal className="w-4 h-4" />
                      <span>Click &ldquo;Run Samples&rdquo; to test your C code against visible sample test cases.</span>
                    </div>
                  )}

                  {running && (
                    <div className="flex items-center gap-2 text-indigo-400 py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Compiling and running sample test cases in secure sandbox...</span>
                    </div>
                  )}

                  {runResult && (
                    <div className="space-y-4">
                      {/* Overall Sample Test Cases Summary */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-indigo-400" />
                            Sample Test Results
                          </h3>
                          <span
                            className={`font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1.5 ${
                              runPassedCount === runTotalCount && runTotalCount > 0
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-rose-950 text-rose-300 border border-rose-800"
                            }`}
                          >
                            {runPassedCount === runTotalCount && runTotalCount > 0 ? (
                              <>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                All Sample Test Cases Passed ({runPassedCount}/{runTotalCount})
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                Passed: {runPassedCount} / {runTotalCount}
                              </>
                            )}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                          <span>
                            Total: <strong className="text-slate-200">{runTotalCount}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Passed: <strong className="text-emerald-400">{runPassedCount}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Failed: <strong className={runFailedCount > 0 ? "text-rose-400" : "text-slate-300"}>{runFailedCount}</strong>
                          </span>
                          {runResult.executionTime ? (
                            <>
                              <span>•</span>
                              <span>Total Time: {runResult.executionTime}ms</span>
                            </>
                          ) : null}
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allExpanded = {};
                                runCases.forEach((_, idx) => {
                                  allExpanded[idx] = true;
                                });
                                setExpandedCases(allExpanded);
                              }}
                              className="text-[11px] text-slate-400 hover:text-white transition underline"
                            >
                              Expand All
                            </button>
                            <span>|</span>
                            <button
                              type="button"
                              onClick={() => setExpandedCases({})}
                              className="text-[11px] text-slate-400 hover:text-white transition underline"
                            >
                              Collapse All
                            </button>
                          </div>
                        </div>
                      </div>

                      {runCompileError && (
                        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 whitespace-pre-wrap text-xs">
                          <strong className="block mb-1 text-rose-200 uppercase tracking-wider text-[11px]">
                            Compilation Error:
                          </strong>
                          {runCompileError}
                        </div>
                      )}

                      {!runCompileError && runRuntimeError && (
                        <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-300 whitespace-pre-wrap text-xs">
                          <strong className="block mb-1 text-amber-200 uppercase tracking-wider text-[11px]">
                            Runtime Error / Execution Alert:
                          </strong>
                          {runRuntimeError}
                        </div>
                      )}

                      {/* Individual Sample Test Case Results */}
                      <div className="space-y-2.5">
                        {runCases.map((tc, idx) => {
                          const isPassed = tc.passed ?? (tc.status === "passed");
                          const caseNum = tc.testCaseNumber || idx + 1;
                          const isExpanded = expandedCases[idx] ?? true;

                          return (
                            <div
                              key={idx}
                              className={`rounded-xl border transition overflow-hidden ${
                                isPassed
                                  ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                                  : "bg-rose-950/20 border-rose-800/40 text-rose-300"
                              }`}
                            >
                              {/* Header Card (Clickable to collapse/expand) */}
                              <div
                                onClick={() => toggleCaseExpand(idx)}
                                className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-900/40 transition select-none"
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                  )}
                                  <span className="font-bold text-xs text-white">
                                    Sample Case #{caseNum}
                                  </span>
                                  <span
                                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                                      isPassed
                                        ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60"
                                        : "bg-rose-950/80 text-rose-300 border border-rose-800/60"
                                    }`}
                                  >
                                    {isPassed ? "Pass" : "Fail"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {tc.executionTime ? (
                                    <span className="text-[11px] font-mono text-slate-400">
                                      {tc.executionTime}ms
                                    </span>
                                  ) : null}
                                  <span
                                    className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-0.5 rounded ${
                                      isPassed
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                    }`}
                                  >
                                    {isPassed ? "✓ Passed" : "✗ Failed"}
                                  </span>
                                </div>
                              </div>

                              {/* Collapsible Content */}
                              {isExpanded && (
                                <div className="p-3.5 pt-0 space-y-2.5 text-xs font-mono border-t border-slate-800/40 mt-1">
                                  <div>
                                    <span className="text-slate-500 block mb-1 font-sans font-semibold text-[11px] uppercase tracking-wider">Input:</span>
                                    <pre className="pattern-output whitespace-pre overflow-x-auto text-slate-300 bg-slate-900/80 p-2 rounded-lg border border-slate-800 text-xs">
                                      {tc.input || "(Empty)"}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block mb-1 font-sans font-semibold text-[11px] uppercase tracking-wider">Expected Output:</span>
                                    <pre className="pattern-output whitespace-pre overflow-x-auto text-emerald-300 bg-slate-900/80 p-2 rounded-lg border border-slate-800 text-xs">
                                      {tc.expectedOutput}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block mb-1 font-sans font-semibold text-[11px] uppercase tracking-wider">Actual Output:</span>
                                    <pre className={`pattern-output whitespace-pre overflow-x-auto p-2 rounded-lg border border-slate-800 text-xs bg-slate-900/80 ${isPassed ? "text-emerald-300" : "text-rose-300"}`}>
                                      {tc.actualOutput || "(No output)"}
                                    </pre>
                                  </div>
                                  {!isPassed && tc.error && (
                                    <div className="text-xs text-rose-400 font-mono bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50">
                                      <strong>Error: </strong>
                                      {tc.error}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "submit" && (
                <div>
                  {!submitResult && !submitting && (
                    <div className="text-slate-500 flex items-center gap-2 py-4">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Click &ldquo;Submit Code&rdquo; to test your solution against all evaluation test cases.</span>
                    </div>
                  )}

                  {submitting && (
                    <div className="flex items-center gap-2 text-indigo-400 py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Executing comprehensive test suite against sandbox runner...</span>
                    </div>
                  )}

                  {submitResult && (
                    <div className="space-y-4">
                      {/* Per-Question Completion Banner with Next Question Button */}
                      {isSubmitAllPassed && !submitResult.isExamCompleted && (
                        <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>
                                Successfully Completed {submitResult.currentQuestionNumber || question.questionNumber || "Question"}!
                              </span>
                            </div>
                            <p className="text-xs text-emerald-200/80">
                              Questions Successfully Submitted:{" "}
                              <strong>
                                {submitResult.submittedQuestionCount ?? 1} / {submitResult.assignedQuestionCount ?? (data?.questions?.length || 1)}
                              </strong>
                            </p>
                          </div>
                          {submitResult.nextQuestion && (
                            <button
                              type="button"
                              onClick={() => handleNavigateToNextQuestion(submitResult.nextQuestion)}
                              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition transform active:scale-95 whitespace-nowrap"
                            >
                              <span>Next Question</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}

                      {isSubmitAllPassed && submitResult.isExamCompleted && (
                        <div className="bg-indigo-950/60 border border-indigo-500/40 rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>Congratulations! You have successfully completed all assigned questions.</span>
                            </div>
                            <p className="text-xs text-indigo-200/80">
                              Questions Submitted:{" "}
                              <strong>
                                {submitResult.submittedQuestionCount ?? submitResult.assignedQuestionCount ?? 1} / {submitResult.assignedQuestionCount ?? 1}
                              </strong>
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Test Results Header Summary */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                            Submission Result
                          </h3>
                          <span
                            className={`font-bold px-3 py-1 rounded-full text-xs ${
                              isSubmitAllPassed
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-rose-950 text-rose-300 border border-rose-800"
                            }`}
                          >
                            {isSubmitAllPassed
                              ? `Overall Status: Passed (${submitPassedCount}/${submitTotalCount})`
                              : `Overall Status: Failed (${submitPassedCount}/${submitTotalCount} Passed)`}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                          <span>
                            Total Test Cases: <strong className="text-slate-200">{submitTotalCount}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Passed: <strong className="text-emerald-400">{submitPassedCount}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Failed: <strong className={submitFailedCount > 0 ? "text-rose-400" : "text-slate-300"}>{submitFailedCount}</strong>
                          </span>
                          {submitResult.executionTime ? (
                            <>
                              <span>•</span>
                              <span>Time: {submitResult.executionTime}ms</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {submitCompileError && (
                        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 whitespace-pre-wrap text-xs">
                          <strong className="block mb-1 text-rose-200 uppercase tracking-wider text-[11px]">
                            Compilation Error:
                          </strong>
                          {submitCompileError}
                        </div>
                      )}

                      {!submitCompileError && submitRuntimeError && (
                        <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-300 whitespace-pre-wrap text-xs">
                          <strong className="block mb-1 text-amber-200 uppercase tracking-wider text-[11px]">
                            Runtime Error / Execution Alert:
                          </strong>
                          {submitRuntimeError}
                        </div>
                      )}

                      {/* Sample Test Case Results */}
                      {visibleSubmitCases.length > 0 && (
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Sample Test Case Results ({visibleSubmitCases.filter((tc) => tc.passed ?? tc.status === "passed").length}/{visibleSubmitCases.length} Passed)
                          </h4>
                          {visibleSubmitCases.map((tc, idx) => {
                            const isPassed = tc.passed ?? (tc.status === "passed");
                            const caseNum = tc.testCaseNumber || idx + 1;
                            return (
                              <div
                                key={`sample-${idx}`}
                                className={`p-3.5 rounded-xl border transition space-y-2 ${
                                  isPassed
                                    ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                                    : "bg-rose-950/20 border-rose-800/40 text-rose-300"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-white">
                                      Sample Case #{caseNum}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                                      {tc.statusLabel || (isPassed ? "Passed" : "Failed")}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {tc.executionTime ? (
                                      <span className="text-[11px] font-mono text-slate-400">
                                        {tc.executionTime}ms
                                      </span>
                                    ) : null}
                                    <span
                                      className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-0.5 rounded ${
                                        isPassed
                                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                          : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                      }`}
                                    >
                                      {isPassed ? "PASS" : "FAIL"}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-2 text-xs font-mono pt-2 border-t border-slate-800/60">
                                  <div>
                                    <span className="text-slate-500 block mb-0.5">Input:</span>
                                    <pre className="pattern-output whitespace-pre overflow-x-auto text-slate-300 bg-slate-900/70 p-1.5 rounded border border-slate-800 text-xs">
                                      {tc.input || "(Empty)"}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block mb-0.5">Expected Output:</span>
                                    <pre className="pattern-output whitespace-pre overflow-x-auto text-emerald-300 bg-slate-900/70 p-1.5 rounded border border-slate-800 text-xs">
                                      {tc.expectedOutput}
                                    </pre>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block mb-0.5">Actual Output:</span>
                                    <pre className={`pattern-output whitespace-pre overflow-x-auto p-1.5 rounded border border-slate-800 text-xs bg-slate-900/70 ${isPassed ? "text-emerald-300" : "text-rose-300"}`}>
                                      {tc.actualOutput || "(No output)"}
                                    </pre>
                                  </div>
                                </div>
                                {!isPassed && tc.error && (
                                  <div className="text-xs text-rose-400 font-mono bg-rose-950/40 p-2 rounded border border-rose-900/50">
                                    <strong>Error: </strong>
                                    {tc.error}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Hidden Test Case Results */}
                      {hiddenSubmitCases.length > 0 && (
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Hidden Test Case Results ({hiddenSubmitCases.filter((tc) => tc.passed ?? tc.status === "passed").length}/{hiddenSubmitCases.length} Passed)
                          </h4>
                          <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden divide-y divide-slate-800/70">
                            {hiddenSubmitCases.map((tc, idx) => {
                              const isPassed = tc.passed ?? (tc.status === "passed");
                              const hiddenNum = tc.hiddenTestNumber || idx + 1;
                              const isExpanded = Boolean(expandedHiddenCases[idx]);
                              const detailsText =
                                tc.statusLabel ||
                                (isPassed
                                  ? "Passed successfully"
                                  : tc.status === "runtime_error"
                                  ? "Runtime Error"
                                  : tc.status === "time_limit"
                                  ? "Time Limit Exceeded"
                                  : "Wrong Answer");

                              return (
                                <div key={`hidden-${idx}`} className="text-xs">
                                  <div
                                    onClick={() => !isPassed && toggleHiddenCaseExpand(idx)}
                                    className={`px-4 py-3 flex items-center justify-between gap-3 ${
                                      !isPassed ? "cursor-pointer hover:bg-slate-900/60" : ""
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      {!isPassed ? (
                                        isExpanded ? (
                                          <ChevronDown className="w-3.5 h-3.5 text-rose-400" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5 text-rose-400" />
                                        )
                                      ) : (
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                      )}
                                      <span className="font-bold text-white">
                                        Hidden Test Case {hiddenNum}
                                      </span>
                                      <span className="text-slate-400">{detailsText}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                      {tc.executionTime ? (
                                        <span className="text-[11px] font-mono text-slate-400">
                                          {tc.executionTime}ms
                                        </span>
                                      ) : null}
                                      <span
                                        className={`inline-flex items-center font-bold text-[11px] px-2.5 py-0.5 rounded ${
                                          isPassed
                                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                            : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                        }`}
                                      >
                                        {isPassed ? "PASS" : "FAIL"}
                                      </span>
                                    </div>
                                  </div>

                                  {!isPassed && isExpanded && (
                                    <div className="px-4 pb-3 pt-2 bg-rose-950/15 border-t border-rose-900/30 space-y-2 font-mono">
                                      <div className="text-rose-300">
                                        <strong>Failure Reason: </strong>
                                        {tc.error || detailsText}
                                      </div>
                                      {tc.actualOutput !== undefined && (
                                        <div>
                                          <span className="text-slate-400 block mb-1 font-sans text-[11px] uppercase tracking-wider">
                                            Your Program Output:
                                          </span>
                                          <pre className="pattern-output whitespace-pre overflow-x-auto text-rose-300 bg-slate-900/80 p-2 rounded border border-slate-800 text-xs">
                                            {tc.actualOutput || "(No output)"}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security Violation Modal (Active only when Phase 3 Security is enabled) */}
      {PHASE3_SECURITY_ENABLED && showWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95">
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
              <div>• Tab switching, minimizing, or losing focus is audited.</div>
              <div>• Copying, cutting, or pasting external solutions is disabled.</div>
              <div>• Repeated infractions are logged in faculty audit reports.</div>
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

export default ExamCodeEditorPage;
