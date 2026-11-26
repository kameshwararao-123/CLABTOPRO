import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  validateExamAccessAndTiming,
  runExamCode,
  submitExamCode,
  submitVivaExam,
} from "../controllers/examController.js";
import Exam from "../models/Exam.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import ExamQuestion from "../models/ExamQuestion.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import submissionQueue from "../services/submissionQueue.js";
import { ExecutionServiceError } from "../services/judgeService.js";

const createMockRes = () => ({
  statusCode: 200,
  headers: {},
  data: null,
  set(k, v) {
    this.headers[k] = v;
    return this;
  },
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(payload) {
    this.data = payload;
    return this;
  },
});

const validSumCode = `#include <stdio.h>
int main() {
  int a, b;
  if (scanf("%d %d", &a, &b) == 2) {
    printf("%d\\n", a + b);
  }
  return 0;
}`;

test("1. validateExamAccessAndTiming accepts active exam before deadline and rejects at/after deadline", () => {
  const studentId = new mongoose.Types.ObjectId();
  const start = new Date("2026-11-25T10:00:00.000Z");
  const exam = {
    status: "in_progress",
    examType: "internal",
    startedAt: start,
    durationMinutes: 60,
    participatingStudents: [studentId],
  };

  const deadlineMs = start.getTime() + 60 * 60 * 1000;

  // 1ms before deadline -> accepted
  const before = validateExamAccessAndTiming({
    exam,
    progress: { status: "coding_in_progress" },
    studentId,
    nowMs: deadlineMs - 1,
  });
  assert.equal(before.ok, true);
  assert.equal(before.remainingMs, 1);

  // Exactly at deadline -> rejected
  const atDeadline = validateExamAccessAndTiming({
    exam,
    progress: { status: "coding_in_progress" },
    studentId,
    nowMs: deadlineMs,
  });
  assert.equal(atDeadline.ok, false);
  assert.equal(atDeadline.status, 403);
  assert.equal(atDeadline.body.isTimeExpired, true);

  // After deadline -> rejected
  const after = validateExamAccessAndTiming({
    exam,
    progress: { status: "coding_in_progress" },
    studentId,
    nowMs: deadlineMs + 5000,
  });
  assert.equal(after.ok, false);
  assert.equal(after.status, 403);
  assert.equal(after.body.isTimeExpired, true);
});

test("2. validateExamAccessAndTiming rejects faculty-ended, unauthorized, and missing/invalid timing safely", () => {
  const studentA = new mongoose.Types.ObjectId();
  const studentB = new mongoose.Types.ObjectId();

  // Faculty-ended
  const ended = validateExamAccessAndTiming({
    exam: {
      status: "completed",
      startedAt: new Date(Date.now() - 10000),
      durationMinutes: 60,
      participatingStudents: [studentA],
    },
    progress: { status: "coding_in_progress" },
    studentId: studentA,
  });
  assert.equal(ended.ok, false);
  assert.equal(ended.status, 403);
  assert.equal(ended.body.facultyEndedExam, true);

  // Unauthorized student
  const unauth = validateExamAccessAndTiming({
    exam: {
      status: "in_progress",
      startedAt: new Date(Date.now() - 10000),
      durationMinutes: 60,
      participatingStudents: [studentA],
    },
    progress: { status: "coding_in_progress" },
    studentId: studentB,
  });
  assert.equal(unauth.ok, false);
  assert.equal(unauth.status, 403);

  // Missing startedAt -> fails safely
  const missingStart = validateExamAccessAndTiming({
    exam: {
      status: "in_progress",
      startedAt: null,
      durationMinutes: 60,
      participatingStudents: [studentA],
    },
    progress: { status: "coding_in_progress" },
    studentId: studentA,
  });
  assert.equal(missingStart.ok, false);
  assert.equal(missingStart.status, 403);

  // Invalid durationMinutes -> fails safely
  const invalidDuration = validateExamAccessAndTiming({
    exam: {
      status: "in_progress",
      startedAt: new Date(Date.now() - 10000),
      durationMinutes: 0,
      participatingStudents: [studentA],
    },
    progress: { status: "coding_in_progress" },
    studentId: studentA,
  });
  assert.equal(invalidDuration.ok, false);
  assert.equal(invalidDuration.status, 403);
});

