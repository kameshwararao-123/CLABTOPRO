/**
 * Verification Suite for CLABTOPRO Code Editor Upgrades
 * Tests:
 * 1. Deterministic C Formatter (indentation, braces, loops, strings, comments, pointers)
 * 2. GCC Compiler Diagnostic Parser (multiple formats, multi-error, linker no-line guard)
 * 3. Live Local GCC Run & Judge execution (compile error line numbers, runtime errors, sample & custom runs)
 */

import assert from "node:assert/strict";
import { formatCCode } from "../frontend/src/utils/cFormatter.js";
import { parseCompilerDiagnostics } from "../frontend/src/utils/compilerDiagnostics.js";
import { parseGccDiagnostics, sanitizeCompilerOutput } from "../backend/utils/compilerParser.js";
import { judgeSubmission, runCCode } from "../backend/services/judgeService.js";

let passed = 0;
let failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
};

console.log("=== 1. C Formatter Tests ===");

await test("Formats unindented main/if example cleanly", () => {
  const input = `#include <stdio.h>
int main(){
int a=10;
if(a>5){
printf("Greater");
}
return 0;
}`;
  const expected = `#include <stdio.h>

int main() {
    int a = 10;

    if (a > 5) {
        printf("Greater");
    }

    return 0;
}`;
  assert.equal(formatCCode(input), expected);
});

await test("Formats nested loops, else-if, pointers, and strings without altering tokens", () => {
  const input = `#include <stdio.h>
int main(){
int arr[]={1,2,3};
for(int i=0;i<3;i++){
for(int j=0;j<2;j++){
if(arr[i]>1){printf("{hi;}\\n");}else if(arr[i]==1){printf("one");}
}
}
int *p=&arr[0];
return 0;
}`;
  const formatted = formatCCode(input);
  assert.match(formatted, /for \(int i = 0; i < 3; i\+\+\) \{/);
  assert.match(formatted, /\n        for \(int j = 0; j < 2; j\+\+\) \{/);
  assert.match(formatted, /printf\("\{hi;\}\\n"\);/);
  assert.match(formatted, /\} else if \(arr\[i\] == 1\) \{/);
  assert.match(formatted, /int \*p = &arr\[0\];/);
});

console.log("\n=== 2. Compiler Diagnostic Parser Tests ===");

await test("Strips /tmp/clabto-exec-* prefix cleanly", () => {
  const raw = "/tmp/clabto-exec-a1B2c3/solution.c:8:5: error: expected ';' before '}' token";
  const cleaned = sanitizeCompilerOutput(raw);
  assert.equal(cleaned, "solution.c:8:5: error: expected ';' before '}' token");
});

await test("Parses standard GCC line:col error, line-only error, and warnings", () => {
  const raw = [
    "/tmp/clabto-exec-xyz/solution.c:4:12: warning: unused variable 'x' [-Wunused-variable]",
    "/tmp/clabto-exec-xyz/solution.c:8:5: error: expected ';' before '}' token",
    "solution.c:10: error: 'y' undeclared (first use in this function)",
  ].join("\n");

  const backendDiags = parseGccDiagnostics(raw);
  const frontendDiags = parseCompilerDiagnostics(raw);

  assert.equal(backendDiags.length, 3);
  assert.equal(frontendDiags.length, 3);

  assert.deepEqual(
    {
      file: backendDiags[0].file,
      line: backendDiags[0].line,
      column: backendDiags[0].column,
      severity: backendDiags[0].severity,
    },
    { file: "solution.c", line: 4, column: 12, severity: "warning" }
  );

  assert.deepEqual(
    {
      line: backendDiags[1].line,
      column: backendDiags[1].column,
      severity: backendDiags[1].severity,
    },
    { line: 8, column: 5, severity: "error" }
  );

  assert.equal(backendDiags[2].line, 10);
  assert.equal(backendDiags[2].column, 1);
});

await test("Never fabricates line numbers for linker errors", () => {
  const raw = `/usr/bin/ld: /tmp/ccXYZ.o: in function 'main':
solution.c:(.text+0x15): undefined reference to 'missingFunc'
collect2: error: ld returned 1 exit status`;

  const diags = parseGccDiagnostics(raw);
  assert.equal(diags.length, 1);
  assert.equal(diags[0].line, null);
  assert.equal(diags[0].severity, "error");
  assert.match(diags[0].message, /missingFunc/);
});

console.log("\n=== 3. Live GCC Compile, Run & Judge Tests ===");

await test("Detects missing semicolon compile error with exact line number", async () => {
  const code = `#include <stdio.h>
int main() {
    int a = 5
    printf("%d\\n", a);
    return 0;
}`;
  const res = await runCCode({ code, mode: "custom", customInput: "" });
  assert.equal(res.status, "compile_error");
  assert.ok(res.diagnostics.length > 0);
  assert.ok(res.diagnostics.some((d) => d.line === 3 || d.line === 4));
  assert.ok(!res.compilerOutput.includes("/tmp/clabto-exec-"));
});

await test("Detects undeclared variable & missing header errors cleanly", async () => {
  const code = `int main() {
    printf("%d", unknownVar);
    return 0;
}`;
  const res = await runCCode({ code, mode: "custom", customInput: "" });
  assert.equal(res.status, "compile_error");
  assert.ok(res.diagnostics.some((d) => d.severity === "error" && Number.isInteger(d.line)));
});

await test("Detects conflicting function declaration with line number", async () => {
  const code = `#include <stdio.h>
int foo(int x);
double foo(int x) { return x * 1.0; }
int main() { return 0; }`;
  const res = await runCCode({ code, mode: "custom", customInput: "" });
  assert.equal(res.status, "compile_error");
  assert.ok(res.diagnostics.some((d) => d.line === 3));
});

await test("Runtime error (SIGFPE / division by zero or exit != 0) does NOT fabricate source line errors", async () => {
  const code = `#include <stdio.h>
int main() {
    return 2;
}`;
  const res = await runCCode({ code, mode: "custom", customInput: "" });
  assert.equal(res.status, "runtime_error");
  assert.equal(res.diagnostics.filter((d) => d.severity === "error").length, 0);
});

await test("Custom stdin run executes program and returns stdout", async () => {
  const code = `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}`;
  const res = await runCCode({ code, mode: "custom", customInput: "15 27" });
  assert.equal(res.status, "executed");
  assert.equal(res.stdout.trim(), "42");
});

await test("Sample test run only executes visible test cases and preserves hidden tests", async () => {
  const code = `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`;
  const fakeProblem = {
    title: "Add Numbers",
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "100 200", expectedOutput: "300", isHidden: true },
    ],
  };
  const res = await runCCode({ code, mode: "sample", problem: fakeProblem });
  assert.equal(res.status, "accepted");
  assert.equal(res.totalTestCases, 1);
  assert.equal(res.testCasesPassed, 1);
});

