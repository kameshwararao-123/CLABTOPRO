import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import {
  createExam,
  extendExamDuration,
  enrollStudentWithCode,
  getExamEndTimeMs,
} from "../controllers/examController.js";

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

test("1. Exam schema & createExam default to 180 minutes (3 hours)", async () => {
  const examModel = new Exam({
    title: "3 Hour Coding Exam",
    subject: "C Programming",
    examDate: new Date(),
    createdBy: new mongoose.Types.ObjectId(),
  });
  assert.equal(examModel.durationMinutes, 180);

  const origExamCreate = Exam.create;
  const origExamFindOne = Exam.findOne;
  const origAuditCreate = ExamAuditLog.create;

  try {
    Exam.findOne = () => ({ select: () => ({ lean: async () => null }) });
    let createdPayload = null;
    Exam.create = async (doc) => {
      createdPayload = doc;
      return { ...doc, _id: new mongoose.Types.ObjectId() };
    };
    ExamAuditLog.create = async () => ({});

    const res = createMockRes();
    await createExam(
      {
        user: { userId: new mongoose.Types.ObjectId().toString(), role: "admin" },
        body: {
          title: "Default Duration Test",
          subject: "C",
          academicYear: "2026-2027",
          semester: "Semester 1",
          examType: "internal",
          examDate: new Date().toISOString(),
          totalMarks: 100,
        },
      },
      res,
      () => {}
    );
    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.durationMinutes, 180);
  } finally {
    Exam.create = origExamCreate;
    Exam.findOne = origExamFindOne;
    ExamAuditLog.create = origAuditCreate;
  }
});

test("2. Faculty can extend ongoing exam by 30m without resetting startedAt or extending 30-min enrollment window", async () => {
  const origExamFindById = Exam.findById;
  const origExamFindOne = Exam.findOne;

  const examId = new mongoose.Types.ObjectId();
  const startedAt = new Date(Date.now() - 35 * 60 * 1000); // Started 35 minutes ago
  const initialEnd = new Date(startedAt.getTime() + 180 * 60 * 1000);

  const examDoc = {
    _id: examId,
    examCode: "CLAB180M",
    status: "in_progress",
    startedAt,
    officialEndTime: initialEnd,
    durationMinutes: 180,
    extendedMinutes: 0,
    participatingStudents: [],
    save: async function () {
      return this;
    },
  };

  try {
    Exam.findById = async () => examDoc;
    Exam.findOne = async () => examDoc;

    // Extend by 30 minutes
    const extRes = createMockRes();
    await extendExamDuration(
      {
        params: { examId: examId.toString() },
        user: { userId: new mongoose.Types.ObjectId().toString(), role: "admin" },
        body: { extraMinutes: 30 },
      },
      extRes,
      () => {}
    );

    assert.equal(extRes.statusCode, 200);
    assert.equal(examDoc.durationMinutes, 210);
    assert.equal(examDoc.extendedMinutes, 30);
    assert.equal(examDoc.startedAt.getTime(), startedAt.getTime(), "startedAt must never reset");
    assert.equal(
      getExamEndTimeMs(examDoc),
      initialEnd.getTime() + 30 * 60 * 1000,
      "officialEndTime must advance by 30 minutes"
    );

    // 30-minute enrollment window must still block new student at 35 minutes
    const enrollRes = createMockRes();
    await enrollStudentWithCode(
      {
        user: { userId: new mongoose.Types.ObjectId().toString() },
        body: { examCode: "CLAB180M" },
      },
      enrollRes
    );
    assert.equal(enrollRes.statusCode, 403);
    assert.equal(
      enrollRes.data.message,
      "Enrollment closed. The 30-minute enrollment window for this exam has expired."
    );
  } finally {
    Exam.findById = origExamFindById;
    Exam.findOne = origExamFindOne;
  }
});
