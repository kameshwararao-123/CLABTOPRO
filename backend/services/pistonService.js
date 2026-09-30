/**
 * Piston Execution Service
 * Communicates with the isolated Piston Docker container to execute C code in a secure sandbox.
 * Never executes student code directly on the host application server.
 */

const PISTON_URL = (process.env.PISTON_URL || "http://localhost:2000").replace(/\/+$/, "");
const PISTON_API_KEY = process.env.PISTON_API_KEY || "";
const DEFAULT_RUN_TIMEOUT_MS = parseInt(process.env.EXECUTION_TIMEOUT_MS || "3000", 10);
const DEFAULT_COMPILE_TIMEOUT_MS = 10000;

/**
 * Checks Piston health and verifies available language runtimes.
 * Does not expose sensitive credentials.
 */
export const checkPistonHealth = async () => {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const headers = { "Accept": "application/json" };
    if (PISTON_API_KEY) {
      headers["Authorization"] = PISTON_API_KEY;
    }

    const response = await fetch(`${PISTON_URL}/api/v2/runtimes`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        connected: false,
        url: PISTON_URL,
        error: `Piston responded with HTTP ${response.status}`,
        responseTimeMs: Date.now() - startTime,
      };
    }

    const runtimes = await response.json();
    const cRuntime = Array.isArray(runtimes)
      ? runtimes.find((r) => r.language === "c" || r.aliases?.includes("c"))
      : null;

    return {
      connected: true,
      url: PISTON_URL,
      cInstalled: Boolean(cRuntime),
      cVersion: cRuntime?.version || "unknown",
      totalRuntimes: Array.isArray(runtimes) ? runtimes.length : 0,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const isTimeout = error.name === "AbortError";
    return {
      connected: false,
      url: PISTON_URL,
      error: isTimeout ? "Connection timed out" : error.message,
      responseTimeMs: Date.now() - startTime,
    };
  }
};

/**
 * Executes C code inside the isolated Piston container against stdin input.
 *
 * @param {Object} params
 * @param {string} params.code - Student C source code
 * @param {string} params.stdin - Test case standard input
 * @param {number} [params.runTimeout] - Execution timeout in ms
 * @param {number} [params.compileTimeout] - Compilation timeout in ms
 * @returns {Promise<Object>} Normalized execution result
 */
export const executeCCode = async ({
  code,
  stdin = "",
  runTimeout = DEFAULT_RUN_TIMEOUT_MS,
  compileTimeout = DEFAULT_COMPILE_TIMEOUT_MS,
}) => {
  if (!code || typeof code !== "string" || !code.trim()) {
    throw new Error("Source code cannot be empty");
  }

  // Safety limits on payload size
  if (code.length > 65536) {
    throw new Error("Source code exceeds 64KB maximum limit");
  }

  const startTime = Date.now();
  const controller = new AbortController();
  // Allow slightly more time than compile + run timeout for HTTP overhead
  const totalTimeoutMs = compileTimeout + runTimeout + 3000;
  const timeoutId = setTimeout(() => controller.abort(), totalTimeoutMs);

  const payload = {
    language: "c",
    version: "*",
    files: [
      {
        name: "solution.c",
        content: code,
      },
    ],
    stdin: String(stdin || ""),
    args: [],
    compile_timeout: compileTimeout,
    run_timeout: runTimeout,
  };

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (PISTON_API_KEY) {
    headers["Authorization"] = PISTON_API_KEY;
  }

  try {
    const response = await fetch(`${PISTON_URL}/api/v2/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const executionTimeMs = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        success: false,
        error: `Piston execution failed (HTTP ${response.status}): ${errText || response.statusText}`,
        executionTimeMs,
        isSystemError: true,
      };
    }

    const data = await response.json();
    const compile = data.compile || {};
    const run = data.run || {};

    // 1. Check Compilation Result
    // In Piston: compile.code !== 0 indicates compilation error
    const compileOutput = (compile.output || compile.stderr || compile.stdout || "").trim();
    const compileCode = typeof compile.code === "number" ? compile.code : 0;
    const isCompileError = compileCode !== 0 || (compileOutput.length > 0 && compileCode !== 0);

    if (isCompileError) {
      return {
        success: true,
        compiled: false,
        status: "compile_error",
        compileOutput: compileOutput || "Compilation failed with unknown error.",
        stdout: "",
        stderr: compileOutput,
        exitCode: compileCode,
        signal: compile.signal || null,
        executionTimeMs,
        timedOut: false,
        runtimeError: false,
      };
    }

    // 2. Check Execution Result
    const runOutput = run.output || "";
    const runStdout = run.stdout || "";
    const runStderr = run.stderr || "";
    const runExitCode = typeof run.code === "number" ? run.code : 0;
    const runSignal = run.signal || null;

    // Detect Timeout: Piston signals SIGKILL on timeout or notes it in output
    const timedOut =
      runSignal === "SIGKILL" ||
      runOutput.toLowerCase().includes("timed out") ||
      runStderr.toLowerCase().includes("timed out") ||
      executionTimeMs >= runTimeout + 2000;

    // Detect Runtime Error: Non-zero exit code or terminating fatal signal
    const isRuntimeError =
      !timedOut &&
      (runExitCode !== 0 ||
        (runSignal !== null && runSignal !== "SIGKILL") ||
        runStderr.toLowerCase().includes("segmentation fault") ||
        runStderr.toLowerCase().includes("core dumped") ||
        runStderr.toLowerCase().includes("floating point exception"));

    return {
      success: true,
      compiled: true,
      status: timedOut
        ? "time_limit"
        : isRuntimeError
        ? "runtime_error"
        : "executed",
      compileOutput: compileOutput,
      stdout: runStdout,
      stderr: runStderr,
      exitCode: runExitCode,
      signal: runSignal,
      executionTimeMs,
      timedOut,
      runtimeError: isRuntimeError,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === "AbortError";
    return {
      success: false,
      error: isTimeout
        ? `Execution request timed out after ${totalTimeoutMs}ms`
        : `Could not connect to Piston execution service at ${PISTON_URL}: ${error.message}`,
      executionTimeMs: Date.now() - startTime,
      isSystemError: true,
    };
  }
};
