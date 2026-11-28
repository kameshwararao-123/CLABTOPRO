import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { getExamMonitoring } from "../controllers/examController.js";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import ExamQuestion from "../models/ExamQuestion.js";
import User from "../models/User.js";

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

test("1. getExamMonitoring returns ALL 95 enrolled students (with & without allocations/progress) and reconciles summary counters", async () => {
  const examId = new mongoose.Types.ObjectId();
  const q1 = { _id: new mongoose.Types.ObjectId(), title: "Two Sum", difficulty: "Easy", questionNumber: "Q1", marks: 50 };
  const q2 = { _id: new mongoose.Types.ObjectId(), title: "Reverse List", difficulty: "Medium", questionNumber: "Q2", marks: 50 };

  const allStudents = Array.from({ length: 95 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    username: `Student ${i + 1}`,
    rollNo: `S24${String(i + 1).padStart(3, "0")}`,
    email: `s24${String(i + 1).padStart(3, "0")}@rguktsklm.ac.in`,
  }));

  // 20 students have ExamAllocation; 40 more are only in participatingStudents; 35 more are only in enrolledStudents
  const allocatedStudents = allStudents.slice(0, 20);
  const participatingOnly = allStudents.slice(20, 60);
  const enrolledOnly = allStudents.slice(60, 95);

  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;
  const origUserFind = User.find;

  Exam.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: examId,
        title: "95-Student Coding Exam",
        subject: "DSA",
        examType: "internal",
        status: "in_progress",
        durationMinutes: 120,
        questionsPerStudent: 2,
        participatingStudents: [
          ...allocatedStudents.map((s) => s._id),
          ...participatingOnly.map((s) => s._id),
        ],
        enrolledStudents: enrolledOnly.map((s) => ({ studentId: s._id, enrolledAt: new Date() })),
      }),
    }),
  });

  ExamAllocation.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          lean: async () =>
            allocatedStudents.map((s) => ({
              studentId: s,
              questionId: q1,
              assignedQuestionIds: [q1, q2],
            })),
        }),
      }),
    }),
  });

  // Mix of progress states among the 20 allocated students:
  // 0..2: Draft saved (In Progress)
  // 3..5: Submitted notepad awaiting AI evaluation (Waiting for Evaluation)
  // 6..8: AI evaluated awaiting faculty decision (Waiting for Evaluation)
  // 9..11: Compiler allowed, partial Q1 solved (In Progress)
  // 12..15: Completed all questions (Completed)
  // 16..19: Not started (Waiting to Start)
  const progresses = [
    ...allocatedStudents.slice(0, 3).map((s) => ({
      studentId: s._id,
      status: "answer_in_progress",
      instructionsAcknowledged: true,
      questionProgress: {
        [q1._id.toString()]: { status: "answer_in_progress", lastConceptualAnswer: "draft logic" },
      },
    })),
    ...allocatedStudents.slice(3, 6).map((s) => ({
      studentId: s._id,
      status: "awaiting_faculty_evaluation",
      instructionsAcknowledged: true,
      questionProgress: {
        [q1._id.toString()]: { status: "awaiting_faculty_evaluation", conceptualStatus: "submitted" },
      },
    })),
    ...allocatedStudents.slice(6, 9).map((s) => ({
      studentId: s._id,
      status: "waiting_faculty_decision",
      instructionsAcknowledged: true,
      questionProgress: {
        [q1._id.toString()]: {
          status: "waiting_faculty_decision",
          conceptualStatus: "evaluated",
          lastAIEvaluation: { errorPercentage: 20 },
        },
      },
    })),
    ...allocatedStudents.slice(9, 12).map((s) => ({
      studentId: s._id,
      status: "coding_in_progress",
      instructionsAcknowledged: true,
      questionProgress: {
        [q1._id.toString()]: { status: "successfully_completed", isCompleted: true, compilerAllowed: true },
        [q2._id.toString()]: { status: "coding_in_progress", compilerAllowed: true },
      },
    })),
    ...allocatedStudents.slice(12, 16).map((s) => ({
      studentId: s._id,
      status: "completed",
      instructionsAcknowledged: true,
      questionProgress: {
        [q1._id.toString()]: { status: "successfully_completed", isCompleted: true, compilerAllowed: true },
        [q2._id.toString()]: { status: "successfully_completed", isCompleted: true, compilerAllowed: true },
      },
    })),
  ];

  StudentExamProgress.find = () => ({
    select: () => ({
      lean: async () => progresses,
    }),
  });

  ExamAnswerSubmission.find = () => ({
    sort: () => ({
      select: () => ({
        lean: async () => [],
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

  User.find = (query) => ({
    select: () => ({
      lean: async () => {
        const ids = new Set((query?._id?.$in || []).map((id) => id.toString()));
        return allStudents.filter((s) => ids.has(s._id.toString()));
      },
    }),
  });

  try {
    const res = createMockRes();
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, (err) => {
      throw err;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.totalStudents, 95);
    assert.equal(res.data.summary.totalEnrolled, 95);

    const uniqueStudentIds = new Set(res.data.students.map((r) => r.studentId));
    assert.equal(uniqueStudentIds.size, 95);

    // Reconcile summary categories
    const { waitingToStart, inProgress, waitingForEvaluation, completed, totalEnrolled } = res.data.summary;
    assert.equal(completed, 4);
    assert.equal(waitingForEvaluation, 6);
    assert.equal(inProgress, 6);
    assert.equal(waitingToStart, 79); // 4 unstarted allocated + 40 participatingOnly + 35 enrolledOnly
    assert.equal(waitingToStart + inProgress + waitingForEvaluation + completed, totalEnrolled);

    // Search works for an enrolled-only student (student #95)
    const resSearch = createMockRes();
    await getExamMonitoring(
      { params: { examId: examId.toString() }, query: { search: "S24095" } },
      resSearch,
      (err) => {
        throw err;
      }
    );
    assert.equal(resSearch.data.students.length, 1);
    assert.equal(resSearch.data.students[0].rollNo, "S24095");
    assert.equal(resSearch.data.students[0].examStatus, "Not Started");

    // Pagination reaches the last page
    const resPage = createMockRes();
    await getExamMonitoring(
      { params: { examId: examId.toString() }, query: { page: "4", limit: "50" } },
      resPage,
      (err) => {
        throw err;
      }
    );
    assert.equal(resPage.data.pagination.page, 4);
    assert.ok(resPage.data.pagination.total >= 95);
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
    User.find = origUserFind;
  }
});

test("2. getExamMonitoring returns ALL 90 Viva enrolled students even when only 15 have allocations", async () => {
  const examId = new mongoose.Types.ObjectId();
  const q1 = { _id: new mongoose.Types.ObjectId(), title: "Viva Q1", correctAnswer: "A" };
  const allStudents = Array.from({ length: 90 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    username: `Viva Student ${i + 1}`,
    rollNo: `V24${String(i + 1).padStart(3, "0")}`,
    email: `v24${String(i + 1).padStart(3, "0")}@rguktsklm.ac.in`,
  }));

  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;
  const origQFind = ExamQuestion.find;
  const origUserFind = User.find;

  Exam.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: examId,
        title: "90-Student Viva Exam",
        subject: "OS",
        examType: "viva",
        status: "in_progress",
        durationMinutes: 30,
        questionsPerStudent: 10,
        totalMarks: 10,
        participatingStudents: allStudents.slice(0, 60).map((s) => s._id),
        enrolledStudents: allStudents.slice(60, 90).map((s) => ({ studentId: s._id })),
      }),
    }),
  });

  ExamAllocation.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          lean: async () =>
            allStudents.slice(0, 15).map((s) => ({
              studentId: s,
              questionId: q1,
              assignedQuestionIds: [q1],
            })),
        }),
      }),
    }),
  });

  StudentExamProgress.find = () => ({
    select: () => ({
      lean: async () => [
        {
          studentId: allStudents[0]._id,
          status: "completed",
          vivaResult: { score: 8, totalMarks: 10, percentage: 80, correct: 8, incorrect: 2, unanswered: 0, totalQuestions: 10 },
        },
        {
          studentId: allStudents[20]._id,
          status: "in_progress",
          vivaStartedAt: new Date(),
        },
      ],
    }),
  });

  ExamAnswerSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
  ExamCodeSubmission.find = () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
  ExamQuestion.find = () => ({ select: () => ({ lean: async () => [q1] }) });
  User.find = (query) => ({
    select: () => ({
      lean: async () => {
        const ids = new Set((query?._id?.$in || []).map((id) => id.toString()));
        return allStudents.filter((s) => ids.has(s._id.toString()));
      },
    }),
  });

  try {
    const res = createMockRes();
    await getExamMonitoring({ params: { examId: examId.toString() }, query: {} }, res, (err) => {
      throw err;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.students.length, 90);
    assert.equal(res.data.totalStudents, 90);
    assert.equal(res.data.vivaSummary.totalEnrolled, 90);
    assert.equal(res.data.summary.totalEnrolled, 90);
    assert.equal(res.data.summary.completed, 1);
    assert.equal(res.data.summary.inProgress, 1);
    assert.equal(res.data.summary.waitingToStart, 88);
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
    ExamQuestion.find = origQFind;
    User.find = origUserFind;
  }
});
