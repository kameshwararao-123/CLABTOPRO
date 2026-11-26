import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  judgeSubmission,
  runCCode,
  normalizeOutput,
} from "../services/judgeService.js";
import { executeLocalGccBatch } from "../services/localGccService.js";

const addProgram = `#include <stdio.h>
int main() {
  int a = 0, b = 0;
  if (scanf("%d %d", &a, &b) == 2) {
    printf("%d\\n", a + b);
  }
  return 0;
}`;

const conditionalFaultProgram = `#include <stdio.h>
#include <stdlib.h>
int main() {
  int x = 0;
  if (scanf("%d", &x) != 1) return 0;
  if (x == 0) {
    abort();
  }
  if (x < 0) {
    while (1) {}
  }
  printf("%d\\n", x * 2);
  return 0;
}`;

test("1 & 2. judgeSubmission compiles C code only ONCE across 5 test cases and isolates inputs/outputs", async () => {
  const origMkdtemp = fs.mkdtemp;
  let mkdtempCalls = 0;
  const createdDirs = [];

  fs.mkdtemp = async (...args) => {
    mkdtempCalls++;
    const dir = await origMkdtemp(...args);
    createdDirs.push(dir);
    return dir;
  };

  try {
    const testCases = [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "10 20", expectedOutput: "30", isHidden: false },
      { input: "0 0", expectedOutput: "0", isHidden: true },
      { input: "-5 5", expectedOutput: "0", isHidden: true },
      { input: "100 200", expectedOutput: "300", isHidden: true },
    ];

    const result = await judgeSubmission({
      code: addProgram,
      testCases,
      problemTitle: "Compile Once Multi-Test",
    });

    assert.equal(mkdtempCalls, 1, "Expected exactly 1 compilation workspace for 5 test cases");
    assert.equal(result.status, "accepted");
    assert.equal(result.testCasesPassed, 5);
    assert.equal(result.totalTestCases, 5);
    assert.deepEqual(
      result.testCaseResults.map((r) => normalizeOutput(r.actualOutput)),
      ["5", "30", "0", "0", "300"]
    );

    // Verify temporary directory was cleaned up
    for (const dir of createdDirs) {
      await assert.rejects(() => fs.access(dir));
    }
  } finally {
    fs.mkdtemp = origMkdtemp;
  }
});

test("3. Compilation failure compiles only once and skips remaining test cases cleanly", async () => {
  const origMkdtemp = fs.mkdtemp;
  let mkdtempCalls = 0;
  const createdDirs = [];

  fs.mkdtemp = async (...args) => {
    mkdtempCalls++;
    const dir = await origMkdtemp(...args);
    createdDirs.push(dir);
    return dir;
  };

  try {
    const result = await judgeSubmission({
      code: `int main() { undefined_symbol = 1; return 0; }`,
      testCases: [
        { input: "1 2", expectedOutput: "3", isHidden: false },
        { input: "3 4", expectedOutput: "7", isHidden: true },
        { input: "5 6", expectedOutput: "11", isHidden: true },
      ],
      problemTitle: "Compile Error Once",
    });

    assert.equal(mkdtempCalls, 1);
    assert.equal(result.status, "compile_error");
    assert.equal(result.testCasesPassed, 0);
    assert.equal(result.totalTestCases, 3);
    assert.equal(result.testCaseResults[0].status, "compile_error");
    assert.equal(result.testCaseResults[1].status, "skipped");
    assert.equal(result.testCaseResults[2].status, "skipped");

    for (const dir of createdDirs) {
      await assert.rejects(() => fs.access(dir));
    }
  } finally {
    fs.mkdtemp = origMkdtemp;
  }
});

test("4 & 5. Runtime error and timeout in individual test cases do not corrupt other test cases", async () => {
  const batch = await executeLocalGccBatch({
    code: conditionalFaultProgram,
    runTimeout: 2000,
    testCases: [
      { input: "5", expectedOutput: "10" },
      { input: "0", expectedOutput: "0" }, // SIGABRT runtime error
      { input: "-1", expectedOutput: "0", timeLimitMs: 300 }, // timeout
      { input: "7", expectedOutput: "14" },
    ],
  });

  assert.equal(batch.compileResult.compiled, true);
  assert.equal(batch.results.length, 4);
  assert.equal(batch.results[0].status, "executed");
  assert.equal(normalizeOutput(batch.results[0].stdout), "10");
  assert.equal(batch.results[1].runtimeError, true);
  assert.equal(batch.results[2].timedOut, true);
  assert.equal(batch.results[3].status, "executed");
  assert.equal(normalizeOutput(batch.results[3].stdout), "14");
});

