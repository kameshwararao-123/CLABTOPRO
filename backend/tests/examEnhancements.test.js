import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  autosaveCodeDraft,
  logExamSecurityEvent,
  endStudentExam,
  submitStudentPaperAnswer,
  getStudentExams,
  getMyAssignedQuestion,
  runExamCode,
  autosaveAnswerDraft,
  submitExamCode,
  completeExam,
  getStudentExamCompletion,
  getExamMonitoring,
  expireStudentExam,
  facultyReturnToNotepad,
} from "../controllers/examController.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import User from "../models/User.js";

const createMockRes = () => {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
};

test("1. autosaveCodeDraft stores code isolated by questionId", async () => {
  const originalFindOne = StudentExamProgress.findOne;

  const mockProgress = {
    examId: new mongoose.Types.ObjectId(),
    studentId: new mongoose.Types.ObjectId(),
    currentCode: "",
    questionProgress: new Map(),
    save: async function () {
      return this;
    },
  };

  StudentExamProgress.findOne = async () => mockProgress;

  const q1Id = new mongoose.Types.ObjectId();
  const req = {
    params: { examId: mockProgress.examId.toString() },
    user: { userId: mockProgress.studentId.toString() },
    body: {
      code: "int main() { printf(\"Q1\"); return 0; }",
      questionId: q1Id.toString(),
    },
  };
  const res = createMockRes();
  let errCalled = null;

  await autosaveCodeDraft(req, res, (err) => {
    errCalled = err;
  });

  assert.equal(errCalled, null);
  assert.equal(res.statusCode, 200);
  assert.equal(mockProgress.currentCode, "int main() { printf(\"Q1\"); return 0; }");
  const q1Prog = mockProgress.questionProgress.get(q1Id.toString());
  assert.ok(q1Prog);
  assert.equal(q1Prog.currentCode, "int main() { printf(\"Q1\"); return 0; }");

  StudentExamProgress.findOne = originalFindOne;
});

test("2. logExamSecurityEvent respects PHASE3_SECURITY_ENABLED toggle", async () => {
  const originalCreate = ExamAuditLog.create;
  let loggedAction = null;
  let loggedDetails = null;

  ExamAuditLog.create = async ({ action, details }) => {
    loggedAction = action;
    loggedDetails = details;
    return { _id: new mongoose.Types.ObjectId() };
  };

  const req = {
    params: { examId: new mongoose.Types.ObjectId().toString() },
    user: { userId: new mongoose.Types.ObjectId().toString() },
    body: {
      eventType: "tab_switch_hidden",
      details: { switchCount: 2 },
    },
  };
  const res = createMockRes();

  await logExamSecurityEvent(req, res, () => {});

  // Since PHASE3_SECURITY_ENABLED is false by default, no new audit log is created and disabled is returned
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.disabled, true);
  assert.equal(loggedAction, null, "Should not record new security audit log when PHASE3_SECURITY_ENABLED is false");

  ExamAuditLog.create = originalCreate;
});

test("3. submitStudentPaperAnswer allows unlimited submissions beyond 3 attempts", async () => {
  const originalExamFindById = Exam.findById;
  const originalAllocFindOne = ExamAllocation.findOne;
  const originalProgFindOne = StudentExamProgress.findOne;
  const originalSubCreate = ExamAnswerSubmission.create;
  const originalAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  Exam.findById = async () => ({
    _id: examId,
    status: "in_progress",
    maxConceptualAttempts: 3,
  });

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          assignedQuestionIds: [{ _id: qId, title: "Problem 1" }],
        }),
      }),
    }),
  });

  const mockProgress = {
    examId,
    studentId,
    status: "in_progress",
    conceptualAttemptsCount: 3, // Already reached old max of 3 attempts!
    questionProgress: new Map([
      [
        qId.toString(),
        {
          questionId: qId,
          conceptualAttemptsCount: 3,
          compilerAllowed: false,
        },
      ],
    ]),
    save: async function () {
      return this;
    },
  };

  StudentExamProgress.findOne = async () => mockProgress;
  ExamAnswerSubmission.create = async (doc) => ({ ...doc, _id: new mongoose.Types.ObjectId() });
  ExamAuditLog.create = async () => ({});

  const req = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    body: {
      questionId: qId.toString(),
      answerText: "This is attempt 4 of conceptual solution with sufficient detailed length.",
    },
  };
  const res = createMockRes();

  let errResult = null;
  await submitStudentPaperAnswer(req, res, (err) => {
    errResult = err;
  });

  if (errResult) {
    console.error("submitStudentPaperAnswer error:", errResult);
  }

  assert.equal(errResult, null);
  assert.equal(res.statusCode, 200, "Should succeed for attempt 4 without 403 Forbidden error");
  assert.ok(res.data);
  assert.equal(res.data.attemptNumber, 4);
  assert.equal(res.data.submissionStatus, "Submitted");

  Exam.findById = originalExamFindById;
  ExamAllocation.findOne = originalAllocFindOne;
  StudentExamProgress.findOne = originalProgFindOne;
  ExamAnswerSubmission.create = originalSubCreate;
  ExamAuditLog.create = originalAuditCreate;
});

test("3b. submitStudentPaperAnswer preserves full submission history and allows attempt 10 without limit", async () => {
  const originalExamFindById = Exam.findById;
  const originalAllocFindOne = ExamAllocation.findOne;
  const originalProgFindOne = StudentExamProgress.findOne;
  const originalSubFindOne = ExamAnswerSubmission.findOne;
  const originalSubCreate = ExamAnswerSubmission.create;
  const originalAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  Exam.findById = async () => ({
    _id: examId,
    status: "in_progress",
  });

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          assignedQuestionIds: [{ _id: qId, title: "Problem 1" }],
        }),
      }),
    }),
  });

  const mockProgress = {
    examId,
    studentId,
    status: "notepad_correction_required",
    conceptualAttemptsCount: 9,
    questionProgress: new Map([
      [
        qId.toString(),
        {
          questionId: qId,
          conceptualAttemptsCount: 9,
          compilerAllowed: false,
        },
      ],
    ]),
    save: async function () {
      return this;
    },
  };

  StudentExamProgress.findOne = async () => mockProgress;
  ExamAnswerSubmission.findOne = () => ({
    sort: async () => null, // No recent duplicate
  });

  const createdSubmissions = [];
  ExamAnswerSubmission.create = async (doc) => {
    const record = { ...doc, _id: new mongoose.Types.ObjectId() };
    createdSubmissions.push(record);
    return record;
  };
  ExamAuditLog.create = async () => ({});

  const req = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    body: {
      questionId: qId.toString(),
      answerText: "This is attempt 10 with revised algorithmic explanation and edge case notes.",
    },
  };
  const res = createMockRes();
  let errResult = null;

  await submitStudentPaperAnswer(req, res, (err) => {
    errResult = err;
  });

  assert.equal(errResult, null);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.attemptNumber, 10);
  assert.equal(createdSubmissions.length, 1);
  assert.equal(createdSubmissions[0].attemptNumber, 10);
  assert.equal(createdSubmissions[0].status, "submitted");
  assert.equal(mockProgress.conceptualAttemptsCount, 10);

  Exam.findById = originalExamFindById;
  ExamAllocation.findOne = originalAllocFindOne;
  StudentExamProgress.findOne = originalProgFindOne;
  ExamAnswerSubmission.findOne = originalSubFindOne;
  ExamAnswerSubmission.create = originalSubCreate;
  ExamAuditLog.create = originalAuditCreate;
});

test("4. getStudentExams calculates dynamic per-question completion status", async () => {
  const originalExamFind = Exam.find;
  const originalProgFind = StudentExamProgress.find;
  const originalAllocFind = ExamAllocation.find;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1Id = new mongoose.Types.ObjectId();
  const q2Id = new mongoose.Types.ObjectId();

  Exam.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [
          {
            _id: examId,
            title: "Internal Exam 1",
            subject: "C Programming",
            examType: "internal",
            status: "in_progress",
            durationMinutes: 60,
          },
        ],
      }),
    }),
  });

  ExamAllocation.find = () => ({
    lean: async () => [
      {
        examId,
        studentId,
        assignedQuestionIds: [q1Id, q2Id],
      },
    ],
  });

  StudentExamProgress.find = () => ({
    lean: async () => [
      {
        examId,
        studentId,
        status: "in_progress",
        questionProgress: {
          [q1Id.toString()]: { questionId: q1Id, isCompleted: true },
          [q2Id.toString()]: { questionId: q2Id, isCompleted: false },
        },
      },
    ],
  });

  const req = {
    user: { userId: studentId.toString() },
    query: {},
  };
  const res = createMockRes();

    await getStudentExams(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.data.exams.length, 1);
  const exam = res.data.exams[0];
  assert.equal(exam.displayProgress, "In Progress (1/2 Completed)");

  Exam.find = originalExamFind;
  ExamAllocation.find = originalAllocFind;
  StudentExamProgress.find = originalProgFind;
});

test("5. endStudentExam completes student examination", async () => {
  const originalFindOne = StudentExamProgress.findOne;
  const originalAuditCreate = ExamAuditLog.create;

  const mockProgress = {
    examId: new mongoose.Types.ObjectId(),
    studentId: new mongoose.Types.ObjectId(),
    status: "in_progress",
    save: async function () {
      return this;
    },
  };

  StudentExamProgress.findOne = async () => mockProgress;
  ExamAuditLog.create = async () => ({});

  const req = {
    params: { examId: mockProgress.examId.toString() },
    user: { userId: mockProgress.studentId.toString() },
  };
  const res = createMockRes();

  await endStudentExam(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.data.status, "successfully_completed");
  assert.equal(mockProgress.status, "successfully_completed");
  assert.ok(mockProgress.completedAt);

  StudentExamProgress.findOne = originalFindOne;
  ExamAuditLog.create = originalAuditCreate;
});

test("6. runExamCode passes sampleCases and returns individual pass/fail results for each sample case", async () => {
  const { runCCode } = await import("../services/judgeService.js");

  // Test runCCode with sampleCases directly
  const sampleCases = [
    { testCaseNumber: 1, input: "2 3\n", expectedOutput: "5\n", isHidden: false },
    { testCaseNumber: 2, input: "10 20\n", expectedOutput: "30\n", isHidden: false },
    { testCaseNumber: 3, input: "4 4\n", expectedOutput: "10\n", isHidden: false }, // this one should fail
  ];

  const code = `
#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}
  `;

  const runResult = await runCCode({
    code,
    sampleCases,
    problemTitle: "Sum of Two Numbers",
  });

  assert.equal(runResult.mode, "sample");
  assert.equal(runResult.totalTestCases, 3);
  assert.equal(runResult.testCasesPassed, 2);
  assert.equal(runResult.testCases.length, 3);

  // Case 1
  assert.equal(runResult.testCases[0].testCaseNumber, 1);
  assert.equal(runResult.testCases[0].status, "passed");
  assert.equal(runResult.testCases[0].isHidden, false);
  assert.equal(runResult.testCases[0].expectedOutput, "5\n");
  assert.equal(runResult.testCases[0].actualOutput.trim(), "5");

  // Case 2
  assert.equal(runResult.testCases[1].testCaseNumber, 2);
  assert.equal(runResult.testCases[1].status, "passed");
  assert.equal(runResult.testCases[1].isHidden, false);

  // Case 3 (expected 10, actual 8 -> fail)
  assert.equal(runResult.testCases[2].testCaseNumber, 3);
  assert.equal(runResult.testCases[2].status, "failed");
  assert.equal(runResult.testCases[2].actualOutput.trim(), "8");
  assert.equal(runResult.testCases[2].expectedOutput, "10\n");
});

