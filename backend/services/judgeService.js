/**
 * Deterministic Judge Service
 * Executes student C programs through Piston, performs strict output normalization,
 * and determines the official verdict based on actual execution results.
 */

import { executeCCode, checkPistonHealth } from "./pistonService.js";
import { executeLocalGcc, checkLocalGccHealth } from "./localGccService.js";
import { evaluateCustomInputExpectedOutput } from "./aiEvaluationService.js";
import { predictCustomOutputFromSpec, analyzeCustomRunOutput } from "./problemOracleService.js";
import { sanitizeCompilerOutput, parseGccDiagnostics } from "../utils/compilerParser.js";

/**
 * Normalizes output string for deterministic comparison.
 * - Converts Windows CRLF (\r\n) and lone CR (\r) to standard LF (\n)
 * - Trims trailing whitespace on each line
 * - Trims trailing blank lines at the end of the full output
 * Preserves essential internal line-breaks and numerical values.
 *
 * @param {string} output
 * @returns {string} Normalized output
 */
export const normalizeOutput = (output) => {
  if (output === null || output === undefined) return "";
  return String(output)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
};

export class ExecutionServiceError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = "ExecutionServiceError";
    this.statusCode = statusCode;
  }
}

/**
 * Checks overall judge engine health.
 * Prioritizes Piston Docker container, but gracefully falls back to local GCC
 * when Piston is offline or Docker is not installed on the host.
 */
export const checkJudgeEngineHealth = async () => {
  const pistonHealth = await checkPistonHealth();
  if (pistonHealth.connected) {
    return {
      connected: true,
      engine: "piston",
      url: pistonHealth.url,
      cInstalled: pistonHealth.cInstalled,
      version: pistonHealth.cVersion,
      responseTimeMs: pistonHealth.responseTimeMs,
    };
  }

  const allowLocalFallback = process.env.ENABLE_LOCAL_GCC_FALLBACK !== "false";
  if (allowLocalFallback) {
    const gccHealth = await checkLocalGccHealth();
    if (gccHealth.connected) {
      return {
        connected: true,
        engine: "local_gcc",
        fallbackActive: true,
        pistonOfflineReason: pistonHealth.error,
        cInstalled: true,
        version: gccHealth.version,
        compiler: gccHealth.compiler,
      };
    }
  }

  return {
    connected: false,
    engine: "none",
    error: `Execution engine offline: Piston unreachable (${pistonHealth.error || "offline"}) and local GCC unavailable.`,
  };
};

/**
 * Executes a student C submission against all problem test cases.
 *
 * @param {Object} params
 * @param {string} params.code - Student C source code
 * @param {Array} params.testCases - Array of { input, expectedOutput, isHidden }
 * @param {string} [params.problemTitle] - For logging
 * @returns {Promise<Object>} Official judgment result
 */
