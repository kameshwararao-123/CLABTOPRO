import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAuthoritativeErrorPercentage,
  generateConceptualFallback,
} from "../services/examAIService.js";
import { sanitizeExamCodeSubmissionForStudent } from "../models/ExamCodeSubmission.js";
import { judgeSubmission } from "../services/judgeService.js";
import ExamQuestion from "../models/ExamQuestion.js";
import mongoose from "mongoose";

test("calculateAuthoritativeErrorPercentage: short or empty answers return 100% error", () => {
  const errEmpty = calculateAuthoritativeErrorPercentage({
    rubric: [],
    identifiedIssues: [],
    studentAnswer: "",
  });
  assert.equal(errEmpty, 100);

  const errShort = calculateAuthoritativeErrorPercentage({
    rubric: [],
    identifiedIssues: [],
    studentAnswer: "too short",
  });
  assert.equal(errShort, 100);
});

test("calculateAuthoritativeErrorPercentage: no issues on full answer returns 0% error", () => {
  const err = calculateAuthoritativeErrorPercentage({
    rubric: [
      { criterion: "Algorithm Correctness & Logic", weight: 40 },
      { criterion: "Complexity", weight: 30 },
      { criterion: "Edge Cases", weight: 30 },
    ],
    identifiedIssues: [],
    studentAnswer:
      "This is a detailed explanation of the two-pointer algorithm. We start with left=0 and right=n-1, iterating while left < right.",
  });
  assert.equal(err, 0);
});

test("calculateAuthoritativeErrorPercentage: calculates weighted deduction accurately", () => {
  const rubric = [
    { criterion: "Algorithm Correctness & Logic", weight: 50 },
    { criterion: "Time & Space Complexity", weight: 50 },
  ];

  // A major issue in Algorithm Correctness (80% of 50 = 40 deduction out of 100) -> 40% error
  const err = calculateAuthoritativeErrorPercentage({
    rubric,
    identifiedIssues: [
      {
        criterion: "Algorithm Correctness & Logic",
        severity: "major",
        description: "Does not check null pointer",
      },
    ],
    studentAnswer: "We iterate through the array and print each value.",
  });

  assert.equal(err, 40);
  assert.ok(err < 50, "40% error is under the 50% threshold, qualifying for execution");
});

test("calculateAuthoritativeErrorPercentage: multiple issues crossing 50% threshold", () => {
  const rubric = [
    { criterion: "Algorithm Correctness & Logic", weight: 50 },
    { criterion: "Time & Space Complexity", weight: 50 },
  ];

  // A major issue in Algorithm Correctness (40) + moderate in Complexity (25) = 65 deduction -> 65% error
  const err = calculateAuthoritativeErrorPercentage({
    rubric,
    identifiedIssues: [
      { criterion: "Algorithm Correctness & Logic", severity: "major" },
      { criterion: "Time & Space Complexity", severity: "moderate" },
    ],
    studentAnswer: "We iterate through the array and print each value.",
  });

  assert.equal(err, 65);
  assert.ok(err >= 50, "65% error is at or above 50%, requiring revision in Notepad");
});

test("sanitizeExamCodeSubmissionForStudent: strictly removes hidden test case inputs and outputs", () => {
  const submission = {
    testCaseResults: [
      {
        testCaseNumber: 1,
        status: "passed",
        executionTime: 12,
        isHidden: false,
        input: "5",
        expectedOutput: "25",
        actualOutput: "25",
        error: "",
      },
      {
        testCaseNumber: 2,
        status: "failed",
        executionTime: 15,
        isHidden: true,
        input: "9999999999", // SECRET
        expectedOutput: "SPECIAL_SECRET_HASH", // SECRET
        actualOutput: "WRONG_OUTPUT", // SECRET
        error: "Mismatch",
      },
    ],
  };

  const sanitized = sanitizeExamCodeSubmissionForStudent(submission);
  assert.equal(sanitized.testCases.length, 2);
  assert.equal(sanitized.testCaseResults.length, 2);

  // Visible test case retains details and includes passed: true
  assert.equal(sanitized.testCases[0].isHidden, false);
  assert.equal(sanitized.testCases[0].passed, true);
  assert.equal(sanitized.testCases[0].input, "5");
  assert.equal(sanitized.testCases[0].expectedOutput, "25");

  // Hidden test case strictly hides secret inputs and expected outputs, includes passed: false
  assert.equal(sanitized.testCases[1].isHidden, true);
  assert.equal(sanitized.testCases[1].passed, false);
  assert.equal(sanitized.testCases[1].input, undefined);
  assert.equal(sanitized.testCases[1].expectedOutput, undefined);
  assert.equal(sanitized.testCases[1].actualOutput, undefined);
});