test("7. autosaveCodeDraft maintains separate drafts for Question 1 and Question 2 and enforces version ordering", async () => {
  const originalFindOne = StudentExamProgress.findOne;

  const mockProgress = {
    examId: new mongoose.Types.ObjectId(),
    studentId: new mongoose.Types.ObjectId(),
    currentCode: "",
    questionProgress: new Map(),
    codeDraftVersion: 0,
    save: async function () {
      return this;
    },
  };

  StudentExamProgress.findOne = async () => mockProgress;

  const q1Id = new mongoose.Types.ObjectId();
  const q2Id = new mongoose.Types.ObjectId();

  // Save draft for Question 1 (version 1)
  const req1 = {
    params: { examId: mockProgress.examId.toString() },
    user: { userId: mockProgress.studentId.toString() },
    body: {
      code: "/* Q1 initial solution */ int main() { return 1; }",
      questionId: q1Id.toString(),
      version: 1,
    },
  };
  const res1 = createMockRes();
  await autosaveCodeDraft(req1, res1, () => {});
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.data.version, 1);

  // Save draft for Question 2 (version 1)
  const req2 = {
    params: { examId: mockProgress.examId.toString() },
    user: { userId: mockProgress.studentId.toString() },
    body: {
      code: "/* Q2 solution */ int main() { return 2; }",
      questionId: q2Id.toString(),
      version: 1,
    },
  };
  const res2 = createMockRes();
  await autosaveCodeDraft(req2, res2, () => {});
  assert.equal(res2.statusCode, 200);

  // Verify Question 1 and Question 2 have isolated drafts
  const q1Prog = mockProgress.questionProgress.get(q1Id.toString());
  const q2Prog = mockProgress.questionProgress.get(q2Id.toString());
  assert.ok(q1Prog);
  assert.ok(q2Prog);
  assert.equal(q1Prog.currentCode, "/* Q1 initial solution */ int main() { return 1; }");
  assert.equal(q2Prog.currentCode, "/* Q2 solution */ int main() { return 2; }");

  // Save newer draft for Question 1 (version 2)
  const req1v2 = {
    params: { examId: mockProgress.examId.toString() },
    user: { userId: mockProgress.studentId.toString() },
    body: {
      code: "/* Q1 updated solution */ int main() { return 100; }",
      questionId: q1Id.toString(),
      version: 2,
    },
  };
  const res1v2 = createMockRes();
  await autosaveCodeDraft(req1v2, res1v2, () => {});
  assert.equal(res1v2.statusCode, 200);
  assert.equal(mockProgress.questionProgress.get(q1Id.toString()).currentCode, "/* Q1 updated solution */ int main() { return 100; }");

  // Try to submit a stale version 1 for Question 1 (simulating out-of-order network arrival)
  const reqStale = {
    params: { examId: mockProgress.examId.toString() },
    user: { userId: mockProgress.studentId.toString() },
    body: {
      code: "/* Q1 old out-of-order code */ int main() { return 0; }",
      questionId: q1Id.toString(),
      version: 1,
    },
  };
  const resStale = createMockRes();
  await autosaveCodeDraft(reqStale, resStale, () => {});
  assert.equal(resStale.statusCode, 200);
  assert.equal(resStale.data.stale, true);
  // Verify draft content was NOT overwritten by the stale request
  assert.equal(mockProgress.questionProgress.get(q1Id.toString()).currentCode, "/* Q1 updated solution */ int main() { return 100; }");

  // Question 2 remains untouched
  assert.equal(mockProgress.questionProgress.get(q2Id.toString()).currentCode, "/* Q2 solution */ int main() { return 2; }");

  StudentExamProgress.findOne = originalFindOne;
});

test("8. Student draft isolation: Student A cannot overwrite or access Student B's draft", async () => {
  const originalFindOne = StudentExamProgress.findOne;

  const studentAId = new mongoose.Types.ObjectId();
  const studentBId = new mongoose.Types.ObjectId();
  const examId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const progressStore = new Map();

  const mockProgressA = {
    examId,
    studentId: studentAId,
    currentCode: "",
    questionProgress: new Map(),
    save: async function () {
      progressStore.set(`${examId}_${studentAId}`, this);
      return this;
    },
  };

  const mockProgressB = {
    examId,
    studentId: studentBId,
    currentCode: "",
    questionProgress: new Map(),
    save: async function () {
      progressStore.set(`${examId}_${studentBId}`, this);
      return this;
    },
  };

  StudentExamProgress.findOne = async ({ examId: eId, studentId: sId }) => {
    if (sId.toString() === studentAId.toString()) return mockProgressA;
    if (sId.toString() === studentBId.toString()) return mockProgressB;
    return null;
  };

  // Student A saves draft
  const reqA = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: {
      code: "/* Student A Private Code */",
      questionId: qId.toString(),
      version: 1,
    },
  };
  const resA = createMockRes();
  await autosaveCodeDraft(reqA, resA, () => {});
  assert.equal(resA.statusCode, 200);

  // Student B saves draft
  const reqB = {
    params: { examId: examId.toString() },
    user: { userId: studentBId.toString() },
    body: {
      code: "/* Student B Private Code */",
      questionId: qId.toString(),
      version: 1,
    },
  };
  const resB = createMockRes();
  await autosaveCodeDraft(reqB, resB, () => {});
  assert.equal(resB.statusCode, 200);

  // Assert isolation
  assert.equal(
    mockProgressA.questionProgress.get(qId.toString()).currentCode,
    "/* Student A Private Code */"
  );
  assert.equal(
    mockProgressB.questionProgress.get(qId.toString()).currentCode,
    "/* Student B Private Code */"
  );

  StudentExamProgress.findOne = originalFindOne;
});

test("9. Multi-Question Evaluation Workflow: evaluates correct question, preserves revised answer and avoids cross-contamination", async () => {
  const { facultyEvaluateStudentPaper } = await import("../controllers/examController.js");
  const ExamQuestion = (await import("../models/ExamQuestion.js")).default;
  const User = (await import("../models/User.js")).default;

  const originalExamFindById = Exam.findById;
  const originalUserFindById = User.findById;
  const originalProgressFindOne = StudentExamProgress.findOne;
  const originalQuestionFindById = ExamQuestion.findById;
  const originalSubFindOne = ExamAnswerSubmission.findOne;
  const originalAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1Id = new mongoose.Types.ObjectId();
  const q2Id = new mongoose.Types.ObjectId();

  const mockExam = { _id: examId, title: "Data Structures Lab" };
  const mockStudent = { _id: studentId, username: "Alice", rollNo: "S210100" };

  const mockQ1 = {
    _id: q1Id,
    questionNumber: "Q1",
    title: "Bubble Sort Algorithm",
    difficulty: "Easy",
    problemStatement: "Implement bubble sort.",
    marks: 10,
    evaluationRubric: [{ criterion: "Sorting Logic", weight: 100, description: "Correct comparison" }],
  };

  const mockQ2 = {
    _id: q2Id,
    questionNumber: "Q2",
    title: "Binary Search Tree Insertion",
    difficulty: "Medium",
    problemStatement: "Implement BST insert.",
    marks: 20,
    evaluationRubric: [{ criterion: "Tree Traversal", weight: 100, description: "Correct insertion" }],
  };

  // Create submission for Q1 attempt 1
  const subQ1v1 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q1Id,
    attemptNumber: 1,
    answerText: "Incomplete bubble sort without loops",
    status: "submitted",
    save: async function () { return this; },
  };

  // Create revised submission for Q1 attempt 2
  const subQ1v2 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q1Id,
    attemptNumber: 2,
    answerText: "Complete bubble sort: Compare adjacent elements in nested loops and swap if left > right until sorted.",
    status: "submitted",
    save: async function () { return this; },
  };

  // Create submission for Q2 attempt 1
  const subQ2v1 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q2Id,
    attemptNumber: 1,
    answerText: "BST Insertion: Start from root. If value < current, go left. If value > current, go right. Insert at null.",
    status: "submitted",
    save: async function () { return this; },
  };

  const mockProgress = {
    examId,
    studentId,
    status: "awaiting_faculty_evaluation",
    conceptualStatus: "submitted",
    questionProgress: new Map([
      [q1Id.toString(), { questionId: q1Id, status: "awaiting_faculty_evaluation", conceptualStatus: "submitted" }],
      [q2Id.toString(), { questionId: q2Id, status: "awaiting_faculty_evaluation", conceptualStatus: "submitted" }],
    ]),
    save: async function () { return this; },
  };

  Exam.findById = async () => mockExam;
  User.findById = () => ({ select: async () => mockStudent });
  StudentExamProgress.findOne = async () => mockProgress;
  ExamAuditLog.create = async () => ({});

  ExamQuestion.findById = async (id) => {
    if (id.toString() === q1Id.toString()) return mockQ1;
    if (id.toString() === q2Id.toString()) return mockQ2;
    return null;
  };

  ExamAnswerSubmission.findOne = (query) => {
    const qIdStr = query.questionId?.toString();
    return {
      sort: async () => {
        if (qIdStr === q1Id.toString()) return subQ1v2; // returns latest attempt 2
        if (qIdStr === q2Id.toString()) return subQ2v1;
        return null;
      },
    };
  };

  // 1. Evaluate Question 1
  const req1 = {
    params: { examId: examId.toString(), studentId: studentId.toString() },
    user: { userId: new mongoose.Types.ObjectId().toString(), role: "admin" },
    body: { questionId: q1Id.toString() },
  };
  const res1 = createMockRes();
  await facultyEvaluateStudentPaper(req1, res1, () => {});

  assert.equal(res1.statusCode, 200);
  assert.equal(res1.data.questionId.toString(), q1Id.toString());
  assert.equal(res1.data.questionTitle, "Bubble Sort Algorithm");
  assert.equal(res1.data.attemptNumber, 2);
  assert.equal(res1.data.conceptualAnswer, subQ1v2.answerText);
  assert.equal(res1.data.submissionId.toString(), subQ1v2._id.toString());
  assert.ok(res1.data.understandingPercentage >= 0 && res1.data.understandingPercentage <= 100);

  // 2. Evaluate Question 2
  const req2 = {
    params: { examId: examId.toString(), studentId: studentId.toString() },
    user: { userId: new mongoose.Types.ObjectId().toString(), role: "admin" },
    body: { questionId: q2Id.toString() },
  };
  const res2 = createMockRes();
  await facultyEvaluateStudentPaper(req2, res2, () => {});

  assert.equal(res2.statusCode, 200);
  assert.equal(res2.data.questionId.toString(), q2Id.toString());
  assert.equal(res2.data.questionTitle, "Binary Search Tree Insertion");
  assert.equal(res2.data.attemptNumber, 1);
  assert.equal(res2.data.conceptualAnswer, subQ2v1.answerText);
  assert.equal(res2.data.submissionId.toString(), subQ2v1._id.toString());

  // 3. Verify Question 1 and Question 2 evaluations are completely isolated in questionProgress
  const q1Prog = mockProgress.questionProgress.get(q1Id.toString());
  const q2Prog = mockProgress.questionProgress.get(q2Id.toString());
  assert.ok(q1Prog);
  assert.ok(q2Prog);
  assert.equal(q1Prog.status, "waiting_faculty_decision");
  assert.equal(q2Prog.status, "waiting_faculty_decision");
  assert.ok(q1Prog.lastAIEvaluation);
  assert.ok(q2Prog.lastAIEvaluation);

  // Cleanup mocks
  Exam.findById = originalExamFindById;
  User.findById = originalUserFindById;
  StudentExamProgress.findOne = originalProgressFindOne;
  ExamQuestion.findById = originalQuestionFindById;
  ExamAnswerSubmission.findOne = originalSubFindOne;
  ExamAuditLog.create = originalAuditCreate;
});

