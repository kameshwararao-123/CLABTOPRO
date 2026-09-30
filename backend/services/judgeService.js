/**
 * Deterministic Judge Service
 * Executes student C programs through Piston, performs strict output normalization,
 * and determines the official verdict based on actual execution results.
 */

import { executeCCode, checkPistonHealth } from "./pistonService.js";
import { executeLocalGcc, checkLocalGccHealth } from "./localGccService.js";

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
      return {
        status: "compile_error",
        compilerOutput: compileCheck.compileOutput,
        testCasesPassed: 0,
        totalTestCases: 0,
        executionTime: compileCheck.executionTimeMs,
        testCaseResults: [],
      };
    }

    return {
      status: "accepted",
      compilerOutput: compileCheck.compileOutput,
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
      compilerOutput = runResult.compileOutput;
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

  console.log(
    `[Judge] Verdict: ${overallStatus.toUpperCase()} (${testCasesPassed}/${testCases.length} passed, ${totalExecutionTime}ms)`
  );

  return {
    status: overallStatus,
    compilerOutput,
    testCasesPassed,
    totalTestCases: testCases.length,
    executionTime: totalExecutionTime,
    testCaseResults,
  };
};
