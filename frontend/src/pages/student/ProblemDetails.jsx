import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import Loader from "../../components/common/Loader";
import ProblemDescription from "../../components/problem/ProblemDescription";
import CodeEditor from "../../components/problem/CodeEditor";
import ExecutionPanel from "../../components/problem/ExecutionPanel";
import StreakCelebrationModal from "../../components/problem/StreakCelebrationModal";

import { getProblemById, invalidateProblemCache } from "../../services/problemService";
import {
  runCode as executeRunCode,
  submitCode,
  getMySubmissions,
} from "../../services/submissionService";
import { useAuth } from "../../context/AuthContext";
import { useCodeDraft } from "../../hooks/useCodeDraft";
import { parseCompilerDiagnostics } from "../../utils/compilerDiagnostics";

const DEFAULT_BOILERPLATE = `#include <stdio.h>

int main() {

    return 0;
}`;

const ProblemDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const userId = user?.id || user?._id || "anonymous";

  const editorRef = useRef(null);
  const splitContainerRef = useRef(null);

  const [problem, setProblem] = useState(null);
  const [hasPreviousSubmission, setHasPreviousSubmission] = useState(false);
  const [previousCode, setPreviousCode] = useState(null);
  const [loading, setLoading] = useState(true);

  // Run vs Submit states
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [allPassed, setAllPassed] = useState(false);
  const [progress, setProgress] = useState(null);
  const [showStreakModal, setShowStreakModal] = useState(false);

  // Diagnostics for Monaco line highlighting & clickable error panel
  const [diagnostics, setDiagnostics] = useState([]);

  // Bottom execution panel state
  const [bottomTab, setBottomTab] = useState("input"); // "input" | "output" | "verdict"
  const [runMode, setRunMode] = useState("sample"); // "sample" | "custom"
  const [customInput, setCustomInput] = useState("");
  const [customExpectedOutput, setCustomExpectedOutput] = useState("");

  // Resizable panel state (desktop horizontal split + editor height)
  const [leftWidthPercent, setLeftWidthPercent] = useState(44);
  const [editorHeightPx, setEditorHeightPx] = useState(420);

  const {
    code,
    codeRef,
    saveStatus,
    hasPendingOfflineSync,
    initializeDraft,
    updateCode,
    flushDraft,
    clearDraft,
  } = useCodeDraft({
    problemId: id,
    userId,
    defaultCode: DEFAULT_BOILERPLATE,
  });

  const savePreviousCode = useCallback(
    (nextCode) => {
      if (!nextCode || !nextCode.trim() || nextCode === DEFAULT_BOILERPLATE) {
        return;
      }
      setPreviousCode(nextCode);
      try {
        localStorage.setItem(`clab_previous_code_${id}`, nextCode);
      } catch {
        // Ignore storage quota errors
      }
    },
    [id]
  );

  // Load problem, submission history, and draft whenever problem ID changes
  useEffect(() => {
    let cancelled = false;

    const loadProblem = async () => {
      setLoading(true);
      setProblem(null);
      setHasPreviousSubmission(false);
      let storedPrevious = null;
      try {
        storedPrevious = localStorage.getItem(`clab_previous_code_${id}`);
      } catch {
        storedPrevious = null;
      }
      setPreviousCode(storedPrevious);
      setRunResult(null);
      setRunError("");
      setSubmitError("");
      setEvaluationResult(null);
      setAllPassed(false);
      setDiagnostics([]);
      setBottomTab("input");
      setRunMode("sample");

      try {
        const data = await getProblemById(id);
        if (cancelled) return;

        setProblem(data.problem);
        setCustomInput(data.problem?.sampleInput || "");
        setCustomExpectedOutput("");

        let fallbackCode = DEFAULT_BOILERPLATE;
        let loadedPrevSub = false;

        if (data.lastSubmission) {
          if (data.lastSubmission.code) {
            fallbackCode = data.lastSubmission.code;
            loadedPrevSub = true;
          }
          if (data.lastSubmission.aiEvaluation || data.lastSubmission.status) {
            setEvaluationResult(data.lastSubmission);
            if (data.lastSubmission.status === "compile_error" && data.lastSubmission.compilerOutput) {
              setDiagnostics(parseCompilerDiagnostics(data.lastSubmission.compilerOutput));
            }
          }
          if (data.lastSubmission.allPassed !== undefined) {
            setAllPassed(data.lastSubmission.allPassed);
          } else if (data.problem?.isSolved) {
            setAllPassed(true);
          }
        } else if (data.problem?.isSolved) {
          try {
            const subData = await getMySubmissions();
            if (cancelled) return;
            const matchingSub = subData.submissions?.find(
              (s) =>
                s.problem?._id?.toString() === id ||
                s.problem?.toString() === id
            );
            if (matchingSub && matchingSub.code) {
              fallbackCode = matchingSub.code;
              loadedPrevSub = true;
              setEvaluationResult(matchingSub);
              setAllPassed(matchingSub.status === "accepted");
            }
          } catch (subErr) {
            console.error("Error fetching submission fallback:", subErr);
          }
        }

        setHasPreviousSubmission(loadedPrevSub);
        if (loadedPrevSub && fallbackCode) {
          savePreviousCode(fallbackCode);
        }

        // Initialize draft (restores saved/offline draft without overwriting student code)
        await initializeDraft({ fallbackCode });
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProblem();

    return () => {
      cancelled = true;
    };
  }, [id, initializeDraft, savePreviousCode]);

  // Clear stale compiler error highlights once student starts editing
  const handleCodeChange = useCallback(
    (nextCode) => {
      updateCode(nextCode);
    },
    [updateCode]
  );

  // Jump Monaco cursor to clicked diagnostic error line
  const handleSelectErrorLine = useCallback((line, column = 1) => {
    editorRef.current?.jumpToLine(line, column);
  }, []);

  // RUN CODE (never creates submission, never affects progress/streaks)
  const handleRun = useCallback(async () => {
    const latestCode = editorRef.current?.getCurrentCode() ?? codeRef.current;
    if (!latestCode || !latestCode.trim() || running || submitting) return;

    try {
      setRunning(true);
      setRunError("");
      setDiagnostics([]);
      editorRef.current?.clearDiagnostics();
      setBottomTab("output");

      const data = await executeRunCode({
        problemId: id,
        code: latestCode,
        customInput,
        customExpectedOutput,
        mode: runMode,
      });

      setRunResult(data);

      const parsedDiagnostics =
        Array.isArray(data.diagnostics) && data.diagnostics.length > 0
          ? data.diagnostics
          : data.compilerOutput
          ? parseCompilerDiagnostics(data.compilerOutput)
          : [];

      // Only apply line markers for compiler diagnostics; never fabricate runtime lines
      if (parsedDiagnostics.length > 0) {
        setDiagnostics(parsedDiagnostics);
      }
    } catch (error) {
      const errMsg =
        error.response?.data?.message ||
        "Code execution failed. Please verify the execution service is running.";
      setRunError(errMsg);
    } finally {
      setRunning(false);
    }
  }, [id, customInput, customExpectedOutput, runMode, running, submitting, codeRef]);

  // SUBMIT CODE (official grading + progress/streak updates)
  const handleSubmit = useCallback(async () => {
    const latestCode = editorRef.current?.getCurrentCode() ?? codeRef.current;
    if (!latestCode || !latestCode.trim() || submitting || running) return;

    try {
      setSubmitting(true);
      setSubmitError("");
      setDiagnostics([]);
      editorRef.current?.clearDiagnostics();
      setBottomTab("verdict");

      // Ensure latest code draft is also persisted safely
      flushDraft();
      savePreviousCode(latestCode);

      const data = await submitCode({
        problemId: id,
        code: latestCode,
        language: "c",
      });

      setEvaluationResult(data);
      invalidateProblemCache(id);

      const parsedDiagnostics =
        Array.isArray(data.diagnostics) && data.diagnostics.length > 0
          ? data.diagnostics
          : data.compilerOutput
          ? parseCompilerDiagnostics(data.compilerOutput)
          : [];

      if (parsedDiagnostics.length > 0) {
        setDiagnostics(parsedDiagnostics);
      }

      if (data.allPassed !== undefined) {
        setAllPassed(data.allPassed);
        if (data.allPassed) {
          setShowStreakModal(true);
          setProblem((prev) => (prev ? { ...prev, isSolved: true } : prev));
          setHasPreviousSubmission(true);
        }
      }

      if (data.progress) {
        setProgress(data.progress);
      }
    } catch (error) {
      const errMsg =
        error.response?.data?.message ||
        "Submission failed. Please verify that the execution service is running.";
      setSubmitError(errMsg);
    } finally {
      setSubmitting(false);
    }
  }, [id, submitting, running, codeRef, flushDraft, savePreviousCode]);

  // Reset Code (after confirmation inside CodeEditor)
  const handleResetCode = useCallback(async () => {
    const currentBeforeReset = editorRef.current?.getCurrentCode() ?? codeRef.current;
    savePreviousCode(currentBeforeReset);
    await clearDraft(DEFAULT_BOILERPLATE);
    setHasPreviousSubmission(false);
    setDiagnostics([]);
    setRunResult(null);
    setRunError("");
    editorRef.current?.clearDiagnostics();
  }, [clearDraft, codeRef, savePreviousCode]);

  // Restore previous code (last submitted code or code prior to reset)
  const handleRestorePreviousCode = useCallback(() => {
    if (!previousCode) return;
    updateCode(previousCode);
    setDiagnostics([]);
    editorRef.current?.clearDiagnostics();
  }, [previousCode, updateCode]);

  // Desktop horizontal split-pane drag handler
  const startHorizontalResize = (e) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    const handleMouseMove = (moveEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relativeX = moveEvent.clientX - rect.left;
      const nextPercent = Math.min(62, Math.max(28, (relativeX / rect.width) * 100));
      setLeftWidthPercent(nextPercent);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Vertical editor/bottom-panel resize handler
  const startVerticalResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = editorHeightPx;

    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientY - startY;
      setEditorHeightPx(Math.min(720, Math.max(260, startHeight + delta)));
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  if (loading) {
    return <Loader />;
  }

  if (!problem) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-600">
        Problem not found.
      </div>
    );
  }

  const effectiveDiagnostics =
    diagnostics.length > 0
      ? diagnostics
      : evaluationResult?.status === "compile_error" && evaluationResult?.compilerOutput
      ? parseCompilerDiagnostics(evaluationResult.compilerOutput)
      : [];

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* Responsive split layout: stacked below lg, resizable split at lg+ */}
      <div
        ref={splitContainerRef}
        className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-0"
      >
        {/* LEFT PANEL: Problem Statement */}
        <div
          style={{ "--left-panel-width": `${leftWidthPercent}%` }}
          className="w-full lg:w-[var(--left-panel-width)] lg:shrink-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm lg:max-h-[calc(100vh-110px)] lg:overflow-y-auto"
        >
          <ProblemDescription problem={problem} />
        </div>

        {/* Horizontal Drag Handle (Desktop only) */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize problem and editor panels"
          onMouseDown={startHorizontalResize}
          className="hidden lg:flex w-3 self-stretch cursor-col-resize items-center justify-center group select-none shrink-0"
        >
          <div className="h-14 w-1 rounded-full bg-slate-200 group-hover:bg-indigo-400 transition" />
        </div>

        {/* RIGHT PANEL: Professional C Editor + Resizable Output Panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <CodeEditor
            ref={editorRef}
            code={code}
            setCode={handleCodeChange}
            onBlur={flushDraft}
            diagnostics={effectiveDiagnostics}
            saveStatus={saveStatus}
            hasPendingOfflineSync={hasPendingOfflineSync}
            onManualSave={flushDraft}
            onRun={handleRun}
            onSubmit={handleSubmit}
            running={running}
            submitting={submitting}
            hasLoadedSubmission={hasPreviousSubmission}
            isSolved={Boolean(problem.isSolved)}
            onResetCode={handleResetCode}
            canRestorePrevious={Boolean(previousCode && previousCode !== code)}
            onRestorePreviousCode={handleRestorePreviousCode}
            height={`${editorHeightPx}px`}
          />

          {/* Vertical Drag Handle between Editor and Execution Panel */}
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Drag to resize editor height"
            onMouseDown={startVerticalResize}
            className="hidden sm:flex h-3 cursor-row-resize items-center justify-center group select-none"
          >
            <div className="w-16 h-1 rounded-full bg-slate-200 group-hover:bg-indigo-400 transition" />
          </div>

          <div className="mt-2 sm:mt-0">
            <ExecutionPanel
              activeTab={bottomTab}
              setActiveTab={setBottomTab}
              runMode={runMode}
              setRunMode={setRunMode}
              customInput={customInput}
              setCustomInput={setCustomInput}
              customExpectedOutput={customExpectedOutput}
              setCustomExpectedOutput={setCustomExpectedOutput}
              sampleInput={problem.sampleInput || ""}
              running={running}
              submitting={submitting}
              runResult={runResult}
              runError={runError}
              evaluationResult={evaluationResult}
              submitError={submitError}
              allPassed={allPassed}
              progress={progress}
              problem={problem}
              diagnostics={effectiveDiagnostics}
              onSelectErrorLine={handleSelectErrorLine}
            />
          </div>
        </div>
      </div>

      {/* Streak Celebration Modal (only triggered on accepted official submission) */}
      <StreakCelebrationModal
        isOpen={showStreakModal}
        onClose={() => setShowStreakModal(false)}
        streak={progress?.currentStreak || 1}
        longestStreak={progress?.longestStreak || 1}
        totalSolved={progress?.totalSolved || 1}
      />
    </div>
  );
};

export default ProblemDetails;