test("10. Task 5: Proceed to Code for Every Exam Question with strict per-question authorization and draft isolation", async () => {
  const {
    getMyAssignedQuestion,
    facultyAuthorizeCompiler,
    runExamCode,
    submitExamCode,
  } = await import("../controllers/examController.js");
  const ExamQuestion = (await import("../models/ExamQuestion.js")).default;
  const User = (await import("../models/User.js")).default;

  const originalExamFindById = Exam.findById;
  const originalExamFindOne = Exam.findOne;
  const originalUserFindById = User.findById;
  const originalProgressFindOne = StudentExamProgress.findOne;
  const originalAllocationFindOne = ExamAllocation.findOne;
  const originalQuestionFindById = ExamQuestion.findById;
  const originalSubFindOne = ExamAnswerSubmission.findOne;
  const originalAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();

  const q1Id = new mongoose.Types.ObjectId();
  const q2Id = new mongoose.Types.ObjectId();
  const q3Id = new mongoose.Types.ObjectId();

  const mockExam = {
    _id: examId,
    title: "Advanced Data Structures & Algorithms Lab",
    subject: "Computer Science",
    durationMinutes: 180,
    status: "in_progress",
    questionsPerStudent: 3,
    participatingStudents: [studentId],
  };

  const mockQuestions = [
    {
      _id: q1Id,
      questionNumber: "Q1",
      title: "Binary Tree Inorder Traversal",
      difficulty: "Easy",
      marks: 10,
      problemStatement: "Print inorder traversal of binary tree.",
      testCases: [
        { input: "1 2 3", expectedOutput: "2 1 3\n", isHidden: false },
        { input: "4 5", expectedOutput: "5 4\n", isHidden: true },
      ],
    },
    {
      _id: q2Id,
      questionNumber: "Q2",
      title: "Dijkstra Shortest Path",
      difficulty: "Medium",
      marks: 15,
      problemStatement: "Compute single source shortest path.",
      testCases: [
        { input: "3 3\n0 1 1", expectedOutput: "0 1\n", isHidden: false },
        { input: "4 4\n0 2 5", expectedOutput: "0 2\n", isHidden: true },
      ],
    },
    {
      _id: q3Id,
      questionNumber: "Q3",
      title: "Knapsack 0/1 Dynamic Programming",
      difficulty: "Hard",
      marks: 20,
      problemStatement: "Determine max value in knapsack.",
      testCases: [
        { input: "3 50\n60 10\n100 20\n120 30", expectedOutput: "220\n", isHidden: false },
        { input: "2 20\n10 5\n20 10", expectedOutput: "30\n", isHidden: true },
      ],
    },
  ];

  const mockAllocation = {
    examId,
    studentId,
    questionId: q1Id,
    assignedQuestionIds: mockQuestions,
  };

  const mockProgress = {
    examId,
    studentId,
    instructionsAcknowledged: true,
    status: "in_progress",
    compilerAllowed: false, // top-level remains false initially
    questionProgress: new Map([
      [
        q1Id.toString(),
        {
          questionId: q1Id,
          status: "waiting_faculty_decision",
          conceptualStatus: "evaluated",
          compilerAllowed: false,
          currentCode: "/* Q1 Draft Code */",
          lastAIEvaluation: { errorPercentage: 10, understandingPercentage: 90 },
        },
      ],
      [
        q2Id.toString(),
        {
          questionId: q2Id,
          status: "awaiting_faculty_evaluation",
          conceptualStatus: "submitted",
          compilerAllowed: false,
          currentCode: "/* Q2 Draft Code */",
          lastAIEvaluation: null,
        },
      ],
      [
        q3Id.toString(),
        {
          questionId: q3Id,
          status: "notepad_pending",
          conceptualStatus: "pending",
          compilerAllowed: false,
          currentCode: "/* Q3 Draft Code */",
          lastAIEvaluation: null,
        },
      ],
    ]),
    save: async function () { return this; },
  };

  // Submissions for the questions
  const mockSubmissions = new Map([
    [
      q1Id.toString(),
      {
        _id: new mongoose.Types.ObjectId(),
        examId,
        studentId,
        questionId: q1Id,
        attemptNumber: 1,
        status: "evaluated",
        aiEvaluation: { errorPercentage: 10, understandingPercentage: 90 },
        isApproved: false,
        save: async function () { return this; },
      },
    ],
    [
      q2Id.toString(),
      {
        _id: new mongoose.Types.ObjectId(),
        examId,
        studentId,
        questionId: q2Id,
        attemptNumber: 1,
        status: "evaluated",
        aiEvaluation: { errorPercentage: 20, understandingPercentage: 80 },
        isApproved: false,
        save: async function () { return this; },
      },
    ],
    [
      q3Id.toString(),
      {
        _id: new mongoose.Types.ObjectId(),
        examId,
        studentId,
        questionId: q3Id,
        attemptNumber: 1,
        status: "evaluated",
        aiEvaluation: { errorPercentage: 15, understandingPercentage: 85 },
        isApproved: false,
        save: async function () { return this; },
      },
    ],
  ]);

  Exam.findById = async () => mockExam;
  Exam.findOne = () => ({ select: async () => mockExam });
  User.findById = () => ({ select: async () => ({ _id: studentId, username: "Bob", rollNo: "S210200" }) });
  StudentExamProgress.findOne = async () => mockProgress;
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => mockAllocation,
      }),
    }),
  });
  ExamQuestion.findById = async (id) => mockQuestions.find((q) => q._id.toString() === id.toString()) || null;
  ExamAnswerSubmission.findOne = (query) => {
    const qKey = query.questionId?.toString();
    const sub = mockSubmissions.get(qKey);
    return {
      sort: async () => sub || null,
      lean: async () => (query.isApproved ? (sub?.isApproved ? sub : null) : sub),
    };
  };
  ExamAnswerSubmission.find = () => ({
    sort: () => ({
      lean: async () => [],
    }),
  });
  ExamAuditLog.create = async () => ({});

  // STEP 1: Question 1 initially not allowed
  const reqCheckQ1Before = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    query: { questionId: q1Id.toString() },
  };
  const resCheckQ1Before = createMockRes();
    await getMyAssignedQuestion(reqCheckQ1Before, resCheckQ1Before, () => {});
  assert.equal(resCheckQ1Before.statusCode, 200);
  assert.equal(resCheckQ1Before.data.progress.compilerAllowed, false);

  // STEP 2: Faculty approves Question 1 ("Allow to Code")
  const reqAuthQ1 = {
    params: { examId: examId.toString(), studentId: studentId.toString() },
    user: { userId: facultyId.toString(), role: "faculty" },
    body: { questionId: q1Id.toString() },
  };
  const resAuthQ1 = createMockRes();
  await facultyAuthorizeCompiler(reqAuthQ1, resAuthQ1, () => {});
  assert.equal(resAuthQ1.statusCode, 200);
  assert.equal(resAuthQ1.data.compilerAllowed, true);

  // STEP 3: Verify Question 1 now has compilerAllowed: true, but Question 2 and Question 3 REMAIN LOCKED (false)
  const reqCheckQ1 = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    query: { questionId: q1Id.toString() },
  };
  const resCheckQ1 = createMockRes();
  await getMyAssignedQuestion(reqCheckQ1, resCheckQ1, () => {});
  assert.equal(resCheckQ1.statusCode, 200);
  assert.equal(resCheckQ1.data.progress.compilerAllowed, true);
  assert.equal(resCheckQ1.data.question.title, "Binary Tree Inorder Traversal");
  assert.equal(resCheckQ1.data.progress.currentCode, "/* Q1 Draft Code */");

  // Verify Question 2 is strictly locked
  const reqCheckQ2 = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    query: { questionId: q2Id.toString() },
  };
  const resCheckQ2 = createMockRes();
  await getMyAssignedQuestion(reqCheckQ2, resCheckQ2, () => {});
  assert.equal(resCheckQ2.statusCode, 200);
  assert.equal(resCheckQ2.data.progress.compilerAllowed, false, "Q2 must remain locked when Q1 was unlocked");
  assert.equal(resCheckQ2.data.question.title, "Dijkstra Shortest Path");
  assert.equal(resCheckQ2.data.progress.currentCode, "/* Q2 Draft Code */");

  // Verify backend execution rejects Q2 since it is still locked
  const reqRunQ2 = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    body: { code: "int main() { return 0; }", questionId: q2Id.toString() },
  };
  const resRunQ2 = createMockRes();
  await runExamCode(reqRunQ2, resRunQ2, () => {});
  assert.equal(resRunQ2.statusCode, 403, "Backend must reject code execution on locked Question 2");

  // STEP 4: Now faculty approves Question 2
  const reqAuthQ2 = {
    params: { examId: examId.toString(), studentId: studentId.toString() },
    user: { userId: facultyId.toString(), role: "faculty" },
    body: { questionId: q2Id.toString() },
  };
  const resAuthQ2 = createMockRes();
  await facultyAuthorizeCompiler(reqAuthQ2, resAuthQ2, () => {});
  assert.equal(resAuthQ2.statusCode, 200);

  // STEP 5: Verify Question 2 is now unlocked, while Question 3 still remains locked
  const reqCheckQ2After = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    query: { questionId: q2Id.toString() },
  };
  const resCheckQ2After = createMockRes();
  await getMyAssignedQuestion(reqCheckQ2After, resCheckQ2After, () => {});
  assert.equal(resCheckQ2After.statusCode, 200);
  assert.equal(resCheckQ2After.data.progress.compilerAllowed, true, "Q2 must now be unlocked");

  // Question 3 is still locked
  const reqCheckQ3 = {
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    query: { questionId: q3Id.toString() },
  };
  const resCheckQ3 = createMockRes();
  await getMyAssignedQuestion(reqCheckQ3, resCheckQ3, () => {});
  assert.equal(resCheckQ3.statusCode, 200);
  assert.equal(resCheckQ3.data.progress.compilerAllowed, false, "Q3 must still be locked");

  // STEP 6: Now faculty approves Question 3
  const reqAuthQ3 = {
    params: { examId: examId.toString(), studentId: studentId.toString() },
    user: { userId: facultyId.toString(), role: "faculty" },
    body: { questionId: q3Id.toString() },
  };
  const resAuthQ3 = createMockRes();
  await facultyAuthorizeCompiler(reqAuthQ3, resAuthQ3, () => {});
  assert.equal(resAuthQ3.statusCode, 200);

  // Verify Question 3 is now unlocked
  const resCheckQ3After = createMockRes();
  await getMyAssignedQuestion(reqCheckQ3, resCheckQ3After, () => {});
  assert.equal(resCheckQ3After.statusCode, 200);
  assert.equal(resCheckQ3After.data.progress.compilerAllowed, true, "Q3 must now be unlocked");
  assert.equal(resCheckQ3After.data.question.title, "Knapsack 0/1 Dynamic Programming");

  // Restore mocks
  Exam.findById = originalExamFindById;
  Exam.findOne = originalExamFindOne;
  User.findById = originalUserFindById;
  StudentExamProgress.findOne = originalProgressFindOne;
  ExamAllocation.findOne = originalAllocationFindOne;
  ExamQuestion.findById = originalQuestionFindById;
  ExamAnswerSubmission.findOne = originalSubFindOne;
  ExamAuditLog.create = originalAuditCreate;
});