export const judgeSubmission = async ({
  code,
  testCases = [],
  problemTitle = "Problem",
}) => {
  if (!code || !code.trim()) {
    throw new Error("Student code cannot be empty");
  }

  // 1. Health check to select active execution engine (Piston or local GCC fallback)
  const engineHealth = await checkJudgeEngineHealth();
  if (!engineHealth.connected) {
    console.error(`[Judge] Execution engine unreachable: ${engineHealth.error}`);
    throw new ExecutionServiceError(
      "Code execution engine is currently offline or unreachable. Please try again shortly or contact your instructor."
    );
  }

  const executeEngine = engineHealth.engine === "piston" ? executeCCode : executeLocalGcc;
  if (engineHealth.fallbackActive) {
    console.log(
      `[Judge] Piston Docker container offline. Evaluating using local host GCC (${engineHealth.version}).`
    );
  } else {
    console.log(`[Judge] Evaluating using Piston Docker container at ${engineHealth.url}.`);
  }

  if (testCases.length === 0) {
    // If problem has no test cases configured yet, run compilation check
    const compileCheck = await executeEngine({ code, stdin: "" });
    if (!compileCheck.success && compileCheck.isSystemError) {
      throw new ExecutionServiceError(compileCheck.error);
    }

    if (!compileCheck.compiled) {
      const cleanCompiler = sanitizeCompilerOutput(compileCheck.compileOutput);
      return {
        status: "compile_error",
        compilerOutput: cleanCompiler,
        diagnostics: parseGccDiagnostics(cleanCompiler),
        testCasesPassed: 0,
        totalTestCases: 0,
        executionTime: compileCheck.executionTimeMs,
        testCaseResults: [],
      };
    }

    const cleanWarn = sanitizeCompilerOutput(compileCheck.compileOutput);
    return {
      status: "accepted",
      compilerOutput: cleanWarn,
      diagnostics: parseGccDiagnostics(cleanWarn),
      testCasesPassed: 0,
      totalTestCases: 0,
      executionTime: compileCheck.executionTimeMs,
      testCaseResults: [],
    };
  }

  const testCaseResults = [];
  let totalExecutionTime = 0;
  let overallStatus = "accepted";
  let compilerOutput = "";
  let compilationFailed = false;

  console.log(
    `[Judge] Starting execution for "${problemTitle}" (${testCases.length} test cases)...`
  );

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const testCaseNumber = i + 1;
    const input = tc.input || "";
    const expectedOutput = tc.expectedOutput || "";
    const isHidden = Boolean(tc.isHidden);

    // If compilation failed on previous test case, skip remaining test cases immediately
    if (compilationFailed) {
      testCaseResults.push({
        testCaseNumber,
        status: "skipped",
        isHidden,
        input,
        expectedOutput,
        actualOutput: "",
        executionTime: 0,
        error: "Compilation failed.",
      });
      continue;
    }

    const runResult = await executeEngine({
      code,
      stdin: input,
    });

    // Check for fatal system failure
    if (!runResult.success && runResult.isSystemError) {
      console.error(`[Judge] Execution engine failure on test #${testCaseNumber}:`, runResult.error);
      throw new ExecutionServiceError(
        `Execution service error while evaluating test case #${testCaseNumber}: ${runResult.error}`
      );
    }

    totalExecutionTime += runResult.executionTimeMs || 0;

    // 1. Compilation Error
    if (!runResult.compiled) {
      compilationFailed = true;
      compilerOutput = sanitizeCompilerOutput(runResult.compileOutput);
      overallStatus = "compile_error";

      testCaseResults.push({
        testCaseNumber,
        status: "compile_error",
        isHidden,
        input,
        expectedOutput,
        actualOutput: "",
        executionTime: runResult.executionTimeMs,
        error: compilerOutput,
      });

      console.log(`[Judge] Test #${testCaseNumber}: Compile Error`);
      continue;
    }

    // 2. Timeout (Time Limit Exceeded)
    if (runResult.timedOut) {
      if (overallStatus !== "compile_error") {
        overallStatus = "time_limit";
      }

      testCaseResults.push({
        testCaseNumber,
        status: "time_limit",
        isHidden,
        input,
        expectedOutput,
        actualOutput: runResult.stdout || "",
        executionTime: runResult.executionTimeMs,
        error: "Time limit exceeded (possible infinite loop or excessive computation).",
      });

      console.log(`[Judge] Test #${testCaseNumber}: Time Limit Exceeded`);
      continue;
    }

    // 3. Runtime Error (Crash, Segmentation Fault, Non-zero Exit Code)
    if (runResult.runtimeError) {
      if (overallStatus !== "compile_error" && overallStatus !== "time_limit") {
        overallStatus = "runtime_error";
      }

      const errorMsg =
        runResult.stderr ||
        `Process exited with non-zero code ${runResult.exitCode}${
          runResult.signal ? ` (Signal: ${runResult.signal})` : ""
        }`;

      testCaseResults.push({
        testCaseNumber,
        status: "runtime_error",
        isHidden,
        input,
        expectedOutput,
        actualOutput: runResult.stdout || "",
        executionTime: runResult.executionTimeMs,
        error: errorMsg,
      });

      console.log(`[Judge] Test #${testCaseNumber}: Runtime Error (${errorMsg})`);
      continue;
    }

    // 4. Output Comparison
    const normalizedActual = normalizeOutput(runResult.stdout);
    const normalizedExpected = normalizeOutput(expectedOutput);
    const isPassed = normalizedActual === normalizedExpected;

    if (isPassed) {
      testCaseResults.push({
        testCaseNumber,
        status: "passed",
        isHidden,
        input,
        expectedOutput,
        actualOutput: runResult.stdout,
        executionTime: runResult.executionTimeMs,
        error: "",
      });
      console.log(`[Judge] Test #${testCaseNumber}: Passed ✓`);
    } else {
      if (
        overallStatus !== "compile_error" &&
        overallStatus !== "time_limit" &&
        overallStatus !== "runtime_error"
      ) {
        overallStatus = "wrong_answer";
      }

      testCaseResults.push({
        testCaseNumber,
        status: "failed",
        isHidden,
        input,
        expectedOutput,
        actualOutput: runResult.stdout,
        executionTime: runResult.executionTimeMs,
        error: "Output mismatch.",
      });
      console.log(`[Judge] Test #${testCaseNumber}: Wrong Answer ✗`);
    }
  }

  const testCasesPassed = testCaseResults.filter((tc) => tc.status === "passed").length;

  const cleanCompilerOutput = sanitizeCompilerOutput(compilerOutput);
  const diagnostics = parseGccDiagnostics(cleanCompilerOutput);

  console.log(
    `[Judge] Verdict: ${overallStatus.toUpperCase()} (${testCasesPassed}/${testCases.length} passed, ${totalExecutionTime}ms)`
  );

  return {
    status: overallStatus,
    compilerOutput: cleanCompilerOutput,
    diagnostics,
    testCasesPassed,
    totalTestCases: testCases.length,
    executionTime: totalExecutionTime,
    testCaseResults,
  };
};

