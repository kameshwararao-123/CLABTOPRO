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
    assert.equal(row1.examStatus, "In Progress");

    assert.equal(row2.vivaTotalQuestions, 10);
    assert.equal(row2.vivaCorrectCount, 10);
    assert.equal(row2.vivaScoreLabel, "10/10");
    assert.equal(row2.examStatus, "Completed");

    assert.equal(row3.vivaTotalQuestions, 10);
    assert.equal(row3.vivaCorrectCount, 0);
    assert.equal(row3.vivaScoreLabel, "0/10");
    assert.equal(row3.examStatus, "In Progress");
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
    ExamQuestion.find = origQFind;
  }
});

test("Internal Faculty Monitoring: displays per-question Solution Status (Solved/Not Solved) and live Exam Status (Not Started -> In Progress -> Completed)", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;
  const origQFind = ExamQuestion.find;

  const examId = new mongoose.Types.ObjectId();
  const q14 = new mongoose.Types.ObjectId();
  const q16 = new mongoose.Types.ObjectId();
  const assignedList = [
    { _id: q14, title: "Count Digits", questionNumber: "Q14", difficulty: "Easy" },
    { _id: q16, title: "Strong Number", questionNumber: "Q16", difficulty: "Medium" },
  ];

  const sStarted = new mongoose.Types.ObjectId(); // Started exam, Q14 solved, Q16 drafting in Notepad
  const sNotStarted = new mongoose.Types.ObjectId(); // Not started yet
  const sCompleted = new mongoose.Types.ObjectId(); // Officially completed

  try {
    Exam.findById = () => ({
      select: () => ({
        lean: async () => ({
          _id: examId,
          title: "Internal Coding Exam",
          examType: "internal",
          status: "in_progress",
          questionsPerStudent: 2,
        }),
      }),
    });

    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              { studentId: { _id: sStarted, username: "Harsha Konatala", rollNo: "S101", email: "h@college.edu" }, assignedQuestionIds: assignedList },
              { studentId: { _id: sNotStarted, username: "Priya", rollNo: "S102", email: "p@college.edu" }, assignedQuestionIds: assignedList },
              { studentId: { _id: sCompleted, username: "Arjun", rollNo: "S103", email: "a@college.edu" }, assignedQuestionIds: assignedList },
            ],
          }),
        }),
      }),
    });

    StudentExamProgress.find = () => ({
      select: () => ({
        lean: async () => [
          {
            studentId: sStarted,
            status: "in_progress",
            instructionsAcknowledged: true,
            questionProgress: {
              [q14.toString()]: { status: "completed", isCompleted: true },
              [q16.toString()]: { status: "answer_in_progress", lastConceptualAnswer: "Step 1..." },
            },
          },
          {
            studentId: sCompleted,
            status: "completed",
            instructionsAcknowledged: true,
            questionProgress: {
              [q14.toString()]: { status: "completed", isCompleted: true },
              [q16.toString()]: { status: "completed", isCompleted: true },
            },
          },
        ],
      }),
    });

    ExamQuestion.find = () => ({ select: () => ({ lean: async () => [] }) });
    ExamAnswerSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
    ExamCodeSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });

    const res = createMockRes();
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, () => {});
    assert.equal(res.statusCode, 200);

    const harshaQ14 = res.data.students.find((r) => r.studentId === sStarted.toString() && r.targetQuestionId.toString() === q14.toString());
    const harshaQ16 = res.data.students.find((r) => r.studentId === sStarted.toString() && r.targetQuestionId.toString() === q16.toString());
    assert.equal(harshaQ14.solutionStatus, "Solved");
    assert.equal(harshaQ16.solutionStatus, "Not Solved");
    assert.equal(harshaQ14.examStatus, "In Progress");
    assert.equal(harshaQ16.examStatus, "In Progress");

    const priyaRows = res.data.students.filter((r) => r.studentId === sNotStarted.toString());
    assert.equal(priyaRows.length, 2);
    assert.ok(priyaRows.every((r) => r.solutionStatus === "Not Solved" && r.examStatus === "Not Started"));

    const arjunRows = res.data.students.filter((r) => r.studentId === sCompleted.toString());
    assert.equal(arjunRows.length, 2);
    assert.ok(arjunRows.every((r) => r.solutionStatus === "Solved" && r.examStatus === "Completed"));
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
    ExamQuestion.find = origQFind;
  }
});

test("Internal Faculty Monitoring: question_assigned without acknowledgment stays Not Started, and solving all questions without finishing stays In Progress", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;
  const origQFind = ExamQuestion.find;

  const examId = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();
  const assignedList = [
    { _id: q1, title: "Q1", questionNumber: "Q1", difficulty: "Easy" },
    { _id: q2, title: "Q2", questionNumber: "Q2", difficulty: "Medium" },
  ];

  const sEnrolledNotStarted = new mongoose.Types.ObjectId();
  const sAllSolvedNotFinished = new mongoose.Types.ObjectId();

  try {
    Exam.findById = () => ({
      select: () => ({
        lean: async () => ({
          _id: examId,
          title: "Internal Coding Exam",
          examType: "internal",
          status: "in_progress",
          questionsPerStudent: 2,
        }),
      }),
    });

    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              { studentId: { _id: sEnrolledNotStarted, username: "Enrolled Only", rollNo: "S201", email: "e@college.edu" }, assignedQuestionIds: assignedList },
              { studentId: { _id: sAllSolvedNotFinished, username: "Solved Not Finished", rollNo: "S202", email: "f@college.edu" }, assignedQuestionIds: assignedList },
            ],
          }),
        }),
      }),
    });

    StudentExamProgress.find = () => ({
      select: () => ({
        lean: async () => [
          {
            studentId: sEnrolledNotStarted,
            status: "question_assigned",
            instructionsAcknowledged: false,
            questionProgress: {
              [q1.toString()]: { status: "not_started" },
              [q2.toString()]: { status: "not_started" },
            },
          },
          {
            studentId: sAllSolvedNotFinished,
            status: "coding_in_progress",
            instructionsAcknowledged: true,
            questionProgress: {
              [q1.toString()]: { status: "completed", isCompleted: true },
              [q2.toString()]: { status: "completed", isCompleted: true },
            },
          },
        ],
      }),
    });

    ExamQuestion.find = () => ({ select: () => ({ lean: async () => [] }) });
    ExamAnswerSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
    ExamCodeSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });

    const res = createMockRes();
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, () => {});
    assert.equal(res.statusCode, 200);

    const enrolledRows = res.data.students.filter((r) => r.studentId === sEnrolledNotStarted.toString());
    assert.equal(enrolledRows.length, 2);
    assert.ok(enrolledRows.every((r) => r.examStatus === "Not Started" && r.solutionStatus === "Not Solved"));

    const solvedRows = res.data.students.filter((r) => r.studentId === sAllSolvedNotFinished.toString());
    assert.equal(solvedRows.length, 2);
    assert.ok(solvedRows.every((r) => r.solutionStatus === "Solved" && r.examStatus === "In Progress"));
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
    ExamQuestion.find = origQFind;
  }
});
