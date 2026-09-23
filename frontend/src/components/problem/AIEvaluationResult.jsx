import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Info,
  Flame,
} from "lucide-react";

const AIEvaluationResult = ({ evaluation, allPassed, progress }) => {
  if (!evaluation) return null;

  const {
    overallStatus = "needs_verification",
    testCaseAnalysis = [],
    detectedIssues = [],
    summary = "",
  } = evaluation;

  const totalCases = testCaseAnalysis.length;
  const passedCount = testCaseAnalysis.filter(
    (tc) => tc.prediction === "likely_pass"
  ).length;

  const isSuccess =
    allPassed ||
    overallStatus === "likely_correct" ||
    (totalCases > 0 && passedCount === totalCases);

  const isUnavailable = overallStatus === "evaluation_unavailable";

  return (
    <div className="space-y-4">
      {/* 1. OVERALL STATUS BANNER */}
      {isUnavailable ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <Info size={24} className="text-slate-500 shrink-0" />
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Submission Saved
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                AI evaluation is currently unavailable. Your code was recorded
                successfully.
              </p>
            </div>
          </div>
        </div>
      ) : isSuccess ? (
        <div className="rounded-2xl border-2 border-green-500 bg-green-50/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500 text-white shadow-sm">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-green-800">
                  All Test Cases Passed!
                </h3>
                <p className="text-xs text-green-700 mt-0.5">
                  Great job! Problem solved successfully. Dashboard &amp; streak
                  updated.
                </p>
              </div>
            </div>

            {progress?.currentStreak !== undefined && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-xl bg-white border border-green-200 px-3.5 py-2 shadow-xs">
                <Flame size={18} className="text-amber-500 fill-amber-500" />
                <div className="text-left text-xs">
                  <p className="text-[10px] uppercase font-bold text-slate-400 leading-tight">
                    Streak
                  </p>
                  <p className="font-bold text-slate-800 leading-tight">
                    {progress.currentStreak} Day{progress.currentStreak > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-red-400 bg-red-50/80 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
              <XCircle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-800">
                Test Cases Failed ({passedCount}/{totalCases} Passed)
              </h3>
              <p className="text-xs text-red-700 mt-0.5">
                Some test cases did not pass. Check the details below to fix your code.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. TEST CASES (GREEN FOR PASSED, RED FOR FAILED) */}
      {testCaseAnalysis.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Test Case Results
          </h4>

          {testCaseAnalysis.map((tc, index) => {
            const isPass = tc.prediction === "likely_pass";
            const isFail = tc.prediction === "likely_fail";

            return (
              <div
                key={index}
                className={`rounded-xl border-2 p-4 transition ${
                  isPass
                    ? "border-green-400 bg-green-50/70 text-green-900"
                    : isFail
                    ? "border-red-400 bg-red-50/70 text-red-900"
                    : "border-amber-300 bg-amber-50/70 text-amber-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {isPass ? (
                      <CheckCircle2
                        size={20}
                        className="text-green-600 shrink-0"
                      />
                    ) : isFail ? (
                      <XCircle size={20} className="text-red-600 shrink-0" />
                    ) : (
                      <HelpCircle
                        size={20}
                        className="text-amber-600 shrink-0"
                      />
                    )}
                    <span className="font-bold text-sm">
                      Test Case #{tc.testCaseNumber || index + 1}
                    </span>
                  </div>

                  <span
                    className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide shadow-xs ${
                      isPass
                        ? "bg-green-600 text-white"
                        : isFail
                        ? "bg-red-600 text-white"
                        : "bg-amber-500 text-white"
                    }`}
                  >
                    {isPass ? "Passed" : isFail ? "Failed" : "Uncertain"}
                  </span>
                </div>

                {tc.reason && (
                  <p
                    className={`mt-2 text-xs leading-relaxed ${
                      isPass
                        ? "text-green-800"
                        : isFail
                        ? "text-red-800 font-medium"
                        : "text-amber-800"
                    }`}
                  >
                    {tc.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. BRIEF DETECTED ISSUE (IF ANY) */}
      {detectedIssues && detectedIssues.length > 0 && !isSuccess && (
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-red-600 mb-1">
            <AlertTriangle size={15} />
            Detected Issue
          </div>
          {detectedIssues.map((issue, idx) => (
            <p key={idx} className="text-xs text-slate-700 leading-relaxed">
              &bull; {issue.message || issue.type}
            </p>
          ))}
        </div>
      )}

      {/* 4. STATIC ANALYSIS FOOTER NOTE */}
      <p className="text-[11px] text-slate-400 text-center pt-1">
        AI evaluation is based on static code reasoning. The C program has not
        been executed by a compiler.
      </p>
    </div>
  );
};

export default AIEvaluationResult;
