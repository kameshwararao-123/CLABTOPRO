import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import ExamQuestion from "../models/ExamQuestion.js";
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

test("Viva Faculty Monitoring: returns 1 row per student with aggregated Correct/Total (5/10, 10/10, 0/10)", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;
  const origQFind = ExamQuestion.find;

  const examId = new mongoose.Types.ObjectId();
  const qIds = Array.from({ length: 10 }, () => new mongoose.Types.ObjectId());
  const assignedList = qIds.map((id, i) => ({ _id: id, title: `MCQ ${i + 1}`, questionNumber: `Q${i + 1}` }));

  const s1 = new mongoose.Types.ObjectId(); // Raju (5/10 live answers)
  const s2 = new mongoose.Types.ObjectId(); // Ravi (10/10 submitted)
  const s3 = new mongoose.Types.ObjectId(); // Raju (0/10 - same name, different ID & rollNo)

  try {
    Exam.findById = () => ({
      select: () => ({
        lean: async () => ({
          _id: examId,
          title: "Viva MCQ Test",
          examType: "viva",
          status: "in_progress",
          questionsPerStudent: 10,
        }),
      }),
    });

    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              { studentId: { _id: s1, username: "Raju", rollNo: "S216678", email: "s1@college.edu" }, assignedQuestionIds: assignedList },
              { studentId: { _id: s2, username: "Ravi", rollNo: "S216679", email: "s2@college.edu" }, assignedQuestionIds: assignedList },
              { studentId: { _id: s3, username: "Raju", rollNo: "S216680", email: "s3@college.edu" }, assignedQuestionIds: assignedList },
            ],
          }),
        }),
      }),
    });

    // Live answers for s1: 5 correct ("A") + 5 wrong ("B")
    const s1Answers = {};
    qIds.forEach((id, idx) => {
      s1Answers[id.toString()] = { selectedOption: idx < 5 ? "A" : "B" };
    });

    // Wrong answers for s3: all 10 answered "C" (0 correct)
    const s3Answers = {};
    qIds.forEach((id) => {
      s3Answers[id.toString()] = { selectedOption: "C" };
    });

    StudentExamProgress.find = () => ({
      select: () => ({
        lean: async () => [
          { studentId: s1, status: "in_progress", vivaAnswers: s1Answers },
          { studentId: s2, status: "completed", vivaResult: { correct: 10, incorrect: 0, unanswered: 0, totalQuestions: 10, score: 10, percentage: 100 } },
          { studentId: s3, status: "in_progress", vivaAnswers: s3Answers },
        ],
      }),
    });

    ExamQuestion.find = () => ({
      select: () => ({
        lean: async () => qIds.map((id) => ({ _id: id, correctAnswer: "A" })),
      }),
    });

    ExamAnswerSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
    ExamCodeSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });

    const res = createMockRes();
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, () => {});
    assert.equal(res.statusCode, 200);

    // Must be 3 rows total (1 per student), NOT 30 rows
    assert.equal(res.data.students.length, 3);

    const row1 = res.data.students.find((r) => r.studentId === s1.toString());
    const row2 = res.data.students.find((r) => r.studentId === s2.toString());
    const row3 = res.data.students.find((r) => r.studentId === s3.toString());

    assert.equal(row1.vivaTotalQuestions, 10);
    assert.equal(row1.vivaCorrectCount, 5);
    assert.equal(row1.vivaScoreLabel, "5/10");

    assert.equal(row2.vivaTotalQuestions, 10);
    assert.equal(row2.vivaCorrectCount, 10);
    assert.equal(row2.vivaScoreLabel, "10/10");

    assert.equal(row3.vivaTotalQuestions, 10);
    assert.equal(row3.vivaCorrectCount, 0);
    assert.equal(row3.vivaScoreLabel, "0/10");
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
    ExamQuestion.find = origQFind;
  }
});