/**
 * Runs student C code in sandbox WITHOUT creating a submission or running hidden tests.
 * Supports either "custom" stdin execution or "sample" visible test case verification.
 *
 * @param {Object} params
 * @param {string} params.code
 * @param {string} [params.mode] - "sample" | "custom"
 * @param {string} [params.customInput]
 * @param {Object} [params.problem]
 * @returns {Promise<Object>}
 */
const getVisibleSampleCases = (problem) => {
  if (!problem) return [];

  const visibleTestCases = Array.isArray(problem.testCases)
    ? problem.testCases.filter((tc) => !tc.isHidden)
    : [];

  const casesToRun = [...visibleTestCases];

  const hasProblemSample =
    (typeof problem.sampleOutput === "string" && problem.sampleOutput.trim().length > 0) ||
    (typeof problem.sampleInput === "string" && problem.sampleInput.trim().length > 0);

  if (hasProblemSample) {
    const normSampleIn = normalizeOutput(problem.sampleInput || "");
    const normSampleOut = normalizeOutput(problem.sampleOutput || "");
    const alreadyIncluded = casesToRun.some(
      (tc) =>
        normalizeOutput(tc.input || "") === normSampleIn &&
        normalizeOutput(tc.expectedOutput || "") === normSampleOut
    );

    if (!alreadyIncluded) {
      casesToRun.unshift({
        input: problem.sampleInput || "",
        expectedOutput: problem.sampleOutput || "",
        isHidden: false,
      });
    }
  }

  return casesToRun;
};

