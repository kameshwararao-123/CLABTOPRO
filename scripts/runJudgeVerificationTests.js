/**
 * CLABTOPro - Deterministic Judge Verification Tests
 *
 * Verifies all 7 required test cases:
 * 1. Accepted (Addition: 10 20 -> 30)
 * 2. Wrong Answer (Multiplication: 10 20 -> 200 instead of 30)
 * 3. Compilation Error (Invalid C syntax)
 * 4. Runtime Error (Division by zero / SIGFPE)
 * 5. Time Limit Exceeded (Infinite loop)
 * 6. Multiple Test Cases (5/5 accepted vs 3/5 wrong_answer)
 * 7. Piston Unavailable (Ensures system error is thrown and NOT marked as wrong_answer)
 */

import { normalizeOutput, judgeSubmission, ExecutionServiceError } from "../backend/services/judgeService.js";
import { checkPistonHealth } from "../backend/services/pistonService.js";

const runTests = async () => {
  console.log("===============================================================");
  console.log("   CLABTOPro Deterministic Judge - Official Verification Suite ");
  console.log("===============================================================\n");

  let passed = 0;
  let failed = 0;

  const assertEqual = (name, actual, expected) => {
    if (actual === expected) {
      console.log(`  ✓ [PASS] ${name} (Result: ${actual})`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name} - Expected: "${expected}", Received: "${actual}"`);
      failed++;
    }
  };

  // -------------------------------------------------------------
  // Output Normalization Unit Verification
  // -------------------------------------------------------------
  console.log("--- Output Normalization Tests ---");
  assertEqual("Normalize CRLF to LF", normalizeOutput("30\r\n"), "30");
  assertEqual("Trim trailing spaces per line", normalizeOutput("30   \n40   "), "30\n40");
  assertEqual("Trim multiple trailing blank lines", normalizeOutput("30\n\n\n"), "30");
  assertEqual("Preserve internal line breaks", normalizeOutput("line1\nline2"), "line1\nline2");
  assertEqual("Null / undefined safe handling", normalizeOutput(null), "");

  // -------------------------------------------------------------
  // Test Piston Connectivity
  // -------------------------------------------------------------
  console.log("\n--- Checking Piston Engine Status ---");
  const pistonHealth = await checkPistonHealth();
  console.log("Piston Health:", pistonHealth);

  const isPistonAvailable = pistonHealth.connected;

  if (!isPistonAvailable) {
    console.warn("\n⚠️  Local Piston container (http://localhost:2000) is not currently running.");
    console.warn("   Simulating and verifying judgment logic, normalization, and failure guards.\n");
  }

  // -------------------------------------------------------------
  // TEST 7: Piston Unavailable Guard (Guaranteed not to mark as wrong_answer)
  // -------------------------------------------------------------
  console.log("\n--- TEST 7: Piston Unavailable System Error Guard ---");
  try {
    // Force invalid host to verify fallback guard
    const oldPistonUrl = process.env.PISTON_URL;
    process.env.PISTON_URL = "http://127.0.0.1:19999"; // Non-existent port

    let caughtError = null;
    try {
      await judgeSubmission({
        code: "int main(){ return 0; }",
        testCases: [{ input: "1", expectedOutput: "1", isHidden: false }],
        problemTitle: "Test Problem",
      });
    } catch (err) {
      caughtError = err;
    }

    process.env.PISTON_URL = oldPistonUrl;

    if (caughtError && caughtError instanceof ExecutionServiceError) {
      console.log(`  ✓ [PASS] Test 7: Throws ExecutionServiceError (Message: "${caughtError.message}")`);
      console.log("  ✓ [PASS] Test 7: Submission was NOT marked as wrong_answer.");
      passed += 2;
    } else {
      console.error("  ✗ [FAIL] Test 7: Did not throw ExecutionServiceError when Piston was offline.");
      failed++;
    }
  } catch (err) {
    console.error("  ✗ [FAIL] Test 7 failed unexpectedly:", err.message);
    failed++;
  }

  // If live Piston is online, execute full end-to-end sandbox tests
  if (isPistonAvailable) {
    console.log("\n--- Live Piston Sandbox Tests ---");

    // -----------------------------------------------------------
    // TEST 1: Accepted (Addition)
    // -----------------------------------------------------------
    console.log("\n--- TEST 1: Accepted Submission ---");
    const codeAccepted = `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}`;
    const result1 = await judgeSubmission({
      code: codeAccepted,
      testCases: [{ input: "10 20", expectedOutput: "30", isHidden: false }],
      problemTitle: "Sum of Two Numbers",
    });
    assertEqual("Test 1 Verdict", result1.status, "accepted");
    assertEqual("Test 1 Passed Count", result1.testCasesPassed, 1);

    // -----------------------------------------------------------
    // TEST 2: Wrong Answer (Multiplication instead of addition)
    // -----------------------------------------------------------
    console.log("\n--- TEST 2: Wrong Answer Submission ---");
    const codeWrongAnswer = `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a * b); // Bug: Multiplication instead of addition
    }
    return 0;
}`;
    const result2 = await judgeSubmission({
      code: codeWrongAnswer,
      testCases: [{ input: "10 20", expectedOutput: "30", isHidden: false }],
      problemTitle: "Sum of Two Numbers",
    });
    assertEqual("Test 2 Verdict", result2.status, "wrong_answer");
    assertEqual("Test 2 Passed Count", result2.testCasesPassed, 0);

    // -----------------------------------------------------------
    // TEST 3: Compilation Error (Invalid C Syntax)
    // -----------------------------------------------------------
    console.log("\n--- TEST 3: Compilation Error Submission ---");
    const codeCompileError = `#include <stdio.h>
