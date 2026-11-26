import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { runExamCode } from "../controllers/examController.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAllocation from "../models/ExamAllocation.js";

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

const validSumCode = `#include <stdio.h>
int main() {
  int a, b;
  if (scanf("%d %d", &a, &b) == 2) {
    printf("%d\\n", a + b);
  }
  return 0;
}`;

test("1-4 & 9. runExamCode executes visible sample test cases, excludes hidden cases, and compares outputs", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;

  const mockQuestion = {
    _id: qId,
    title: "Sum of Two Numbers",
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false, type: "sample" },
      { input: "10 20", expectedOutput: "30", isHidden: false, type: "sample" },
      { input: "999 1", expectedOutput: "SECRET_HIDDEN_1000", isHidden: true, type: "hidden" },
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

  const res = createMockRes();
  await runExamCode(
    {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: qId.toString() },
    },
    res,
    () => {}
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.data.allPassed, true);
  assert.equal(res.data.testCasesPassed, 2);
  assert.equal(res.data.totalTestCases, 2, "Hidden test case must NOT be executed or counted in Run Samples");
  assert.equal(res.data.testResults.length, 2);
  assert.equal(res.data.testResults[0].input, "2 3");
  assert.equal(res.data.testResults[0].expectedOutput, "5");
  assert.equal(res.data.testResults[0].passed, true);
  assert.equal(res.data.testResults[1].input, "10 20");
  assert.equal(res.data.testResults[1].expectedOutput, "30");
  assert.equal(res.data.testResults[1].passed, true);
  assert.ok(!JSON.stringify(res.data).includes("SECRET_HIDDEN_1000"), "Hidden test case must never leak");

  StudentExamProgress.findOne = origProgFindOne;
  ExamAllocation.findOne = origAllocFindOne;
});

test("5 & 10. Missing question returns 404 and unassigned question returns 403", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const assignedQId = new mongoose.Types.ObjectId();
  const otherStudentQId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;

  StudentExamProgress.findOne = async () => ({
    examId,
    studentId,
    status: "coding_in_progress",
    compilerAllowed: true,
    questionProgress: new Map([[assignedQId.toString(), { compilerAllowed: true }]]),
  });

  // Unassigned question -> 403
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [{ _id: assignedQId, title: "Assigned", testCases: [] }],
        }),
      }),
    }),
  });

  const resUnauth = createMockRes();
  await runExamCode(
    {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: otherStudentQId.toString() },
    },
    resUnauth,
    () => {}
  );
  assert.equal(resUnauth.statusCode, 403);

  // Missing question in allocation -> 404
  ExamAllocation.findOne = () => ({
    populate: () => ({
      populate: () => ({
        lean: async () => ({
          examId,
          studentId,
          assignedQuestionIds: [],
        }),
      }),
    }),
  });

  const resMissing = createMockRes();
  await runExamCode(
    {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode },
    },
    resMissing,
    () => {}
  );
  assert.equal(resMissing.statusCode, 404);

  StudentExamProgress.findOne = origProgFindOne;
  ExamAllocation.findOne = origAllocFindOne;
});

test("6. Missing sample test cases returns 400 with missingSampleCases instead of 0/0 custom fallback", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;

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
              title: "Only Hidden Question",
              testCases: [{ input: "1", expectedOutput: "1", isHidden: true, type: "hidden" }],
            },
          ],
        }),
      }),
    }),
  });

  const res = createMockRes();
  await runExamCode(
    {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: validSumCode, questionId: qId.toString() },
    },
    res,
    () => {}
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.data.missingSampleCases, true);
  assert.equal(res.data.totalTestCases, 0);

  StudentExamProgress.findOne = origProgFindOne;
  ExamAllocation.findOne = origAllocFindOne;
});

test("7 & 8. Compilation errors and runtime errors are reported clearly", async () => {
  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const origProgFindOne = StudentExamProgress.findOne;
  const origAllocFindOne = ExamAllocation.findOne;

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
              title: "Error Handling Test",
              testCases: [{ input: "1 2", expectedOutput: "3", isHidden: false }],
            },
          ],
        }),
      }),
    }),
  });

  // Compilation error
  const resCompile = createMockRes();
  await runExamCode(
    {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: "int main() { broken_syntax }", questionId: qId.toString() },
    },
    resCompile,
    () => {}
  );
  assert.equal(resCompile.statusCode, 200);
  assert.equal(resCompile.data.status, "compile_error");
  assert.ok(resCompile.data.compilationError.length > 0);
  assert.equal(resCompile.data.allPassed, false);

  // Runtime error
  const resRuntime = createMockRes();
  await runExamCode(
    {
      params: { examId: examId.toString() },
      user: { userId: studentId.toString() },
      body: { code: "#include <stdlib.h>\nint main() { abort(); return 0; }", questionId: qId.toString() },
    },
    resRuntime,
    () => {}
  );
  assert.equal(resRuntime.statusCode, 200);
  assert.equal(resRuntime.data.status, "runtime_error");
  assert.equal(resRuntime.data.allPassed, false);
  assert.ok(resRuntime.data.runtimeError.length > 0);

  StudentExamProgress.findOne = origProgFindOne;
  ExamAllocation.findOne = origAllocFindOne;
});
