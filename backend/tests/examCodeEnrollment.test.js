import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamQuestion from "../models/ExamQuestion.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import {
  generateUniqueExamCode,
  enrollStudentWithCode,
  startExam,
  selectDistinctQuestionsForStudent,
} from "../controllers/examController.js";

test("Exam Code Generation - produces unique readable uppercase alphanumeric code", async () => {
  const code1 = await generateUniqueExamCode("CLAB");
  const code2 = await generateUniqueExamCode("INT");
  const code3 = await generateUniqueExamCode("VIVA");

  assert.ok(code1.startsWith("CLAB"));
  assert.ok(code2.startsWith("INT"));
  assert.ok(code3.startsWith("VIVA"));
  assert.equal(code1.length, 8);
  assert.equal(code1, code1.toUpperCase());
});

test("Exam Model - validates examCode and enrolledStudents schema fields", () => {
  const exam = new Exam({
    title: "Test Exam Code Model",
    subject: "C Programming",
    academicYear: "2025-2026",
    semester: "Semester 1",
    examType: "internal",
    examDate: new Date(),
    examCode: "CLAB9999",
    createdBy: new mongoose.Types.ObjectId(),
    enrolledStudents: [
      {
        studentId: new mongoose.Types.ObjectId(),
        enrolledAt: new Date(),
      },
    ],
  });

  const err = exam.validateSync();
  assert.equal(err, undefined, "Exam model should validate examCode and enrolledStudents");
  assert.equal(exam.examCode, "CLAB9999");
  assert.equal(exam.enrolledStudents.length, 1);
});

test("Enrollment API: Invalid code rejection", async () => {
  let statusCode = null;
  let jsonResponse = null;

  const mockRes = {
    status(c) {
      statusCode = c;
      return {
        json(d) {
          jsonResponse = d;
        },
      };
    },
  };

  // 1. Missing / empty code
  await enrollStudentWithCode(
    {
      user: { userId: new mongoose.Types.ObjectId() },
      body: { examCode: "" },
    },
    mockRes
  );
  assert.equal(statusCode, 400);
  assert.equal(jsonResponse.message, "Invalid Exam Code. Please check and try again.");

  // 2. Non-existent code
  const originalFindOne = Exam.findOne;
  try {
    Exam.findOne = async () => null;

    await enrollStudentWithCode(
      {
        user: { userId: new mongoose.Types.ObjectId() },
        body: { examCode: "NONEXISTENTCODE" },
      },
      mockRes
    );
    assert.equal(statusCode, 404);
    assert.equal(jsonResponse.message, "Invalid Exam Code. Please check and try again.");
  } finally {
    Exam.findOne = originalFindOne;
  }
});

test("Enrollment API: Duplicate enrollment prevention and waiting state response", async () => {
  const studentId = new mongoose.Types.ObjectId();
  const examId = new mongoose.Types.ObjectId();

  let statusCode = null;
  let jsonResponse = null;

  const mockRes = {
    status(c) {
      statusCode = c;
      return {
        json(d) {
          jsonResponse = d;
        },
      };
    },
  };

  const originalFindOne = Exam.findOne;
  try {
    // Exam where student is already in participatingStudents
    Exam.findOne = async () => ({
      _id: examId,
      examCode: "CLAB1234",
      title: "C Lab Exam",
      status: "draft",
      participatingStudents: [studentId],
    });

    await enrollStudentWithCode(
      {
        user: { userId: studentId },
        body: { examCode: "CLAB1234" },
      },
      mockRes
    );
    assert.equal(statusCode, 400);
    assert.equal(jsonResponse.message, "You are already enrolled in this examination.");
  } finally {
    Exam.findOne = originalFindOne;
  }
});

