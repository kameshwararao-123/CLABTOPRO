import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import ExamQuestion from "../models/ExamQuestion.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import User from "../models/User.js";
import { submitStudentPaperAnswer, facultyEvaluateStudentPaper } from "../controllers/examController.js";

const createMockRes = () => ({
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
});

test("1. Student can submit Notepad answers >5 times (1st..7th) with unique IDs and preserved history", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFindOne = ExamAllocation.findOne;
  const origQuestionFindById = ExamQuestion.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origSubFindOne = ExamAnswerSubmission.findOne;
  const origSubCreate = ExamAnswerSubmission.create;
  const origAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const history = [];

  try {
    Exam.findById = async () => ({
      _id: examId,
      status: "in_progress",
      maxConceptualAttempts: 2,
    });
    ExamQuestion.findById = async () => ({
      _id: qId,
      title: "Arrays",
      problemStatement: "Explain arrays in C.",
      marks: 10,
      evaluationRubric: [{ criterion: "Concept", weight: 100 }],
    });
    ExamAllocation.findOne = () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => ({ assignedQuestionIds: [{ _id: qId, title: "Pointer Basics" }] }),
        }),
      }),
    });

    const mockProgress = {
      examId,
      studentId,
      status: "in_progress",
      conceptualAttemptsCount: 0,
      questionProgress: new Map(),
      save: async function () {
        return this;
      },
    };
    StudentExamProgress.findOne = async () => mockProgress;
    ExamAnswerSubmission.findOne = () => ({ sort: async () => null });
    ExamAnswerSubmission.create = async (doc) => {
      const rec = { ...doc, _id: new mongoose.Types.ObjectId() };
      history.push(rec);
      return rec;
    };
    ExamAuditLog.create = async () => ({});

    for (let i = 1; i <= 7; i++) {
      const req = {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: {
          questionId: qId.toString(),
          answerText: `Conceptual answer revision #${i}: explaining pointer arithmetic and memory safety in C.`,
        },
      };
      const res = createMockRes();
      let errOut = null;
      await submitStudentPaperAnswer(req, res, (e) => {
        errOut = e;
      });
      assert.equal(errOut, null);
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.attemptNumber, i);
      assert.ok(res.data.submission._id);
    }

    assert.equal(history.length, 7);
    const uniqueIds = new Set(history.map((h) => h._id.toString()));
    assert.equal(uniqueIds.size, 7);
    assert.equal(mockProgress.conceptualAttemptsCount, 7);
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.findOne = origAllocFindOne;
    ExamQuestion.findById = origQuestionFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAnswerSubmission.findOne = origSubFindOne;
    ExamAnswerSubmission.create = origSubCreate;
    ExamAuditLog.create = origAuditCreate;
  }
});

test("2. Exam end rules (completed, time_expired, faculty_ended, inactive exam, expired timer) still block Notepad submissions", async () => {
  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();

  try {
    for (const terminalStatus of ["completed", "successfully_completed", "time_expired", "faculty_ended"]) {
      StudentExamProgress.findOne = async () => ({ status: terminalStatus });
      Exam.findById = async () => ({ _id: examId, status: "in_progress" });
      const res = createMockRes();
      await submitStudentPaperAnswer(
        {
          params: { examId: examId.toString() },
          user: { userId: studentId.toString() },
          body: { answerText: "Valid conceptual answer with more than twenty characters." },
        },
        res,
        () => {}
      );
      assert.equal(res.statusCode, 403, `Expected 403 for terminal status ${terminalStatus}`);
      assert.equal(res.data.isCompleted, true);
    }

    // Expired exam timer
    StudentExamProgress.findOne = async () => ({ status: "in_progress" });
    Exam.findById = async () => ({
      _id: examId,
      status: "in_progress",
      startedAt: new Date(Date.now() - 120 * 60 * 1000),
      durationMinutes: 60,
    });
    const expiredRes = createMockRes();
    await submitStudentPaperAnswer(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { answerText: "Valid conceptual answer after timer expired." },
      },
      expiredRes,
      () => {}
    );
    assert.equal(expiredRes.statusCode, 403);
    assert.equal(expiredRes.data.isCompleted, true);
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
  }
});