export const runCCode = async ({
  code,
  mode = "sample",
  customInput = "",
  customExpectedOutput = "",
  problem = null,
}) => {
  if (!code || !code.trim()) {
    throw new Error("Student code cannot be empty");
  }

  const engineHealth = await checkJudgeEngineHealth();
  if (!engineHealth.connected) {
    throw new ExecutionServiceError(
      "Code execution engine is currently offline or unreachable. Please try again shortly or contact your instructor."
    );
  }

  const executeEngine = engineHealth.engine === "piston" ? executeCCode : executeLocalGcc;

  // Mode 1: Custom stdin run
  if (mode === "custom") {
    const runResult = await executeEngine({
      code,
      stdin: String(customInput ?? ""),
    });

    if (!runResult.success && runResult.isSystemError) {
      throw new ExecutionServiceError(runResult.error);
    }

    const cleanCompiler = sanitizeCompilerOutput(runResult.compileOutput);
    const diagnostics = parseGccDiagnostics(cleanCompiler);

    if (!runResult.compiled) {
      return {
        mode: "custom",
        status: "compile_error",
        compilerOutput: cleanCompiler,
        diagnostics,
        stdout: "",
        stderr: cleanCompiler,
        executionTime: runResult.executionTimeMs || 0,
        exitCode: runResult.exitCode ?? 1,
        signal: runResult.signal || null,
      };
    }

    if (runResult.timedOut) {
      return {
        mode: "custom",
        status: "time_limit",
        compilerOutput: cleanCompiler,
        diagnostics,
        stdout: runResult.stdout || "",
        stderr: "Time limit exceeded (possible infinite loop).",
        executionTime: runResult.executionTimeMs || 0,
        exitCode: runResult.exitCode ?? 0,
        signal: runResult.signal || "SIGKILL",
      };
    }

    if (runResult.runtimeError) {
      const runtimeMsg =
        sanitizeCompilerOutput(runResult.stderr) ||
        `Process exited with non-zero code ${runResult.exitCode}${
          runResult.signal ? ` (Signal: ${runResult.signal})` : ""
        }`;
      return {
        mode: "custom",
        status: "runtime_error",
        compilerOutput: cleanCompiler,
        diagnostics,
        stdout: runResult.stdout || "",
        stderr: runtimeMsg,
        executionTime: runResult.executionTimeMs || 0,
        exitCode: runResult.exitCode ?? 1,
        signal: runResult.signal || null,
      };
    }

    const stdout = runResult.stdout || "";
    const normalizedCustomIn = normalizeOutput(String(customInput ?? ""));
    const sampleCases = getVisibleSampleCases(problem);

    const hasUserExpectedOutput =
      typeof customExpectedOutput === "string" && customExpectedOutput.trim().length > 0;

    let checkSource = hasUserExpectedOutput ? "user" : null;
    let explanation = "";
    let ruleName = "";
    let effectiveExpectedOutput = hasUserExpectedOutput ? customExpectedOutput : null;

    if (effectiveExpectedOutput === null && problem) {
      if (
        typeof problem.sampleOutput === "string" &&
        problem.sampleOutput.length > 0 &&
        normalizedCustomIn === normalizeOutput(problem.sampleInput || "")
      ) {
        effectiveExpectedOutput = problem.sampleOutput;
        checkSource = "sample";
      } else {
        const matchedVisible = sampleCases.find(
          (tc) =>
            typeof tc.expectedOutput === "string" &&
            tc.expectedOutput.length > 0 &&
            normalizeOutput(tc.input || "") === normalizedCustomIn
        );
        if (matchedVisible) {
          effectiveExpectedOutput = matchedVisible.expectedOutput;
          checkSource = "sample";
        }
      }
    }

    // Priority 3: Deterministic self-verified problem oracle (works offline without API key)
    if (effectiveExpectedOutput === null && problem) {
      const deterministicPrediction = predictCustomOutputFromSpec({
        problem,
        customInput,
        visibleCases: sampleCases,
      });
      if (deterministicPrediction) {
        effectiveExpectedOutput = deterministicPrediction.expectedOutput;
        explanation = deterministicPrediction.explanation || "";
        ruleName = deterministicPrediction.ruleName || "";
        checkSource = "problem_oracle";
      }
    }

    // Priority 4: Run problem sample test cases and (if still unpredicted) AI problem oracle
    const [judgedSample, aiCustomOracle] = await Promise.all([
      sampleCases.length > 0
        ? judgeSubmission({
            code,
            testCases: sampleCases,
            problemTitle: `${problem?.title || "Problem"} (Sample Run)`,
          })
        : Promise.resolve(null),
      effectiveExpectedOutput === null && problem
        ? evaluateCustomInputExpectedOutput({
            problem,
            customInput,
          })
        : Promise.resolve(null),
    ]);

    if (effectiveExpectedOutput === null && aiCustomOracle) {
      effectiveExpectedOutput = aiCustomOracle.expectedOutput;
      explanation = aiCustomOracle.explanation || "";
      checkSource = "problem_spec";
    }

    const cleanStderr = sanitizeCompilerOutput(runResult.stderr) || "";
    const hasExpectedRef = effectiveExpectedOutput !== null;
    const sampleMatched = hasExpectedRef
      ? normalizeOutput(stdout) === normalizeOutput(effectiveExpectedOutput)
      : null;

    const outputAnalysis = analyzeCustomRunOutput({
      customInput,
      expectedOutput: effectiveExpectedOutput,
      actualOutput: stdout,
      matched: sampleMatched,
      stderr: cleanStderr,
      baseExplanation: explanation,
    });

    let sampleResults = null;
    if (judgedSample) {
      sampleResults = {
        status: judgedSample.status,
        testCasesPassed: judgedSample.testCasesPassed,
        totalTestCases: judgedSample.totalTestCases,
        executionTime: judgedSample.executionTime,
        testCases: judgedSample.testCaseResults.map((tc) => ({
          testCaseNumber: tc.testCaseNumber,
          status: tc.status,
          executionTime: tc.executionTime,
          isHidden: false,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: tc.actualOutput,
          error: tc.error,
        })),
      };
    }

    return {
      mode: "custom",
      status: "executed",
      compilerOutput: cleanCompiler,
      diagnostics,
      customInput: String(customInput ?? ""),
      customExpectedOutput: effectiveExpectedOutput,
      stdout,
      stderr: cleanStderr,
      executionTime: runResult.executionTimeMs || 0,
      exitCode: runResult.exitCode ?? 0,
      signal: runResult.signal || null,
      outputAnalysis,
      ...(hasExpectedRef
        ? {
            sampleCheck: {
              matched: sampleMatched,
              status: sampleMatched ? "passed" : "failed",
              source: checkSource,
              ...(ruleName ? { ruleName } : {}),
              input: String(customInput ?? ""),
              expectedOutput: effectiveExpectedOutput,
              actualOutput: stdout,
              explanation: outputAnalysis,
            },
          }
        : {}),
      ...(sampleResults ? { sampleResults } : {}),
    };
  }

  // Mode 2: Run visible/sample test cases ONLY (never reveal hidden tests)
  const casesToRun = getVisibleSampleCases(problem);

  // If still no sample tests exist, fall back to a clean custom execution with empty input
  if (casesToRun.length === 0) {
    return runCCode({ code, mode: "custom", customInput: "", problem });
  }

  const judged = await judgeSubmission({
    code,
    testCases: casesToRun,
    problemTitle: `${problem?.title || "Problem"} (Sample Run)`,
  });

  // Preserve warning diagnostics on successful compilation too
  let finalCompilerOutput = judged.compilerOutput;
  let finalDiagnostics = judged.diagnostics;
  if (!finalCompilerOutput && judged.status !== "compile_error") {
    const firstCheck = await executeEngine({ code, stdin: casesToRun[0].input || "" }).catch(() => null);
    if (firstCheck?.compileOutput) {
      finalCompilerOutput = sanitizeCompilerOutput(firstCheck.compileOutput);
      finalDiagnostics = parseGccDiagnostics(finalCompilerOutput);
    }
  }

  return {
    mode: "sample",
    status: judged.status,
    compilerOutput: finalCompilerOutput,
    diagnostics: finalDiagnostics,
    testCasesPassed: judged.testCasesPassed,
    totalTestCases: judged.totalTestCases,
    executionTime: judged.executionTime,
    testCases: judged.testCaseResults.map((tc) => ({
      testCaseNumber: tc.testCaseNumber,
      status: tc.status,
      executionTime: tc.executionTime,
      isHidden: false,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      actualOutput: tc.actualOutput,
      error: tc.error,
    })),
  };
};
