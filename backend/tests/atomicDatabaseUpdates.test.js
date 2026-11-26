import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  saveVivaAnswerDraft,
  autosaveCodeDraft,
  autosaveAnswerDraft,
  facultyAuthorizeCompiler,
} from "../controllers/examController.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import Exam from "../models/Exam.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamAuditLog from "../models/ExamAuditLog.js";

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

test("1. saveVivaAnswerDraft uses atomic findOneAndUpdate for rapid Option A -> Option B changes without VersionError", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;

  // Simulated atomic in-memory document
  const dbDoc = {
    examId,
    studentId,
    status: "in_progress",
    vivaAnswers: {
      [q2.toString()]: { questionId: q2.toString(), selectedOption: "C" },
    },
    vivaResult: null,
  };
  let atomicCalls = 0;

  Exam.findById = () => ({ select: async () => ({ status: "in_progress" }) });
  StudentExamProgress.findOneAndUpdate = async (filter, update) => {
    atomicCalls++;
    assert.ok(filter.status.$nin.includes("completed"));
    for (const [k, v] of Object.entries(update.$set)) {
      if (k.startsWith("vivaAnswers.")) {
        const qKey = k.slice("vivaAnswers.".length);
        dbDoc.vivaAnswers[qKey] = v;
      } else {
        dbDoc[k] = v;
      }
    }
    return dbDoc;
  };

  try {
    const [resA, resB] = await Promise.all([
      (async () => {
        const r = createMockRes();
        await saveVivaAnswerDraft(
          {
            params: { examId: examId.toString() },
            user: { userId: studentId.toString() },
            body: { questionId: q1.toString(), selectedOption: "A", isMarkedForReview: false },
          },
          r,
          (e) => {
            throw e;
          }
        );
        return r;
      })(),
      (async () => {
        const r = createMockRes();
        await saveVivaAnswerDraft(
          {
            params: { examId: examId.toString() },
            user: { userId: studentId.toString() },
            body: { questionId: q1.toString(), selectedOption: "B", isMarkedForReview: true },
          },
          r,
          (e) => {
            throw e;
          }
        );
        return r;
      })(),
    ]);

    assert.equal(resA.statusCode, 200);
    assert.equal(resB.statusCode, 200);
    assert.equal(atomicCalls, 2);
    assert.equal(dbDoc.vivaAnswers[q1.toString()].selectedOption, "B");
    assert.equal(dbDoc.vivaAnswers[q2.toString()].selectedOption, "C");
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOneAndUpdate = origFindOneAndUpdate;
  }
});

test("2. autosaveCodeDraft uses atomic findOneAndUpdate with version guard so older requests cannot overwrite newer code", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;

  const dbDoc = {
    examId,
    studentId,
    status: "coding_in_progress",
    currentCode: "",
    codeDraftVersion: 0,
    questionProgress: new Map([
      [qId.toString(), { questionId: qId, status: "coding_in_progress", currentCode: "", codeDraftVersion: 0 }],
    ]),
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
  StudentExamProgress.findOne = async () => dbDoc;
  StudentExamProgress.findOneAndUpdate = async (filter, update) => {
    const qp = dbDoc.questionProgress.get(qId.toString());
    const versionConstraint = filter.$or?.find((c) => c[`questionProgress.${qId}.codeDraftVersion`]?.$lte !== undefined);
    const maxAllowed = versionConstraint?.[`questionProgress.${qId}.codeDraftVersion`]?.$lte;
    if (maxAllowed !== undefined && qp.codeDraftVersion > maxAllowed) {
      return null; // Reject stale write atomically
    }
    qp.currentCode = update.$set[`questionProgress.${qId}.currentCode`];
    qp.codeDraftVersion = update.$set[`questionProgress.${qId}.codeDraftVersion`];
    dbDoc.currentCode = update.$set.currentCode;
    dbDoc.codeDraftVersion = update.$set.codeDraftVersion;
    return dbDoc;
  };

  try {
    // Newer v5 arrives first
    const resNew = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "// version 5", questionId: qId.toString(), version: 5 },
      },
      resNew,
      (e) => {
        throw e;
      }
    );
    assert.equal(resNew.statusCode, 200);
    assert.equal(dbDoc.currentCode, "// version 5");

    // Older v3 arrives late -> ignored atomically
    const resOld = createMockRes();
    await autosaveCodeDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { code: "// version 3", questionId: qId.toString(), version: 3 },
      },
      resOld,
      (e) => {
        throw e;
      }
    );
    assert.equal(resOld.statusCode, 200);
    assert.equal(resOld.data.stale, true);
    assert.equal(dbDoc.currentCode, "// version 5");
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    StudentExamProgress.findOneAndUpdate = origFindOneAndUpdate;
  }
});

test("3. autosaveAnswerDraft uses atomic findOneAndUpdate and preserves non-draft statuses", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;

  let capturedUpdate = null;
  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "notepad_submitted",
    questionProgress: new Map([[qId.toString(), { questionId: qId, status: "notepad_submitted", answerDraftVersion: 1 }]]),
  });
  StudentExamProgress.findOneAndUpdate = async (filter, update) => {
    capturedUpdate = update;
    return { examId, studentId, status: "notepad_submitted" };
  };

  try {
    const res = createMockRes();
    await autosaveAnswerDraft(
      {
        params: { examId: examId.toString() },
        user: { userId: studentId.toString() },
        body: { answerText: "Refined note", questionId: qId.toString(), version: 2 },
      },
      res,
      (e) => {
        throw e;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.ok(capturedUpdate);
    assert.equal(capturedUpdate.$set.status, undefined);
    assert.equal(capturedUpdate.$set[`questionProgress.${qId}.status`], undefined);
    assert.equal(capturedUpdate.$set[`questionProgress.${qId}.lastConceptualAnswer`], "Refined note");
  } finally {
    StudentExamProgress.findOne = origProgFindOne;
    StudentExamProgress.findOneAndUpdate = origFindOneAndUpdate;
  }
});

test("4. facultyAuthorizeCompiler uses atomic findOneAndUpdate without overwriting student code or answers", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origAuditCreate = ExamAuditLog.create;
  const origFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;

  let capturedSet = null;
  Exam.findById = async () => ({ _id: examId, status: "in_progress" });
  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "waiting_faculty_decision",
    currentCode: "/* preserved */",
  });
  ExamAnswerSubmission.findOne = () => ({
    sort: async () => ({
      _id: new mongoose.Types.ObjectId(),
      questionId: qId,
      aiEvaluation: { errorPercentage: 10 },
      async save() {},
    }),
  });
  ExamAuditLog.create = async () => ({});
  StudentExamProgress.findOneAndUpdate = async (filter, update) => {
    capturedSet = update.$set;
    assert.ok(filter.status.$nin.includes("completed"));
    return { examId, studentId, compilerAllowed: true };
  };

  try {
    const res = createMockRes();
    await facultyAuthorizeCompiler(
      {
        params: { examId: examId.toString(), studentId: studentId.toString() },
        user: { userId: facultyId.toString(), role: "faculty" },
        body: { questionId: qId.toString() },
      },
      res,
      (e) => {
        throw e;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.ok(capturedSet);
    assert.equal(capturedSet.compilerAllowed, true);
    assert.equal(capturedSet.currentCode, undefined);
    assert.equal(capturedSet.lastConceptualAnswer, undefined);
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAnswerSubmission.findOne = origAnsFindOne;
    ExamAuditLog.create = origAuditCreate;
    StudentExamProgress.findOneAndUpdate = origFindOneAndUpdate;
  }
});
