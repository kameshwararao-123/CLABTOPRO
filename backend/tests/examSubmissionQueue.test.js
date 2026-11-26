import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import submissionQueue, { SubmissionQueue } from "../services/submissionQueue.js";
import { runExamCode, submitExamCode } from "../controllers/examController.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAllocation from "../models/ExamAllocation.js";
import Exam from "../models/Exam.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import { ExecutionServiceError } from "../services/judgeService.js";

const createMockRes = () => ({
  statusCode: 200,
  headers: {},
  data: null,
  set(k, v) {
    this.headers[k] = v;
    return this;
  },
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(payload) {
    this.data = payload;
    return this;
  },
});

const validSumCode = `#include <stdio.h>
int main() {
  int a, b;
  if (scanf("%d %d", &a, &b) == 2) {
    printf("%d\\n", a + b);
  }
  return 0;
}`;

test("1. SubmissionQueue enforces concurrency limit under burst load", async () => {
  const queue = new SubmissionQueue(2, 20, 5000);
  let active = 0;
  let maxObservedActive = 0;

  const jobs = Array.from({ length: 8 }, (_, idx) =>
    queue.enqueue(
      async () => {
        active++;
        if (active > maxObservedActive) maxObservedActive = active;
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return idx * 10;
      },
      { userId: `student-${idx}`, action: "exam_submit" }
    )
  );

  const results = await Promise.all(jobs);
  assert.equal(maxObservedActive, 2);
  assert.deepEqual(results, [0, 10, 20, 30, 40, 50, 60, 70]);
  assert.equal(queue.getStats().activeWorkers, 0);
  assert.equal(queue.getStats().waitingTasks, 0);
  assert.equal(queue.getStats().totalProcessed, 8);
});

test("2. SubmissionQueue rejects overflow with 503 QUEUE_OVERLOAD and retryAfterSeconds", async () => {
  const queue = new SubmissionQueue(1, 2, 5000);

  let releaseFirst;
  const firstGate = new Promise((r) => {
    releaseFirst = r;
  });

  const p1 = queue.enqueue(() => firstGate, { userId: "s1" }); // active (1/1)
  const p2 = queue.enqueue(async () => "ok2", { userId: "s2" }); // waiting (1/2)
  const p3 = queue.enqueue(async () => "ok3", { userId: "s3" }); // waiting (2/2)

  await assert.rejects(
    () => queue.enqueue(async () => "overflow", { userId: "s4" }),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "QUEUE_OVERLOAD");
      assert.equal(err.retryable, true);
      assert.equal(err.retryAfterSeconds, 5);
      return true;
    }
  );

  releaseFirst("ok1");
  const settled = await Promise.all([p1, p2, p3]);
  assert.deepEqual(settled, ["ok1", "ok2", "ok3"]);
  assert.equal(queue.getStats().totalRejected, 1);
});

test("3. SubmissionQueue times out stuck tasks, frees worker slot, and does not block subsequent jobs", async () => {
  const queue = new SubmissionQueue(1, 10, 40);

  // Task 1 hangs longer than 40ms
  const hungPromise = queue.enqueue(
    () => new Promise((resolve) => setTimeout(() => resolve("too-late"), 150)),
    { userId: "hung-student" }
  );

  await assert.rejects(
    () => hungPromise,
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "QUEUE_TIMEOUT");
      assert.equal(err.retryable, true);
      return true;
    }
  );

  // Subsequent job should run cleanly without being blocked
  const nextResult = await queue.enqueue(async () => "recovered", { userId: "next-student" });
  assert.equal(nextResult, "recovered");
  assert.equal(queue.getStats().totalTimedOut, 1);
  assert.equal(queue.getStats().activeWorkers, 0);
});

test("4. Failed jobs do not leak activeWorkers or block subsequent queued jobs", async () => {
  const queue = new SubmissionQueue(1, 10, 5000);

  await assert.rejects(
    () =>
      queue.enqueue(async () => {
        throw new Error("Simulated Piston crash");
      }),
    /Simulated Piston crash/
  );

  const ok = await queue.enqueue(async () => "still-working");
  assert.equal(ok, "still-working");
  assert.equal(queue.getStats().totalFailed, 1);
  assert.equal(queue.getStats().totalProcessed, 1);
  assert.equal(queue.getStats().activeWorkers, 0);
});

test("5. runExamCode routes execution through shared submissionQueue and preserves sample-only visibility", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origEnqueue = submissionQueue.enqueue.bind(submissionQueue);

  let enqueueCalledWith = null;
  submissionQueue.enqueue = async (task, metadata) => {
    enqueueCalledWith = metadata;
    return origEnqueue(task, metadata);
  };

  const mockQuestion = {
    _id: qId,
    title: "Sum Two",
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false, type: "sample" },
      { input: "99 1", expectedOutput: "SECRET_100", isHidden: true, type: "hidden" },
    ],
  };

  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "coding_in_progress",
    compilerAllowed: true,
    questionProgress: new Map([[qId.toString(), { compilerAllowed: true }]]),
  });

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [mockQuestion],
        }),
      }),
    }),
  });

  try {
    const req = {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: qId.toString() },
    };
    const res = createMockRes();

    await runExamCode(req, res, (err) => {
      throw err;
    });

    assert.equal(res.statusCode, 200);
    assert.ok(enqueueCalledWith, "submissionQueue.enqueue must be called by runExamCode");
    assert.equal(enqueueCalledWith.action, "exam_run");
    assert.equal(enqueueCalledWith.examId, examId.toString());
    assert.equal(res.data.totalSampleCases, 1);
    assert.equal(JSON.stringify(res.data).includes("SECRET_100"), false);
  } finally {
    submissionQueue.enqueue = origEnqueue;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
  }
});