test("3. Per-student viva deadlines are calculated independently without cross-student interference", () => {
  const studentA = new mongoose.Types.ObjectId();
  const studentB = new mongoose.Types.ObjectId();
  const nowMs = Date.now();

  const vivaExam = {
    status: "in_progress",
    examType: "viva",
    startedAt: new Date(nowMs - 120 * 60 * 1000),
    durationMinutes: 30,
    participatingStudents: [studentA, studentB],
  };

  // Student A started 31 mins ago -> expired
  const resA = validateExamAccessAndTiming({
    exam: vivaExam,
    progress: { status: "in_progress", vivaStartedAt: new Date(nowMs - 31 * 60 * 1000) },
    studentId: studentA,
    isViva: true,
    nowMs,
  });
  assert.equal(resA.ok, false);
  assert.equal(resA.body.isTimeExpired, true);

  // Student B started 10 mins ago -> still active with ~20 mins left
  const resB = validateExamAccessAndTiming({
    exam: vivaExam,
    progress: { status: "in_progress", vivaStartedAt: new Date(nowMs - 10 * 60 * 1000) },
    studentId: studentB,
    isViva: true,
    nowMs,
  });
  assert.equal(resB.ok, true);
  assert.equal(resB.remainingMs, 20 * 60 * 1000);
});

test("4. runExamCode rejects expired and faculty-ended exams before entering submissionQueue", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origEnqueue = submissionQueue.enqueue.bind(submissionQueue);

  let queueCalled = false;
  submissionQueue.enqueue = async () => {
    queueCalled = true;
    return {};
  };

  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "coding_in_progress",
    compilerAllowed: true,
    questionProgress: new Map([[qId.toString(), { compilerAllowed: true }]]),
  });

  try {
    // Expired exam
    Exam.findById = () => ({
      select: async () => ({
        _id: examId,
        status: "in_progress",
        startedAt: new Date(Date.now() - 100 * 60 * 1000),
        durationMinutes: 60,
        participatingStudents: [studentId],
      }),
    });

    const req = {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: qId.toString() },
    };
    const resExpired = createMockRes();
    await runExamCode(req, resExpired, (err) => {
      throw err;
    });
    assert.equal(resExpired.statusCode, 403);
    assert.equal(resExpired.data.isTimeExpired, true);
    assert.equal(queueCalled, false);

    // Faculty-ended exam
    Exam.findById = () => ({
      select: async () => ({
        _id: examId,
        status: "completed",
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        durationMinutes: 60,
        participatingStudents: [studentId],
      }),
    });
    const resEnded = createMockRes();
    await runExamCode(req, resEnded, (err) => {
      throw err;
    });
    assert.equal(resEnded.statusCode, 403);
    assert.equal(resEnded.data.facultyEndedExam, true);
    assert.equal(queueCalled, false);
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    submissionQueue.enqueue = origEnqueue;
  }
});

test("5. submitExamCode prevents concurrent duplicate submissions, blocks repeats after completion, and allows retry after pre-persistence failure", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origSubCreate = ExamCodeSubmission.create;
  const origEnqueue = submissionQueue.enqueue.bind(submissionQueue);

  let createdSubCount = 0;
  let queueCallCount = 0;

  const progressState = {
    examId,
    studentId,
    status: "coding_in_progress",
    compilerAllowed: true,
    questionProgress: new Map([
      [
        qId.toString(),
        {
          compilerAllowed: true,
          conceptualStatus: "approved",
          lastAIEvaluation: { errorPercentage: 10 },
          isCompleted: false,
        },
      ],
    ]),
    markModified() {},
    async save() {},
  };

  Exam.findById = () => ({
    select: async () => ({
      _id: examId,
      status: "in_progress",
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
      durationMinutes: 90,
      participatingStudents: [studentId],
    }),
  });
  StudentExamProgress.findOne = async () => progressState;
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [
            {
              _id: qId,
              title: "Sum Two",
              questionNumber: "Q1",
              marks: 100,
              testCases: [{ input: "2 3", expectedOutput: "5", isHidden: false }],
            },
          ],
        }),
      }),
    }),
  });
  ExamAnswerSubmission.findOne = () => ({
    lean: async () => ({ _id: new mongoose.Types.ObjectId(), isApproved: true }),
  });
  ExamCodeSubmission.create = async (doc) => {
    createdSubCount++;
    return { ...doc, _id: new mongoose.Types.ObjectId() };
  };

  const makeReq = () => ({
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    body: { code: validSumCode, questionId: qId.toString() },
  });

  try {
    // Part A: Failure before persistence does not lock out retry
    submissionQueue.enqueue = async () => {
      queueCallCount++;
      throw new ExecutionServiceError("Temporary Piston failure");
    };
    const resFail = createMockRes();
    await submitExamCode(makeReq(), resFail, (err) => {
      throw err;
    });
    assert.equal(resFail.statusCode, 503);
    assert.equal(createdSubCount, 0);

    // Part B: Two concurrent requests -> only 1 runs, 2nd gets 409
    let releaseQueue;
    const queueGate = new Promise((r) => {
      releaseQueue = r;
    });
    submissionQueue.enqueue = async () => {
      queueCallCount++;
      return queueGate;
    };

    const res1 = createMockRes();
    const res2 = createMockRes();

    const p1 = submitExamCode(makeReq(), res1, (err) => {
      throw err;
    });
    // Wait a tick so p1 enters the async queue lock
    await new Promise((r) => setTimeout(r, 10));
    const p2 = submitExamCode(makeReq(), res2, (err) => {
      throw err;
    });

    releaseQueue({
      status: "accepted",
      testCasesPassed: 1,
      totalTestCases: 1,
      testCaseResults: [{ status: "passed", passed: true }],
      executionTime: 10,
      compilerOutput: "",
    });

    await Promise.all([p1, p2]);

    assert.equal(res1.statusCode, 201);
    assert.equal(res2.statusCode, 409);
    assert.equal(createdSubCount, 1);
    assert.equal(queueCallCount, 2); // 1 from Part A failure + 1 from Part B

    // Part C: Subsequent request after completion -> 409 without calling queue
    const res3 = createMockRes();
    await submitExamCode(makeReq(), res3, (err) => {
      throw err;
    });
    assert.equal(res3.statusCode, 409);
    assert.equal(res3.data.alreadySubmitted, true);
    assert.equal(queueCallCount, 2);
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
    ExamAnswerSubmission.findOne = origAnsFindOne;
    ExamCodeSubmission.create = origSubCreate;
    submissionQueue.enqueue = origEnqueue;
  }
});

