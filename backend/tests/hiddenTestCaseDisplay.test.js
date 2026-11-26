import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeExamCodeSubmissionForStudent } from "../models/ExamCodeSubmission.js";

test("1. sanitizeExamCodeSubmissionForStudent exposes failed hidden test details (statusLabel, actualOutput, error, executionTime) without leaking hidden inputs or expected outputs", () => {
  const rawSubmission = {
    status: "wrong_answer",
    testCasesPassed: 2,
    totalTestCases: 4,
    testCaseResults: [
      {
        testCaseNumber: 1,
        isHidden: false,
        status: "passed",
        input: "2 3",
        expectedOutput: "5",
        actualOutput: "5",
        executionTime: 12,
        error: "",
      },
      {
        testCaseNumber: 2,
        isHidden: true,
        status: "passed",
        input: "SECRET_IN_1",
        expectedOutput: "SECRET_OUT_1",
        actualOutput: "SECRET_OUT_1",
        executionTime: 10,
        error: "",
      },
      {
        testCaseNumber: 3,
        isHidden: true,
        status: "failed",
        input: "SECRET_IN_2",
        expectedOutput: "SECRET_OUT_2",
        actualOutput: "WRONG_ACTUAL_99",
        executionTime: 15,
        error: "Output mismatch.",
      },
      {
        testCaseNumber: 4,
        isHidden: true,
        status: "runtime_error",
        input: "SECRET_IN_3",
        expectedOutput: "SECRET_OUT_3",
        actualOutput: "",
        executionTime: 22,
        error: "Process exited with non-zero code 0 (Signal: SIGSEGV)",
      },
    ],
  };

  const sanitized = sanitizeExamCodeSubmissionForStudent(rawSubmission);
  const serialized = JSON.stringify(sanitized);

  // Privacy: hidden inputs and expected outputs must NEVER appear
  assert.equal(serialized.includes("SECRET_IN_1"), false);
  assert.equal(serialized.includes("SECRET_IN_2"), false);
  assert.equal(serialized.includes("SECRET_IN_3"), false);
  assert.equal(serialized.includes("SECRET_OUT_1"), false);
  assert.equal(serialized.includes("SECRET_OUT_2"), false);
  assert.equal(serialized.includes("SECRET_OUT_3"), false);

  // Visible case keeps input/expected/actual
  assert.equal(sanitized.testCases[0].input, "2 3");
  assert.equal(sanitized.testCases[0].expectedOutput, "5");

  // Hidden case 1 (PASS)
  assert.equal(sanitized.testCases[1].hiddenTestNumber, 1);
  assert.equal(sanitized.testCases[1].passed, true);
  assert.equal(sanitized.testCases[1].statusLabel, "Passed successfully");
  assert.equal(sanitized.testCases[1].actualOutput, undefined);

  // Hidden case 2 (FAIL - Wrong Answer)
  assert.equal(sanitized.testCases[2].hiddenTestNumber, 2);
  assert.equal(sanitized.testCases[2].passed, false);
  assert.equal(sanitized.testCases[2].statusLabel, "Wrong Answer");
  assert.equal(sanitized.testCases[2].actualOutput, "WRONG_ACTUAL_99");
  assert.equal(sanitized.testCases[2].executionTime, 15);
  assert.equal(sanitized.testCases[2].error, "Output mismatch.");

  // Hidden case 3 (FAIL - Runtime Error)
  assert.equal(sanitized.testCases[3].hiddenTestNumber, 3);
  assert.equal(sanitized.testCases[3].passed, false);
  assert.equal(sanitized.testCases[3].statusLabel, "Runtime Error");
  assert.ok(sanitized.testCases[3].error.includes("SIGSEGV"));
});