test("6. runExamCode returns 503 with Retry-After when submissionQueue rejects with QUEUE_OVERLOAD", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origEnqueue = submissionQueue.enqueue.bind(submissionQueue);

  submissionQueue.enqueue = async () => {
    const err = new Error("Execution queue is at maximum capacity. Please retry in a few moments.");
    err.statusCode = 503;
    err.code = "QUEUE_OVERLOAD";
    err.retryAfterSeconds = 5;
    throw err;
  };

  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "coding_in_progress",
    compilerAllowed: true,
    questionProgress: new Map([[qId.toString(), { compilerAllowed: true }]]),
  });

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [
            {
              _id: qId,
              title: "Sum Two",
              testCases: [{ input: "2 3", expectedOutput: "5", isHidden: false }],
            },
          ],
        }),
      }),
    }),
  });

  try {
    const req = {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: qId.toString() },
    };
    const res = createMockRes();

    await runExamCode(req, res, (err) => {
      throw err;
    });

    assert.equal(res.statusCode, 503);
    assert.equal(res.headers["Retry-After"], "5");
    assert.equal(res.data.code, "QUEUE_OVERLOAD");
    assert.equal(res.data.retryable, true);
  } finally {
    submissionQueue.enqueue = origEnqueue;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
  }
});

test("7. submitExamCode routes execution through shared submissionQueue and handles ExecutionServiceError with 503", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origExamFindById = Exam.findById;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origSubCreate = ExamCodeSubmission.create;
  const origEnqueue = submissionQueue.enqueue.bind(submissionQueue);

  let capturedMeta = null;
  submissionQueue.enqueue = async (task, metadata) => {
    capturedMeta = metadata;
    return origEnqueue(task, metadata);
  };

  const mockQuestion = {
    _id: qId,
    title: "Sum Two",
    questionNumber: "Q1",
    marks: 100,
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "10 20", expectedOutput: "30", isHidden: true },
    ],
  };

  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "coding_in_progress",
    compilerAllowed: true,
    conceptualEvaluationStatus: "approved",
    questionProgress: new Map([
      [
        qId.toString(),
        {
          compilerAllowed: true,
          conceptualStatus: "approved",
          lastAIEvaluation: { errorPercentage: 10 },
        },
      ],
    ]),
    markModified() {},
    async save() {},
  });

  ExamAnswerSubmission.findOne = () => ({
    lean: async () => ({ _id: new mongoose.Types.ObjectId(), isApproved: true }),
  });

  Exam.findById = () => ({
    select: async () => ({
      _id: examId,
      status: "in_progress",
      startedAt: new Date(Date.now() - 60 * 1000),
      durationMinutes: 90,
    }),
  });

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [mockQuestion],
        }),
      }),
    }),
  });

  ExamCodeSubmission.create = async (doc) => ({
    ...doc,
    _id: new mongoose.Types.ObjectId(),
  });

  try {
    const req = {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: qId.toString() },
    };
    const res = createMockRes();

    await submitExamCode(req, res, (err) => {
      throw err;
    });

    assert.equal(res.statusCode, 201);
    assert.ok(capturedMeta, "submissionQueue.enqueue must be called by submitExamCode");
    assert.equal(capturedMeta.action, "exam_submit");
    assert.equal(res.data.allPassed, true);

    // Now test ExecutionServiceError rejection from queue
    submissionQueue.enqueue = async () => {
      throw new ExecutionServiceError("Piston sandbox temporarily unavailable.");
    };
    const resErr = createMockRes();
    await submitExamCode(req, resErr, (err) => {
      throw err;
    });
    assert.equal(resErr.statusCode, 503);
    assert.equal(resErr.headers["Retry-After"], "5");
    assert.equal(resErr.data.retryable, true);
  } finally {
    submissionQueue.enqueue = origEnqueue;
    StudentExamProgress.findOne = origProgFindOne;
    Exam.findById = origExamFindById;
    ExamAllocation.findOne = origAllocFindOne;
    ExamAnswerSubmission.findOne = origAnsFindOne;
    ExamCodeSubmission.create = origSubCreate;
  }
});

test("8. Unauthorized student is rejected with 403 before entering submissionQueue", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origEnqueue = submissionQueue.enqueue.bind(submissionQueue);

  let queueCalled = false;
  submissionQueue.enqueue = async () => {
    queueCalled = true;
    return {};
  };

  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "notepad_pending",
    compilerAllowed: false,
    questionProgress: new Map([[qId.toString(), { compilerAllowed: false }]]),
  });

  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [{ _id: qId, title: "Q1", testCases: [] }],
        }),
      }),
    }),
  });

  try {
    const req = {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: qId.toString() },
    };
    const res = createMockRes();

    await runExamCode(req, res, (err) => {
      throw err;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(queueCalled, false);
  } finally {
    submissionQueue.enqueue = origEnqueue;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAllocation.findOne = origAllocFindOne;
  }
});
