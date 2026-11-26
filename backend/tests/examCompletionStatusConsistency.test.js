import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  getMyAssignedQuestion,
  getVivaExamQuestions,
} from "../controllers/examController.js";
import Exam from "../models/Exam.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamQuestion from "../models/ExamQuestion.js";

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

test("1. getMyAssignedQuestion returns 403 isCompleted=true for both completed and successfully_completed", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindOne = Exam.findOne;
  const origProgFindOne = StudentExamProgress.findOne;

  Exam.findOne = () => ({
    select: async () => ({
      _id: examId,
      status: "in_progress",
      title: "Status Consistency Exam",
      subject: "C",
      durationMinutes: 90,
      startedAt: new Date(Date.now() - 10000),
    }),
  });

  try {
    for (const terminalStatus of ["completed", "successfully_completed"]) {
      StudentExamProgress.findOne = async () => ({
        examId,
        studentId,
        status: terminalStatus,
        completionReason:
          terminalStatus === "successfully_completed"
            ? "all_questions_submitted"
            : "faculty_ended",
        questionProgress: new Map([[qId.toString(), { isCompleted: true }]]),
      });

      const res = createMockRes();
      await getMyAssignedQuestion(
        {
          params: { examId: examId.toString() },
          user: { userId: studentId.toString() },
          query: {},
        },
        res,
        (err) => {
          throw err;
        }
      );

      assert.equal(res.statusCode, 403);
      assert.equal(res.data.isCompleted, true);
    }
  } finally {
    Exam.findOne = origExamFindOne;
    StudentExamProgress.findOne = origProgFindOne;
  }
});

test("2. getVivaExamQuestions marks isCompleted=true for completed, successfully_completed, and time_expired", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origQFind = ExamQuestion.find;

  Exam.findById = async () => ({
    _id: examId,
    title: "Viva Exam",
    subject: "C",
    examType: "viva",
    status: "in_progress",
    durationMinutes: 30,
    totalMarks: 10,
    participatingStudents: [studentId],
  });
  ExamAllocation.findOne = async () => ({
    examId,
    studentId,
    assignedQuestionIds: [qId],
  });
  ExamQuestion.find = () => ({
    sort: () => ({
      lean: async () => [{ _id: qId, title: "Q1", options: [] }],
    }),
  });

  try {
    for (const status of ["completed", "successfully_completed", "time_expired"]) {
      StudentExamProgress.findOne = async () => ({
        examId,
        studentId,
        status,
        vivaAnswers: new Map(),
        vivaResult: { score: 10 },
      });

      const res = createMockRes();
      await getVivaExamQuestions(
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
      assert.equal(res.data.isCompleted, true);
    }

    // Active status -> isCompleted must be false
    StudentExamProgress.findOne = async () => ({
      examId,
      studentId,
      status: "in_progress",
      vivaAnswers: new Map(),
      vivaResult: null,
    });
    const resActive = createMockRes();
    await getVivaExamQuestions(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
      },
      resActive,
      (err) => {
        throw err;
      }
    );
    assert.equal(resActive.statusCode, 200);
    assert.equal(resActive.data.isCompleted, false);
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
    ExamQuestion.find = origQFind;
  }
});
