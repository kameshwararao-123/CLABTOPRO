import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamQuestion from "../models/ExamQuestion.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import { enrollStudentWithCode } from "../controllers/examController.js";

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

const mockInProgressEnrollment = async (minutesAfterStart) => {
  const origExamFindOne = Exam.findOne;
  const origExamFindOneAndUpdate = Exam.findOneAndUpdate;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAllocFind = ExamAllocation.find;
  const origAllocCreate = ExamAllocation.create;
  const origQuestionFind = ExamQuestion.find;
  const origProgFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const startedAt = new Date(Date.now() - minutesAfterStart * 60 * 1000);
  let createdAlloc = null;

  try {
    Exam.findOne = async () => ({
      _id: examId,
      examCode: "CLAB30MIN",
      title: "Midterm C Lab",
      subject: "C Programming",
      examType: "coding",
      status: "in_progress",
      enrollmentClosed: true,
      startedAt,
      durationMinutes: 90,
      questionsPerStudent: 1,
      totalMarks: 100,
      participatingStudents: [],
    });

    Exam.findOneAndUpdate = async (_filter) => ({
      _id: examId,
      status: "in_progress",
      examType: "coding",
      questionsPerStudent: 1,
      participatingStudents: [studentId],
    });

    ExamAllocation.findOne = () => ({ lean: async () => null });
    ExamAllocation.find = () => ({ select: () => ({ lean: async () => [] }) });
    ExamAllocation.create = async (doc) => {
      createdAlloc = doc;
      return doc;
    };
    ExamQuestion.find = () => ({
      lean: async () => [{ _id: qId, title: "Array Sum", difficulty: "Medium", marks: 100 }],
    });
    StudentExamProgress.findOneAndUpdate = async () => ({});

    const res = createMockRes();
    await enrollStudentWithCode(
      { user: { userId: studentId.toString() }, body: { examCode: "CLAB30MIN" } },
      res
    );

    return { res, createdAlloc, studentId };
  } finally {
    Exam.findOne = origExamFindOne;
    Exam.findOneAndUpdate = origExamFindOneAndUpdate;
    ExamAllocation.findOne = origAllocFindOne;
    ExamAllocation.find = origAllocFind;
    ExamAllocation.create = origAllocCreate;
    ExamQuestion.find = origQuestionFind;
    StudentExamProgress.findOneAndUpdate = origProgFindOneAndUpdate;
  }
};

test("1. Student can enroll 10 minutes after exam starts and receives question allocation", async () => {
  const { res, createdAlloc } = await mockInProgressEnrollment(10);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.enrollmentStatus, "Successfully Enrolled");
  assert.ok(createdAlloc, "Late-joining student within 30-min window should receive question allocation");
});

test("2. Student can enroll 29 minutes after exam starts", async () => {
  const { res, createdAlloc } = await mockInProgressEnrollment(29);
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.enrollmentStatus, "Successfully Enrolled");
  assert.ok(createdAlloc);
});

test("3. Student cannot enroll at exactly 30 minutes after exam starts", async () => {
  const { res, createdAlloc } = await mockInProgressEnrollment(30);
  assert.equal(res.statusCode, 403);
  assert.equal(
    res.data.message,
    "Enrollment closed. The 30-minute enrollment window for this exam has expired."
  );
  assert.equal(createdAlloc, null);
});

test("4. Student cannot enroll 31 minutes after exam starts even if exam is in progress", async () => {
  const { res, createdAlloc } = await mockInProgressEnrollment(31);
  assert.equal(res.statusCode, 403);
  assert.equal(
    res.data.message,
    "Enrollment closed. The 30-minute enrollment window for this exam has expired."
  );
  assert.equal(createdAlloc, null);
});

test("5. Already-enrolled student is not invalidated after 30 minutes", async () => {
  const origExamFindOne = Exam.findOne;
  const studentId = new mongoose.Types.ObjectId();
  const examId = new mongoose.Types.ObjectId();

  try {
    Exam.findOne = async () => ({
      _id: examId,
      examCode: "CLAB30MIN",
      status: "in_progress",
      enrollmentClosed: true,
      startedAt: new Date(Date.now() - 45 * 60 * 1000),
      participatingStudents: [studentId],
    });

    const res = createMockRes();
    await enrollStudentWithCode(
      { user: { userId: studentId.toString() }, body: { examCode: "CLAB30MIN" } },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.data.message, "You are already enrolled in this examination.");
  } finally {
    Exam.findOne = origExamFindOne;
  }
});
