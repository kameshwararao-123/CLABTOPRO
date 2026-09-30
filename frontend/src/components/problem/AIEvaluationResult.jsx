import React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Flame,
  Terminal,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const AIEvaluationResult = ({
  evaluation,
  allPassed,
  progress,
  // New deterministic judge fields (if passed directly or inside evaluation)
  status,
  testCasesPassed,
  totalTestCases,
  executionTime,
  compilerOutput,
  testCases,
}) => {
  const [showAllTests, setShowAllTests] = React.useState(false);

  // Normalize data whether passed as root props or encapsulated in evaluation object
  const effectiveStatus =
    status ||
    evaluation?.status ||
    (allPassed ? "accepted" : evaluation?.overallStatus === "likely_correct" ? "accepted" : "wrong_answer");

  // Normalize test cases array from any source
  const effectiveTestCases =
    Array.isArray(testCases) && testCases.length > 0
      ? testCases
      : Array.isArray(evaluation?.testCases) && evaluation.testCases.length > 0
      ? evaluation.testCases
      : Array.isArray(evaluation?.testCaseResults) && evaluation.testCaseResults.length > 0
      ? evaluation.testCaseResults
      : Array.isArray(evaluation?.testCaseAnalysis) && evaluation.testCaseAnalysis.length > 0
      ? evaluation.testCaseAnalysis.map((tc, idx) => ({
          testCaseNumber: tc.testCaseNumber || idx + 1,
          status: tc.prediction === "likely_pass" ? "passed" : "failed",
          error: tc.reason || "",
          isHidden: false,
        }))
      : [];

  const passedFromList = effectiveTestCases.filter((tc) => tc.status === "passed").length;
  const totalFromList = effectiveTestCases.length;

  const effectivePassedCount =
    testCasesPassed !== undefined && testCasesPassed !== null
      ? Number(testCasesPassed)
      : evaluation?.testCasesPassed !== undefined && evaluation?.testCasesPassed !== null
      ? Number(evaluation.testCasesPassed)
      : passedFromList;

  const rawTotal =
    totalTestCases !== undefined && totalTestCases !== null && Number(totalTestCases) > 0
      ? Number(totalTestCases)
      : evaluation?.totalTestCases !== undefined && evaluation?.totalTestCases !== null && Number(evaluation.totalTestCases) > 0
      ? Number(evaluation.totalTestCases)
      : totalFromList;

  const effectiveTotalCount = Math.max(rawTotal, effectivePassedCount, totalFromList);

  const effectiveExecutionTime =
    executionTime !== undefined ? executionTime : evaluation?.executionTime || 0;

  const effectiveCompilerOutput =
    compilerOutput || evaluation?.compilerOutput || "";

  const aiFeedback = evaluation?.aiEvaluation || (evaluation?.summary ? evaluation : null);

  const passPercentage =
    effectiveTotalCount > 0
      ? Math.round((effectivePassedCount / effectiveTotalCount) * 100)
      : effectiveStatus === "accepted"
      ? 100
      : 0;

  // Status-specific banner designs matching required specifications
  const renderVerdictBanner = () => {
    switch (effectiveStatus) {
      case "accepted":
        return (
          <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-emerald-900 tracking-tight">
                      ✓ Accepted
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-black text-white shadow-xs">
                      {effectivePassedCount} / {effectiveTotalCount} Passed
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-emerald-800 mt-1">
                    All test cases passed successfully!
                    {effectiveExecutionTime > 0 && ` • Execution time: ${effectiveExecutionTime} ms`}
                  </p>
                </div>
              </div>

              {progress?.currentStreak !== undefined && (
                <div className="hidden sm:flex items-center gap-2 rounded-xl bg-white border border-emerald-200 px-3.5 py-2 shadow-xs">
                  <Flame size={18} className="text-orange-500 fill-orange-500" />
                  <div className="text-left text-xs">
                    <p className="text-[10px] uppercase font-bold text-slate-400 leading-tight">
                      Streak
                    </p>
                    <p className="font-extrabold text-slate-800 leading-tight">
                      {progress.currentStreak} Day{progress.currentStreak > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Test Case Score Progress Bar */}
            <div className="w-full bg-emerald-200/70 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${passPercentage}%` }}
              />
            </div>
          </div>
        );

      case "compile_error":
        return (
          <div className="rounded-2xl border-2 border-rose-500 bg-rose-50/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
                  <Terminal size={26} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-rose-900 tracking-tight">
                      ✗ Compilation Error
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-0.5 text-xs font-black text-white shadow-xs">
                      0 / {effectiveTotalCount} Passed
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-rose-800 mt-1">
                    GCC failed to compile your C code. See compiler diagnostic output below.
                  </p>
                </div>
              </div>
            </div>

            {effectiveCompilerOutput && (
              <div className="rounded-xl bg-slate-900 p-3.5 text-slate-100 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Terminal size={12} />
                  GCC Compiler Output
                </div>
                <pre className="whitespace-pre-wrap leading-relaxed text-rose-300">
                  {effectiveCompilerOutput}
                </pre>
              </div>
            )}
          </div>
        );

      case "runtime_error":
        return (
          <div className="rounded-2xl border-2 border-red-500 bg-red-50/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
                  <AlertOctagon size={26} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-red-900 tracking-tight">
                      ✗ Runtime Error
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-0.5 text-xs font-black text-white shadow-xs">
                      {effectivePassedCount} / {effectiveTotalCount} Passed
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-red-800 mt-1">
                    Program crashed during execution (segmentation fault or non-zero exit code).
                    {effectiveExecutionTime > 0 && ` • Execution time: ${effectiveExecutionTime} ms`}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full bg-red-200/70 rounded-full h-2 overflow-hidden">
              <div
                className="bg-red-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${passPercentage}%` }}
              />
            </div>
          </div>
        );

      case "time_limit":
        return (
          <div className="rounded-2xl border-2 border-amber-500 bg-amber-50/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
                  <Clock size={26} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-amber-900 tracking-tight">
                      ✗ Time Limit Exceeded
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-0.5 text-xs font-black text-white shadow-xs">
                      {effectivePassedCount} / {effectiveTotalCount} Passed
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-amber-800 mt-1">
                    Your program exceeded the allowed execution time limit (possible infinite loop).
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full bg-amber-200/70 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${passPercentage}%` }}
              />
            </div>
          </div>
        );

      case "wrong_answer":
      default:
        return (
          <div className="rounded-2xl border-2 border-red-500 bg-red-50/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
                  <XCircle size={26} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-red-900 tracking-tight">
                      ✗ Wrong Answer
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-0.5 text-xs font-black text-white shadow-xs">
                      {effectivePassedCount} / {effectiveTotalCount} Passed
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-red-800 mt-1">
                    Some test cases failed. Review test results below.
                    {effectiveExecutionTime > 0 && ` • Execution time: ${effectiveExecutionTime} ms`}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full bg-red-200/70 rounded-full h-2 overflow-hidden">
              <div
                className="bg-red-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${passPercentage}%` }}
              />
            </div>
          </div>
        );
    }
  };

  // Ensure test case breakdown always has entries to show
  const activeTestCasesList =
    effectiveTestCases.length > 0
      ? effectiveTestCases
      : Array.from({ length: effectiveTotalCount }, (_, idx) => {
          const isPassed = idx < effectivePassedCount;
          return {
            testCaseNumber: idx + 1,
            status: isPassed ? "passed" : "failed",
            isHidden: true,
            error: isPassed ? "" : "Output mismatch or test case failed.",
          };
        });

  const displayedTestCases = showAllTests
    ? activeTestCasesList
    : activeTestCasesList.slice(0, 4);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. DETERMINISTIC VERDICT BANNER */}
      {renderVerdictBanner()}

      {/* 2. TEST CASES BREAKDOWN (With strict hidden-test protection) */}
      {activeTestCasesList.length > 0 && effectiveStatus !== "compile_error" && (
        <div className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Test Case Results
              </h4>
              <span className="rounded-full bg-slate-800 text-white px-2 py-0.5 text-[11px] font-black">
                {effectivePassedCount} / {effectiveTotalCount} Passed
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              Deterministic Sandbox Run
            </span>
          </div>

          <div className="space-y-2.5">
            {displayedTestCases.map((tc, idx) => {
              const isPassed = tc.status === "passed";
              const isHidden = Boolean(tc.isHidden);

              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 sm:p-3.5 transition ${
                    isPassed
                      ? "border-emerald-200 bg-emerald-50/50"
                      : tc.status === "time_limit"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-red-200 bg-red-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isPassed ? (
                        <CheckCircle2 size={17} className="text-emerald-600 shrink-0" />
                      ) : tc.status === "time_limit" ? (
                        <Clock size={17} className="text-amber-600 shrink-0" />
                      ) : (
                        <XCircle size={17} className="text-red-600 shrink-0" />
                      )}

                      <span className="text-xs font-bold text-slate-800">
                        Test Case #{tc.testCaseNumber || idx + 1}
                      </span>

                      {isHidden && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          <Lock size={10} />
                          Hidden
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {tc.executionTime > 0 && (
                        <span className="text-[10px] font-medium text-slate-400">
                          {tc.executionTime}ms
                        </span>
                      )}
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isPassed
                            ? "bg-emerald-100 text-emerald-800"
                            : tc.status === "time_limit"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {isPassed
                          ? "Passed"
                          : tc.status === "time_limit"
                          ? "Time Limit"
                          : tc.status === "runtime_error"
                          ? "Runtime Error"
                          : "Failed"}
                      </span>
                    </div>
                  </div>

                  {/* Public test case details vs. protected hidden test case */}
                  {isHidden ? (
                    !isPassed && (
                      <p className="mt-2 text-[11px] text-slate-500 italic">
                        Hidden test case failed. Details are kept private to protect assessment integrity.
                      </p>
                    )
                  ) : (
                    !isPassed && (
                      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                        {tc.expectedOutput && (
                          <div className="rounded-lg bg-white p-2 border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 block font-sans">
                              Expected Output:
                            </span>
                            <pre className="text-slate-800 whitespace-pre-wrap mt-0.5">
                              {tc.expectedOutput}
                            </pre>
                          </div>
                        )}
                        {tc.actualOutput !== undefined && (
                          <div className="rounded-lg bg-white p-2 border border-red-200">
                            <span className="text-[10px] font-bold text-red-500 block font-sans">
                              Your Output:
                            </span>
                            <pre className="text-red-700 whitespace-pre-wrap mt-0.5">
                              {tc.actualOutput || "<empty output>"}
                            </pre>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {tc.error && !isHidden && !tc.expectedOutput && (
                    <p className="mt-1.5 text-xs text-red-700 font-medium">
                      {tc.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {effectiveTestCases.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllTests((prev) => !prev)}
              className="mt-2 flex items-center justify-center gap-1 w-full py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition"
            >
              <span>{showAllTests ? "Show Fewer Tests" : `Show All ${effectiveTestCases.length} Tests`}</span>
              {showAllTests ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      )}

      {/* 3. OPTIONAL AI EDUCATIONAL ASSISTANT & DEBUGGING HINTS */}
      {aiFeedback && aiFeedback.summary && (
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/40 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <Sparkles size={14} />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                  AI Learning Assistant &amp; Debugging Guidance
                </h4>
                <p className="text-[10px] text-slate-400">
                  Educational guidance based on actual execution evidence
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
              Assistant
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
            {aiFeedback.summary}
          </p>

          {aiFeedback.detectedIssues && aiFeedback.detectedIssues.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Identified Logic Bottlenecks
              </span>
              {aiFeedback.detectedIssues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="text-red-500 font-bold">•</span>
                  <span>{issue.message || issue.type}</span>
                </div>
              ))}
            </div>
          )}

          {aiFeedback.suggestions && aiFeedback.suggestions.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Debugging Suggestions
              </span>
              <ul className="list-disc list-inside space-y-1 text-xs text-slate-700">
                {aiFeedback.suggestions.map((sug, i) => (
                  <li key={i}>{sug}</li>
                ))}
              </ul>
            </div>
          )}

          {aiFeedback.learningFeedback && (
            <p className="text-xs text-slate-500 italic pt-1 border-t border-indigo-100/60">
              💡 {aiFeedback.learningFeedback}
            </p>
          )}
        </div>
      )}

      {/* 4. FOOTER NOTE */}
      <p className="text-[11px] text-slate-400 text-center">
        Code executed inside an isolated Piston sandbox with GCC. Verdict is 100% deterministic.
      </p>
    </div>
  );
};

export default AIEvaluationResult;
