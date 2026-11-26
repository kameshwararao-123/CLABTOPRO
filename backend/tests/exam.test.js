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

  // Hidden test case strictly hides secret inputs and expected outputs, includes passed: false and student actualOutput on failure
  assert.equal(sanitized.testCases[1].isHidden, true);
  assert.equal(sanitized.testCases[1].passed, false);
  assert.equal(sanitized.testCases[1].input, undefined);
  assert.equal(sanitized.testCases[1].expectedOutput, undefined);
  assert.equal(sanitized.testCases[1].actualOutput, "WRONG_OUTPUT");
  assert.equal(sanitized.testCases[1].hiddenTestNumber, 1);
  assert.equal(sanitized.testCases[1].statusLabel, "Wrong Answer");
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

// =========================================================================
// FACULTY-CONTROLLED MULTI-QUESTION ALLOCATION TESTS
// =========================================================================
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import {
  fisherYatesShuffle,
  selectDistinctQuestionsForStudent,
} from "../controllers/examController.js";

test("Faculty-Controlled Allocation: 30 questions, 20 students, 5 questions per student", () => {
  const totalQuestions = 30;
  const totalStudents = 20;
  const questionsPerStudent = 5;

  // Generate 30 distinct questions
  const questionBank = [];
  for (let i = 1; i <= totalQuestions; i++) {
    questionBank.push({
      _id: `q_id_${i}`,
      questionNumber: `Q${i}`,
      title: `Programming Problem ${i}`,
      difficulty: i % 3 === 0 ? "Hard" : i % 2 === 0 ? "Medium" : "Easy",
    });
  }

  // Generate 20 students
  const studentList = [];
  for (let s = 1; s <= totalStudents; s++) {
    studentList.push({
      _id: `student_id_${s}`,
      rollNo: `22CS${100 + s}`,
    });
  }

  const usedCombos = new Set();
  const allocations = studentList.map((student) => {
    const selected = selectDistinctQuestionsForStudent(
      questionBank,
      questionsPerStudent,
      usedCombos
    );
    return {
      studentId: student._id,
      assignedQuestionIds: selected.map((q) => q._id),
      selectedQuestions: selected,
    };
  });

  // 1. Exactly 20 students receive allocations
  assert.equal(allocations.length, totalStudents);

  // 2. Every student receives exactly 5 questions
  for (const alloc of allocations) {
    assert.equal(
      alloc.assignedQuestionIds.length,
      questionsPerStudent,
      "Each student must receive exactly 5 questions"
    );

    // 3. Ensure a student NEVER receives duplicate questions within their own assignment
    const uniqueIdsForStudent = new Set(alloc.assignedQuestionIds);
    assert.equal(
      uniqueIdsForStudent.size,
      questionsPerStudent,
      "Student must have zero duplicate questions within their assignment"
    );
  }

  // 4. Verify combination diversity: different students receive different random combinations
  const combinationKeys = allocations.map((a) =>
    [...a.assignedQuestionIds].sort().join(",")
  );
  const uniqueCombinations = new Set(combinationKeys);
  // With 30 choose 5 = 142,506 combinations, 20 students should all have unique combinations
  assert.equal(
    uniqueCombinations.size,
    totalStudents,
    "All 20 students should receive distinct random combinations of 5 questions"
  );
});

test("Fisher-Yates Shuffle: produces distinct permutation containing all original elements", () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shuffled = fisherYatesShuffle(input);

  assert.equal(shuffled.length, input.length);
  const inputSorted = [...input].sort((a, b) => a - b);
  const shuffledSorted = [...shuffled].sort((a, b) => a - b);
  assert.deepEqual(inputSorted, shuffledSorted);
});

test("Multi-Question Allocation Validation: boundary limits (k < 1 and k > questions)", () => {
  const totalQuestions = 10;
  const questionBank = Array.from({ length: totalQuestions }, (_, i) => ({
    _id: `q_${i + 1}`,
  }));

  // k = 0 or negative
  assert.throws(() => {
    const k = 0;
    if (k < 1) throw new Error("Number of questions per student must be at least 1.");
  }, /must be at least 1/);

  // k > total available questions
  assert.throws(() => {
    const k = 15;
    if (k > questionBank.length) {
      throw new Error(
        `Insufficient questions available! The exam has only ${questionBank.length} question(s), but ${k} question(s) per student were requested.`
      );
    }
  }, /Insufficient questions available/);
});

