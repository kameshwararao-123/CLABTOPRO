import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import ExamQuestion from "../models/ExamQuestion.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import User from "../models/User.js";
import { facultyEvaluateStudentPaper, getExamMonitoring } from "../controllers/examController.js";

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

test("1. Multi-question completion counts (1/2, 2/2, 2/3) & partial completion never marks exam Successfully Completed", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;

  const examId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();
  const q3 = new mongoose.Types.ObjectId();

  const sOneOfTwo = new mongoose.Types.ObjectId();
  const sTwoOfTwo = new mongoose.Types.ObjectId();
  const sTwoOfThree = new mongoose.Types.ObjectId();

  try {
    Exam.findById = () => ({
      lean: async () => ({ _id: examId, title: "Final", examType: "coding", status: "completed" }),
    });
    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              {
                studentId: { _id: sOneOfTwo, username: "S1", rollNo: "01", email: "s1@college.edu" },
                assignedQuestionIds: [
                  { _id: q1, title: "Q1", questionNumber: "Q1" },
                  { _id: q2, title: "Q2", questionNumber: "Q2" },
                ],
              },
              {
                studentId: { _id: sTwoOfTwo, username: "S2", rollNo: "02", email: "s2@college.edu" },
                assignedQuestionIds: [
                  { _id: q1, title: "Q1", questionNumber: "Q1" },
                  { _id: q2, title: "Q2", questionNumber: "Q2" },
                ],
              },
              {
                studentId: { _id: sTwoOfThree, username: "S3", rollNo: "03", email: "s3@college.edu" },
                assignedQuestionIds: [
                  { _id: q1, title: "Q1", questionNumber: "Q1" },
                  { _id: q2, title: "Q2", questionNumber: "Q2" },
                  { _id: q3, title: "Q3", questionNumber: "Q3" },
                ],
              },
            ],
          }),
        }),
      }),
    });

    StudentExamProgress.find = () => ({
      select: () => ({
        lean: async () => [
          {
            studentId: sOneOfTwo,
            status: "completed",
            questionProgress: {
              [q1.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
              [q2.toString()]: { isCompleted: false, status: "in_progress" },
            },
          },
          {
            studentId: sTwoOfTwo,
            status: "completed",
            questionProgress: {
              [q1.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
              [q2.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
            },
          },
          {
            studentId: sTwoOfThree,
            status: "completed",
            questionProgress: {
              [q1.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
              [q2.toString()]: { isCompleted: true, status: "completed", compilerAllowed: true },
              [q3.toString()]: { isCompleted: false, status: "not_started" },
            },
          },
        ],
      }),
    });

    ExamAnswerSubmission.find = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => [
            { studentId: sOneOfTwo, questionId: q1, isApproved: true, facultyDecision: "allow_to_code", status: "approved" },
            { studentId: sTwoOfTwo, questionId: q1, isApproved: true, facultyDecision: "allow_to_code", status: "approved" },
            { studentId: sTwoOfTwo, questionId: q2, isApproved: true, facultyDecision: "allow_to_code", status: "approved" },
            { studentId: sTwoOfThree, questionId: q1, isApproved: true, facultyDecision: "allow_to_code", status: "approved" },
            { studentId: sTwoOfThree, questionId: q2, isApproved: true, facultyDecision: "allow_to_code", status: "approved" },
          ],
        }),
      }),
    });

    ExamCodeSubmission.find = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => [
            { studentId: sOneOfTwo, questionId: q1, allPassed: true, testCasesPassed: 5, totalTestCases: 5 },
            { studentId: sTwoOfTwo, questionId: q1, allPassed: true, testCasesPassed: 5, totalTestCases: 5 },
            { studentId: sTwoOfTwo, questionId: q2, allPassed: true, testCasesPassed: 5, totalTestCases: 5 },
            { studentId: sTwoOfThree, questionId: q1, allPassed: true, testCasesPassed: 5, totalTestCases: 5 },
            { studentId: sTwoOfThree, questionId: q2, allPassed: true, testCasesPassed: 5, totalTestCases: 5 },
          ],
        }),
      }),
    });

    const res = createMockRes();
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, () => {});
    assert.equal(res.statusCode, 200);

    const s1Rows = res.data.students.filter((r) => r.studentId === sOneOfTwo.toString());
    assert.equal(s1Rows[0].solvedQuestionsLabel, "1/2");
    assert.equal(s1Rows[0].isSuccessfullyCompleted, false);

    const s2Rows = res.data.students.filter((r) => r.studentId === sTwoOfTwo.toString());
    assert.equal(s2Rows[0].solvedQuestionsLabel, "2/2");
    assert.equal(s2Rows[0].isSuccessfullyCompleted, true);

    const s3Rows = res.data.students.filter((r) => r.studentId === sTwoOfThree.toString());
    assert.equal(s3Rows[0].solvedQuestionsLabel, "2/3");
    assert.equal(s3Rows[0].isSuccessfullyCompleted, false);
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
  }
});

test("2. Evaluating Q1 for a student does not block or mark Q2 as evaluating", async () => {
  const origExamFindById = Exam.findById;
  const origUserFindById = User.findById;
  const origQuestionFindById = ExamQuestion.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origSubFindOne = ExamAnswerSubmission.findOne;
  const origAuditCreate = ExamAuditLog.create;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const facultyId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();

  const subQ2 = {
    _id: new mongoose.Types.ObjectId(),
    examId,
    studentId,
    questionId: q2,
    attemptNumber: 1,
    answerText: "Detailed conceptual answer for Q2 with clear explanation.",
    status: "submitted",
    save: async function () {
      return this;
    },
  };

  // Q1 is currently evaluating (top-level progress.status === "evaluating"), Q2 is still "awaiting_faculty_evaluation"
  const progressDoc = {
    examId,
    studentId,
    status: "evaluating",
    conceptualStatus: "evaluating",
    questionProgress: new Map([
      [q1.toString(), { questionId: q1, status: "evaluating", conceptualStatus: "evaluating" }],
      [q2.toString(), { questionId: q2, status: "awaiting_faculty_evaluation", conceptualStatus: "submitted" }],
    ]),
    save: async function () {
      return this;
    },
  };

  try {
    Exam.findById = async () => ({ _id: examId, status: "in_progress" });
    User.findById = () => ({ select: async () => ({ _id: studentId, username: "Sateesh", rollNo: "101" }) });
    ExamQuestion.findById = async () => ({
      _id: q2,
      title: "Q2",
      problemStatement: "Explain loops.",
      marks: 10,
      evaluationRubric: [{ criterion: "Logic", weight: 100 }],
    });
    StudentExamProgress.findOne = async () => progressDoc;
    ExamAnswerSubmission.findOne = () => ({ sort: async () => subQ2 });
    ExamAuditLog.create = async () => ({});

    const res = createMockRes();
    let errOut = null;
    await facultyEvaluateStudentPaper(
      {
        params: { examId: examId.toString(), studentId: studentId.toString() },
        user: { userId: facultyId.toString(), role: "admin" },
        body: { questionId: q2.toString() },
        query: {},
      },
      res,
      (e) => {
        errOut = e;
      }
    );

    assert.equal(errOut, null);
    assert.equal(res.statusCode, 200);
    assert.equal(subQ2.status, "evaluated");
    // Q1 was not touched
    assert.equal(progressDoc.questionProgress.get(q1.toString()).status, "evaluating");
  } finally {
    Exam.findById = origExamFindById;
    User.findById = origUserFindById;
    ExamQuestion.findById = origQuestionFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAnswerSubmission.findOne = origSubFindOne;
    ExamAuditLog.create = origAuditCreate;
  }
});