int main() {
    syntax_error_here();;;
    return 0
}`; // Missing semicolon and undefined symbol
    const result3 = await judgeSubmission({
      code: codeCompileError,
      testCases: [{ input: "10 20", expectedOutput: "30", isHidden: false }],
      problemTitle: "Syntax Bug",
    });
    assertEqual("Test 3 Verdict", result3.status, "compile_error");
    assertEqual("Test 3 Passed Count", result3.testCasesPassed, 0);
    if (result3.compilerOutput && result3.compilerOutput.length > 0) {
      console.log("  ✓ [PASS] Test 3: Compiler diagnostic output successfully captured.");
      passed++;
    } else {
      console.error("  ✗ [FAIL] Test 3: Compiler output missing.");
      failed++;
    }

    // -----------------------------------------------------------
    // TEST 4: Runtime Error (Division by Zero)
    // -----------------------------------------------------------
    console.log("\n--- TEST 4: Runtime Error Submission ---");
    const codeRuntimeError = `#include <stdio.h>
int main() {
    int a = 10;
    int b = 0;
    printf("%d\\n", a / b); // Division by zero triggers SIGFPE
    return 0;
}`;
    const result4 = await judgeSubmission({
      code: codeRuntimeError,
      testCases: [{ input: "10 20", expectedOutput: "30", isHidden: false }],
      problemTitle: "Crash Bug",
    });
    assertEqual("Test 4 Verdict", result4.status, "runtime_error");

    // -----------------------------------------------------------
    // TEST 5: Infinite Loop (Time Limit Exceeded)
    // -----------------------------------------------------------
    console.log("\n--- TEST 5: Time Limit Exceeded (Infinite Loop) ---");
    const codeInfiniteLoop = `#include <stdio.h>
int main() {
    volatile int x = 0;
    while (1) {
        x++;
    }
    return 0;
}`;
    const result5 = await judgeSubmission({
      code: codeInfiniteLoop,
      testCases: [{ input: "10 20", expectedOutput: "30", isHidden: false }],
      problemTitle: "Loop Bug",
    });
    assertEqual("Test 5 Verdict", result5.status, "time_limit");

    // -----------------------------------------------------------
    // TEST 6: Multiple Test Cases (5/5 vs 3/5)
    // -----------------------------------------------------------
    console.log("\n--- TEST 6: Multiple Test Cases (5/5 vs 3/5) ---");
    const multiTestCases = [
      { input: "1 2", expectedOutput: "3", isHidden: false },
      { input: "10 20", expectedOutput: "30", isHidden: false },
      { input: "0 0", expectedOutput: "0", isHidden: false },
      { input: "-5 5", expectedOutput: "0", isHidden: true },
      { input: "100 200", expectedOutput: "300", isHidden: true },
    ];

    // Subcase 6A: Correct solution -> 5/5 Accepted
    const result6A = await judgeSubmission({
      code: codeAccepted,
      testCases: multiTestCases,
      problemTitle: "Multi-test Addition",
    });
    assertEqual("Subcase 6A Verdict (5/5)", result6A.status, "accepted");
    assertEqual("Subcase 6A Passed Tests", result6A.testCasesPassed, 5);
    assertEqual("Subcase 6A Total Tests", result6A.totalTestCases, 5);

    // Subcase 6B: Code that only works for positive numbers < 100 -> 3/5 Wrong Answer
    const codePartial = `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        if (a < 0 || a >= 100) {
            printf("-1\\n"); // Fails on test 4 and test 5
        } else {
            printf("%d\\n", a + b);
        }
    }
    return 0;
}`;
    const result6B = await judgeSubmission({
      code: codePartial,
      testCases: multiTestCases,
      problemTitle: "Partial Solution",
    });
    assertEqual("Subcase 6B Verdict (3/5)", result6B.status, "wrong_answer");
    assertEqual("Subcase 6B Passed Tests", result6B.testCasesPassed, 3);
    assertEqual("Subcase 6B Total Tests", result6B.totalTestCases, 5);
  }

  // -------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------
  console.log("\n===============================================================");
  console.log(`   Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log("===============================================================");

  if (failed > 0) {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});