await test("Judge submission detects Wrong Answer vs Accepted cleanly", async () => {
  const wrongCode = `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a * b);
    return 0;
}`;
  const resWrong = await judgeSubmission({
    code: wrongCode,
    testCases: [{ input: "2 3", expectedOutput: "5", isHidden: false }],
  });
  assert.equal(resWrong.status, "wrong_answer");
  assert.equal(resWrong.testCasesPassed, 0);
});

await test("Sample test run always checks problem.sampleInput/sampleOutput even with hidden testCases", async () => {
  const code = `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`;
  const wrongCode = `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a * b);
    return 0;
}`;
  const problemWithSampleAndVisible = {
    title: "Add Numbers",
    sampleInput: "10 20",
    sampleOutput: "30",
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "100 200", expectedOutput: "300", isHidden: true },
    ],
  };

  const passRes = await runCCode({ code, mode: "sample", problem: problemWithSampleAndVisible });
  assert.equal(passRes.status, "accepted");
  assert.equal(passRes.totalTestCases, 2);
  assert.equal(passRes.testCasesPassed, 2);
  assert.equal(passRes.testCases[0].input, "10 20");
  assert.equal(passRes.testCases[0].status, "passed");

  const failRes = await runCCode({ code: wrongCode, mode: "sample", problem: problemWithSampleAndVisible });
  assert.equal(failRes.status, "wrong_answer");
  assert.equal(failRes.testCasesPassed, 0);
  assert.equal(failRes.testCases[0].status, "failed");
  assert.equal(failRes.testCases[0].expectedOutput, "30");
  assert.equal(failRes.testCases[0].actualOutput.trim(), "200");
});

await test("Custom mode returns sampleCheck when customInput matches problem.sampleInput", async () => {
  const problem = {
    title: "Add Numbers",
    sampleInput: "4 6",
    sampleOutput: "10",
  };
  const passCode = `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`;
  const failCode = `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a - b);
    return 0;
}`;

  const passCustom = await runCCode({ code: passCode, mode: "custom", customInput: "4 6", problem });
  assert.equal(passCustom.status, "executed");
  assert.ok(passCustom.sampleCheck);
  assert.equal(passCustom.sampleCheck.matched, true);
  assert.equal(passCustom.sampleCheck.status, "passed");
  assert.equal(passCustom.sampleCheck.source, "sample");

  const failCustom = await runCCode({ code: failCode, mode: "custom", customInput: "4 6", problem });
  assert.equal(failCustom.status, "executed");
  assert.ok(failCustom.sampleCheck);
  assert.equal(failCustom.sampleCheck.matched, false);
  assert.equal(failCustom.sampleCheck.status, "failed");
  assert.equal(failCustom.sampleCheck.expectedOutput, "10");
  assert.equal(failCustom.sampleCheck.actualOutput.trim(), "-2");
});

