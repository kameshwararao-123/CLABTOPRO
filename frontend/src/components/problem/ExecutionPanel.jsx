import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FileCode2,
  Loader2,
  Terminal,
  XCircle,
} from "lucide-react";
import AIEvaluationResult from "./AIEvaluationResult";

const ExecutionPanel = ({
  activeTab,
  setActiveTab,
  runMode,
  setRunMode,
  customInput,
  setCustomInput,
  customExpectedOutput = "",
  setCustomExpectedOutput,
  sampleInput = "",
  running = false,
  submitting = false,
  runResult = null,
  runError = "",
  evaluationResult = null,
  submitError = "",
  allPassed = false,
  progress = null,
  problem = null,
  diagnostics = [],
  onSelectErrorLine,
}) => {
  const hasDiagnostics = Array.isArray(diagnostics) && diagnostics.length > 0;
  const errorCount = (diagnostics || []).filter((d) => d.severity === "error").length;

  const renderDiagnosticsList = (items, rawOutput = "") => {
    if (!items?.length && !rawOutput) return null;

    return (
      <div className="space-y-2.5">
        {items?.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                Compiler Diagnostics ({items.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Click any item with a line number to jump to it
              </span>
            </div>

            {items.map((diag, idx) => {
              const isClickable = Number.isInteger(diag.line) && diag.line > 0;
              const isError = diag.severity === "error";

              return (
                <button
                  key={`${diag.file}-${diag.line}-${diag.column}-${idx}`}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onSelectErrorLine?.(diag.line, diag.column || 1)}
                  className={`w-full text-left rounded-xl border p-2.5 transition flex items-start justify-between gap-3 ${
                    isError
                      ? "border-rose-200 bg-rose-50/80 hover:bg-rose-100/70"
                      : "border-amber-200 bg-amber-50/80 hover:bg-amber-100/70"
                  } ${isClickable ? "cursor-pointer" : "cursor-default opacity-90"}`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {isError ? (
                      <XCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-semibold break-words ${
                          isError ? "text-rose-900" : "text-amber-900"
                        }`}
                      >
                        {diag.message}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        {diag.file || "solution.c"}
                        {isClickable ? ` : line ${diag.line}${diag.column ? `, col ${diag.column}` : ""}` : " (no source line)"}
                      </p>
                    </div>
                  </div>

                  {isClickable && (
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        isError
                          ? "bg-rose-600 text-white"
                          : "bg-amber-600 text-white"
                      }`}
                    >
                      Line {diag.line} →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {rawOutput && (
          <div className="rounded-xl bg-slate-900 p-3 text-slate-100 font-mono text-xs overflow-x-auto border border-slate-800">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Terminal size={12} />
              Raw GCC Compiler Output
            </div>
            <pre className="whitespace-pre-wrap leading-relaxed text-rose-300">
              {rawOutput}
            </pre>
          </div>
        )}
      </div>
    );
  };

  const renderRunOutputTab = () => {
    if (running) {
      return (
        <div className="flex items-center justify-center gap-2.5 py-8 text-xs font-semibold text-indigo-700">
          <Loader2 size={16} className="animate-spin text-indigo-600" />
          <span>Compiling and running in sandbox (no submission recorded)...</span>
        </div>
      );
    }

    if (runError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
          {runError}
        </div>
      );
    }

    if (!runResult) {
      return (
        <div className="py-8 text-center text-xs text-slate-400">
          Click <span className="font-semibold text-slate-600">Run Code</span> (or press{" "}
          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">
            Ctrl+Enter
          </kbd>
          ) to test your program against sample test cases or custom input.
        </div>
      );
    }

    if (runResult.status === "compile_error") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Terminal size={18} className="text-rose-600" />
              <div>
                <h4 className="text-sm font-bold text-rose-900">Compilation Error</h4>
                <p className="text-xs text-rose-700">
                  Fix the syntax or declaration error below and run again.
                </p>
              </div>
            </div>
            {runResult.executionTime > 0 && (
              <span className="text-[11px] font-medium text-rose-700">
                {runResult.executionTime} ms
              </span>
            )}
          </div>

          {renderDiagnosticsList(
            runResult.diagnostics?.length ? runResult.diagnostics : diagnostics,
            runResult.compilerOutput
          )}
        </div>
      );
    }

    if (runResult.status === "runtime_error") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-red-300 bg-red-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <AlertOctagon size={18} className="text-red-600" />
              <div>
                <h4 className="text-sm font-bold text-red-900">Runtime Error</h4>
                <p className="text-xs text-red-700">
                  Program crashed or exited with non-zero status ({runResult.signal || `exit ${runResult.exitCode}`}).
                </p>
              </div>
            </div>
            {runResult.executionTime > 0 && (
              <span className="text-[11px] font-medium text-red-700">
                {runResult.executionTime} ms
              </span>
            )}
          </div>

          {runResult.stderr && (
            <div className="rounded-xl bg-slate-900 p-3 font-mono text-xs text-red-300">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                Runtime Details (stderr)
              </div>
              <pre className="whitespace-pre-wrap">{runResult.stderr}</pre>
            </div>
          )}

          {runResult.stdout && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                Stdout before crash
              </div>
              <pre className="whitespace-pre-wrap">{runResult.stdout}</pre>
            </div>
          )}

          {Array.isArray(runResult.testCases) && runResult.testCases.length > 0 && (
            <div className="space-y-2">
              {runResult.testCases.map((tc, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between font-bold text-red-900">
                    <span>Example Testcase #{tc.testCaseNumber || i + 1}</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 uppercase text-[10px] text-red-700">
                      Failed ({tc.status})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="rounded-lg border border-red-200 bg-white p-2">
                      <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                        Input
                      </span>
                      <pre className="whitespace-pre-wrap text-slate-800">{tc.input || "<empty>"}</pre>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-white p-2">
                      <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                        Expected Output
                      </span>
                      <pre className="whitespace-pre-wrap text-slate-800">{tc.expectedOutput || "<empty>"}</pre>
                    </div>
                  </div>
                  {tc.error && <p className="text-red-700 font-mono">{tc.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (runResult.status === "time_limit") {
      return (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <Clock size={17} className="text-amber-600" />
            Time Limit Exceeded
          </div>
          <p className="text-xs text-amber-800">
            Your program ran longer than the allowed limit. Check for infinite loops or blocking input calls.
          </p>
        </div>
      );
    }

    const renderSampleResultsBlock = (sampleObj) => {
      if (!sampleObj || !Array.isArray(sampleObj.testCases) || sampleObj.testCases.length === 0) {
        return null;
      }

      const passed = sampleObj.testCasesPassed ?? 0;
      const total = sampleObj.totalTestCases ?? sampleObj.testCases.length;
      const sampleAccepted = sampleObj.status === "accepted";

      return (
        <div className="space-y-3">
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
              sampleAccepted
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
              {sampleAccepted ? (
                <CheckCircle2 size={16} className="text-emerald-600" />
              ) : (
                <XCircle size={16} className="text-red-600" />
              )}
              <span>
                {sampleAccepted ? "Example Testcase Passed" : "Example Testcase Failed"} ({passed} / {total} Passed)
              </span>
              <span className="font-normal text-[11px] opacity-80">
                (Submit to grade all hidden tests)
              </span>
            </div>
            {sampleObj.executionTime > 0 && (
              <span className="text-[11px] font-medium opacity-80">
                {sampleObj.executionTime} ms
              </span>
            )}
          </div>

          <div className="space-y-2">
            {sampleObj.testCases.map((tc, idx) => {
              const isOk = tc.status === "passed";
              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 text-xs ${
                    isOk
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-red-200 bg-red-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-800">
                      Sample Case #{tc.testCaseNumber || idx + 1}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        isOk
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isOk ? "Passed" : tc.status === "failed" ? "Wrong Answer" : tc.status}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 font-mono text-[11px]">
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <span className="block font-sans text-[10px] font-bold text-slate-400">
                        Input
                      </span>
                      <pre className="whitespace-pre-wrap text-slate-700 mt-0.5">
                        {tc.input || "<empty>"}
                      </pre>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <span className="block font-sans text-[10px] font-bold text-slate-400">
                        Expected
                      </span>
                      <pre className="whitespace-pre-wrap text-slate-800 mt-0.5">
                        {tc.expectedOutput || "<empty>"}
                      </pre>
                    </div>
                    <div
                      className={`rounded-lg bg-white border p-2 ${
                        isOk ? "border-emerald-200" : "border-red-200"
                      }`}
                    >
                      <span
                        className={`block font-sans text-[10px] font-bold ${
                          isOk ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        Your Output
                      </span>
                      <pre
                        className={`whitespace-pre-wrap mt-0.5 ${
                          isOk ? "text-emerald-800" : "text-red-700"
                        }`}
                      >
                        {tc.actualOutput || tc.error || "<empty output>"}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    // Custom Input execution succeeded
    if (runResult.mode === "custom") {
      const sampleCheck = runResult.sampleCheck;
      const sampleMatched = sampleCheck?.matched;
      const customInputDisplay =
        sampleCheck?.input ?? runResult.customInput ?? customInput ?? "";

      return (
        <div className="space-y-3">
          {sampleCheck ? (
            <div
              className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                sampleMatched
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                {sampleMatched ? (
                  <CheckCircle2 size={16} className="text-emerald-600" />
                ) : (
                  <XCircle size={16} className="text-red-600" />
                )}
                <span>
                  {sampleMatched
                    ? "Correct — Custom Testcase Passed"
                    : "Wrong — Custom Testcase Failed (Output Mismatch)"}
                </span>
              </div>
              <span className="text-[11px] font-medium opacity-80">
                {runResult.executionTime} ms • Exit {runResult.exitCode ?? 0}
              </span>
            </div>
          ) : (
            <div
              className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                runResult.sampleResults && runResult.sampleResults.status !== "accepted"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                {runResult.sampleResults && runResult.sampleResults.status !== "accepted" ? (
                  <XCircle size={16} className="text-red-600 shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                )}
                <span>
                  {runResult.sampleResults && runResult.sampleResults.status !== "accepted"
                    ? "Wrong on Example Testcases — Custom Output Shown Below"
                    : "Output Generated (Enter Expected Output to verify Custom Input)"}
                </span>
              </div>
              <span className="text-[11px] font-medium opacity-80 shrink-0">
                {runResult.executionTime} ms • Exit {runResult.exitCode ?? 0}
              </span>
            </div>
          )}

          {sampleCheck ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Custom Input
                  </span>
                  <pre className="whitespace-pre-wrap text-slate-800">
                    {customInputDisplay !== "" ? customInputDisplay : "<empty>"}
                  </pre>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Expected Output{" "}
                    {(sampleCheck.source === "problem_oracle" ||
                      sampleCheck.source === "problem_spec") && (
                      <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] text-indigo-700 normal-case">
                        Predicted Expected
                      </span>
                    )}
                  </span>
                  <pre className="whitespace-pre-wrap text-slate-800">
                    {sampleCheck.expectedOutput !== "" ? sampleCheck.expectedOutput : "<empty>"}
                  </pre>
                </div>
                <div
                  className={`rounded-lg border p-2.5 ${
                    sampleMatched
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-red-200 bg-red-50/40"
                  }`}
                >
                  <span
                    className={`block font-sans text-[10px] font-bold uppercase mb-1 ${
                      sampleMatched ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    Your Output ({sampleMatched ? "Correct" : "Wrong"})
                  </span>
                  <pre className="whitespace-pre-wrap text-slate-900">
                    {sampleCheck.actualOutput !== "" ? sampleCheck.actualOutput : "<empty output>"}
                  </pre>
                </div>
              </div>
              {(sampleCheck.explanation || runResult.outputAnalysis) && (
                <div
                  className={`rounded-lg border px-3 py-2 text-[11px] ${
                    sampleMatched
                      ? "border-emerald-200/80 bg-emerald-50/60 text-emerald-900"
                      : "border-red-200/80 bg-red-50/60 text-red-900"
                  }`}
                >
                  <span className="font-bold">Analysis: </span>
                  {sampleCheck.explanation || runResult.outputAnalysis}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Custom Input (stdin)
                  </span>
                  <pre className="whitespace-pre-wrap text-slate-800">
                    {customInputDisplay !== "" ? customInputDisplay : "<empty>"}
                  </pre>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-950 p-2.5 text-emerald-300">
                  <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Your Output (stdout)
                  </span>
                  <pre className="whitespace-pre-wrap">
                    {runResult.stdout !== "" ? runResult.stdout : "<empty output>"}
                  </pre>
                </div>
              </div>
              {runResult.outputAnalysis && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900">
                  <span className="font-bold">Analysis: </span>
                  {runResult.outputAnalysis}
                </div>
              )}
            </div>
          )}

          {runResult.sampleResults && renderSampleResultsBlock(runResult.sampleResults)}

          {hasDiagnostics && renderDiagnosticsList(diagnostics, "")}
        </div>
      );
    }

    // Sample test case results
    return (
      <div className="space-y-3">
        {renderSampleResultsBlock(runResult)}
        {hasDiagnostics && renderDiagnosticsList(diagnostics, "")}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Bottom Panel Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("input")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "input"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <FileCode2 size={13} />
            Testcase / Input
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("output")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "output"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <Terminal size={13} />
            Output &amp; Errors
            {errorCount > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {errorCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("verdict")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "verdict"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <CheckCircle2 size={13} />
            Submission Verdict
          </button>
        </div>

        {/* Run Mode Switcher */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 font-medium hidden sm:inline">Run mode:</span>
          <button
            type="button"
            onClick={() => setRunMode("sample")}
            className={`rounded-md px-2 py-1 font-semibold transition ${
              runMode === "sample"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            Sample Tests
          </button>
          <button
            type="button"
            onClick={() => {
              setRunMode("custom");
              setActiveTab("input");
            }}
            className={`rounded-md px-2 py-1 font-semibold transition ${
              runMode === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            Custom Stdin
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="p-4">
        {activeTab === "input" && (
          <div className="space-y-3">
            {runMode === "sample" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      Example Testcase (Checked on Run Code)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Clicking Run Code checks your program against the problem&apos;s example testcase and shows whether it passes or fails.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRunMode("custom")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    Use Custom Stdin
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Example Input (stdin)
                    </span>
                    <pre className="whitespace-pre-wrap text-slate-800">
                      {sampleInput !== "" ? sampleInput : "<no input>"}
                    </pre>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="block font-sans text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Expected Output
                    </span>
                    <pre className="whitespace-pre-wrap text-slate-800">
                      {problem?.sampleOutput ? problem.sampleOutput : "<not specified>"}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      Custom Testcase (stdin &amp; optional expected output)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Run Code executes your program with your custom input, shows its output (checking Expected Output if provided), and also checks the Example Testcases.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {sampleInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomInput(sampleInput);
                          if (setCustomExpectedOutput && problem?.sampleOutput) {
                            setCustomExpectedOutput(problem.sampleOutput);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Copy size={12} />
                        Load Sample
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRunMode("sample")}
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      Back to Sample Tests
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Custom Input (stdin)
                    </label>
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      rows={4}
                      spellCheck="false"
                      placeholder="Enter stdin values here (e.g. 10 20)..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-green-300 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Expected Output (Optional)
                    </label>
                    <textarea
                      value={customExpectedOutput}
                      onChange={(e) => setCustomExpectedOutput?.(e.target.value)}
                      rows={4}
                      spellCheck="false"
                      placeholder="Optional: enter expected output to check Pass/Fail..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "output" && renderRunOutputTab()}

        {activeTab === "verdict" && (
          <div>
            {submitting && (
              <div className="mb-3 flex items-center justify-center gap-2.5 rounded-2xl bg-indigo-50 border border-indigo-200/80 p-3.5 text-xs font-semibold text-indigo-800 animate-pulse">
                <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
                <span>Compiling and executing all test cases in sandbox...</span>
              </div>
            )}

            {submitError && !evaluationResult && (
              <div className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700 border border-red-200">
                {submitError}
              </div>
            )}

            {evaluationResult ? (
              <AIEvaluationResult
                evaluation={evaluationResult}
                allPassed={allPassed}
                progress={progress}
                diagnostics={diagnostics}
                onSelectErrorLine={onSelectErrorLine}
                totalTestCases={
                  evaluationResult.totalTestCases ??
                  problem?.testCases?.length ??
                  evaluationResult.testCases?.length ??
                  0
                }
                testCasesPassed={
                  evaluationResult.testCasesPassed ??
                  evaluationResult.testCases?.filter((tc) => tc.status === "passed").length ??
                  0
                }
              />
            ) : (
              !submitting &&
              !submitError && (
                <div className="py-8 text-center text-xs text-slate-400">
                  Submit your solution (<kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">Ctrl+Shift+Enter</kbd>) to evaluate against all test cases and record your progress.
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutionPanel;