test("Workflow Timing: Zero questions allocated at enrollment time", async () => {
  const studentId = new mongoose.Types.ObjectId();
  const examId = new mongoose.Types.ObjectId();

  let statusCode = null;
  let jsonResponse = null;

  const mockRes = {
    status(c) {
      statusCode = c;
      return {
        json(d) {
          jsonResponse = d;
        },
      };
    },
  };

  const originalFindOne = Exam.findOne;
  const originalFindOneAndUpdate = Exam.findOneAndUpdate;
  const originalProgressFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;

  try {
    Exam.findOne = async () => ({
      _id: examId,
      examCode: "CLAB5555",
      title: "Operating Systems",
      subject: "OS",
      examType: "internal",
      status: "draft",
      durationMinutes: 90,
      totalMarks: 100,
      participatingStudents: [],
    });

    Exam.findOneAndUpdate = async () => ({
      _id: examId,
      participatingStudents: [studentId],
      status: "draft",
    });

    StudentExamProgress.findOneAndUpdate = async () => ({});

    await enrollStudentWithCode(
      {
        user: { userId: studentId },
        body: { examCode: "CLAB5555" },
      },
      mockRes
    );

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.enrollmentStatus, "Successfully Enrolled");
    assert.ok(jsonResponse.message.includes("wait for your faculty to start"));

    // CRITICAL REQUIREMENT CHECK:
    // Ensure no questions, question IDs, test cases, or allocations are present
    assert.equal(jsonResponse.questions, undefined);
    assert.equal(jsonResponse.assignedQuestionIds, undefined);
    assert.equal(jsonResponse.exam.questions, undefined);
    assert.equal(jsonResponse.exam.allocatedCount, undefined);
  } finally {
    Exam.findOne = originalFindOne;
    Exam.findOneAndUpdate = originalFindOneAndUpdate;
    StudentExamProgress.findOneAndUpdate = originalProgressFindOneAndUpdate;
  }
});

test("Workflow Timing: startExam allocates questions to all enrolled students", async () => {
  const facultyId = new mongoose.Types.ObjectId();
  const examId = new mongoose.Types.ObjectId();

  // Create 20 mock students
  const enrolledStudentIds = Array.from({ length: 20 }, () => new mongoose.Types.ObjectId());

  // Create 30 mock questions in the pool
  const mockQuestions = Array.from({ length: 30 }, (_, idx) => ({
    _id: new mongoose.Types.ObjectId(),
    title: `Problem ${idx + 1}`,
    questionNumber: `P${idx + 1}`,
    difficulty: "Medium",
    marks: 20,
  }));

  let savedAllocations = [];
  let examStatus = "draft";
  let enrollmentClosed = false;

  const originalExamFindById = Exam.findById;
  const originalQuestionFind = ExamQuestion.find;
  const originalAllocDeleteMany = ExamAllocation.deleteMany;
  const originalAllocInsertMany = ExamAllocation.insertMany;
  const originalAllocFind = ExamAllocation.find;
  const originalProgressBulkWrite = StudentExamProgress.bulkWrite;

  try {
    const examDoc = {
      _id: examId,
      title: "Algorithms Final Exam",
      createdBy: facultyId,
      status: "draft",
      enrollmentClosed: false,
      participatingStudents: enrolledStudentIds,
      questionsPerStudent: 1,
      async save() {
        examStatus = this.status;
        enrollmentClosed = this.enrollmentClosed;
      },
    };

    Exam.findById = async () => examDoc;
    ExamQuestion.find = () => ({
      select: () => ({
        lean: async () => mockQuestions,
      }),
    });

    ExamAllocation.deleteMany = async () => {};
    ExamAllocation.insertMany = async (records) => {
      savedAllocations = records;
    };
    ExamAllocation.find = () => ({
      lean: async () => savedAllocations,
    });

    StudentExamProgress.bulkWrite = async () => ({});

    let resCode = null;
    let resData = null;
    const mockRes = {
      status(c) {
        resCode = c;
        return {
          json(d) {
            resData = d;
          },
        };
      },
    };

    // Faculty starts exam with 5 questions per student
    await startExam(
      {
        params: { examId: examId.toString() },
        user: { userId: facultyId, role: "admin" },
        body: { questionsPerStudent: 5 },
      },
      mockRes
    );

    assert.equal(resCode, 200);
    assert.equal(examStatus, "in_progress", "Exam status should become in_progress");
    assert.equal(enrollmentClosed, true, "Enrollment should be closed");
    assert.equal(savedAllocations.length, 20, "All 20 students must have allocations");

    // Verify each student receives exactly 5 distinct questions
    for (const alloc of savedAllocations) {
      assert.equal(alloc.assignedQuestionIds.length, 5);
      const uniqueIds = new Set(alloc.assignedQuestionIds.map((id) => id.toString()));
      assert.equal(uniqueIds.size, 5, "Questions per student must be distinct");
    }
  } finally {
    Exam.findById = originalExamFindById;
    ExamQuestion.find = originalQuestionFind;
    ExamAllocation.deleteMany = originalAllocDeleteMany;
    ExamAllocation.insertMany = originalAllocInsertMany;
    ExamAllocation.find = originalAllocFind;
    StudentExamProgress.bulkWrite = originalProgressBulkWrite;
  }
});
