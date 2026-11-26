/**
 * Local GCC Execution Engine
 * Provides deterministic C compilation and execution when the isolated
 * Piston Docker container is not available locally.
 *
 * Implements strict timeouts, memory/output caps, and sandboxed temporary directories.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { sanitizeCompilerOutput } from "../utils/compilerParser.js";

const execAsync = promisify(exec);

const DEFAULT_RUN_TIMEOUT_MS = parseInt(process.env.EXECUTION_TIMEOUT_MS || "3000", 10);
const DEFAULT_COMPILE_TIMEOUT_MS = 8000;
const MAX_OUTPUT_SIZE = 65536; // 64KB cap to prevent buffer flooding

/**
 * Checks if local GCC is available on the host system.
 */
export const checkLocalGccHealth = async () => {
  try {
    const { stdout } = await execAsync("gcc --version", { timeout: 2500 });
    const versionLine = (stdout || "").split("\n")[0].trim();
    return {
      connected: true,
      compiler: "gcc",
      version: versionLine,
      cInstalled: true,
    };
  } catch (error) {
    return {
      connected: false,
      compiler: "gcc",
      error: `Local GCC not available: ${error.message}`,
      cInstalled: false,
    };
  }
};

/**
 * Compiles C source code once into an isolated temporary directory.
 * Caller is responsible for cleaning up `tempDir` when `compiled === true`.
 */
export const compileLocalGcc = async ({
  code,
  compileTimeout = DEFAULT_COMPILE_TIMEOUT_MS,
}) => {
  if (!code || typeof code !== "string" || !code.trim()) {
    throw new Error("Source code cannot be empty");
  }

  if (code.length > MAX_OUTPUT_SIZE) {
    throw new Error("Source code exceeds 64KB maximum limit");
  }

  const startTime = Date.now();
  let tempDir = null;

  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clabto-exec-"));
    const srcFile = path.join(tempDir, "solution.c");
    const binFile = path.join(tempDir, "solution");

    await fs.writeFile(srcFile, code, "utf-8");

    try {
      const compileCmd = `gcc -O2 -Wall -Wno-unused-result -std=c11 "${srcFile}" -o "${binFile}" -lm`;
      const { stdout: cStdout, stderr: cStderr } = await execAsync(compileCmd, {
        cwd: tempDir,
        timeout: compileTimeout,
      });
      const compileOutput = sanitizeCompilerOutput(cStderr || cStdout || "");
      return {
        success: true,
        compiled: true,
        status: "compiled",
        compileOutput,
        tempDir,
        binFile,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (compileErr) {
      const errOut = sanitizeCompilerOutput(
        compileErr.stderr || compileErr.stdout || compileErr.message || ""
      );
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = null;
      return {
        success: true,
        compiled: false,
        status: "compile_error",
        compileOutput: errOut || "Compilation failed.",
        stdout: "",
        stderr: errOut,
        exitCode: compileErr.code || 1,
        signal: null,
        executionTimeMs: Date.now() - startTime,
        timedOut: false,
        runtimeError: false,
        tempDir: null,
        binFile: null,
      };
    }
  } catch (systemError) {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    return {
      success: false,
      compiled: false,
      error: `Execution engine error: ${systemError.message}`,
      executionTimeMs: Date.now() - startTime,
      isSystemError: true,
      tempDir: null,
      binFile: null,
    };
  }
};

/**
 * Executes an already-compiled local binary against a single stdin input.
 */
export const runCompiledLocalGcc = async ({
  binFile,
  tempDir,
  stdin = "",
  runTimeout = DEFAULT_RUN_TIMEOUT_MS,
  compileOutput = "",
}) => {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const isLinux = os.platform() === "linux";
    const cpuLimitSec = Math.max(2, Math.ceil(runTimeout / 1000) + 1);
    const spawnCmd = isLinux ? "/bin/sh" : binFile;
    const spawnArgs = isLinux
      ? [
          "-c",
          `ulimit -t ${cpuLimitSec} && ulimit -v 262144 && ulimit -f 1024 && ulimit -c 0 && exec "${binFile}"`,
        ]
      : [];

    const child = spawn(spawnCmd, spawnArgs, {
      cwd: tempDir,
      detached: os.platform() !== "win32",
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const killProcessGroup = () => {
      try {
        if (os.platform() !== "win32" && child.pid) {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        // Process might already be dead
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup();
    }, runTimeout);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT_SIZE) {
        stdout += chunk.toString("utf-8");
      }
    });

    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT_SIZE) {
        stderr += chunk.toString("utf-8");
      }
    });

    child.stdin.on("error", (err) => {
      if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_DESTROYED") {
        console.warn(`[LocalGcc] stdin write error: ${err.message}`);
      }
    });
    child.stdout.on("error", () => {});
    child.stderr.on("error", () => {});

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      killProcessGroup();

      const executionTimeMs = Date.now() - startTime;
      const isRuntimeError =
        !timedOut &&
        (exitCode !== 0 ||
          signal === "SIGSEGV" ||
          signal === "SIGFPE" ||
          signal === "SIGABRT" ||
          stderr.toLowerCase().includes("segmentation fault") ||
          stderr.toLowerCase().includes("core dumped") ||
          stderr.toLowerCase().includes("floating point exception"));

      resolve({
        success: true,
        compiled: true,
        status: timedOut
          ? "time_limit"
          : isRuntimeError
          ? "runtime_error"
          : "executed",
        compileOutput,
        stdout,
        stderr,
        exitCode: typeof exitCode === "number" ? exitCode : 0,
        signal: signal || null,
        executionTimeMs,
        timedOut,
        runtimeError: isRuntimeError,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: `Execution process error: ${err.message}`,
        executionTimeMs: Date.now() - startTime,
        isSystemError: true,
      });
    });

    try {
      if (stdin !== undefined && stdin !== null && String(stdin).length > 0) {
        if (!child.stdin.destroyed && child.stdin.writable) {
          child.stdin.write(String(stdin), () => {});
        }
      }
      if (!child.stdin.destroyed) {
        child.stdin.end();
      }
    } catch {
      // Silently ignore stream errors if child process closed early
    }
  });
};