test("11. Task 6: Comprehensive Test Case Execution and Individual Results Reporting", async () => {
  const { runCCode, judgeSubmission, normalizeOutput } = await import("../services/judgeService.js");
  const { runExamCode, submitExamCode } = await import("../controllers/examController.js");
  const Exam = (await import("../models/Exam.js")).default;
  const User = (await import("../models/User.js")).default;
  const StudentExamProgress = (await import("../models/StudentExamProgress.js")).default;
  const ExamAllocation = (await import("../models/ExamAllocation.js")).default;
  const ExamQuestion = (await import("../models/ExamQuestion.js")).default;
  const ExamCodeSubmission = (await import("../models/ExamCodeSubmission.js")).default;
  const ExamAnswerSubmission = (await import("../models/ExamAnswerSubmission.js")).default;

  const sampleCases = [
    { testCaseNumber: 1, input: "1 2\n", expectedOutput: "3\n", isHidden: false },
    { testCaseNumber: 2, input: "5 5\n", expectedOutput: "10\n", isHidden: false },
    { testCaseNumber: 3, input: "10 20\n", expectedOutput: "30\n", isHidden: false },
  ];

  // Scenario 1: Code that passes all sample cases
  const allPassCode = `
#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}
  `;
  const resAllPass = await runCCode({
    code: allPassCode,
    sampleCases,
    problemTitle: "Sum All Pass",
  });
  assert.equal(resAllPass.mode, "sample");
  assert.equal(resAllPass.totalTestCases, 3);
  assert.equal(resAllPass.testCasesPassed, 3);
  assert.equal(resAllPass.status, "accepted");
  assert.equal(resAllPass.testCases[0].status, "passed");
  assert.equal(resAllPass.testCases[1].status, "passed");
  assert.equal(resAllPass.testCases[2].status, "passed");

  // Scenario 2: Code that passes some and fails others (Pass 1 & 2, fail 3)
  const partialPassCode = `
#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        if (a == 10 && b == 20) {
            printf("999\\n"); // intentional fail
        } else {
            printf("%d\\n", a + b);
        }
    }
    return 0;
}
  `;
  const resPartial = await runCCode({
    code: partialPassCode,
    sampleCases,
    problemTitle: "Sum Partial Pass",
  });
  assert.equal(resPartial.totalTestCases, 3);
  assert.equal(resPartial.testCasesPassed, 2);
  assert.equal(resPartial.status, "wrong_answer");
  assert.equal(resPartial.testCases[0].status, "passed");
  assert.equal(resPartial.testCases[1].status, "passed");
  assert.equal(resPartial.testCases[2].status, "failed");
  assert.equal(resPartial.testCases[2].expectedOutput, "30\n");
  assert.equal(resPartial.testCases[2].actualOutput.trim(), "999");

  // Scenario 3: Code that fails every case
  const allFailCode = `
#include <stdio.h>
int main() {
    printf("-1\\n");
    return 0;
}
  `;
  const resAllFail = await runCCode({
    code: allFailCode,
    sampleCases,
    problemTitle: "Sum All Fail",
  });
  assert.equal(resAllFail.testCasesPassed, 0);
  assert.equal(resAllFail.status, "wrong_answer");
  assert.equal(resAllFail.testCases[0].status, "failed");
  assert.equal(resAllFail.testCases[1].status, "failed");
  assert.equal(resAllFail.testCases[2].status, "failed");

  // Scenario 4: Compilation error
  const compileErrorCode = `
#include <stdio.h>
int main() {
    this_is_a_syntax_error();
    return 0
}
  `;
  const resCompileErr = await runCCode({
    code: compileErrorCode,
    sampleCases,
    problemTitle: "Compile Error Test",
  });
  assert.equal(resCompileErr.status, "compile_error");
  assert.equal(resCompileErr.testCasesPassed, 0);
  assert.ok(resCompileErr.compilerOutput && resCompileErr.compilerOutput.length > 0);
  assert.equal(resCompileErr.testCases[0].status, "compile_error");

  // Scenario 5: Runtime error (division by zero / SIGFPE or segfault)
  const runtimeErrorCode = `
#include <stdio.h>
#include <stdlib.h>
int main() {
    int *p = NULL;
    *p = 42; // Segmentation fault
    return 0;
}
  `;
  const resRuntimeErr = await runCCode({
    code: runtimeErrorCode,
    sampleCases,
    problemTitle: "Runtime Error Test",
  });
  assert.equal(resRuntimeErr.status, "runtime_error");
  assert.equal(resRuntimeErr.testCasesPassed, 0);
  assert.ok(resRuntimeErr.testCases[0].status === "runtime_error");
  assert.ok(resRuntimeErr.testCases[0].error.length > 0);

  // Scenario 6: Pattern-printing whitespace normalization preserves line breaks
  const patternInput = "3\n*  \n** \n***\n";
  const normalized = normalizeOutput(patternInput);
  assert.equal(normalized, "3\n*\n**\n***");

  // Scenario 7: Hidden test privacy during final Submit
  const mixedTestCases = [
    { testCaseNumber: 1, input: "1 2\n", expectedOutput: "3\n", isHidden: false },
    { testCaseNumber: 2, input: "100 200\n", expectedOutput: "300\n", isHidden: true },
  ];
  const judgeSubmissionRes = await judgeSubmission({
    code: allPassCode,
    testCases: mixedTestCases,
    problemTitle: "Mixed Tests Submit",
  });
  assert.equal(judgeSubmissionRes.status, "accepted");
  assert.equal(judgeSubmissionRes.testCasesPassed, 2);

  const { sanitizeExamCodeSubmissionForStudent } = await import("../models/ExamCodeSubmission.js");
  const mockSubDoc = {
    testCasesPassed: 2,
    totalTestCases: 2,
    testCaseResults: judgeSubmissionRes.testCaseResults,
  };
  const sanitizedForStudent = sanitizeExamCodeSubmissionForStudent(mockSubDoc);
  // Hidden case must have input and expectedOutput redacted
  const hiddenCase = sanitizedForStudent.testCases.find((tc) => tc.isHidden);
  assert.ok(hiddenCase);
  assert.equal(hiddenCase.input, undefined);
  assert.equal(hiddenCase.expectedOutput, undefined);
  assert.equal(hiddenCase.visibility, "hidden");
  assert.equal(hiddenCase.passed, true);
});

test("12. Task 7: Student Dashboard Exam Status and Dynamic Progress Tracking", async () => {
  const { getStudentExams, endStudentExam } = await import("../controllers/examController.js");
  const Exam = (await import("../models/Exam.js")).default;
  const StudentExamProgress = (await import("../models/StudentExamProgress.js")).default;
  const ExamAllocation = (await import("../models/ExamAllocation.js")).default;
  const ExamAuditLog = (await import("../models/ExamAuditLog.js")).default;

  const originalExamFind = Exam.find;
  const originalProgFind = StudentExamProgress.find;
  const originalAllocFind = ExamAllocation.find;
  const originalProgFindOne = StudentExamProgress.findOne;
  const originalAuditCreate = ExamAuditLog.create;

  ExamAuditLog.create = async () => ({});

  const examId = new mongoose.Types.ObjectId();
  const studentAId = new mongoose.Types.ObjectId();
  const studentBId = new mongoose.Types.ObjectId();
  const q1Id = new mongoose.Types.ObjectId();
  const q2Id = new mongoose.Types.ObjectId();

  const mockExam = {
    _id: examId,
    title: "Mid-Term C Lab Exam",
    subject: "Computer Science",
    examType: "internal",
    status: "in_progress",
    durationMinutes: 120,
    questionsPerStudent: 2,
    participatingStudents: [studentAId, studentBId],
  };

  Exam.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [mockExam],
      }),
    }),
  });

  ExamAllocation.find = (filter) => ({
    lean: async () => {
      const sId = filter.studentId?.toString();
      if (sId === studentAId.toString() || sId === studentBId.toString()) {
        return [
          {
            examId,
            studentId: filter.studentId,
            assignedQuestionIds: [q1Id, q2Id],
          },
        ];
      }
      return [];
    },
  });

  // State store for student progress
  const progressMap = new Map();

  StudentExamProgress.find = (filter) => ({
    lean: async () => {
      const sId = filter.studentId?.toString();
      const prog = progressMap.get(`${filter.examId?.$in ? examId.toString() : filter.examId}_${sId}`);
      return prog ? [prog] : [];
    },
  });

  // STAGE 1: Before starting -> Not Started
  // No progress record exists yet (or status: "not_started" and instructionsAcknowledged: false)
  const reqA1 = { user: { userId: studentAId.toString() }, query: {} };
  const resA1 = createMockRes();
  await getStudentExams(reqA1, resA1, () => {});
  assert.equal(resA1.statusCode, 200);
  assert.equal(resA1.data.exams[0].displayProgress, "Not Started");
  assert.equal(resA1.data.exams[0].studentStatus, "not_started");
  assert.equal(resA1.data.exams[0].completedQuestionsCount, 0);
  assert.equal(resA1.data.exams[0].totalAssignedQuestions, 2);

  // STAGE 2: After starting (instructions acknowledged), before completing any question -> In Progress (0/2 Completed)
  progressMap.set(`${examId}_${studentAId}`, {
    examId,
    studentId: studentAId,
    instructionsAcknowledged: true,
    status: "in_progress",
    questionProgress: {
      [q1Id.toString()]: { questionId: q1Id, isCompleted: false },
      [q2Id.toString()]: { questionId: q2Id, isCompleted: false },
    },
  });
  const resA2 = createMockRes();
  await getStudentExams(reqA1, resA2, () => {});
  assert.equal(resA2.statusCode, 200);
  assert.equal(resA2.data.exams[0].displayProgress, "In Progress (0/2 Completed)");
  assert.equal(resA2.data.exams[0].studentStatus, "in_progress");
  assert.equal(resA2.data.exams[0].completedQuestionsCount, 0);

  // STAGE 3: After completing Question 1 -> In Progress (1/2 Completed)
  progressMap.set(`${examId}_${studentAId}`, {
    examId,
    studentId: studentAId,
    instructionsAcknowledged: true,
    status: "in_progress",
    questionProgress: {
      [q1Id.toString()]: { questionId: q1Id, isCompleted: true },
      [q2Id.toString()]: { questionId: q2Id, isCompleted: false },
    },
  });
  const resA3 = createMockRes();
  await getStudentExams(reqA1, resA3, () => {});
  assert.equal(resA3.statusCode, 200);
  assert.equal(resA3.data.exams[0].displayProgress, "In Progress (1/2 Completed)");
  assert.equal(resA3.data.exams[0].completedQuestionsCount, 1);

  // STAGE 4: Completing Question 2 without final exam submission must NOT mark exam as Completed
  // It should show In Progress (2/2 Completed) until endStudentExam or successfully_completed
  progressMap.set(`${examId}_${studentAId}`, {
    examId,
    studentId: studentAId,
    instructionsAcknowledged: true,
    status: "in_progress",
    questionProgress: {
      [q1Id.toString()]: { questionId: q1Id, isCompleted: true },
      [q2Id.toString()]: { questionId: q2Id, isCompleted: true },
    },
  });
  const resA4 = createMockRes();
  await getStudentExams(reqA1, resA4, () => {});
  assert.equal(resA4.statusCode, 200);
  assert.equal(resA4.data.exams[0].displayProgress, "In Progress (2/2 Completed)");
  assert.equal(resA4.data.exams[0].completedQuestionsCount, 2);

  // STAGE 5: After student explicitly ends the exam -> Completed (2/2 Completed)
  const currentProgDoc = {
    examId,
    studentId: studentAId,
    instructionsAcknowledged: true,
    status: "in_progress",
    questionProgress: {
      [q1Id.toString()]: { questionId: q1Id, isCompleted: true },
      [q2Id.toString()]: { questionId: q2Id, isCompleted: true },
    },
    save: async function() {
      progressMap.set(`${examId}_${studentAId}`, { ...this });
      return this;
    },
  };
  StudentExamProgress.findOne = async () => currentProgDoc;

  const reqEnd = { params: { examId: examId.toString() }, user: { userId: studentAId.toString() } };
  const resEnd = createMockRes();
  Exam.findById = (id) => ({
    select: () => mockExam,
  });
  await endStudentExam(reqEnd, resEnd, () => {});
  assert.equal(resEnd.statusCode, 200);

  const resA5 = createMockRes();
  await getStudentExams(reqA1, resA5, () => {});
  assert.equal(resA5.statusCode, 200);
  assert.equal(resA5.data.exams[0].displayProgress, "Completed (2/2 Completed)");
  assert.equal(resA5.data.exams[0].studentStatus, "successfully_completed");
  assert.equal(resA5.data.exams[0].isCompleted, true);

  // STAGE 6: Student B attending the same exam independently -> remains Not Started
  const reqB = { user: { userId: studentBId.toString() }, query: {} };
  const resB = createMockRes();
  await getStudentExams(reqB, resB, () => {});
  assert.equal(resB.statusCode, 200);
  assert.equal(resB.data.exams[0].displayProgress, "Not Started");
  assert.equal(resB.data.exams[0].studentStatus, "not_started");
  assert.equal(resB.data.exams[0].completedQuestionsCount, 0);

  // Restore mocks
  Exam.find = originalExamFind;
  StudentExamProgress.find = originalProgFind;
  ExamAllocation.find = originalAllocFind;
  StudentExamProgress.findOne = originalProgFindOne;
  ExamAuditLog.create = originalAuditCreate;
  delete Exam.findById;
});