test("6. Empty input and empty output are handled cleanly", async () => {
  const emptyOutProgram = `#include <stdio.h>
int main() {
  int ch = getchar();
  if (ch == EOF) return 0;
  putchar(ch);
  return 0;
}`;

  const result = await judgeSubmission({
    code: emptyOutProgram,
    testCases: [{ input: "", expectedOutput: "", isHidden: false }],
    problemTitle: "Empty IO",
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.testCasesPassed, 1);
});

test("7. runCCode sample mode compiles once, runs only visible cases, and excludes hidden cases", async () => {
  const origMkdtemp = fs.mkdtemp;
  let mkdtempCalls = 0;

  fs.mkdtemp = async (...args) => {
    mkdtempCalls++;
    return origMkdtemp(...args);
  };

  try {
    const res = await runCCode({
      code: addProgram,
      mode: "sample",
      problem: {
        title: "Add Samples",
        testCases: [
          { input: "1 2", expectedOutput: "3", isHidden: false },
          { input: "4 5", expectedOutput: "9", isHidden: false },
          { input: "99 1", expectedOutput: "SECRET_HIDDEN", isHidden: true },
        ],
      },
    });

    assert.equal(mkdtempCalls, 1, "runCCode sample mode must compile only once");
    assert.equal(res.status, "accepted");
    assert.equal(res.testCasesPassed, 2);
    assert.equal(res.totalTestCases, 2);
    assert.equal(JSON.stringify(res).includes("SECRET_HIDDEN"), false);
  } finally {
    fs.mkdtemp = origMkdtemp;
  }
});

test("8. Piston mock: compile error short-circuits after 1 execute request and multi-test passes independent stdins", async () => {
  const origFetch = globalThis.fetch;
  let executeCalls = 0;
  const seenStdins = [];

  try {
    // Part A: Compile error on Piston -> 1 execute call for 3 test cases
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/v2/runtimes")) {
        return {
          ok: true,
          async json() {
            return [{ language: "c", version: "10.2.0" }];
          },
        };
      }
      executeCalls++;
      return {
        ok: true,
        async json() {
          return {
            compile: { code: 1, stderr: "solution.c:1: error: syntax error" },
            run: {},
          };
        },
      };
    };

    const errRes = await judgeSubmission({
      code: "bad code",
      testCases: [
        { input: "1", expectedOutput: "1", isHidden: false },
        { input: "2", expectedOutput: "2", isHidden: true },
        { input: "3", expectedOutput: "3", isHidden: true },
      ],
      problemTitle: "Piston Compile Error",
    });

    assert.equal(executeCalls, 1);
    assert.equal(errRes.status, "compile_error");
    assert.equal(errRes.testCaseResults[1].status, "skipped");

    // Part B: Passing Piston multi-test -> independent stdin per test case
    executeCalls = 0;
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes("/api/v2/runtimes")) {
        return {
          ok: true,
          async json() {
            return [{ language: "c", version: "10.2.0" }];
          },
        };
      }
      executeCalls++;
      const body = JSON.parse(opts.body);
      seenStdins.push(body.stdin);
      const out = String(Number(body.stdin) * 10);
      return {
        ok: true,
        async json() {
          return {
            compile: { code: 0, output: "" },
            run: { code: 0, stdout: `${out}\n`, stderr: "" },
          };
        },
      };
    };

    const okRes = await judgeSubmission({
      code: "int main(){return 0;}",
      testCases: [
        { input: "2", expectedOutput: "20", isHidden: false },
        { input: "3", expectedOutput: "30", isHidden: true },
      ],
      problemTitle: "Piston Multi-Test",
    });

    assert.equal(executeCalls, 2);
    assert.deepEqual(seenStdins, ["2", "3"]);
    assert.equal(okRes.status, "accepted");
    assert.equal(okRes.testCasesPassed, 2);
  } finally {
    globalThis.fetch = origFetch;
  }
});
