import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import { getExamMonitoring } from "../controllers/examController.js";

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

test("getExamMonitoring: >20 chars draft does not enable Evaluate; explicit submissions appear at top newest-first", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;

  const examId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const sDraftShort = new mongoose.Types.ObjectId();
  const sDraftLong = new mongoose.Types.ObjectId();
  const sSubmittedOld = new mongoose.Types.ObjectId();
  const sSubmittedNew = new mongoose.Types.ObjectId();
  const sReturnedEdited = new mongoose.Types.ObjectId();

  const tOld = new Date(Date.now() - 60_000);
  const tNew = new Date(Date.now() - 5_000);

  try {
    Exam.findById = () => ({
      lean: async () => ({
        _id: examId,
        title: "C Exam",
        examType: "coding",
        status: "in_progress",
        startedAt: new Date(Date.now() - 300_000),
        durationMinutes: 90,
      }),
    });

    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              {
                studentId: { _id: sDraftShort, username: "ShortDraft", rollNo: "01", email: "s1@college.edu" },
                assignedQuestionIds: [{ _id: qId, title: "Q1", questionNumber: "Q1" }],
              },
              {
                studentId: { _id: sDraftLong, username: "LongDraft", rollNo: "02", email: "s2@college.edu" },
                assignedQuestionIds: [{ _id: qId, title: "Q1", questionNumber: "Q1" }],
              },
              {
                studentId: { _id: sSubmittedOld, username: "SubmittedOld", rollNo: "03", email: "s3@college.edu" },
                assignedQuestionIds: [{ _id: qId, title: "Q1", questionNumber: "Q1" }],
              },
              {
                studentId: { _id: sReturnedEdited, username: "ReturnedEdited", rollNo: "04", email: "s4@college.edu" },
                assignedQuestionIds: [{ _id: qId, title: "Q1", questionNumber: "Q1" }],
              },
              {
                studentId: { _id: sSubmittedNew, username: "SubmittedNew", rollNo: "05", email: "s5@college.edu" },
                assignedQuestionIds: [{ _id: qId, title: "Q1", questionNumber: "Q1" }],
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
            studentId: sDraftShort,
            status: "answer_in_progress",
            conceptualStatus: "pending",
            lastConceptualAnswer: "short draft",
            questionProgress: { [qId.toString()]: { status: "answer_in_progress", conceptualStatus: "pending", lastConceptualAnswer: "short draft" } },
          },
          {
            studentId: sDraftLong,
            status: "answer_in_progress",
            conceptualStatus: "pending",
            lastConceptualAnswer: "This is a long unsent draft with far more than twenty characters typed in Notepad.",
            questionProgress: {
              [qId.toString()]: {
                status: "answer_in_progress",
                conceptualStatus: "pending",
                lastConceptualAnswer: "This is a long unsent draft with far more than twenty characters typed in Notepad.",
              },
            },
          },
          {
            studentId: sSubmittedOld,
            status: "awaiting_faculty_evaluation",
            conceptualStatus: "submitted",
            submittedAt: tOld,
            questionProgress: { [qId.toString()]: { status: "awaiting_faculty_evaluation", conceptualStatus: "submitted", submittedAt: tOld } },
          },
          {
            studentId: sReturnedEdited,
            status: "notepad_correction_required",
            conceptualStatus: "correction_required",
            lastConceptualAnswer: "Student edited draft after return without clicking Submit again.",
            questionProgress: {
              [qId.toString()]: {
                status: "notepad_correction_required",
                conceptualStatus: "correction_required",
                lastConceptualAnswer: "Student edited draft after return without clicking Submit again.",
              },
            },
          },
          {
            studentId: sSubmittedNew,
            status: "awaiting_faculty_evaluation",
            conceptualStatus: "submitted",
            submittedAt: tNew,
            questionProgress: { [qId.toString()]: { status: "awaiting_faculty_evaluation", conceptualStatus: "submitted", submittedAt: tNew } },
          },
        ],
      }),
    });

    ExamAnswerSubmission.find = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => [
            { studentId: sSubmittedNew, questionId: qId, status: "submitted", facultyDecision: "pending", submittedAt: tNew, attemptNumber: 1 },
            { studentId: sSubmittedOld, questionId: qId, status: "submitted", facultyDecision: "pending", submittedAt: tOld, attemptNumber: 1 },
            { studentId: sReturnedEdited, questionId: qId, status: "correction_required", facultyDecision: "return_to_notepad", submittedAt: tOld, attemptNumber: 1, aiEvaluation: { errorPercentage: 70 } },
          ],
        }),
      }),
    });

    ExamCodeSubmission.find = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => [],
        }),
      }),
    });

    const res = createMockRes();
    let errOut = null;
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, (e) => {
      errOut = e;
    });

    assert.equal(errOut, null);
    assert.equal(res.statusCode, 200);
    const rows = res.data.students;
    assert.equal(rows.length, 5);

    // Newest explicit submission is at index 0, older explicit submission at index 1
    assert.equal(rows[0].studentId, sSubmittedNew.toString());
    assert.equal(rows[0].evaluationAction, "evaluate");
    assert.equal(rows[0].notepadStatus, "Submitted");

    assert.equal(rows[1].studentId, sSubmittedOld.toString());
    assert.equal(rows[1].evaluationAction, "evaluate");

    // Drafts <=20 chars and >20 chars without Submit remain disabled (not_submitted)
    const shortRow = rows.find((r) => r.studentId === sDraftShort.toString());
    const longRow = rows.find((r) => r.studentId === sDraftLong.toString());
    assert.equal(shortRow.evaluationAction, "not_submitted");
    assert.equal(longRow.evaluationAction, "not_submitted");
    assert.equal(longRow.notepadStatus, "In Progress");

    // Returned answer edited without re-submitting stays return_to_notepad (not evaluate)
    const returnedRow = rows.find((r) => r.studentId === sReturnedEdited.toString());
    assert.equal(returnedRow.evaluationAction, "return_to_notepad");
    assert.equal(returnedRow.notepadStatus, "Correction Required");
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
  }
});