await test("Custom mode checks customExpectedOutput AND also checks visible sample test cases", async () => {
  const problem = {
    title: "Add Numbers",
    sampleInput: "2 3",
    sampleOutput: "5",
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "100 200", expectedOutput: "300", isHidden: true },
    ],
  };
  const passCode = `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`;

  const passCustom = await runCCode({
    code: passCode,
    mode: "custom",
    customInput: "7 8",
    customExpectedOutput: "15",
    problem,
  });
  assert.equal(passCustom.status, "executed");
  assert.equal(passCustom.stdout.trim(), "15");
  assert.ok(passCustom.sampleCheck);
  assert.equal(passCustom.sampleCheck.matched, true);
  assert.equal(passCustom.sampleCheck.status, "passed");
  assert.equal(passCustom.sampleCheck.source, "user");
  assert.ok(passCustom.sampleResults);
  assert.equal(passCustom.sampleResults.status, "accepted");
  assert.equal(passCustom.sampleResults.totalTestCases, 1);
  assert.equal(passCustom.sampleResults.testCasesPassed, 1);

  const wrongCustomExpected = await runCCode({
    code: passCode,
    mode: "custom",
    customInput: "7 8",
    customExpectedOutput: "99",
    problem,
  });
  assert.equal(wrongCustomExpected.stdout.trim(), "15");
  assert.equal(wrongCustomExpected.sampleCheck.matched, false);
  assert.equal(wrongCustomExpected.sampleCheck.status, "failed");
  assert.equal(wrongCustomExpected.sampleResults.status, "accepted");
});

await test("Offline Problem Oracle predicts expected output & analyzes mismatches for arbitrary custom input", async () => {
  const sumProblem = {
    title: "Sum of Two Numbers",
    description: "Read two integers and print their sum.",
    sampleInput: "2 3",
    sampleOutput: "5",
    testCases: [{ input: "2 3", expectedOutput: "5", isHidden: false }],
  };
  const factorialProblem = {
    title: "Factorial of a Number",
    description: "Find factorial of N.",
    sampleInput: "4",
    sampleOutput: "24",
  };
  const evenOddProblem = {
    title: "Even or Odd",
    description: "Check whether the given number is even or odd.",
    sampleInput: "4",
    sampleOutput: "Even",
  };

  const sumCorrect = `#include <stdio.h>
int main() { int a,b; scanf("%d %d",&a,&b); printf("%d\\n", a+b); return 0; }`;
  const sumOffByOne = `#include <stdio.h>
int main() { int a,b; scanf("%d %d",&a,&b); printf("%d\\n", a+b+1); return 0; }`;
  const factCode = `#include <stdio.h>
int main() { int n,f=1; scanf("%d",&n); for(int i=1;i<=n;i++) f*=i; printf("%d\\n",f); return 0; }`;
  const oddCode = `#include <stdio.h>
int main() { int n; scanf("%d",&n); printf(n%2==0?"Even":"Odd"); return 0; }`;

  // Predict without customExpectedOutput on arbitrary custom input "12 30"
  const sumOk = await runCCode({ code: sumCorrect, mode: "custom", customInput: "12 30", problem: sumProblem });
  assert.equal(sumOk.sampleCheck.source, "problem_oracle");
  assert.equal(sumOk.sampleCheck.matched, true);
  assert.equal(sumOk.sampleCheck.expectedOutput, "42");
  assert.ok(sumOk.outputAnalysis.includes("Added inputs 12 + 30 = 42"));

  // Wrong code on arbitrary custom input triggers mismatch analysis
  const sumWrong = await runCCode({ code: sumOffByOne, mode: "custom", customInput: "12 30", problem: sumProblem });
  assert.equal(sumWrong.sampleCheck.source, "problem_oracle");
  assert.equal(sumWrong.sampleCheck.matched, false);
  assert.equal(sumWrong.sampleCheck.expectedOutput, "42");
  assert.equal(sumWrong.sampleCheck.actualOutput.trim(), "43");
  assert.ok(sumWrong.outputAnalysis.includes("Off-by-one error"));

  // Factorial prediction for N = 6 -> 720
  const factRun = await runCCode({ code: factCode, mode: "custom", customInput: "6", problem: factorialProblem });
  assert.equal(factRun.sampleCheck.matched, true);
  assert.equal(factRun.sampleCheck.expectedOutput, "720");

  // Predicate label prediction for odd number 7 -> "Odd"
  const oddRun = await runCCode({ code: oddCode, mode: "custom", customInput: "7", problem: evenOddProblem });
  assert.equal(oddRun.sampleCheck.matched, true);
  assert.equal(oddRun.sampleCheck.expectedOutput, "Odd");

  // Safety guard: conflicting sampleOutput prevents false offline oracle prediction
  const conflictingProblem = {
    title: "Sum of Two Numbers Custom Variant",
    description: "Special problem where sum is doubled.",
    sampleInput: "2 3",
    sampleOutput: "10",
  };
  const unverified = await runCCode({ code: sumCorrect, mode: "custom", customInput: "7 8", problem: conflictingProblem });
  assert.equal(unverified.sampleCheck, undefined);
  assert.ok(unverified.outputAnalysis.includes("Enter an Expected Output"));
});