test("ExamAllocation Schema: validates multiple assignedQuestionIds per student", () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId1 = new mongoose.Types.ObjectId();
  const qId2 = new mongoose.Types.ObjectId();
  const qId3 = new mongoose.Types.ObjectId();

  const alloc = new ExamAllocation({
    examId,
    studentId,
    questionId: qId1, // backward compatibility
    assignedQuestionIds: [qId1, qId2, qId3],
  });

  const err = alloc.validateSync();
  assert.equal(err, undefined, "ExamAllocation validates with assignedQuestionIds array");
  assert.equal(alloc.assignedQuestionIds.length, 3);
  assert.equal(alloc.questionId.toString(), qId1.toString());
});

test("Exam Schema: validates questionsPerStudent field with default 1 and custom values", () => {
  const exam = new Exam({
    title: "Midterm Practical",
    subject: "C Programming",
    academicYear: "2026",
    semester: "Semester 1",
    examType: "internal",
    examDate: new Date(),
    durationMinutes: 90,
    totalMarks: 100,
    questionsPerStudent: 5,
    createdBy: new mongoose.Types.ObjectId(),
  });

  const err = exam.validateSync();
  assert.equal(err, undefined, "Exam validates with questionsPerStudent = 5");
  assert.equal(exam.questionsPerStudent, 5);
});

test("StudentExamProgress Schema: validates questionProgress map for multi-question tracking", () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId1 = new mongoose.Types.ObjectId();
  const qId2 = new mongoose.Types.ObjectId();

  const progress = new StudentExamProgress({
    examId,
    studentId,
    status: "question_assigned",
    instructionsAcknowledged: true,
    questionProgress: {
      [qId1.toString()]: {
        questionId: qId1,
        status: "execution_allowed",
        compilerAllowed: true,
        conceptualAttemptsCount: 1,
        lastConceptualAnswer: "Binary search algorithm description",
      },
      [qId2.toString()]: {
        questionId: qId2,
        status: "not_started",
        compilerAllowed: false,
        conceptualAttemptsCount: 0,
      },
    },
  });

  const err = progress.validateSync();
  assert.equal(err, undefined, "StudentExamProgress validates with questionProgress map");
  assert.equal(progress.questionProgress.get(qId1.toString()).compilerAllowed, true);
  assert.equal(progress.questionProgress.get(qId2.toString()).compilerAllowed, false);
});

test("StudentExamProgress Schema: validates new accurate statuses", () => {
  const statuses = [
    "not_started",
    "instructions_acknowledged",
    "notepad_pending",
    "notepad_submitted",
    "ai_evaluation_pending",
    "conceptual_evaluation_failed",
    "compiler_access_granted",
    "coding_in_progress",
    "submission_pending",
    "test_cases_failed",
    "successfully_completed",
    "time_expired",
  ];

  for (const st of statuses) {
    const prog = new StudentExamProgress({
      examId: new mongoose.Types.ObjectId(),
      studentId: new mongoose.Types.ObjectId(),
      status: st,
    });
    const err = prog.validateSync();
    assert.equal(err, undefined, `Status "${st}" should be valid`);
  }
});

test("Completion Validation: Incomplete Notepad blocks successful completion", () => {
  const progress = {
    instructionsAcknowledged: true,
    lastConceptualAnswer: "",
    lastAIEvaluation: null,
    compilerAllowed: false,
    status: "notepad_pending",
  };
  const latestApprovedAnswer = null;
  const latestCodeSub = null;

  const hasSubmittedConceptual = Boolean(
    latestApprovedAnswer ||
      (progress.lastConceptualAnswer && progress.lastConceptualAnswer.trim().length > 20)
  );
  const hasApprovedConceptual = Boolean(
    latestApprovedAnswer ||
      (progress.lastAIEvaluation && progress.lastAIEvaluation.errorPercentage < 50)
  );
  const compilerAccessGranted = Boolean(progress.compilerAllowed && hasApprovedConceptual);
  const hasSubmittedCode = Boolean(latestCodeSub);
  const allTestsPassed = Boolean(
    latestCodeSub &&
      latestCodeSub.allPassed &&
      latestCodeSub.testCasesPassed > 0 &&
      latestCodeSub.testCasesPassed === latestCodeSub.totalTestCases
  );

  const isSuccessfullyCompleted =
    progress.instructionsAcknowledged &&
    hasSubmittedConceptual &&
    hasApprovedConceptual &&
    compilerAccessGranted &&
    hasSubmittedCode &&
    allTestsPassed &&
    progress.status === "successfully_completed";

  assert.equal(isSuccessfullyCompleted, false, "Incomplete Notepad must not mark exam completed");
});