test("13. Task 8: Exam Completion Screen and Final Exam State Protection", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentAId = new mongoose.Types.ObjectId();
  const studentBId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const originalExamFindOne = Exam.findOne;
  const originalExamFindById = Exam.findById;
  const originalProgFindOne = StudentExamProgress.findOne;
  const originalAllocFindOne = ExamAllocation.findOne;
  const originalAuditCreate = ExamAuditLog.create;

  const mockExam = {
    _id: examId,
    title: "Final CS Examination",
    subject: "Data Structures",
    examType: "internal",
    durationMinutes: 90,
    totalMarks: 50,
    status: "in_progress",
    participatingStudents: [studentAId, studentBId],
  };

  const progressStore = new Map();
  progressStore.set(`${examId}_${studentAId}`, {
    examId,
    studentId: studentAId,
    status: "in_progress",
    instructionsAcknowledged: true,
    lastConceptualAnswer: "Detailed binary tree traversal explanation",
    compilerAllowed: true,
    save: async function() {
      progressStore.set(`${examId}_${studentAId}`, { ...this });
      return this;
    },
  });

  Exam.findById = (id) => ({
    select: () => (id.toString() === examId.toString() ? mockExam : null),
  });

  Exam.findOne = (query) => {
    if (query._id && query._id.toString() === examId.toString()) {
      if (query.participatingStudents) {
        const studentIdStr = query.participatingStudents.toString();
        if (studentIdStr === studentAId.toString() || studentIdStr === studentBId.toString()) {
          return {
            select: () => mockExam,
          };
        }
      }
      return { select: () => mockExam };
    }
    return { select: () => null };
  };

  StudentExamProgress.findOne = async ({ examId: eId, studentId: sId }) => {
    return progressStore.get(`${eId}_${sId}`) || null;
  };

  ExamAuditLog.create = async () => ({ _id: new mongoose.Types.ObjectId() });

  // 1. Student A ends their exam
  const reqEndA = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
  };
  const resEndA = createMockRes();
  await endStudentExam(reqEndA, resEndA, () => {});
  assert.equal(resEndA.statusCode, 200);
  assert.equal(resEndA.data.status, "successfully_completed");
  assert.equal(resEndA.data.isCompleted, true);

  // 2. Calling endStudentExam again is idempotent and safe
  const resEndA2 = createMockRes();
  await endStudentExam(reqEndA, resEndA2, () => {});
  assert.equal(resEndA2.statusCode, 200);
  assert.equal(resEndA2.data.status, "successfully_completed");
  assert.equal(resEndA2.data.isCompleted, true);

  // 3. Student A attempting to access question route gets locked out with redirect to /completed
  const reqGetQA = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    query: {},
  };
  const resGetQA = createMockRes();
  await getMyAssignedQuestion(reqGetQA, resGetQA, () => {});
  assert.equal(resGetQA.statusCode, 403);
  assert.equal(resGetQA.data.isCompleted, true);
  assert.equal(resGetQA.data.redirect, `/exams/${examId}/completed`);

  // 4. Student A attempting to autosave drafts or run code is rejected with HTTP 403
  const reqDraftCodeA = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: { code: "int main() {}", questionId: qId.toString() },
  };
  const resDraftCodeA = createMockRes();
  await autosaveCodeDraft(reqDraftCodeA, resDraftCodeA, () => {});
  assert.equal(resDraftCodeA.statusCode, 403);
  assert.equal(resDraftCodeA.data.isCompleted, true);

  const reqDraftAnsA = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: { answerText: "New answer edit", questionId: qId.toString() },
  };
  const resDraftAnsA = createMockRes();
  await autosaveAnswerDraft(reqDraftAnsA, resDraftAnsA, () => {});
  assert.equal(resDraftAnsA.statusCode, 403);
  assert.equal(resDraftAnsA.data.isCompleted, true);

  const reqRunCodeA = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: { code: "int main() {}", questionId: qId.toString() },
  };
  const resRunCodeA = createMockRes();
  await runExamCode(reqRunCodeA, resRunCodeA, () => {});
  assert.equal(resRunCodeA.statusCode, 403);
  assert.equal(resRunCodeA.data.isCompleted, true);

  // 5. Unenrolled student attempting to end exam gets 403
  const unenrolledId = new mongoose.Types.ObjectId();
  const reqEndUnenrolled = {
    params: { examId: examId.toString() },
    user: { userId: unenrolledId.toString() },
  };
  const resEndUnenrolled = createMockRes();
  await endStudentExam(reqEndUnenrolled, resEndUnenrolled, () => {});
  assert.equal(resEndUnenrolled.statusCode, 403);

  // Restore mocks
  Exam.findOne = originalExamFindOne;
  Exam.findById = originalExamFindById;
  StudentExamProgress.findOne = originalProgFindOne;
  ExamAllocation.findOne = originalAllocFindOne;
  ExamAuditLog.create = originalAuditCreate;
});

test("14. Bug Fix: Notepad Draft Autosave, Per-Question Restoration, Race Condition & Student Isolation", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentAId = new mongoose.Types.ObjectId();
  const studentBId = new mongoose.Types.ObjectId();
  const q1Id = new mongoose.Types.ObjectId();
  const q2Id = new mongoose.Types.ObjectId();

  const originalExamFindOne = Exam.findOne;
  const originalProgFindOne = StudentExamProgress.findOne;
  const originalAllocFindOne = ExamAllocation.findOne;
  const originalAnswerFind = ExamAnswerSubmission.find;

  const mockExam = {
    _id: examId,
    title: "Data Structures Lab",
    subject: "C Programming",
    durationMinutes: 90,
    maxConceptualAttempts: 99,
    startedAt: new Date(),
    questionsPerStudent: 2,
    status: "in_progress",
  };

  const mockQ1 = {
    _id: q1Id,
    questionNumber: "Q1",
    title: "Stack Using Array",
    problemStatement: "Implement stack operations.",
    difficulty: "Easy",
    marks: 10,
    testCases: [],
  };

  const mockQ2 = {
    _id: q2Id,
    questionNumber: "Q2",
    title: "Queue Using Linked List",
    problemStatement: "Implement queue operations.",
    difficulty: "Medium",
    marks: 15,
    testCases: [],
  };

  Exam.findOne = () => ({
    select: async () => mockExam,
  });

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId: studentAId,
          assignedQuestionIds: [mockQ1, mockQ2],
        }),
      }),
    }),
  });

  ExamAnswerSubmission.find = () => ({
    sort: () => ({
      lean: async () => [],
    }),
  });

  // Simulate Mongoose-like Map where entries may have .toObject()
  const createProgressDoc = (sId) => {
    const mapStore = new Map();
    const doc = {
      examId,
      studentId: sId,
      status: "notepad_pending",
      instructionsAcknowledged: true,
      lastConceptualAnswer: "",
      answerDraftVersion: 0,
      lastAnswerSavedAt: null,
      questionProgress: {
        get(k) {
          const val = mapStore.get(k);
          if (!val) return undefined;
          return {
            ...val,
            toObject() {
              return { ...val };
            },
          };
        },
        set(k, v) {
          mapStore.set(k, { ...v });
        },
      },
      markModified() {},
      save: async function () {
        return this;
      },
    };
    return doc;
  };

  const progA = createProgressDoc(studentAId);
  const progB = createProgressDoc(studentBId);

  StudentExamProgress.findOne = async ({ studentId: sId }) => {
    if (sId.toString() === studentAId.toString()) return progA;
    if (sId.toString() === studentBId.toString()) return progB;
    return null;
  };

  // 1. Student A writes draft in Q1 (version 1)
  const reqSaveQ1 = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: {
      answerText: "Q1 Stack push and pop algorithm using top pointer.",
      questionId: q1Id.toString(),
      version: 1,
    },
  };
  const resSaveQ1 = createMockRes();
  await autosaveAnswerDraft(reqSaveQ1, resSaveQ1, () => {});
  assert.equal(resSaveQ1.statusCode, 200);
  assert.equal(resSaveQ1.data.version, 1);
  assert.ok(resSaveQ1.data.savedAt);

  // 2. Student A navigates to Q2 and writes draft in Q2 (version 1)
  const reqSaveQ2 = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: {
      answerText: "Q2 Queue enqueue and dequeue using front and rear pointers.",
      questionId: q2Id.toString(),
      version: 1,
    },
  };
  const resSaveQ2 = createMockRes();
  await autosaveAnswerDraft(reqSaveQ2, resSaveQ2, () => {});
  assert.equal(resSaveQ2.statusCode, 200);

  // 3. Student A returns to Q1 (or refreshes browser / returns from Code Editor) -> Q1 draft is restored accurately
  const reqFetchQ1 = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    query: { questionId: q1Id.toString() },
  };
  const resFetchQ1 = createMockRes();
  await getMyAssignedQuestion(reqFetchQ1, resFetchQ1, () => {});
  assert.equal(resFetchQ1.statusCode, 200);
  assert.equal(
    resFetchQ1.data.progress.lastConceptualAnswer,
    "Q1 Stack push and pop algorithm using top pointer."
  );
  assert.equal(resFetchQ1.data.progress.conceptualStatus, "pending", "Draft save must NOT submit or trigger evaluation");

  // 4. Student A checks Q2 -> Q2 draft is independent and intact
  const reqFetchQ2 = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    query: { questionId: q2Id.toString() },
  };
  const resFetchQ2 = createMockRes();
  await getMyAssignedQuestion(reqFetchQ2, resFetchQ2, () => {});
  assert.equal(resFetchQ2.statusCode, 200);
  assert.equal(
    resFetchQ2.data.progress.lastConceptualAnswer,
    "Q2 Queue enqueue and dequeue using front and rear pointers."
  );

  // 5. Rapid typing / Race condition: version 3 arrives before stale version 2 -> version 2 must NOT overwrite version 3
  const reqSaveQ1v3 = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: {
      answerText: "Q1 Updated v3 latest answer",
      questionId: q1Id.toString(),
      version: 3,
    },
  };
  const resSaveQ1v3 = createMockRes();
  await autosaveAnswerDraft(reqSaveQ1v3, resSaveQ1v3, () => {});
  assert.equal(resSaveQ1v3.statusCode, 200);
  assert.equal(resSaveQ1v3.data.version, 3);

  const reqSaveQ1v2Stale = {
    params: { examId: examId.toString() },
    user: { userId: studentAId.toString() },
    body: {
      answerText: "Q1 Stale v2 older answer",
      questionId: q1Id.toString(),
      version: 2,
    },
  };
  const resSaveQ1v2Stale = createMockRes();
  await autosaveAnswerDraft(reqSaveQ1v2Stale, resSaveQ1v2Stale, () => {});
  assert.equal(resSaveQ1v2Stale.statusCode, 200);
  assert.equal(resSaveQ1v2Stale.data.stale, true);

  const resFetchQ1AfterRace = createMockRes();
  await getMyAssignedQuestion(reqFetchQ1, resFetchQ1AfterRace, () => {});
  assert.equal(
    resFetchQ1AfterRace.data.progress.lastConceptualAnswer,
    "Q1 Updated v3 latest answer"
  );

  // 6. Student isolation: Student B's draft for Q1 is completely separate from Student A
  const reqSaveB = {
    params: { examId: examId.toString() },
    user: { userId: studentBId.toString() },
    body: {
      answerText: "Student B independent Q1 answer",
      questionId: q1Id.toString(),
      version: 1,
    },
  };
  const resSaveB = createMockRes();
  await autosaveAnswerDraft(reqSaveB, resSaveB, () => {});
  assert.equal(resSaveB.statusCode, 200);

  const reqFetchB = {
    params: { examId: examId.toString() },
    user: { userId: studentBId.toString() },
    query: { questionId: q1Id.toString() },
  };
  const resFetchB = createMockRes();
  await getMyAssignedQuestion(reqFetchB, resFetchB, () => {});
  assert.equal(resFetchB.data.progress.lastConceptualAnswer, "Student B independent Q1 answer");

  // Student A's Q1 draft must remain untouched by Student B
  const resFetchAAgain = createMockRes();
  await getMyAssignedQuestion(reqFetchQ1, resFetchAAgain, () => {});
  assert.equal(resFetchAAgain.data.progress.lastConceptualAnswer, "Q1 Updated v3 latest answer");

  // Restore mocks
  Exam.findOne = originalExamFindOne;
  StudentExamProgress.findOne = originalProgFindOne;
  ExamAllocation.findOne = originalAllocFindOne;
  ExamAnswerSubmission.find = originalAnswerFind;
});