test("6. submitVivaExam enforces expiry, prevents concurrent duplicate evaluations, and recovers on failure", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origQFind = ExamQuestion.find;
  const origAuditCreate = ExamAuditLog.create;

  let auditCount = 0;
  let saveGate = null;

  const progressDoc = {
    examId,
    studentId,
    status: "in_progress",
    vivaStartedAt: new Date(Date.now() - 5 * 60 * 1000),
    vivaAnswers: new Map(),
    vivaResult: null,
    async save() {
      if (saveGate) {
        await saveGate();
      }
    },
  };

  Exam.findById = async () => ({
    _id: examId,
    status: "in_progress",
    examType: "viva",
    startedAt: new Date(Date.now() - 10 * 60 * 1000),
    durationMinutes: 45,
    marksPerQuestion: 2,
    participatingStudents: [studentId],
  });
  StudentExamProgress.findOne = async () => progressDoc;
  ExamAllocation.findOne = async () => ({
    examId,
    studentId,
    assignedQuestionIds: [qId],
  });
  ExamQuestion.find = () => ({
    lean: async () => [
      {
        _id: qId,
        correctAnswer: "A",
        marks: 2,
        options: [
          { optionId: "A", text: "Correct" },
          { optionId: "B", text: "Wrong" },
        ],
      },
    ],
  });
  ExamAuditLog.create = async () => {
    auditCount++;
    return {};
  };

  const makeReq = () => ({
    params: { examId: examId.toString() },
    user: { userId: studentId.toString() },
    body: {
      answers: {
        [qId.toString()]: { selectedOption: "A", isMarkedForReview: false },
      },
    },
  });

  try {
    // Part A: Failure during save releases lock for retry
    saveGate = async () => {
      throw new Error("Simulated transient DB error");
    };
    let nextErr = null;
    await submitVivaExam(makeReq(), createMockRes(), (err) => {
      nextErr = err;
    });
    assert.ok(nextErr);
    assert.equal(auditCount, 0);

    // Part B: Concurrent manual + auto-submit -> only 1 succeeds, 2nd gets 409
    let releaseSave;
    const savePromise = new Promise((r) => {
      releaseSave = r;
    });
    saveGate = () => savePromise;

    const res1 = createMockRes();
    const res2 = createMockRes();
    const p1 = submitVivaExam(makeReq(), res1, (err) => {
      throw err;
    });
    await new Promise((r) => setTimeout(r, 10));
    const p2 = submitVivaExam(makeReq(), res2, (err) => {
      throw err;
    });

    releaseSave();
    await Promise.all([p1, p2]);

    assert.equal(res1.statusCode, 200);
    assert.equal(res1.data.isSubmitted, true);
    assert.equal(res2.statusCode, 409);
    assert.equal(auditCount, 1);

    // Part C: Expired viva exam -> 403
    progressDoc.status = "in_progress";
    progressDoc.vivaResult = null;
    progressDoc.vivaStartedAt = new Date(Date.now() - 50 * 60 * 1000);
    const resExpired = createMockRes();
    await submitVivaExam(makeReq(), resExpired, (err) => {
      throw err;
    });
    assert.equal(resExpired.statusCode, 403);
    assert.equal(resExpired.data.isTimeExpired, true);
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
    ExamQuestion.find = origQFind;
    ExamAuditLog.create = origAuditCreate;
  }
});