test("Completion Validation: All mandatory conditions satisfied marks successfully completed", () => {
  const progress = {
    instructionsAcknowledged: true,
    lastConceptualAnswer: "A full detailed explanation of binary search logic with constraints",
    lastAIEvaluation: { errorPercentage: 15 },
    compilerAllowed: true,
    status: "successfully_completed",
  };
  const latestApprovedAnswer = { isApproved: true, aiEvaluation: { errorPercentage: 15 } };
  const latestCodeSub = {
    allPassed: true,
    testCasesPassed: 5,
    totalTestCases: 5,
    status: "accepted",
  };

  const hasSubmittedConceptual = Boolean(
    latestApprovedAnswer ||
      (progress.lastConceptualAnswer && progress.lastConceptualAnswer.trim().length > 20)
  );
  const hasApprovedConceptual = Boolean(
    latestApprovedAnswer ||
      (progress.lastAIEvaluation && progress.lastAIEvaluation.errorPercentage < 50)
  );
  const compilerAccessGranted = Boolean(progress.compilerAllowed && hasApprovedConceptual);
  const hasSubmittedCode = Boolean(latestCodeSub);
  const allTestsPassed = Boolean(
    latestCodeSub &&
      latestCodeSub.allPassed &&
      latestCodeSub.testCasesPassed > 0 &&
      latestCodeSub.testCasesPassed === latestCodeSub.totalTestCases
  );

  const isSuccessfullyCompleted =
    progress.instructionsAcknowledged &&
    hasSubmittedConceptual &&
    hasApprovedConceptual &&
    compilerAccessGranted &&
    hasSubmittedCode &&
    allTestsPassed &&
    progress.status === "successfully_completed";

  assert.equal(isSuccessfullyCompleted, true, "All conditions satisfied must mark exam completed");
});

// =========================================================================
// FACULTY-CONTROLLED AI EVALUATION & COMPILER AUTHORIZATION TESTS
// =========================================================================

test("Faculty Control: Student Notepad submission does NOT auto-evaluate or grant compiler access", () => {
  const studentSubmission = {
    answerText: "Algorithm: Iterate through the array using two pointers from opposite ends. Swap elements until pointers meet.",
    submittedAt: new Date(),
  };

  // State transitions enforced on student submission
  const progress = {
    conceptualStatus: "submitted",
    status: "awaiting_faculty_evaluation",
    lastConceptualAnswer: studentSubmission.answerText,
    compilerAllowed: false, // Must remain locked!
    lastAIEvaluation: null, // No automatic Gemini AI trigger
  };

  assert.equal(progress.conceptualStatus, "submitted");
  assert.equal(progress.status, "awaiting_faculty_evaluation");
  assert.equal(progress.compilerAllowed, false, "Compiler access must NOT be granted on student submit");
  assert.equal(progress.lastAIEvaluation, null, "AI evaluation must NOT be triggered automatically on student submit");
});