await test("Real DB problems (Square, Cube, Prime Number or Not) predict custom input '10' accurately", async () => {
  const squareProblem = {
    title: "Find Square of a Number",
    description: "Let the number given is n.\n\nYou have to find the square of a number",
    sampleInput: "5",
    sampleOutput: "25",
    testCases: [
      { input: "9", expectedOutput: "81", isHidden: true },
      { input: "7", expectedOutput: "49", isHidden: true },
    ],
  };
  const cubeProblem = {
    title: "Find cube of a number",
    description: "If the number is a.\nPrint its cube a*a*a",
    sampleInput: "4",
    sampleOutput: "64",
    testCases: [
      { input: "7", expectedOutput: "343", isHidden: true },
      { input: "5", expectedOutput: "125", isHidden: true },
    ],
  };
  const primeProblem = {
    title: "Find Prime Number or Not",
    description: "Let the given number be n\n\nFind n is prime or or not",
    sampleInput: "9",
    sampleOutput: "Not Prime Number",
    testCases: [
      { input: "8", expectedOutput: "Not Prime Number", isHidden: true },
      { input: "7", expectedOutput: "Prime Number", isHidden: true },
    ],
  };

  const sqRight = `#include <stdio.h>
int main(){int n;scanf("%d",&n);printf("%d\\n",n*n);return 0;}`;
  const sqWrong = `#include <stdio.h>
int main(){int n;scanf("%d",&n);printf("%d\\n",n+n);return 0;}`;
  const cubeRight = `#include <stdio.h>
int main(){int n;scanf("%d",&n);printf("%d\\n",n*n*n);return 0;}`;
  const primeRight = `#include <stdio.h>
int main(){int n,p=1;scanf("%d",&n);if(n<2)p=0;for(int i=2;i*i<=n;i++)if(n%i==0){p=0;break;}printf(p?"Prime Number":"Not Prime Number");return 0;}`;

  const sqOk = await runCCode({ code: sqRight, mode: "custom", customInput: "10", problem: squareProblem });
  assert.equal(sqOk.sampleCheck.matched, true);
  assert.equal(sqOk.sampleCheck.expectedOutput, "100");
  assert.equal(sqOk.sampleCheck.actualOutput.trim(), "100");

  const sqBad = await runCCode({ code: sqWrong, mode: "custom", customInput: "10", problem: squareProblem });
  assert.equal(sqBad.sampleCheck.matched, false);
  assert.equal(sqBad.sampleCheck.expectedOutput, "100");
  assert.equal(sqBad.sampleCheck.actualOutput.trim(), "20");
  assert.ok(sqBad.outputAnalysis.includes("expected 100"));

  const cubeOk = await runCCode({ code: cubeRight, mode: "custom", customInput: "10", problem: cubeProblem });
  assert.equal(cubeOk.sampleCheck.matched, true);
  assert.equal(cubeOk.sampleCheck.expectedOutput, "1000");

  const prime10 = await runCCode({ code: primeRight, mode: "custom", customInput: "10", problem: primeProblem });
  assert.equal(prime10.sampleCheck.matched, true);
  assert.equal(prime10.sampleCheck.expectedOutput, "Not Prime Number");

  const prime11 = await runCCode({ code: primeRight, mode: "custom", customInput: "11", problem: primeProblem });
  assert.equal(prime11.sampleCheck.matched, true);
  assert.equal(prime11.sampleCheck.expectedOutput, "Prime Number");
});

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
