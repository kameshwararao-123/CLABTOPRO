import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  autosaveAnswerDraft,
  autosaveCodeDraft,
  saveVivaAnswerDraft,
} from "../controllers/examController.js";
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

test("1. autosaveAnswerDraft transitions initial pre-answer statuses to answer_in_progress and saves draft", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const origFindOne = StudentExamProgress.findOne;

  const progressDoc = {
    examId,
    studentId,
    status: "notepad_pending",
    answerDraftVersion: 0,
    lastConceptualAnswer: "",
    questionProgress: new Map([[qId.toString(), { questionId: qId, status: "notepad_pending" }]]),
    markModified() {},
    async save() {
      return this;
    },
  };
  StudentExamProgress.findOne = async () => progressDoc;

  try {
    const res = createMockRes();
    await autosaveAnswerDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { answerText: "Step 1: read input", questionId: qId.toString(), version: 1 },
      },
      res,
      (err) => {
        throw err;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(progressDoc.status, "answer_in_progress");
    assert.equal(progressDoc.questionProgress.get(qId.toString()).status, "answer_in_progress");
    assert.equal(progressDoc.lastConceptualAnswer, "Step 1: read input");
  } finally {
    StudentExamProgress.findOne = origFindOne;
  }
});

test("2, 3 & 4. autosaveAnswerDraft never overwrites terminal, submitted, evaluated, or faculty-ended statuses", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const origFindOne = StudentExamProgress.findOne;

  try {
    // Terminal states -> rejected 403 and status unchanged
    for (const terminalStatus of ["successfully_completed", "completed", "time_expired"]) {
      const doc = {
        examId,
        studentId,
        status: terminalStatus,
        lastConceptualAnswer: "final",
        async save() {
          throw new Error("save() must not be called on terminal progress");
        },
      };
      StudentExamProgress.findOne = async () => doc;

      const res = createMockRes();
      await autosaveAnswerDraft(
        {
          params: { examId: examId.toString() },
          user: { userId: studentId.toString() },
          body: { answerText: "late edit", questionId: qId.toString(), version: 2 },
        },
        res,
        (err) => {
          throw err;
        }
      );

      assert.equal(res.statusCode, 403);
      assert.equal(doc.status, terminalStatus);
      assert.equal(doc.lastConceptualAnswer, "final");
    }

    // Non-terminal post-draft statuses (e.g. notepad_submitted, test_cases_failed, in_progress) -> draft saves, status preserved
    for (const preservedStatus of [
      "notepad_submitted",
      "ai_evaluation_pending",
      "notepad_resubmitted",
      "test_cases_failed",
      "submission_pending",
      "in_progress",
    ]) {
      const doc = {
        examId,
        studentId,
        status: preservedStatus,
        answerDraftVersion: 1,
        lastConceptualAnswer: "old",
        questionProgress: new Map([[qId.toString(), { questionId: qId, status: preservedStatus }]]),
        markModified() {},
        async save() {
          return this;
        },
      };
      StudentExamProgress.findOne = async () => doc;

      const res = createMockRes();
      await autosaveAnswerDraft(
        {
          params: { examId: examId.toString() },
          user: { userId: studentId.toString() },
          body: { answerText: "updated draft", questionId: qId.toString(), version: 2 },
        },
        res,
        (err) => {
          throw err;
        }
      );

      assert.equal(res.statusCode, 200);
      assert.equal(doc.status, preservedStatus);
      assert.equal(doc.questionProgress.get(qId.toString()).status, preservedStatus);
      assert.equal(doc.lastConceptualAnswer, "updated draft");
    }
  } finally {
    StudentExamProgress.findOne = origFindOne;
  }
});