test("15. Multi-Question Exam Navigation and Dual Completion Conditions (All Submitted vs Faculty Ended)", async () => {
  const examId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();
  const studentAId = new mongoose.Types.ObjectId();
  const studentBId = new mongoose.Types.ObjectId();
  const studentCId = new mongoose.Types.ObjectId();
  const qIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());

  const originalExamFindById = Exam.findById;
  const originalExamFindOne = Exam.findOne;
  const originalProgFindOne = StudentExamProgress.findOne;
  const originalProgUpdateMany = StudentExamProgress.updateMany;
  const originalAllocFindOne = ExamAllocation.findOne;
  const originalAnsFindOne = ExamAnswerSubmission.findOne;
  const originalAnsFind = ExamAnswerSubmission.find;
  const originalCodeCreate = ExamCodeSubmission.create;
  const originalCodeFindOne = ExamCodeSubmission.findOne;
  const originalAuditCreate = ExamAuditLog.create;
  const originalUserFindById = User.findById;

  const mockExam = {
    _id: examId,
    title: "5-Question Comprehensive C Exam",
    subject: "C Programming",
    examType: "internal",
    status: "in_progress",
    startedAt: new Date(Date.now() - 5 * 60 * 1000),
    durationMinutes: 120,
    totalMarks: 100,
    questionsPerStudent: 5,
    participatingStudents: [studentAId, studentBId, studentCId],
    completedAt: null,
    completedBy: null,
    save: async function () {
      return this;
    },
  };

  const makeMockQuestion = (idx) => ({
    _id: qIds[idx],
    questionNumber: `Q${idx + 1}`,
    title: `Problem ${idx + 1}`,
    marks: 20,
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
    ],
  });

  const fiveQuestions = qIds.map((_, idx) => makeMockQuestion(idx));
  const oneQuestion = [makeMockQuestion(0)];

  // Student A has 5 questions; Student B has 5 questions; Student C (tested via single) has 1
  const createProg = (sId, qCount) => {
    const mapStore = new Map();
    for (let i = 0; i < qCount; i++) {
      mapStore.set(qIds[i].toString(), {
        questionId: qIds[i],
        compilerAllowed: true,
        isCompleted: false,
        status: "compiler_access_granted",
        lastAIEvaluation: { errorPercentage: 10 },
      });
    }
    return {
      examId,
      studentId: sId,
      status: "in_progress",
      instructionsAcknowledged: true,
      completionReason: null,
      completedAt: null,
      finalScore: 0,
      questionProgress: {
        get(k) {
          const v = mapStore.get(k);
          return v ? { ...v, toObject: () => ({ ...v }) } : undefined;
        },
        set(k, v) {
          mapStore.set(k, { ...v });
        },
      },
      markModified() {},
      save: async function () {
        return this;
      },
    };
  };

  const progA = createProg(studentAId, 5);
  const progB = createProg(studentBId, 5);
  const progC = createProg(studentCId, 1);

  mockExam.select = () => mockExam;
  mockExam.lean = async () => mockExam;

  Exam.findById = () => mockExam;

  Exam.findOne = () => ({
    select: () => mockExam,
  });

  StudentExamProgress.findOne = (filter) => {
    const sId = filter.studentId?.toString();
    let doc = null;
    if (sId === studentAId.toString()) doc = progA;
    if (sId === studentBId.toString()) doc = progB;
    if (sId === studentCId.toString()) doc = progC;
    if (!doc) return null;
    doc.lean = async () => doc;
    return doc;
  };

  StudentExamProgress.updateMany = async (_filter, update) => {
    for (const p of [progA, progB, progC]) {
      if (p.status !== "successfully_completed" && p.status !== "completed") {
        Object.assign(p, update.$set);
      }
    }
  };

  ExamAllocation.findOne = (filter) => {
    const sId = filter.studentId?.toString();
    const assignedList = sId === studentCId.toString() ? oneQuestion : fiveQuestions;
    const alloc = { examId, studentId: filter.studentId, assignedQuestionIds: assignedList };
    return {
      populate: () => ({
        populate: () => ({
          lean: async () => alloc,
        }),
      }),
    };
  };

  ExamAnswerSubmission.findOne = () => ({
    sort: () => ({
      lean: async () => ({ isApproved: true, aiEvaluation: { errorPercentage: 10 } }),
    }),
    lean: async () => ({ isApproved: true, aiEvaluation: { errorPercentage: 10 } }),
  });
  ExamAnswerSubmission.find = () => ({
    select: () => ({
      lean: async () => qIds.map((qId) => ({ questionId: qId, isApproved: true })),
    }),
  });

  ExamCodeSubmission.create = async (doc) => ({
    _id: new mongoose.Types.ObjectId(),
    ...doc,
    submittedAt: new Date(),
  });
  ExamCodeSubmission.findOne = () => ({
    sort: () => ({
      lean: async () => ({
        status: "accepted",
        allPassed: true,
        testCasesPassed: 1,
        totalTestCases: 1,
        submittedAt: new Date(),
      }),
    }),
  });
  ExamAuditLog.create = async () => ({});
  User.findById = (id) => ({
    select: () => ({
      lean: async () => ({ _id: id, username: "Student", rollNo: "S101" }),
    }),
  });

  const validSumCode = `#include <stdio.h>\nint main() { int a, b; if (scanf("%d %d", &a, &b) == 2) printf("%d", a + b); return 0; }`;

  // 1. Single assigned question: Student C submits Q1 -> allQuestionsSubmitted=true, awaits Finish Exam
  const resC = createMockRes();
  await submitExamCode(
    { params: { examId: examId.toString() }, user: { userId: studentCId.toString() }, body: { code: validSumCode, questionId: qIds[0].toString() } },
    resC,
    () => {}
  );
  assert.equal(resC.statusCode, 201);
  assert.equal(resC.data.allPassed, true);
  assert.equal(resC.data.allQuestionsSubmitted, true);
  assert.equal(resC.data.isExamCompleted, false);
  assert.equal(resC.data.submittedQuestionCount, 1);
  assert.equal(resC.data.assignedQuestionCount, 1);

  // 2. Five assigned questions: Student A submits Q1 -> 1/5, NOT completed, Next Question = Q2
  const resA1 = createMockRes();
  await submitExamCode(
    { params: { examId: examId.toString() }, user: { userId: studentAId.toString() }, body: { code: validSumCode, questionId: qIds[0].toString() } },
    resA1,
    () => {}
  );
  assert.equal(resA1.statusCode, 201);
  assert.equal(resA1.data.allPassed, true);
  assert.equal(resA1.data.isExamCompleted, false, "Must NOT complete exam after 1 of 5 questions");
  assert.equal(resA1.data.submittedQuestionCount, 1);
  assert.equal(resA1.data.assignedQuestionCount, 5);
  assert.equal(resA1.data.remainingQuestionCount, 4);
  assert.equal(resA1.data.nextQuestion._id.toString(), qIds[1].toString());

  // 3. Duplicate submission of Q1 must NOT increment count above 1
  const resA1Dup = createMockRes();
  await submitExamCode(
    { params: { examId: examId.toString() }, user: { userId: studentAId.toString() }, body: { code: validSumCode, questionId: qIds[0].toString() } },
    resA1Dup,
    () => {}
  );
  assert.equal(resA1Dup.statusCode, 409);
  assert.equal(resA1Dup.data.alreadySubmitted, true);

  // 4. Student A submits Q2, Q3, Q4, Q5 -> completes exam on Q5 (5/5)
  for (let i = 1; i < 5; i++) {
    const resAi = createMockRes();
    await submitExamCode(
      { params: { examId: examId.toString() }, user: { userId: studentAId.toString() }, body: { code: validSumCode, questionId: qIds[i].toString() } },
      resAi,
      () => {}
    );
    assert.equal(resAi.data.submittedQuestionCount, i + 1);
    if (i < 4) {
      assert.equal(resAi.data.isExamCompleted, false);
      assert.equal(resAi.data.nextQuestion._id.toString(), qIds[i + 1].toString());
    } else {
      assert.equal(resAi.data.allQuestionsSubmitted, true);
      assert.equal(resAi.data.isExamCompleted, false);
      assert.equal(resAi.data.remainingQuestionCount, 0);
    }
  }

  // 5. Student B submits 2 of 5 questions, then Faculty clicks End Exam
  for (let i = 0; i < 2; i++) {
    const resBi = createMockRes();
    await submitExamCode(
      { params: { examId: examId.toString() }, user: { userId: studentBId.toString() }, body: { code: validSumCode, questionId: qIds[i].toString() } },
      resBi,
      () => {}
    );
    assert.equal(resBi.data.submittedQuestionCount, i + 1);
    assert.equal(resBi.data.isExamCompleted, false);
  }

  const resFacEnd = createMockRes();
  await completeExam(
    { params: { examId: examId.toString() }, user: { userId: facultyId.toString() } },
    resFacEnd,
    () => {}
  );
  assert.equal(resFacEnd.statusCode, 200);
  assert.equal(mockExam.status, "completed");
  assert.equal(mockExam.completedBy.toString(), facultyId.toString());

  // 6. Student B polling / refreshing / trying to submit after faculty ended exam -> blocked with 403 + redirect
  const resBGetQ = createMockRes();
  await getMyAssignedQuestion(
    { params: { examId: examId.toString() }, user: { userId: studentBId.toString() }, query: {} },
    resBGetQ,
    () => {}
  );
  assert.equal(resBGetQ.statusCode, 403);
  assert.equal(resBGetQ.data.isCompleted, true);
  assert.equal(resBGetQ.data.facultyEndedExam, true);
  assert.equal(resBGetQ.data.completionReason, "faculty_ended");

  const resBSubmitAfterEnd = createMockRes();
  await submitExamCode(
    { params: { examId: examId.toString() }, user: { userId: studentBId.toString() }, body: { code: validSumCode, questionId: qIds[2].toString() } },
    resBSubmitAfterEnd,
    () => {}
  );
  assert.equal(resBSubmitAfterEnd.statusCode, 403);
  assert.equal(resBSubmitAfterEnd.data.facultyEndedExam, true);

  // 7. Student B's completion dashboard shows accurate 2/5 submitted and faculty_ended reason
  const resBComp = createMockRes();
  await getStudentExamCompletion(
    { params: { examId: examId.toString() }, user: { userId: studentBId.toString() } },
    resBComp,
    () => {}
  );
  assert.equal(resBComp.statusCode, 200);
  assert.equal(resBComp.data.isSuccessfullyCompleted, true);
  assert.equal(resBComp.data.completionReason, "faculty_ended");
  assert.equal(resBComp.data.examStatus, "Examination Ended by Faculty");
  assert.equal(resBComp.data.assignedQuestionCount, 5);
  assert.equal(resBComp.data.submittedQuestionCount, 2);
  assert.equal(resBComp.data.remainingQuestionCount, 3);

  // Restore mocks
  Exam.findById = originalExamFindById;
  Exam.findOne = originalExamFindOne;
  StudentExamProgress.findOne = originalProgFindOne;
  StudentExamProgress.updateMany = originalProgUpdateMany;
  ExamAllocation.findOne = originalAllocFindOne;
  ExamAnswerSubmission.findOne = originalAnsFindOne;
  ExamAnswerSubmission.find = originalAnsFind;
  ExamCodeSubmission.create = originalCodeCreate;
  ExamCodeSubmission.findOne = originalCodeFindOne;
  ExamAuditLog.create = originalAuditCreate;
  User.findById = originalUserFindById;
});

