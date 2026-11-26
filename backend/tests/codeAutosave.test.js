import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { autosaveCodeDraft } from "../controllers/examController.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import Exam from "../models/Exam.js";

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

test("1. autosaveCodeDraft persists formatted code, version, and skips stale/unchanged writes", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const origProgFindOne = StudentExamProgress.findOne;
  const origExamFindById = Exam.findById;

  let saveCount = 0;
  const progressDoc = {
    examId,
    studentId,
    status: "coding_in_progress",
    currentCode: "",
    codeDraftVersion: 0,
    questionProgress: new Map([[qId.toString(), { questionId: qId, status: "coding_in_progress" }]]),
    markModified() {},
    async save() {
      saveCount++;
      return this;
    },
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
  StudentExamProgress.findOne = async () => progressDoc;

  const formattedCode = "#include <stdio.h>\nint main() {\n    return 0;\n}\n";

  try {
    // Save v2
    const res1 = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: formattedCode, questionId: qId.toString(), version: 2 },
      },
      res1,
      (err) => {
        throw err;
      }
    );
    assert.equal(res1.statusCode, 200);
    assert.equal(saveCount, 1);
    assert.equal(progressDoc.currentCode, formattedCode);
    assert.equal(progressDoc.codeDraftVersion, 2);
    assert.equal(progressDoc.status, "coding_in_progress");

    // Stale v1 -> ignored, does not overwrite v2
    const resStale = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "// older code", questionId: qId.toString(), version: 1 },
      },
      resStale,
      (err) => {
        throw err;
      }
    );
    assert.equal(resStale.statusCode, 200);
    assert.equal(resStale.data.stale, true);
    assert.equal(saveCount, 1);
    assert.equal(progressDoc.currentCode, formattedCode);

    // Unchanged v2 -> skipped DB write
    const resUnchanged = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: formattedCode, questionId: qId.toString(), version: 2 },
      },
      resUnchanged,
      (err) => {
        throw err;
      }
    );
    assert.equal(resUnchanged.statusCode, 200);
    assert.equal(resUnchanged.data.unchanged, true);
    assert.equal(saveCount, 1);
  } finally {
    StudentExamProgress.findOne = origProgFindOne;
    Exam.findById = origExamFindById;
  }
});

test("2. autosaveCodeDraft rejects expired exams, faculty-ended exams, and already-submitted questions", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const origProgFindOne = StudentExamProgress.findOne;
  const origExamFindById = Exam.findById;

  const progressDoc = {
    examId,
    studentId,
    status: "coding_in_progress",
    questionProgress: new Map([[qId.toString(), { questionId: qId, status: "coding_in_progress" }]]),
  };
  StudentExamProgress.findOne = async () => progressDoc;

  try {
    // Expired exam -> 403
    Exam.findById = () => ({
      select: async () => ({
        _id: examId,
        status: "in_progress",
        startedAt: new Date(Date.now() - 100 * 60 * 1000),
        durationMinutes: 60,
        participatingStudents: [studentId],
      }),
    });
    const resExp = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "int main(){}", questionId: qId.toString(), version: 1 },
      },
      resExp,
      (err) => {
        throw err;
      }
    );
    assert.equal(resExp.statusCode, 403);
    assert.equal(resExp.data.isTimeExpired, true);

    // Faculty ended -> 403
    Exam.findById = () => ({
      select: async () => ({
        _id: examId,
        status: "completed",
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        durationMinutes: 60,
        participatingStudents: [studentId],
      }),
    });
    const resFac = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "int main(){}", questionId: qId.toString(), version: 1 },
      },
      resFac,
      (err) => {
        throw err;
      }
    );
    assert.equal(resFac.statusCode, 403);
    assert.equal(resFac.data.facultyEndedExam, true);

    // Already submitted question -> 403
    Exam.findById = () => ({
      select: async () => ({
        _id: examId,
        status: "in_progress",
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        durationMinutes: 60,
        participatingStudents: [studentId],
      }),
    });
    progressDoc.questionProgress.set(qId.toString(), {
      questionId: qId,
      isCompleted: true,
      status: "completed",
    });
    const resDoneQ = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "int main(){}", questionId: qId.toString(), version: 1 },
      },
      resDoneQ,
      (err) => {
        throw err;
      }
    );
    assert.equal(resDoneQ.statusCode, 403);
    assert.equal(resDoneQ.data.alreadySubmitted, true);
  } finally {
    StudentExamProgress.findOne = origProgFindOne;
    Exam.findById = origExamFindById;
  }
});
