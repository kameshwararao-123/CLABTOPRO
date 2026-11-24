import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import {
  getMyAssignedQuestion,
  runExamCode,
  submitExamCode,
} from "../../services/examService";
import Loader from "../../components/common/Loader";
import { initMonacoC } from "../../utils/cLanguageSupport";

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
  const [runResult, setRunResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("run"); // 'run' | 'submit'
  const [timeLeftStr, setTimeLeftStr] = useState("");

  const editorRef = useRef(null);
  const currentQId = searchParams.get("questionId");

  const fetchExamInfo = async (qId) => {
    try {
      setLoading(true);
      setErrorMsg("");
      const params = qId ? { questionId: qId } : currentQId ? { questionId: currentQId } : {};
      const res = await getMyAssignedQuestion(examId, params);
      setData(res);

      if (res.progress?.currentCode) {
        setCode(res.progress.currentCode);
      } else {
        setCode(DEFAULT_C_CODE);
      }

      if (!res.progress?.compilerAllowed) {
        navigate(`/exams/${examId}/paper?questionId=${res.question?._id}`, { replace: true });
        return;
      }

      if (res.question?._id && res.question._id !== currentQId) {
        setSearchParams({ questionId: res.question._id });
      }
    } catch (err) {
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
  };

  const handleRun = async () => {
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
      setErrorMsg(err.response?.data?.message || "Code execution failed.");
    } finally {
      setRunning(false);
    }
  };

  const handleSelectQuestion = (qId) => {
    setSearchParams({ questionId: qId });
  };

  const handleSubmit = async () => {
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
      setActiveTab("submit");

      const res = await submitExamCode(examId, code, data?.question?._id);
      setSubmitResult(res);

      if (res.allPassed) {
        if (res.isExamCompleted) {
          setTimeout(() => {
            navigate(`/exams/${examId}/completed`);
          }, 1200);
        } else {
          await fetchExamInfo(data?.question?._id);
        }
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Submission grading failed.");
    } finally {
      setSubmitting(false);
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
            className="inline-flex items-center gap-1.5 px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 transform active:scale-95"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{submitting ? "Submitting..." : "Submit Code"}</span>
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
          <div className="flex-1 min-h-[320px] relative">
            <Editor
              height="100%"
              defaultLanguage="c"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || "")}
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
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
                        <span
                          className={`font-bold px-2.5 py-1 rounded text-xs ${
                            runPassedCount === runTotalCount && runTotalCount > 0
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-amber-950 text-amber-300 border border-amber-800"
                          }`}
                        >
                          {runPassedCount} / {runTotalCount} Samples Passed
                        </span>
                        {runResult.executionTime ? (
                          <span className="text-slate-500 text-xs">
                            Time: {runResult.executionTime}ms
                          </span>
                        ) : null}
                      </div>

                      {runCompileError && (
                        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 whitespace-pre-wrap">
                          <strong className="block mb-1 text-rose-200">Compilation Error:</strong>
                          {runCompileError}
                        </div>
                      )}

                      <div className="space-y-2">
                        {runCases.map((tc, idx) => {
                          const isPassed = tc.passed ?? (tc.status === "passed");
                          return (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg border ${
                                isPassed
                                  ? "bg-emerald-950/20 border-emerald-800/40"
                                  : "bg-rose-950/20 border-rose-800/40"
                              } space-y-1.5`}
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span className={isPassed ? "text-emerald-400" : "text-rose-400"}>
                                  Sample Case #{tc.testCaseNumber || idx + 1}: {isPassed ? "PASSED ✓" : "FAILED ✗"}
                                </span>
                                {tc.executionTime ? (
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {tc.executionTime}ms
                                  </span>
                                ) : null}
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">Input:</span>
                                <pre className="pattern-output whitespace-pre overflow-x-auto text-slate-300 bg-slate-900/70 p-1.5 rounded border border-slate-800 text-xs">
                                  {tc.input || "(Empty)"}
                                </pre>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">Expected:</span>
                                <pre className="pattern-output whitespace-pre overflow-x-auto text-emerald-300 bg-slate-900/70 p-1.5 rounded border border-slate-800 text-xs">
                                  {tc.expectedOutput}
                                </pre>
                              </div>
                              <div>
                                <span className="text-slate-400 block mb-0.5">Your Output:</span>
                                <pre className={`pattern-output whitespace-pre overflow-x-auto p-1.5 rounded border border-slate-800 text-xs bg-slate-900/70 ${isPassed ? "text-emerald-300" : "text-rose-300"}`}>
                                  {tc.actualOutput || "(No output)"}
                                </pre>
                              </div>
                              {!isPassed && tc.error && <div className="text-rose-400 font-semibold">{tc.error}</div>}
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
                      {/* Test Results Header Summary */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                            Test Results
                          </h3>
                          <span
                            className={`font-bold px-3 py-1 rounded-full text-xs ${
                              isSubmitAllPassed
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-rose-950 text-rose-300 border border-rose-800"
                            }`}
                          >
                            Passed: {submitPassedCount} / {submitTotalCount}
                            {isSubmitAllPassed ? " (All Tests Passed ✓)" : ""}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                          <span>
                            Passed: <strong className="text-emerald-400">{submitPassedCount}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Failed: <strong className={submitFailedCount > 0 ? "text-rose-400" : "text-slate-300"}>{submitFailedCount}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Total: <strong className="text-slate-200">{submitTotalCount}</strong>
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

                      {/* Display individual test case results */}
                      <div className="space-y-2.5">
                        {submitCases.map((tc, idx) => {
                          const isPassed = tc.passed ?? (tc.status === "passed");
                          const isHidden = Boolean(tc.isHidden || tc.visibility === "hidden");
                          const caseNum = tc.testCaseNumber || idx + 1;

                          return (
                            <div
                              key={idx}
                              className={`p-3.5 rounded-xl border transition ${
                                isPassed
                                  ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                                  : "bg-rose-950/20 border-rose-800/40 text-rose-300"
                              } space-y-2`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-white">
                                    Test Case {caseNum}
                                  </span>
                                  <span
                                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                                      isHidden
                                        ? "bg-slate-800 text-slate-400 border border-slate-700"
                                        : "bg-slate-800 text-indigo-300 border border-slate-700"
                                    }`}
                                  >
                                    {isHidden ? "Hidden" : "Visible"}
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

                              {/* Visible test cases show Input, Expected, and Actual output */}
                              {!isHidden && (
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
                              )}

                              {/* Error message (runtime error, timeout, compile error) */}
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamCodeEditorPage;