test("16. Faculty Live Monitoring: Solved Questions count per student excludes drafts/in-progress and handles varied counts", async () => {
  const examId = new mongoose.Types.ObjectId();
  const s1Id = new mongoose.Types.ObjectId();
  const s2Id = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();
  const q3 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;

  Exam.findById = () => ({
    lean: async () => ({
      _id: examId,
      title: "Live Monitoring Test Exam",
      examType: "internal",
      status: "in_progress",
      durationMinutes: 90,
      startedAt: new Date(),
    }),
  });

  // Student 1 has 3 assigned questions; Student 2 has 2 assigned questions
  ExamAllocation.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => [
            {
              studentId: { _id: s1Id, username: "Alice", rollNo: "R01", email: "a@test.com" },
              assignedQuestionIds: [
                { _id: q1, title: "Q1", questionNumber: "Q1", difficulty: "Easy", marks: 10 },
                { _id: q2, title: "Q2", questionNumber: "Q2", difficulty: "Medium", marks: 10 },
                { _id: q3, title: "Q3", questionNumber: "Q3", difficulty: "Hard", marks: 10 },
              ],
            },
            {
              studentId: { _id: s2Id, username: "Bob", rollNo: "R02", email: "b@test.com" },
              assignedQuestionIds: [
                { _id: q1, title: "Q1", questionNumber: "Q1", difficulty: "Easy", marks: 10 },
                { _id: q2, title: "Q2", questionNumber: "Q2", difficulty: "Medium", marks: 10 },
              ],
            },
          ],
        }),
      }),
    }),
  });

  // Alice: Q1 completed, Q2 has Notepad draft only (answer_in_progress), Q3 is coding_in_progress (not submitted)
  // Bob: Q1 and Q2 both completed
  StudentExamProgress.find = () => ({
    lean: async () => [
      {
        examId,
        studentId: s1Id,
        status: "in_progress",
        questionProgress: {
          [q1.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
          [q2.toString()]: { isCompleted: false, status: "answer_in_progress", lastConceptualAnswer: "draft only" },
          [q3.toString()]: { isCompleted: false, status: "coding_in_progress", compilerAllowed: true },
        },
      },
      {
        examId,
        studentId: s2Id,
        status: "successfully_completed",
        questionProgress: {
          [q1.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
          [q2.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
        },
      },
    ],
  });

  ExamAnswerSubmission.find = () => ({ sort: () => ({ lean: async () => [] }) });
  ExamCodeSubmission.find = () => ({ sort: () => ({ lean: async () => [] }) });

  const res = createMockRes();
  await getExamMonitoring({ params: { examId: examId.toString() } }, res, () => {});

  assert.equal(res.statusCode, 200);
  const aliceRows = res.data.students.filter((r) => r.studentId === s1Id.toString());
  const bobRows = res.data.students.filter((r) => r.studentId === s2Id.toString());

  assert.equal(aliceRows.length, 3);
  assert.equal(aliceRows[0].solvedQuestionsCount, 1);
  assert.equal(aliceRows[0].totalAssignedQuestions, 3);
  assert.equal(aliceRows[0].solvedQuestionsLabel, "1/3");

  assert.equal(bobRows.length, 2);
  assert.equal(bobRows[0].solvedQuestionsCount, 2);
  assert.equal(bobRows[0].totalAssignedQuestions, 2);
  assert.equal(bobRows[0].solvedQuestionsLabel, "2/2");

  // Restore
  Exam.findById = origExamFindById;
  ExamAllocation.find = origAllocFind;
  StudentExamProgress.find = origProgFind;
  ExamAnswerSubmission.find = origAnsFind;
  ExamCodeSubmission.find = origCodeFind;
});

test("17. Intermediate Question Success Screen & Next Question Progress Persistence", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();
  const q3 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origUserFindById = User.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origCodeFindOne = ExamCodeSubmission.findOne;

  let examStatus = "in_progress";
  let assignedList = [
    { _id: q1, questionNumber: "Q1", title: "Problem 1" },
    { _id: q2, questionNumber: "Q2", title: "Problem 2" },
  ];
  let progState = {
    status: "coding_in_progress",
    instructionsAcknowledged: true,
    questionProgress: {
      [q1.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
      [q2.toString()]: { isCompleted: false, status: "notepad_pending", compilerAllowed: false },
    },
  };

  Exam.findById = () => ({
    lean: async () => ({
      _id: examId,
      title: "Multi-Question Exam",
      subject: "C",
      examType: "internal",
      status: examStatus,
      durationMinutes: 90,
      totalMarks: 100,
      questionsPerStudent: assignedList.length,
    }),
  });
  User.findById = () => ({ select: () => ({ lean: async () => ({ _id: studentId, username: "Alice", rollNo: "R01" }) }) });
  StudentExamProgress.findOne = () => ({ lean: async () => progState });
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({ examId, studentId, assignedQuestionIds: assignedList }),
      }),
    }),
  });
  ExamAnswerSubmission.findOne = () => ({ sort: () => ({ lean: async () => ({ isApproved: true, aiEvaluation: { errorPercentage: 10 } }) }) });
  ExamCodeSubmission.findOne = () => ({ sort: () => ({ lean: async () => ({ status: "accepted", allPassed: true, testCasesPassed: 1, totalTestCases: 1 }) }) });

  // 1. 1 of 2 submitted -> intermediate success screen (hasRemainingQuestions=true, nextQuestion=Q2)
  const res1of2 = createMockRes();
  await getStudentExamCompletion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, res1of2, () => {});
  assert.equal(res1of2.statusCode, 200);
  assert.equal(res1of2.data.isSuccessfullyCompleted, false);
  assert.equal(res1of2.data.hasRemainingQuestions, true);
  assert.equal(res1of2.data.submittedQuestionCount, 1);
  assert.equal(res1of2.data.assignedQuestionCount, 2);
  assert.equal(res1of2.data.remainingQuestionCount, 1);
  assert.equal(res1of2.data.nextQuestion._id.toString(), q2.toString());

  // 2. 2 of 2 submitted -> final completion dashboard (hasRemainingQuestions=false, nextQuestion=null)
  progState.status = "successfully_completed";
  progState.questionProgress[q2.toString()] = { isCompleted: true, status: "completed", compilerAllowed: true };
  const res2of2 = createMockRes();
  await getStudentExamCompletion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, res2of2, () => {});
  assert.equal(res2of2.data.isSuccessfullyCompleted, true);
  assert.equal(res2of2.data.hasRemainingQuestions, false);
  assert.equal(res2of2.data.nextQuestion, null);
  assert.equal(res2of2.data.submittedQuestionCount, 2);

  // 3. 3 assigned questions, 2 submitted -> hasRemainingQuestions=true, nextQuestion=Q3
  assignedList = [
    { _id: q1, questionNumber: "Q1", title: "Problem 1" },
    { _id: q2, questionNumber: "Q2", title: "Problem 2" },
    { _id: q3, questionNumber: "Q3", title: "Problem 3" },
  ];
  progState.status = "coding_in_progress";
  progState.questionProgress[q3.toString()] = { isCompleted: false, status: "notepad_pending", compilerAllowed: false };
  const res2of3 = createMockRes();
  await getStudentExamCompletion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, res2of3, () => {});
  assert.equal(res2of3.data.isSuccessfullyCompleted, false);
  assert.equal(res2of3.data.hasRemainingQuestions, true);
  assert.equal(res2of3.data.submittedQuestionCount, 2);
  assert.equal(res2of3.data.assignedQuestionCount, 3);
  assert.equal(res2of3.data.nextQuestion._id.toString(), q3.toString());

  // 4. Faculty ends exam when 1 of 2 is submitted -> final completion dashboard, NO Next Question
  assignedList = [
    { _id: q1, questionNumber: "Q1", title: "Problem 1" },
    { _id: q2, questionNumber: "Q2", title: "Problem 2" },
  ];
  examStatus = "completed";
  progState.questionProgress[q2.toString()] = { isCompleted: false, status: "notepad_pending" };
  const resFacEnd = createMockRes();
  await getStudentExamCompletion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, resFacEnd, () => {});
  assert.equal(resFacEnd.data.isSuccessfullyCompleted, true);
  assert.equal(resFacEnd.data.facultyEndedExam, true);
  assert.equal(resFacEnd.data.hasRemainingQuestions, false);
  assert.equal(resFacEnd.data.nextQuestion, null);
  assert.equal(resFacEnd.data.submittedQuestionCount, 1);
  assert.equal(resFacEnd.data.remainingQuestionCount, 1);

  // Restore
  Exam.findById = origExamFindById;
  User.findById = origUserFindById;
  StudentExamProgress.findOne = origProgFindOne;
  ExamAllocation.findOne = origAllocFindOne;
  ExamAnswerSubmission.findOne = origAnsFindOne;
  ExamCodeSubmission.findOne = origCodeFindOne;
});

test("19. Return to Notepad: Saves & Restores AI Evaluation Feedback per Question without Unlocking Compiler", async () => {
  const examId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origExamFindOne = Exam.findOne;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origAnsFind = ExamAnswerSubmission.find;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAuditCreate = ExamAuditLog.create;

  const mockExam = { _id: examId, title: "AI Feedback Exam", status: "in_progress", questionsPerStudent: 2 };
  Exam.findById = async () => mockExam;
  Exam.findOne = () => ({ select: async () => mockExam });
  ExamAuditLog.create = async () => ({});

  const q1Attempt1 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q1,
    attemptNumber: 1,
    answerText: "Attempt 1 answer with FIFO mistake.",
    aiEvaluation: {
      errorPercentage: 65,
      understandingPercentage: 35,
      incorrectConcepts: ["Explained FIFO instead of LIFO"],
      missingConcepts: ["Overflow check in push"],
      improvementSuggestions: ["Correct LIFO definition and add overflow check."],
    },
    status: "evaluated",
    save: async function () {
      return this;
    },
  };

  const q1Attempt2 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q1,
    attemptNumber: 2,
    answerText: "Attempt 2 answer still missing example.",
    aiEvaluation: {
      errorPercentage: 80,
      understandingPercentage: 20,
      incorrectConcepts: ["Pop removes from bottom instead of top"],
      missingConcepts: ["Practical example", "Underflow check"],
      improvementSuggestions: ["Explain pop from top and include a real example."],
    },
    status: "evaluated",
    save: async function () {
      return this;
    },
  };

  let activeQ1Subs = [q1Attempt1];
  const mapStore = new Map();
  mapStore.set(q1.toString(), { questionId: q1, compilerAllowed: false, status: "waiting_faculty_decision" });
  mapStore.set(q2.toString(), { questionId: q2, compilerAllowed: false, status: "notepad_pending" });

  const mockProg = {
    examId,
    studentId,
    status: "waiting_faculty_decision",
    instructionsAcknowledged: true,
    compilerAllowed: false,
    questionProgress: {
      get(k) {
        const v = mapStore.get(k);
        return v ? { ...v, toObject: () => ({ ...v }) } : undefined;
      },
      set(k, v) {
        mapStore.set(k, { ...v });
      },
    },
    markModified() {},
    save: async function () {
      return this;
    },
  };

  StudentExamProgress.findOne = async () => mockProg;
  ExamAnswerSubmission.findOne = (q) => ({
    sort: async () => {
      if (q.questionId?.toString() === q2.toString()) return null;
      return activeQ1Subs[activeQ1Subs.length - 1];
    },
  });
  ExamAnswerSubmission.find = (q) => ({
    sort: () => ({
      lean: async () => (q.questionId?.toString() === q2.toString() ? [] : [...activeQ1Subs].reverse()),
    }),
  });
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [
            { _id: q1, questionNumber: "Q1", title: "Stack", testCases: [] },
            { _id: q2, questionNumber: "Q2", title: "Queue", testCases: [] },
          ],
        }),
      }),
    }),
  });

  // 1. Faculty clicks Return to Notepad on Q1 Attempt 1 (65% error)
  const resRet1 = createMockRes();
  await facultyReturnToNotepad(
    { params: { examId: examId.toString(), studentId: studentId.toString() }, user: { userId: facultyId.toString(), role: "admin" }, body: { questionId: q1.toString(), feedback: "Fix LIFO and push overflow." } },
    resRet1,
    () => {}
  );
  assert.equal(resRet1.statusCode, 200);
  assert.equal(resRet1.data.compilerAllowed, false);
  assert.equal(resRet1.data.conceptualStatus, "correction_required");

  // 2. Student opens/refreshes Notepad on Q1 -> sees 65% AI evaluation feedback, compiler remains disabled
  const resGetQ1 = createMockRes();
  await getMyAssignedQuestion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() }, query: { questionId: q1.toString() } }, resGetQ1, () => {});
  assert.equal(resGetQ1.statusCode, 200);
  assert.equal(resGetQ1.data.progress.compilerAllowed, false);
  assert.equal(resGetQ1.data.progress.conceptualStatus, "correction_required");
  assert.equal(resGetQ1.data.progress.lastAIEvaluation.errorPercentage, 65);
  assert.deepEqual(resGetQ1.data.progress.lastAIEvaluation.incorrectConcepts, ["Explained FIFO instead of LIFO"]);

  // 3. Student switches to Q2 -> Q2 does NOT show Q1's feedback
  const resGetQ2 = createMockRes();
  await getMyAssignedQuestion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() }, query: { questionId: q2.toString() } }, resGetQ2, () => {});
  assert.equal(resGetQ2.data.progress.lastAIEvaluation, null);

  // 4. Student resubmits Q1 (Attempt 2, 80% error) and faculty returns to Notepad -> newer feedback (80%) replaces older (65%)
  activeQ1Subs = [q1Attempt1, q1Attempt2];
  const resRet2 = createMockRes();
  await facultyReturnToNotepad(
    { params: { examId: examId.toString(), studentId: studentId.toString() }, user: { userId: facultyId.toString(), role: "admin" }, body: { questionId: q1.toString(), feedback: "Review pop and add example." } },
    resRet2,
    () => {}
  );
  assert.equal(resRet2.statusCode, 200);

  const resGetQ1v2 = createMockRes();
  await getMyAssignedQuestion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() }, query: { questionId: q1.toString() } }, resGetQ1v2, () => {});
  assert.equal(resGetQ1v2.data.progress.lastAIEvaluation.errorPercentage, 80);
  assert.deepEqual(resGetQ1v2.data.progress.lastAIEvaluation.incorrectConcepts, ["Pop removes from bottom instead of top"]);
  assert.equal(resGetQ1v2.data.previousAttempts.length, 2, "Previous evaluation history must be preserved");

  // Restore
  Exam.findById = origExamFindById;
  Exam.findOne = origExamFindOne;
  StudentExamProgress.findOne = origProgFindOne;
  ExamAnswerSubmission.findOne = origAnsFindOne;
  ExamAnswerSubmission.find = origAnsFind;
  ExamAllocation.findOne = origAllocFindOne;
  ExamAuditLog.create = origAuditCreate;
});

