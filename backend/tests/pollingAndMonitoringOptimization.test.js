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

test("1. getExamMonitoring uses MongoDB field projections to exclude heavy code/answer payloads", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;

  const capturedSelects = {};

  Exam.findById = () => ({
    select(fields) {
      capturedSelects.exam = fields;
      return {
        lean: async () => ({
          _id: examId,
          title: "Projected Exam",
          subject: "C",
          examType: "internal",
          status: "in_progress",
          durationMinutes: 90,
          questionsPerStudent: 1,
        }),
      };
    },
  });

  ExamAllocation.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => [
            {
              studentId: { _id: studentId, username: "Riya", rollNo: "S210001", email: "riya@rguktsklm.ac.in" },
              questionId: { _id: qId, title: "Sum Two", difficulty: "Easy", questionNumber: "Q1", marks: 100 },
              assignedQuestionIds: [],
            },
          ],
        }),
      }),
    }),
  });

  StudentExamProgress.find = () => ({
    select(fields) {
      capturedSelects.progress = fields;
      return {
        lean: async () => [
          {
            studentId,
            status: "coding_in_progress",
            compilerAllowed: true,
            lastAIEvaluation: { errorPercentage: 10 },
          },
        ],
      };
    },
  });

  ExamAnswerSubmission.find = () => ({
    sort: () => ({
      select(fields) {
        capturedSelects.answer = fields;
        return {
          lean: async () => [
            {
              studentId,
              questionId: qId,
              status: "approved",
              isApproved: true,
              facultyDecision: "allow_to_code",
              aiEvaluation: { errorPercentage: 10 },
              submittedAt: new Date(),
            },
          ],
        };
      },
    }),
  });

  ExamCodeSubmission.find = () => ({
    sort: () => ({
      select(fields) {
        capturedSelects.code = fields;
        return {
          lean: async () => [
            {
              studentId,
              questionId: qId,
              status: "accepted",
              testCasesPassed: 3,
              totalTestCases: 3,
              allPassed: true,
              submittedAt: new Date(),
            },
          ],
        };
      },
    }),
  });

  try {
    const res = createMockRes();
    await getExamMonitoring(
      { params: { examId: examId.toString() } },
      res,
      (err) => {
        throw err;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.ok(capturedSelects.progress.includes("-currentCode"));
    assert.ok(capturedSelects.progress.includes("-lastConceptualAnswer"));
    assert.equal(capturedSelects.answer.includes("answerText"), false);
    assert.equal(capturedSelects.code.includes("testCaseResults"), false);
    assert.equal(capturedSelects.code.includes("compilerOutput"), false);
    assert.equal(res.data.students.length, 1);
    assert.equal(res.data.students[0].solvedQuestionsLabel, "1/1");
    assert.equal(res.data.students[0].testCasesStatus, "3 / 3 Passed");
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
  }
});

test("2. getExamMonitoring scales cleanly for 90 simulated students in < 50ms", async () => {
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
        title: "90-Student Lab Exam",
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
              studentId: { _id: sid, username: `Student ${idx + 1}`, rollNo: `S210${idx + 1}` },
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
        studentIds.map((sid) => ({
          studentId: sid,
          status: "coding_in_progress",
          compilerAllowed: true,
        })),
    }),
  });

  ExamAnswerSubmission.find = () => ({
    sort: () => ({
      select: () => ({
        lean: async () =>
          studentIds.map((sid) => ({
            studentId: sid,
            questionId: qId,
            status: "approved",
            isApproved: true,
            aiEvaluation: { errorPercentage: 15 },
            submittedAt: new Date(),
          })),
      }),
    }),
  });

  ExamCodeSubmission.find = () => ({
    sort: () => ({
      select: () => ({
        lean: async () =>
          studentIds.map((sid) => ({
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
    const startMs = Date.now();
    const res = createMockRes();
    await getExamMonitoring(
      { params: { examId: examId.toString() } },
      res,
      (err) => {
        throw err;
      }
    );
    const elapsedMs = Date.now() - startMs;

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.students.length, 90);
    assert.ok(elapsedMs < 100, `Expected <100ms for 90 students, got ${elapsedMs}ms`);
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
  }
});
