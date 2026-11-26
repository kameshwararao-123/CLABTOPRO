import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  getStudentExamCompletion,
  expireStudentExam,
} from "../controllers/examController.js";
import Exam from "../models/Exam.js";
import User from "../models/User.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import submissionQueue from "../services/submissionQueue.js";

const createMockRes = () => ({
  statusCode: 200,
  data: null,
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(payload) {
    this.data = payload;
    return this;
  },
});

test("1. getStudentExamCompletion returns all 13 dashboard fields with multi-question test case & score aggregation", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origUserFindById = User.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origCodeFind = ExamCodeSubmission.find;

  Exam.findById = () => ({
    lean: async () => ({
      _id: examId,
      title: "Midterm C Lab",
      subject: "C Programming",
      examType: "internal",
      status: "completed",
      totalMarks: 100,
      questionsPerStudent: 2,
      completedAt: new Date("2026-11-25T12:00:00.000Z"),
    }),
  });
  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: studentId,
        username: "Asha Rao",
        rollNo: "S210123",
      }),
    }),
  });
  StudentExamProgress.findOne = () => ({
    lean: async () => ({
      examId,
      studentId,
      status: "completed",
      completionReason: "faculty_ended",
      instructionsAcknowledged: true,
      compilerAllowed: true,
      lastAIEvaluation: { errorPercentage: 12 },
      questionProgress: {
        [q1.toString()]: { isCompleted: true, score: 50, status: "completed" },
        [q2.toString()]: { isCompleted: false, currentCode: "int main(){}", status: "test_cases_failed" },
      },
    }),
  });
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [
            { _id: q1, title: "Q1", marks: 50 },
            { _id: q2, title: "Q2", marks: 50 },
          ],
        }),
      }),
    }),
  });
  ExamAnswerSubmission.findOne = () => ({
    sort: () => ({
      lean: async () => ({ isApproved: true, aiEvaluation: { errorPercentage: 12 } }),
    }),
  });
  ExamCodeSubmission.find = () => ({
    sort: () => ({
      lean: async () => [
        { questionId: q2, testCasesPassed: 1, totalTestCases: 3, allPassed: false, submittedAt: new Date() },
        { questionId: q1, testCasesPassed: 3, totalTestCases: 3, allPassed: true, submittedAt: new Date() },
      ],
    }),
  });

  try {
    const res = createMockRes();
    await getStudentExamCompletion(
      {
        params: { examId: examId.toString(), studentId: studentId.toString() },
        user: { userId: new mongoose.Types.ObjectId().toString(), role: "faculty" },
      },
      res,
      (err) => {
        throw err;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.studentName, "Asha Rao");
    assert.equal(res.data.rollNo, "S210123");
    assert.equal(res.data.examTitle, "Midterm C Lab");
    assert.equal(res.data.assignedQuestionCount, 2);
    assert.equal(res.data.questionsAttempted, 2);
    assert.equal(res.data.submittedQuestionCount, 1);
    assert.equal(res.data.totalTestCases, 6);
    assert.equal(res.data.testCasesPassed, 4);
    assert.equal(res.data.testCasesFailed, 2);
    assert.equal(res.data.overallScore, 50);
    assert.equal(res.data.aiEvaluationStatus, "Passed (12% Error)");
    assert.equal(res.data.finalExamStatus, "Examination Ended by Faculty");
    assert.ok(res.data.completedAt);
  } finally {
    Exam.findById = origExamFindById;
    User.findById = origUserFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
    ExamAnswerSubmission.findOne = origAnsFindOne;
    ExamCodeSubmission.find = origCodeFind;
  }
});

test("2. expireStudentExam routes auto-evaluation through submissionQueue and saves results on timer expiry", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origSubCreate = ExamCodeSubmission.create;
  const origAuditCreate = ExamAuditLog.create;
  const origEnqueue = submissionQueue.enqueue.bind(submissionQueue);

  let queueAction = null;
  let savedSubCount = 0;

  submissionQueue.enqueue = async (task, meta) => {
    queueAction = meta?.action;
    return origEnqueue(task, meta);
  };

  Exam.findById = () => ({
    select: async () => ({
      _id: examId,
      title: "Timer Expiry Exam",
      status: "in_progress",
      startedAt: new Date(Date.now() - 95 * 60 * 1000),
      durationMinutes: 90,
      participatingStudents: [studentId],
    }),
  });

  const progressDoc = {
    examId,
    studentId,
    status: "coding_in_progress",
    questionProgress: new Map([
      [
        q1.toString(),
        {
          questionId: q1,
          isCompleted: false,
          currentCode: `#include <stdio.h>\nint main(){int a,b; if(scanf("%d %d",&a,&b)==2) printf("%d\\n",a+b); return 0;}`,
        },
      ],
    ]),
    markModified() {},
    async save() {
      return this;
    },
  };
  StudentExamProgress.findOne = async () => progressDoc;

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [
            {
              _id: q1,
              title: "Sum Two",
              marks: 100,
              testCases: [{ input: "2 3", expectedOutput: "5", isHidden: false }],
            },
          ],
        }),
      }),
    }),
  });

  ExamCodeSubmission.create = async (doc) => {
    savedSubCount++;
    return { ...doc, _id: new mongoose.Types.ObjectId() };
  };
  ExamAuditLog.create = async () => ({});

  try {
    const res = createMockRes();
    await expireStudentExam(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
      },
      res,
      (err) => {
        throw err;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(queueAction, "exam_expire");
    assert.equal(savedSubCount, 1);
    assert.equal(res.data.completionReason, "time_expired");
    assert.equal(res.data.finalScore, 100);
    assert.equal(progressDoc.status, "completed");
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
    ExamCodeSubmission.create = origSubCreate;
    ExamAuditLog.create = origAuditCreate;
    submissionQueue.enqueue = origEnqueue;
  }
});