test("5. autosaveAnswerDraft preserves completed question status and unrelated fields", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const origFindOne = StudentExamProgress.findOne;

  const doc = {
    examId,
    studentId,
    status: "coding_in_progress",
    finalScore: 100,
    compilerAllowed: true,
    questionProgress: new Map([
      [q1.toString(), { questionId: q1, status: "completed", isCompleted: true, score: 100 }],
    ]),
    markModified() {},
    async save() {
      return this;
    },
  };
  StudentExamProgress.findOne = async () => doc;

  try {
    const res = createMockRes();
    await autosaveAnswerDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { answerText: "extra note", questionId: q1.toString(), version: 1 },
      },
      res,
      (err) => {
        throw err;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(doc.status, "coding_in_progress");
    assert.equal(doc.questionProgress.get(q1.toString()).status, "completed");
    assert.equal(doc.questionProgress.get(q1.toString()).isCompleted, true);
    assert.equal(doc.finalScore, 100);
    assert.equal(doc.compilerAllowed, true);
  } finally {
    StudentExamProgress.findOne = origFindOne;
  }
});

test("6. autosaveCodeDraft preserves progress status and rejects time_expired / completed", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const origFindOne = StudentExamProgress.findOne;

  try {
    const activeDoc = {
      examId,
      studentId,
      status: "coding_in_progress",
      codeDraftVersion: 1,
      questionProgress: new Map([[qId.toString(), { questionId: qId, status: "coding_in_progress" }]]),
      markModified() {},
      async save() {
        return this;
      },
    };
    StudentExamProgress.findOne = async () => activeDoc;

    const resOk = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "int main(){return 0;}", questionId: qId.toString(), version: 2 },
      },
      resOk,
      (err) => {
        throw err;
      }
    );
    assert.equal(resOk.statusCode, 200);
    assert.equal(activeDoc.status, "coding_in_progress");

    const expiredDoc = { examId, studentId, status: "time_expired" };
    StudentExamProgress.findOne = async () => expiredDoc;
    const resExp = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "int main(){return 0;}", questionId: qId.toString(), version: 3 },
      },
      resExp,
      (err) => {
        throw err;
      }
    );
    assert.equal(resExp.statusCode, 403);
    assert.equal(expiredDoc.status, "time_expired");
  } finally {
    StudentExamProgress.findOne = origFindOne;
  }
});

test("7. saveVivaAnswerDraft preserves viva completion and faculty-ended exam state", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const origProgFindOne = StudentExamProgress.findOne;
  const origExamFindById = Exam.findById;

  try {
    // Active viva draft -> saves without changing status "in_progress"
    Exam.findById = () => ({ select: async () => ({ status: "in_progress" }) });
    const activeViva = {
      examId,
      studentId,
      status: "in_progress",
      vivaAnswers: new Map(),
      vivaResult: null,
      async save() {
        return this;
      },
    };
    StudentExamProgress.findOne = async () => activeViva;

    const resOk = createMockRes();
    await saveVivaAnswerDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { questionId: qId.toString(), selectedOption: "A", isMarkedForReview: false },
      },
      resOk,
      (err) => {
        throw err;
      }
    );
    assert.equal(resOk.statusCode, 200);
    assert.equal(activeViva.status, "in_progress");

    // Already submitted viva -> rejected 400 and vivaResult/status untouched
    const completedViva = {
      examId,
      studentId,
      status: "completed",
      vivaResult: { submittedAt: new Date(), score: 10 },
      async save() {
        throw new Error("save() must not be called on completed viva");
      },
    };
    StudentExamProgress.findOne = async () => completedViva;
    const resDone = createMockRes();
    await saveVivaAnswerDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { questionId: qId.toString(), selectedOption: "B" },
      },
      resDone,
      (err) => {
        throw err;
      }
    );
    assert.equal(resDone.statusCode, 400);
    assert.equal(completedViva.status, "completed");

    // Faculty ended viva exam -> rejected 403
    Exam.findById = () => ({ select: async () => ({ status: "completed" }) });
    StudentExamProgress.findOne = async () => activeViva;
    const resFac = createMockRes();
    await saveVivaAnswerDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { questionId: qId.toString(), selectedOption: "C" },
      },
      resFac,
      (err) => {
        throw err;
      }
    );
    assert.equal(resFac.statusCode, 403);
    assert.equal(resFac.data.facultyEndedExam, true);
  } finally {
    StudentExamProgress.findOne = origProgFindOne;
    Exam.findById = origExamFindById;
  }
});