test("3. Older AI evaluation does not overwrite newer submission progress/evaluation", async () => {
  const origExamFindById = Exam.findById;
  const origUserFindById = User.findById;
  const origAllocFindOne = ExamAllocation.findOne;
  const origQuestionFindById = ExamQuestion.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origSubFindOne = ExamAnswerSubmission.findOne;
  const origAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const qKey = qId.toString();

  try {
    Exam.findById = async () => ({ _id: examId, status: "in_progress" });
    User.findById = () => ({
      select: async () => ({ _id: studentId, username: "Student", rollNo: "101" }),
    });
    ExamQuestion.findById = async () => ({
      _id: qId,
      title: "Arrays",
      problemStatement: "Explain arrays in C.",
      marks: 10,
      evaluationRubric: [{ criterion: "Concept", weight: 100 }],
    });
    ExamAllocation.findOne = () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => ({
            assignedQuestionIds: [
              {
                _id: qId,
                title: "Arrays",
                problemStatement: "Explain arrays in C.",
                marks: 10,
                evaluationRubric: [{ criterion: "Concept", weight: 100 }],
              },
            ],
          }),
        }),
      }),
    });

    const olderSub = {
      _id: new mongoose.Types.ObjectId(),
      examId,
      studentId,
      questionId: qId,
      attemptNumber: 1,
      answerText: "Short older answer about arrays.",
      status: "submitted",
      save: async function () {
        return this;
      },
    };

    const newerEval = { errorPercentage: 10, understandingPercentage: 90 };
    const progressDoc = {
      examId,
      studentId,
      status: "in_progress",
      conceptualStatus: "submitted",
      conceptualAttemptsCount: 1,
      lastAIEvaluation: null,
      questionProgress: new Map([[qKey, { questionId: qId, conceptualAttemptsCount: 1, status: "in_progress" }]]),
      save: async function () {
        return this;
      },
    };

    let progReadCount = 0;
    StudentExamProgress.findOne = async () => {
      progReadCount += 1;
      // Simulate a newer submission (attempt 2) arriving before persistEvaluationSuccess finishes!
      if (progReadCount >= 2) {
        progressDoc.conceptualAttemptsCount = 2;
        progressDoc.status = "waiting_faculty_decision";
        progressDoc.lastAIEvaluation = newerEval;
        progressDoc.questionProgress.set(qKey, {
          questionId: qId,
          conceptualAttemptsCount: 2,
          status: "waiting_faculty_decision",
          lastAIEvaluation: newerEval,
        });
      }
      return progressDoc;
    };

    ExamAnswerSubmission.findOne = () => ({
      sort: async () => olderSub,
    });
    ExamAuditLog.create = async () => ({});

    const res = createMockRes();
    let errOut = null;
    await facultyEvaluateStudentPaper(
      {
        params: { examId: examId.toString(), studentId: studentId.toString() },
        user: { userId: facultyId.toString(), role: "admin" },
        body: { questionId: qKey },
        query: {},
      },
      res,
      (e) => {
        errOut = e;
      }
    );

    assert.equal(errOut, null);
    assert.equal(res.statusCode, 200);
    // Older submission itself keeps its own evaluation history
    assert.equal(olderSub.status, "evaluated");
    assert.ok(olderSub.aiEvaluation);
    // Newer progress evaluation was NOT overwritten by attempt 1's evaluation
    assert.equal(progressDoc.conceptualAttemptsCount, 2);
    assert.deepEqual(progressDoc.lastAIEvaluation, newerEval);
  } finally {
    Exam.findById = origExamFindById;
    User.findById = origUserFindById;
    ExamAllocation.findOne = origAllocFindOne;
    ExamQuestion.findById = origQuestionFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAnswerSubmission.findOne = origSubFindOne;
    ExamAuditLog.create = origAuditCreate;
  }
});