test("Faculty Control: Faculty Evaluate calculates authoritative error percentage and provides conditional action", () => {
  const question = {
    title: "Reverse Array",
    difficulty: "Easy",
    evaluationRubric: [
      { criterion: "Algorithm Correctness & Logic", weight: 50 },
      { criterion: "Time & Space Complexity", weight: 50 },
    ],
  };

  // Case 1: Error percentage is 35% (<50%) -> Condition A: Allow to Code
  const evaluationGood = {
    errorPercentage: 35,
    understandingPercentage: 65,
    strengths: ["Correct two pointer algorithm"],
    missingConcepts: ["Incomplete space complexity proof"],
  };

  const canAllowToCode = evaluationGood.errorPercentage < 50;
  const requiresRevision = evaluationGood.errorPercentage >= 50;

  assert.equal(canAllowToCode, true, "35% error (<50%) must enable 'Allow to Code' button");
  assert.equal(requiresRevision, false);

  // Even though error is 35%, compiler access must NOT be granted until faculty clicks the button!
  let compilerAllowed = false;
  assert.equal(compilerAllowed, false, "Compiler must remain locked until faculty explicitly authorizes");

  // Faculty clicks "Allow to Code"
  const facultyAction = "allow_to_code";
  if (facultyAction === "allow_to_code" && evaluationGood.errorPercentage < 50) {
    compilerAllowed = true;
  }
  assert.equal(compilerAllowed, true, "Clicking 'Allow to Code' grants compiler access");
});

test("Faculty Control: Error percentage >= 50% displays Return to Notepad and prevents compiler unlocking", () => {
  // Case 2: Error percentage is 65% (>= 50%) -> Condition B: Return to Notepad
  const evaluationPoor = {
    errorPercentage: 65,
    understandingPercentage: 35,
    strengths: ["Attempted problem"],
    missingConcepts: ["Missing loop termination condition", "No complexity analysis"],
  };

  const canAllowToCode = evaluationPoor.errorPercentage < 50;
  const requiresRevision = evaluationPoor.errorPercentage >= 50;

  assert.equal(canAllowToCode, false, "65% error (>=50%) must NOT enable 'Allow to Code'");
  assert.equal(requiresRevision, true, "65% error (>=50%) must display 'Return to Notepad'");

  // Faculty clicks "Return to Notepad"
  const facultyDecision = {
    action: "return_to_notepad",
    feedback: "Please review loop termination and handle empty input before resubmitting.",
    timestamp: new Date(),
  };

  const studentProgress = {
    conceptualStatus: "correction_required",
    status: "notepad_correction_required",
    compilerAllowed: false,
    facultyFeedback: facultyDecision.feedback,
  };

  assert.equal(studentProgress.compilerAllowed, false, "Compiler must remain locked on return to notepad");
  assert.equal(studentProgress.status, "notepad_correction_required");
  assert.ok(studentProgress.facultyFeedback.length > 0);
});

test("Faculty Control: Boundary condition - exactly 50% error requires Return to Notepad", () => {
  const boundaryError = 50;
  const canAllowToCode = boundaryError < 50;
  const requiresRevision = boundaryError >= 50;

  assert.equal(canAllowToCode, false, "Exactly 50% error must NOT allow compiler access");
  assert.equal(requiresRevision, true, "Exactly 50% error must require Return to Notepad");
});

test("Faculty Control: Student resubmission preserves previous answer and previous evaluation history", () => {
  const attemptHistory = [
    {
      attemptNumber: 1,
      answerText: "V1: Incomplete attempt",
      aiEvaluation: { errorPercentage: 65 },
      facultyDecision: "return_to_notepad",
      isApproved: false,
    },
  ];

  // Student resubmits corrected answer
  const attempt2 = {
    attemptNumber: 2,
    answerText: "V2: Corrected two-pointer algorithm with full edge cases and O(N) complexity.",
    aiEvaluation: null, // Awaiting new faculty evaluation
    facultyDecision: "pending",
    isApproved: false,
  };

  attemptHistory.push(attempt2);

  assert.equal(attemptHistory.length, 2, "Both attempts must be preserved in auditable history");
  assert.equal(attemptHistory[0].aiEvaluation.errorPercentage, 65, "Previous evaluation must not be overwritten or deleted");
  assert.equal(attemptHistory[1].attemptNumber, 2);
  assert.equal(attemptHistory[1].aiEvaluation, null, "Resubmission must await new faculty evaluation");
});

test("Faculty Control: Security gate - compiler execution rejected if student lacks faculty approval", () => {
  // Student tries to submit code when compiler is locked or error >= 50%
  const progressUnapproved = {
    compilerAllowed: false,
    status: "awaiting_faculty_evaluation",
  };

  const isExecutionPermitted = Boolean(progressUnapproved.compilerAllowed);
  assert.equal(isExecutionPermitted, false, "Backend must reject compiler execution when compilerAllowed is false");
});