/**
 * Compiles C code ONCE and executes the compiled binary sequentially across all test cases.
 */
export const executeLocalGccBatch = async ({
  code,
  testCases = [],
  runTimeout = DEFAULT_RUN_TIMEOUT_MS,
  compileTimeout = DEFAULT_COMPILE_TIMEOUT_MS,
}) => {
  const compileResult = await compileLocalGcc({ code, compileTimeout });
  if (!compileResult.success || !compileResult.compiled) {
    return { compileResult, results: [] };
  }

  const { tempDir, binFile, compileOutput } = compileResult;
  const results = [];

  try {
    for (const tc of testCases) {
      const tcTimeout = Number(tc?.timeLimitMs) > 0 ? Number(tc.timeLimitMs) : runTimeout;
      const runResult = await runCompiledLocalGcc({
        binFile,
        tempDir,
        stdin: tc?.input ?? "",
        runTimeout: tcTimeout,
        compileOutput,
      });
      results.push(runResult);
    }
    return { compileResult, results };
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
};

/**
 * Compiles and executes C code locally using host GCC (single input).
 */
export const executeLocalGcc = async ({
  code,
  stdin = "",
  runTimeout = DEFAULT_RUN_TIMEOUT_MS,
  compileTimeout = DEFAULT_COMPILE_TIMEOUT_MS,
}) => {
  const compileResult = await compileLocalGcc({ code, compileTimeout });
  if (!compileResult.success || !compileResult.compiled) {
    return compileResult;
  }

  const { tempDir, binFile, compileOutput } = compileResult;
  try {
    return await runCompiledLocalGcc({
      binFile,
      tempDir,
      stdin,
      runTimeout,
      compileOutput,
    });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
};