test("18. Three-Way Final Exam Completion Workflow (Faculty Ended, Finish Exam at 3/3, Timer Expiry Auto-Submit)", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();
  const q3 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origCodeCreate = ExamCodeSubmission.create;
  const origAuditCreate = ExamAuditLog.create;
  const origUserFindById = User.findById;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origCodeFindOne = ExamCodeSubmission.findOne;

  const assignedQuestions = [
    { _id: q1, questionNumber: "Q1", title: "Q1 Sum", marks: 20, testCases: [{ input: "1 2", expectedOutput: "3", isHidden: false }] },
    { _id: q2, questionNumber: "Q2", title: "Q2 Sum", marks: 20, testCases: [{ input: "4 5", expectedOutput: "9", isHidden: false }] },
    { _id: q3, questionNumber: "Q3", title: "Q3 Empty", marks: 20, testCases: [{ input: "1 1", expectedOutput: "2", isHidden: false }] },
  ];

  const validCode = `#include <stdio.h>\nint main() { int a, b; if (scanf("%d %d", &a, &b) == 2) printf("%d", a + b); return 0; }`;

  let mockExam = {
    _id: examId,
    title: "3-Way Exam",
    examType: "internal",
    status: "in_progress",
    startedAt: new Date(Date.now() - 10 * 60 * 1000),
    durationMinutes: 60,
    totalMarks: 60,
    questionsPerStudent: 3,
    participatingStudents: [studentId],
    select: () => mockExam,
    lean: async () => mockExam,
  };

  let codeSubmissionsCreated = [];
  Exam.findById = () => mockExam;
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({ examId, studentId, assignedQuestionIds: assignedQuestions }),
      }),
    }),
  });
  ExamCodeSubmission.create = async (doc) => {
    const created = { _id: new mongoose.Types.ObjectId(), ...doc };
    codeSubmissionsCreated.push(created);
    return created;
  };
  ExamAuditLog.create = async () => ({});
  User.findById = () => ({ select: () => ({ lean: async () => ({ _id: studentId, username: "Alice", rollNo: "R01" }) }) });
  ExamAnswerSubmission.findOne = () => ({ sort: () => ({ lean: async () => ({ isApproved: true, aiEvaluation: { errorPercentage: 10 } }) }) });
  ExamCodeSubmission.findOne = () => ({ sort: () => ({ lean: async () => codeSubmissionsCreated[0] || null }) });

  const makeProg = (qMapInit) => {
    const store = new Map(Object.entries(qMapInit));
    const p = {
      examId,
      studentId,
      status: "coding_in_progress",
      instructionsAcknowledged: true,
      completionReason: null,
      expiryProcessing: false,
      finalScore: 0,
      questionProgress: {
        get(k) {
          const v = store.get(k);
          return v ? { ...v, toObject: () => ({ ...v }) } : undefined;
        },
        set(k, v) {
          store.set(k, { ...v });
        },
      },
      markModified() {},
      save: async function () {
        return this;
      },
      lean: async function () {
        return this;
      },
    };
    return p;
  };

  // CONDITION 2A: Attempting Finish Exam (endStudentExam) when only 2/3 submitted -> rejected with 400
  let currentProg = makeProg({
    [q1.toString()]: { isCompleted: true, status: "completed", score: 20 },
    [q2.toString()]: { isCompleted: true, status: "completed", score: 20 },
    [q3.toString()]: { isCompleted: false, status: "coding_in_progress" },
  });
  StudentExamProgress.findOne = () => currentProg;

  const resEarlyFinish = createMockRes();
  await endStudentExam({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, resEarlyFinish, () => {});
  assert.equal(resEarlyFinish.statusCode, 400);
  assert.equal(resEarlyFinish.data.pendingQuestionsCount, 1);

  // CONDITION 2B: All 3/3 submitted -> getStudentExamCompletion shows readyToFinish=true; Finish Exam succeeds
  currentProg.questionProgress.set(q3.toString(), { isCompleted: true, status: "completed", score: 20 });
  const resReady = createMockRes();
  await getStudentExamCompletion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, resReady, () => {});
  assert.equal(resReady.data.isSuccessfullyCompleted, false);
  assert.equal(resReady.data.readyToFinish, true);
  assert.equal(resReady.data.submittedQuestionCount, 3);

  const resFinish = createMockRes();
  await endStudentExam({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, resFinish, () => {});
  assert.equal(resFinish.statusCode, 200);
  assert.equal(resFinish.data.completionReason, "all_questions_submitted");
  assert.equal(currentProg.status, "successfully_completed");

  // CONDITION 3: Timer expires with Q1 already completed, Q2 having valid draft code, Q3 empty
  mockExam.startedAt = new Date(Date.now() - 120 * 60 * 1000); // expired
  mockExam.durationMinutes = 60;
  codeSubmissionsCreated = [];
  currentProg = makeProg({
    [q1.toString()]: { isCompleted: true, status: "completed", score: 20 },
    [q2.toString()]: { isCompleted: false, status: "coding_in_progress", currentCode: validCode },
    [q3.toString()]: { isCompleted: false, status: "notepad_pending", currentCode: "" },
  });

  const resExpire1 = createMockRes();
  await expireStudentExam({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, resExpire1, () => {});
  assert.equal(resExpire1.statusCode, 200);
  assert.equal(resExpire1.data.completionReason, "time_expired");
  assert.equal(codeSubmissionsCreated.length, 1, "Only Q2 (non-empty uncompleted) should be auto-evaluated");
  assert.equal(codeSubmissionsCreated[0].allPassed, true);
  assert.equal(currentProg.questionProgress.get(q2.toString()).isCompleted, true);
  assert.equal(currentProg.questionProgress.get(q3.toString()).isCompleted, false);
  assert.equal(currentProg.questionProgress.get(q3.toString()).status, "time_expired");
  assert.equal(currentProg.finalScore, 40);

  // Duplicate timer expiry call must be idempotent and NOT create duplicate submissions
  const resExpire2 = createMockRes();
  await expireStudentExam({ params: { examId: examId.toString() }, user: { userId: studentId.toString() } }, resExpire2, () => {});
  assert.equal(resExpire2.statusCode, 200);
  assert.equal(resExpire2.data.alreadyCompleted, true);
  assert.equal(codeSubmissionsCreated.length, 1);

  // Restore
  Exam.findById = origExamFindById;
  StudentExamProgress.findOne = origProgFindOne;
  ExamAllocation.findOne = origAllocFindOne;
  ExamCodeSubmission.create = origCodeCreate;
  ExamAuditLog.create = origAuditCreate;
  User.findById = origUserFindById;
  ExamAnswerSubmission.findOne = origAnsFindOne;
  ExamCodeSubmission.findOne = origCodeFindOne;
});

test("19. Return to Notepad: Saves & Restores AI Evaluation Feedback per Question without Unlocking Compiler", async () => {
  const examId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origExamFindOne = Exam.findOne;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origAnsFind = ExamAnswerSubmission.find;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAuditCreate = ExamAuditLog.create;

  const mockExam = { _id: examId, title: "AI Feedback Exam", status: "in_progress", questionsPerStudent: 2 };
  Exam.findById = async () => mockExam;
  Exam.findOne = () => ({ select: async () => mockExam });
  ExamAuditLog.create = async () => ({});

  const q1Attempt1 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q1,
    attemptNumber: 1,
    answerText: "Attempt 1 answer with FIFO mistake.",
    aiEvaluation: {
      errorPercentage: 65,
      understandingPercentage: 35,
      incorrectConcepts: ["Explained FIFO instead of LIFO"],
      missingConcepts: ["Overflow check in push"],
      improvementSuggestions: ["Correct LIFO definition and add overflow check."],
    },
    status: "evaluated",
    save: async function () {
      return this;
    },
  };

  const q1Attempt2 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q1,
    attemptNumber: 2,
    answerText: "Attempt 2 answer still missing example.",
    aiEvaluation: {
      errorPercentage: 80,
      understandingPercentage: 20,
      incorrectConcepts: ["Pop removes from bottom instead of top"],
      missingConcepts: ["Practical example", "Underflow check"],
      improvementSuggestions: ["Explain pop from top and include a real example."],
    },
    status: "evaluated",
    save: async function () {
      return this;
    },
  };

  let activeQ1Subs = [q1Attempt1];
  const mapStore = new Map();
  mapStore.set(q1.toString(), { questionId: q1, compilerAllowed: false, status: "waiting_faculty_decision" });
  mapStore.set(q2.toString(), { questionId: q2, compilerAllowed: false, status: "notepad_pending" });

  const mockProg = {
    examId,
    studentId,
    status: "waiting_faculty_decision",
    instructionsAcknowledged: true,
    compilerAllowed: false,
    questionProgress: {
      get(k) {
        const v = mapStore.get(k);
        return v ? { ...v, toObject: () => ({ ...v }) } : undefined;
      },
      set(k, v) {
        mapStore.set(k, { ...v });
      },
    },
    markModified() {},
    save: async function () {
      return this;
    },
  };

  StudentExamProgress.findOne = async () => mockProg;
  ExamAnswerSubmission.findOne = (q) => ({
    sort: async () => {
      if (q.questionId?.toString() === q2.toString()) return null;
      return activeQ1Subs[activeQ1Subs.length - 1];
    },
  });
  ExamAnswerSubmission.find = (q) => ({
    sort: () => ({
      lean: async () => (q.questionId?.toString() === q2.toString() ? [] : [...activeQ1Subs].reverse()),
    }),
  });
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [
            { _id: q1, questionNumber: "Q1", title: "Stack", testCases: [] },
            { _id: q2, questionNumber: "Q2", title: "Queue", testCases: [] },
          ],
        }),
      }),
    }),
  });

  // 1. Faculty clicks Return to Notepad on Q1 Attempt 1 (65% error)
  const resRet1 = createMockRes();
  await facultyReturnToNotepad(
    { params: { examId: examId.toString(), studentId: studentId.toString() }, user: { userId: facultyId.toString(), role: "admin" }, body: { questionId: q1.toString(), feedback: "Fix LIFO and push overflow." } },
    resRet1,
    () => {}
  );
  assert.equal(resRet1.statusCode, 200);
  assert.equal(resRet1.data.compilerAllowed, false);
  assert.equal(resRet1.data.conceptualStatus, "correction_required");

  // 2. Student opens/refreshes Notepad on Q1 -> sees 65% AI evaluation feedback, compiler remains disabled
  const resGetQ1 = createMockRes();
  await getMyAssignedQuestion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() }, query: { questionId: q1.toString() } }, resGetQ1, () => {});
  assert.equal(resGetQ1.statusCode, 200);
  assert.equal(resGetQ1.data.progress.compilerAllowed, false);
  assert.equal(resGetQ1.data.progress.conceptualStatus, "correction_required");
  assert.equal(resGetQ1.data.progress.lastAIEvaluation.errorPercentage, 65);
  assert.deepEqual(resGetQ1.data.progress.lastAIEvaluation.incorrectConcepts, ["Explained FIFO instead of LIFO"]);

  // 3. Student switches to Q2 -> Q2 does NOT show Q1's feedback
  const resGetQ2 = createMockRes();
  await getMyAssignedQuestion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() }, query: { questionId: q2.toString() } }, resGetQ2, () => {});
  assert.equal(resGetQ2.data.progress.lastAIEvaluation, null);

  // 4. Student resubmits Q1 (Attempt 2, 80% error) and faculty returns to Notepad -> newer feedback (80%) replaces older (65%)
  activeQ1Subs = [q1Attempt1, q1Attempt2];
  const resRet2 = createMockRes();
  await facultyReturnToNotepad(
    { params: { examId: examId.toString(), studentId: studentId.toString() }, user: { userId: facultyId.toString(), role: "admin" }, body: { questionId: q1.toString(), feedback: "Review pop and add example." } },
    resRet2,
    () => {}
  );
  assert.equal(resRet2.statusCode, 200);

  const resGetQ1v2 = createMockRes();
  await getMyAssignedQuestion({ params: { examId: examId.toString() }, user: { userId: studentId.toString() }, query: { questionId: q1.toString() } }, resGetQ1v2, () => {});
  assert.equal(resGetQ1v2.data.progress.lastAIEvaluation.errorPercentage, 80);
  assert.deepEqual(resGetQ1v2.data.progress.lastAIEvaluation.incorrectConcepts, ["Pop removes from bottom instead of top"]);
  assert.equal(resGetQ1v2.data.previousAttempts.length, 2, "Previous evaluation history must be preserved");

  // Restore
  Exam.findById = origExamFindById;
  Exam.findOne = origExamFindOne;
  StudentExamProgress.findOne = origProgFindOne;
  ExamAnswerSubmission.findOne = origAnsFindOne;
  ExamAnswerSubmission.find = origAnsFind;
  ExamAllocation.findOne = origAllocFindOne;
  ExamAuditLog.create = origAuditCreate;
});


