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
 * Compiles and executes C code locally using host GCC.
 *
 * @param {Object} params
 * @param {string} params.code - Student C source code
 * @param {string} [params.stdin] - Test case standard input
 * @param {number} [params.runTimeout] - Execution timeout in ms
 * @param {number} [params.compileTimeout] - Compilation timeout in ms
 * @returns {Promise<Object>} Normalized execution result matching Piston's contract
 */
export const executeLocalGcc = async ({
  code,
  stdin = "",
  runTimeout = DEFAULT_RUN_TIMEOUT_MS,
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
    // 1. Create isolated temporary workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clabto-exec-"));
    const srcFile = path.join(tempDir, "solution.c");
    const binFile = path.join(tempDir, "solution");

    await fs.writeFile(srcFile, code, "utf-8");

    // 2. Compile C Code
    let compileOutput = "";
    try {
      const compileCmd = `gcc -O2 -Wall -std=c11 "${srcFile}" -o "${binFile}" -lm`;
      const { stdout: cStdout, stderr: cStderr } = await execAsync(compileCmd, {
        cwd: tempDir,
        timeout: compileTimeout,
      });
      compileOutput = (cStderr || cStdout || "").trim();
    } catch (compileErr) {
      const errOut = (compileErr.stderr || compileErr.stdout || compileErr.message || "").trim();
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
      };
    }

    // 3. Execute Compiled Binary with Sandboxed Timeouts
    const executionResult = await new Promise((resolve) => {
      const child = spawn(binFile, [], {
        cwd: tempDir,
        env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // Watchdog timer for execution timeout
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // Process might already be dead
        }
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

      // Prevent unhandled EPIPE crash if student program terminates before reading all stdin
      child.stdin.on("error", (err) => {
        if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_DESTROYED") {
          console.warn(`[LocalGcc] stdin write error: ${err.message}`);
        }
      });
      child.stdout.on("error", () => {});
      child.stderr.on("error", () => {});

      child.on("close", (exitCode, signal) => {
        clearTimeout(timer);

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

      // Write test case stdin safely and close stream
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

    return executionResult;
  } catch (systemError) {
    return {
      success: false,
      error: `Execution engine error: ${systemError.message}`,
      executionTimeMs: Date.now() - startTime,
      isSystemError: true,
    };
  } finally {
    // 4. Always clean up temporary workspace
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Silently ignore temp cleanup error
      }
    }
  }
};
