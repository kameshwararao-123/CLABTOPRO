import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import {
  facultyAuthorizeCompiler,
  facultyReturnToNotepad,
  getExamMonitoring,
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

test("1. Faculty can switch decision Allow to Code -> Return to Notepad -> Allow to Code without getting stuck", async () => {
  const origExamFindById = Exam.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origProgFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;
  const origSubFindOne = ExamAnswerSubmission.findOne;
  const origAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const qKey = qId.toString();

  const submissionDoc = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: qId,
    attemptNumber: 1,
    status: "evaluated",
    facultyDecision: "pending",
    isApproved: false,
    aiEvaluation: { errorPercentage: 25, understandingPercentage: 75 },
    save: async function () {
      return this;
    },
  };

  const progressDoc = {
    examId,
    studentId,
    status: "waiting_faculty_decision",
    conceptualStatus: "evaluated",
    compilerAllowed: false,
    facultyDecision: "pending",
    questionProgress: new Map([
      [qKey, { questionId: qId, status: "waiting_faculty_decision", conceptualStatus: "evaluated", compilerAllowed: false }],
    ]),
    markModified: () => {},
    save: async function () {
      return this;
    },
  };

  try {
    Exam.findById = async () => ({ _id: examId, status: "in_progress" });
    StudentExamProgress.findOne = async () => progressDoc;
    StudentExamProgress.findOneAndUpdate = async (_filter, update) => {
      if (update?.$set) {
        progressDoc.compilerAllowed = update.$set.compilerAllowed;
        progressDoc.conceptualStatus = update.$set.conceptualStatus;
        progressDoc.status = update.$set.status;
        progressDoc.facultyDecision = update.$set.facultyDecision;
        const qp = progressDoc.questionProgress.get(qKey) || {};
        qp.compilerAllowed = update.$set[`questionProgress.${qKey}.compilerAllowed`];
        qp.conceptualStatus = update.$set[`questionProgress.${qKey}.conceptualStatus`];
        qp.status = update.$set[`questionProgress.${qKey}.status`];
        qp.facultyDecision = update.$set[`questionProgress.${qKey}.facultyDecision`];
        progressDoc.questionProgress.set(qKey, qp);
      }
      return progressDoc;
    };
    ExamAnswerSubmission.findOne = () => ({ sort: async () => submissionDoc });
    ExamAuditLog.create = async () => ({});

    // Step 1: Allow to Code
    const res1 = createMockRes();
    await facultyAuthorizeCompiler(
      { params: { examId: examId.toString(), studentId: studentId.toString() }, user: { userId: facultyId.toString(), role: "admin" }, body: { questionId: qKey } },
      res1,
      () => {}
    );
    assert.equal(res1.statusCode, 200);
    assert.equal(progressDoc.compilerAllowed, true);
    assert.equal(submissionDoc.facultyDecision, "allow_to_code");

    // Step 2: Change decision to Return to Notepad
    const res2 = createMockRes();
    await facultyReturnToNotepad(
      {
        params: { examId: examId.toString(), studentId: studentId.toString() },
        user: { userId: facultyId.toString(), role: "admin" },
        body: { questionId: qKey, feedback: "Please clarify edge cases." },
      },
      res2,
      () => {}
    );
    assert.equal(res2.statusCode, 200);
    assert.equal(progressDoc.compilerAllowed, false);
    assert.equal(progressDoc.status, "notepad_correction_required");
    assert.equal(submissionDoc.facultyDecision, "return_to_notepad");
    assert.equal(submissionDoc.isApproved, false);

    // Step 3: Change decision back to Allow to Code
    const res3 = createMockRes();
    await facultyAuthorizeCompiler(
      { params: { examId: examId.toString(), studentId: studentId.toString() }, user: { userId: facultyId.toString(), role: "admin" }, body: { questionId: qKey } },
      res3,
      () => {}
    );
    assert.equal(res3.statusCode, 200);
    assert.equal(progressDoc.compilerAllowed, true);
    assert.equal(submissionDoc.facultyDecision, "allow_to_code");
    assert.equal(submissionDoc.isApproved, true);
  } finally {
    Exam.findById = origExamFindById;
    StudentExamProgress.findOne = origProgFindOne;
    StudentExamProgress.findOneAndUpdate = origProgFindOneAndUpdate;
    ExamAnswerSubmission.findOne = origSubFindOne;
    ExamAuditLog.create = origAuditCreate;
  }
});

test("2. getExamMonitoring does not stay stuck in evaluating when evaluation/decision already exists", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  try {
    Exam.findById = () => ({
      lean: async () => ({ _id: examId, title: "Test", examType: "coding", status: "in_progress" }),
    });
    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              {
                studentId: { _id: studentId, username: "Student1", rollNo: "101", email: "s1@college.edu" },
                assignedQuestionIds: [{ _id: qId, title: "Q1", questionNumber: "Q1" }],
              },
            ],
          }),
        }),
      }),
    });
    // Simulate stale "evaluating" flag in progress even though submission is already evaluated
    StudentExamProgress.find = () => ({
      select: () => ({
        lean: async () => [
          {
            studentId,
            status: "evaluating",
            conceptualStatus: "evaluating",
            questionProgress: { [qId.toString()]: { status: "evaluating", conceptualStatus: "evaluating" } },
          },
        ],
      }),
    });
    ExamAnswerSubmission.find = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => [
            {
              studentId,
              questionId: qId,
              status: "evaluated",
              facultyDecision: "pending",
              aiEvaluation: { errorPercentage: 20 },
              submittedAt: new Date(),
            },
          ],
        }),
      }),
    });
    ExamCodeSubmission.find = () => ({
      sort: () => ({ select: () => ({ lean: async () => [] }) }),
    });

    const res = createMockRes();
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, () => {});
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.students[0].evaluationAction, "allow_to_code");
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
  }
});