test("ExamQuestion schema: validation succeeds with both array and default rubric", () => {
  const dummyId = new mongoose.Types.ObjectId();
  const q = new ExamQuestion({
    examId: dummyId,
    title: "Reverse Array",
    problemStatement: "Reverse the given array of size N.",
    testCases: [{ input: "3\n1 2 3", expectedOutput: "3 2 1" }],
    evaluationRubric: [
      { criterion: "Logic & Correctness", weight: 40 },
      { weight: 60 }, // Missing criterion will default without error!
    ],
  });

  const validationError = q.validateSync();
  assert.equal(validationError, undefined, "Question validates with default criterion fallback");
  assert.equal(q.evaluationRubric[1].criterion, "Algorithm Correctness & Logic");
});

test("judgeSubmission with correct C code: all 3 test cases pass and counts match", async () => {
  const code = `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}`;

  const testCases = [
    { input: "2 3", expectedOutput: "5", isHidden: false },
    { input: "10 20", expectedOutput: "30", isHidden: false },
    { input: "-5 5", expectedOutput: "0", isHidden: true },
  ];

  const result = await judgeSubmission({ code, testCases, problemTitle: "Sum Two Numbers" });
  assert.equal(result.status, "accepted");
  assert.equal(result.testCasesPassed, 3);
  assert.equal(result.totalTestCases, 3);
  assert.equal(result.testCaseResults.length, 3);
  assert.ok(result.testCaseResults.every((tc) => tc.status === "passed"));

  // Check sanitized output has passed: true on each
  const sanitized = sanitizeExamCodeSubmissionForStudent(result);
  assert.equal(sanitized.testCasesPassed, 3);
  assert.equal(sanitized.totalTestCases, 3);
  assert.ok(sanitized.testCases.every((tc) => tc.passed === true));
});

test("judgeSubmission with incorrect C code: returns wrong_answer with accurate passed count", async () => {
  const code = `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a - b); // Intentionally subtraction instead of addition
    }
    return 0;
}`;

  const testCases = [
    { input: "5 0", expectedOutput: "5", isHidden: false }, // 5 - 0 = 5, will pass
    { input: "10 5", expectedOutput: "15", isHidden: false }, // 10 - 5 = 5 != 15, fails
    { input: "2 3", expectedOutput: "5", isHidden: true }, // fails
  ];

  const result = await judgeSubmission({ code, testCases, problemTitle: "Sum Two Numbers (Wrong Code)" });
  assert.equal(result.status, "wrong_answer");
  assert.equal(result.testCasesPassed, 1);
  assert.equal(result.totalTestCases, 3);

  const sanitized = sanitizeExamCodeSubmissionForStudent(result);
  assert.equal(sanitized.testCasesPassed, 1);
  assert.equal(sanitized.totalTestCases, 3);
  assert.equal(sanitized.testCases[0].passed, true);
  assert.equal(sanitized.testCases[1].passed, false);
  assert.equal(sanitized.testCases[2].passed, false);
});

test("judgeSubmission with compilation error: returns compile_error with 0 passed tests", async () => {
  const code = `#include <stdio.h>
int main() {
    UNDEFINED_IDENTIFIER_SYNTAX_ERROR !@#$;
    return 0;
}`;

  const testCases = [
    { input: "1", expectedOutput: "1" },
    { input: "2", expectedOutput: "2" },
  ];

  const result = await judgeSubmission({ code, testCases, problemTitle: "Syntax Error Test" });
  assert.equal(result.status, "compile_error");
  assert.equal(result.testCasesPassed, 0);
  assert.equal(result.totalTestCases, 2);
  assert.ok(result.compilerOutput && result.compilerOutput.length > 0);
});

test("judgeSubmission with runtime error: handles crash and records non-zero failure", async () => {
  const code = `#include <stdio.h>
#include <stdlib.h>
int main() {
    abort(); // Triggers SIGABRT
    return 0;
}`;

  const testCases = [
    { input: "1", expectedOutput: "1" },
  ];

  const result = await judgeSubmission({ code, testCases, problemTitle: "Runtime Error Test" });
  assert.equal(result.status, "runtime_error");
  assert.equal(result.testCasesPassed, 0);
  assert.equal(result.totalTestCases, 1);
  assert.ok(result.testCaseResults[0].error.length > 0);
});

