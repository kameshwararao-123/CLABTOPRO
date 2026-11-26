import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { getExamMonitoring } from "../controllers/examController.js";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";

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

test("1. Compound indexes for monitoring queries exist on ExamAnswerSubmission and ExamCodeSubmission", () => {
  const ansIndexes = ExamAnswerSubmission.schema.indexes();
  const codeIndexes = ExamCodeSubmission.schema.indexes();

  assert.ok(
    ansIndexes.some(([fields]) => fields.examId === 1 && fields.submittedAt === -1),
    "ExamAnswerSubmission must have compound index { examId: 1, submittedAt: -1 }"
  );
  assert.ok(
    codeIndexes.some(([fields]) => fields.examId === 1 && fields.submittedAt === -1),
    "ExamCodeSubmission must have compound index { examId: 1, submittedAt: -1 }"
  );
});

test("2. getExamMonitoring returns lightweight summary rows (no raw code/notepad/vivaAnswers) and supports search, status filter, and pagination", async () => {
  const examId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;

  const studentIds = Array.from({ length: 90 }, () => new mongoose.Types.ObjectId());

  Exam.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: examId,
        title: "90-Student Optimized Monitoring",
        subject: "C",
        examType: "internal",
        status: "in_progress",
        durationMinutes: 90,
        questionsPerStudent: 1,
      }),
    }),
  });

  ExamAllocation.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          lean: async () =>
            studentIds.map((sid, idx) => ({
              studentId: {
                _id: sid,
                username: idx === 0 ? "Target Alice" : `Student ${idx + 1}`,
                rollNo: idx === 0 ? "S219999" : `S210${idx + 1}`,
              },
              questionId: { _id: qId, title: "Array Sum", difficulty: "Easy", questionNumber: "Q1", marks: 100 },
              assignedQuestionIds: [],
            })),
        }),
      }),
    }),
  });

  StudentExamProgress.find = () => ({
    select: () => ({
      lean: async () =>
        studentIds.map((sid, idx) => ({
          studentId: sid,
          status: idx % 2 === 0 ? "successfully_completed" : "notepad_pending",
          compilerAllowed: idx % 2 === 0,
          lastCodeSavedAt: new Date(),
        })),
    }),
  });

  ExamAnswerSubmission.find = () => ({
    sort: () => ({
      select: () => ({
        lean: async () =>
          studentIds.map((sid, idx) => ({
            studentId: sid,
            questionId: qId,
            status: idx % 2 === 0 ? "approved" : "submitted",
            isApproved: idx % 2 === 0,
            aiEvaluation: { errorPercentage: 10 },
            submittedAt: new Date(),
          })),
      }),
    }),
  });

  ExamCodeSubmission.find = () => ({
    sort: () => ({
      select: () => ({
        lean: async () =>
          studentIds
            .filter((_, idx) => idx % 2 === 0)
            .map((sid) => ({
              studentId: sid,
              questionId: qId,
              status: "accepted",
              testCasesPassed: 5,
              totalTestCases: 5,
              allPassed: true,
              submittedAt: new Date(),
            })),
      }),
    }),
  });

  try {
    // Full 90-student response check
    const resAll = createMockRes();
    await getExamMonitoring(
      { params: { examId: examId.toString() }, query: {} },
      resAll,
      (err) => {
        throw err;
      }
    );

    assert.equal(resAll.statusCode, 200);
    assert.equal(resAll.data.students.length, 90);
    const sampleRow = resAll.data.students[0];
    assert.equal(sampleRow.lastConceptualAnswer, undefined);
    assert.equal(sampleRow.facultyFeedback, undefined);
    assert.equal(sampleRow.vivaAnswers, undefined);
    assert.equal(sampleRow.assignedQuestions, undefined);
    assert.ok(sampleRow.lastActivityTime);

    // Server-side search + pagination
    const resPaged = createMockRes();
    await getExamMonitoring(
      {
        params: { examId: examId.toString() },
        query: { search: "S219999", status: "Successfully Completed", page: "1", limit: "10" },
      },
      resPaged,
      (err) => {
        throw err;
      }
    );

    assert.equal(resPaged.statusCode, 200);
    assert.equal(resPaged.data.students.length, 1);
    assert.equal(resPaged.data.students[0].username, "Target Alice");
    assert.equal(resPaged.data.pagination.total, 1);
    assert.equal(resPaged.data.pagination.page, 1);
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
  }
});
