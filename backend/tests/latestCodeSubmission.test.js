import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamAllocation from "../models/ExamAllocation.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission from "../models/ExamCodeSubmission.js";
import ExamQuestion from "../models/ExamQuestion.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import submissionQueue from "../services/submissionQueue.js";
import {
  submitExamCode,
  getMyAssignedQuestion,
  getExamMonitoring,
  getStudentConceptualReport,
  getStudentExamCompletion,
  getExamFinalReports,
} from "../controllers/examController.js";
import { generateConceptualFallback } from "../services/examAIService.js";
import User from "../models/User.js";

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

test("1. submitExamCode saves submission immediately before evaluation and updates latest submission across incorrect -> correct -> incorrect", async () => {
  const origExamFindById = Exam.findById;
  const origExamFindOne = Exam.findOne;
  const origAllocFindOne = ExamAllocation.findOne;
  const origAllocFind = ExamAllocation.find;
  const origProgFindOne = StudentExamProgress.findOne;
  const origProgFind = StudentExamProgress.find;
  const origProgFindOneAndUpdate = StudentExamProgress.findOneAndUpdate;
  const origProgUpdateOne = StudentExamProgress.updateOne;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeCreate = ExamCodeSubmission.create;
  const origCodeFind = ExamCodeSubmission.find;
  const origEnqueue = submissionQueue.enqueue;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const savedSubmissions = [];
  const progressDoc = {
    examId,
    studentId,
    status: "coding_in_progress",
    instructionsAcknowledged: true,
    compilerAllowed: true,
    currentCode: "",
    questionProgress: new Map([
      [
        qId.toString(),
        {
          questionId: qId,
          compilerAllowed: true,
          status: "compiler_access_granted",
          currentCode: "",
          isCompleted: false,
        },
      ],
    ]),
    markModified() {},
    async save() {
      return this;
    },
  };

  try {
    const examObj = {
      _id: examId,
      title: "C Coding Exam",
      examType: "internal",
      status: "in_progress",
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
      durationMinutes: 60,
      participatingStudents: [studentId],
    };
    Exam.findById = () => ({
      select: () => Object.assign(Promise.resolve(examObj), { lean: async () => examObj }),
    });
    Exam.findOne = () => ({
      select: async () => examObj,
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
                questionNumber: "Q1",
                marks: 100,
                testCases: [{ input: "1 2", expectedOutput: "3", isHidden: false }],
              },
            ],
          }),
        }),
      }),
    });

    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              {
                studentId: { _id: studentId, username: "Student A", rollNo: "R1", email: "a@c.edu" },
                assignedQuestionIds: [{ _id: qId, title: "Sum Two", questionNumber: "Q1", difficulty: "Easy" }],
              },
            ],
          }),
        }),
      }),
    });

    StudentExamProgress.findOne = async () => progressDoc;
    StudentExamProgress.find = () => ({
      select: () => ({
        lean: async () => [progressDoc],
      }),
    });
    StudentExamProgress.findOneAndUpdate = null;
    StudentExamProgress.updateOne = async () => ({ modifiedCount: 1 });

    ExamAnswerSubmission.findOne = () => ({
      lean: async () => ({ _id: new mongoose.Types.ObjectId(), isApproved: true }),
    });
    ExamAnswerSubmission.find = () => ({
      sort: () => ({
        select: () => ({ lean: async () => [] }),
        lean: async () => [],
      }),
    });

    ExamCodeSubmission.create = async (doc) => {
      const created = {
        _id: new mongoose.Types.ObjectId(),
        ...doc,
        submittedAt: new Date(Date.now() + savedSubmissions.length * 1000),
      };
      savedSubmissions.push(created);
      return created;
    };
    ExamCodeSubmission.find = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => [...savedSubmissions].reverse(),
        }),
      }),
    });

    // 1. Submit syntax-error code -> saved immediately, evaluated as compile_error
    submissionQueue.enqueue = async () => {
      // Verify submission was ALREADY saved before evaluation runs
      assert.equal(savedSubmissions.length, 1);
      assert.equal(savedSubmissions[0].status, "pending");
      assert.equal(savedSubmissions[0].code, "int main() { prit");
      return {
        status: "compile_error",
        testCasesPassed: 0,
        totalTestCases: 1,
        testCaseResults: [{ testCaseNumber: 1, status: "compile_error", isHidden: false }],
        executionTime: 5,
        compilerOutput: "error: expected ';'",
      };
    };

    const res1 = createMockRes();
    await submitExamCode(
      { params: { examId: examId.toString() }, user: { userId: studentId.toString() }, body: { code: "int main() { prit", questionId: qId.toString() } },
      res1,
      (err) => { throw err; }
    );
    assert.equal(res1.statusCode, 201);
    assert.equal(res1.data.allPassed, false);
    assert.equal(progressDoc.currentCode, "int main() { prit");
    assert.equal(savedSubmissions[0].status, "compile_error");

    // 2. Submit correct code -> saved and marked Solved
    submissionQueue.enqueue = async () => ({
      status: "accepted",
      testCasesPassed: 1,
      totalTestCases: 1,
      testCaseResults: [{ testCaseNumber: 1, status: "passed", isHidden: false }],
      executionTime: 8,
      compilerOutput: "",
    });

    const res2 = createMockRes();
    await submitExamCode(
      { params: { examId: examId.toString() }, user: { userId: studentId.toString() }, body: { code: "int main(){return 0;}", questionId: qId.toString() } },
      res2,
      (err) => { throw err; }
    );
    assert.equal(res2.statusCode, 201);
    assert.equal(res2.data.allPassed, true);
    assert.equal(progressDoc.questionProgress.get(qId.toString()).isCompleted, true);

    // 3. Submit incorrect code AFTER correct code -> latest submission MUST be the incorrect code
    submissionQueue.enqueue = async () => ({
      status: "wrong_answer",
      testCasesPassed: 0,
      totalTestCases: 1,
      testCaseResults: [{ testCaseNumber: 1, status: "failed", isHidden: false }],
      executionTime: 9,
      compilerOutput: "",
    });

    const res3 = createMockRes();
    await submitExamCode(
      { params: { examId: examId.toString() }, user: { userId: studentId.toString() }, body: { code: "int main(){/* wrong */}", questionId: qId.toString() } },
      res3,
      (err) => { throw err; }
    );
    assert.equal(res3.statusCode, 201);
    assert.equal(res3.data.allPassed, false);
    assert.equal(progressDoc.currentCode, "int main(){/* wrong */}");
    assert.equal(progressDoc.questionProgress.get(qId.toString()).currentCode, "int main(){/* wrong */}");
    assert.equal(progressDoc.questionProgress.get(qId.toString()).isCompleted, false);

    // 4. Refresh page (getMyAssignedQuestion) -> returns latest incorrect code
    const resRefresh = createMockRes();
    await getMyAssignedQuestion(
      { params: { examId: examId.toString() }, user: { userId: studentId.toString() }, query: { questionId: qId.toString() } },
      resRefresh,
      (err) => { throw err; }
    );
    assert.equal(resRefresh.statusCode, 200);
    assert.equal(resRefresh.data.progress.currentCode, "int main(){/* wrong */}");

    // 5. Faculty monitoring reflects latest submission (Not Solved, wrong_answer)
    const resMon = createMockRes();
    await getExamMonitoring(
      { params: { examId: examId.toString() }, query: {} },
      resMon,
      (err) => { throw err; }
    );
    assert.equal(resMon.statusCode, 200);
    assert.equal(resMon.data.students[0].solutionStatus, "Not Solved");
    assert.equal(resMon.data.students[0].codeStatus, "wrong_answer");
  } finally {
    Exam.findById = origExamFindById;
    Exam.findOne = origExamFindOne;
    ExamAllocation.findOne = origAllocFindOne;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.findOne = origProgFindOne;
    StudentExamProgress.find = origProgFind;
    StudentExamProgress.findOneAndUpdate = origProgFindOneAndUpdate;
    StudentExamProgress.updateOne = origProgUpdateOne;
    ExamAnswerSubmission.findOne = origAnsFindOne;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.create = origCodeCreate;
    ExamCodeSubmission.find = origCodeFind;
    submissionQueue.enqueue = origEnqueue;
  }
});

test("2. Faculty evaluation report & completion summary return the exact latest submitted source code even when tests fail", async () => {
  const origUserFindById = User.findById;
  const origExamFindById = Exam.findById;
  const origAllocFindOne = ExamAllocation.findOne;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAnsFind = ExamAnswerSubmission.find;
  const origAnsFindOne = ExamAnswerSubmission.findOne;
  const origCodeFindOne = ExamCodeSubmission.findOne;
  const origCodeFind = ExamCodeSubmission.find;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();

  const latestCode = "#include <stdio.h>\nint main() { prit; return 0; }";
  const latestSubDoc = {
    _id: new mongoose.Types.ObjectId(),
    questionId: qId,
    code: latestCode,
    language: "c",
    status: "compile_error",
    testCasesPassed: 0,
    totalTestCases: 10,
    allPassed: false,
    compilerOutput: "error: 'prit' undeclared",
    submittedAt: new Date(),
  };

  try {
    User.findById = () => ({
      select: () => Object.assign(Promise.resolve({ _id: studentId, username: "Raju", rollNo: "S101", email: "raju@college.edu" }), {
        lean: async () => ({ _id: studentId, username: "Raju", rollNo: "S101", email: "raju@college.edu" }),
      }),
    });

    Exam.findById = () => ({
      lean: async () => ({
        _id: examId,
        title: "Internal Exam",
        subject: "C Programming",
        examType: "internal",
        status: "in_progress",
        durationMinutes: 60,
        totalMarks: 100,
        questionsPerStudent: 1,
      }),
    });

    ExamAllocation.findOne = () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => ({
            assignedQuestionIds: [{ _id: qId, questionNumber: "Q1", title: "Reverse a Number", marks: 10 }],
          }),
        }),
      }),
    });

    StudentExamProgress.findOne = () => ({
      lean: async () => ({
        examId,
        studentId,
        status: "test_cases_failed",
        instructionsAcknowledged: true,
        compilerAllowed: true,
        questionProgress: { [qId.toString()]: { questionId: qId, compilerAllowed: true, isCompleted: false } },
      }),
    });

    ExamAnswerSubmission.find = () => ({
      populate: () => ({
        sort: () => ({
          lean: async () => [
            {
              _id: new mongoose.Types.ObjectId(),
              questionId: { _id: qId, title: "Reverse a Number", questionNumber: "Q1", marks: 10 },
              answerText: "Use modulo 10 loop",
              attemptNumber: 1,
              aiEvaluation: { errorPercentage: 10, understandingPercentage: 90, totalMarks: 9, maximumMarks: 10 },
            },
          ],
        }),
      }),
    });

    ExamAnswerSubmission.findOne = () => ({
      sort: () => ({
        lean: async () => ({ _id: new mongoose.Types.ObjectId(), isApproved: true, aiEvaluation: { errorPercentage: 10 } }),
      }),
    });

    ExamCodeSubmission.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: async () => latestSubDoc,
        }),
      }),
    });

    ExamCodeSubmission.find = () => ({
      sort: () => ({
        lean: async () => [latestSubDoc],
      }),
    });

    const reportRes = createMockRes();
    await getStudentConceptualReport(
      { params: { examId: examId.toString(), studentId: studentId.toString() }, query: { questionId: qId.toString() } },
      reportRes,
      (err) => { throw err; }
    );
    assert.equal(reportRes.statusCode, 200);
    assert.equal(reportRes.data.latestCodeSubmission.code, latestCode);
    assert.equal(reportRes.data.latestCodeSubmission.testCasesPassed, 0);
    assert.equal(reportRes.data.latestCodeSubmission.totalTestCases, 10);
    assert.equal(reportRes.data.latestCodeSubmission.status, "compile_error");

    const compRes = createMockRes();
    await getStudentExamCompletion(
      { params: { examId: examId.toString(), studentId: studentId.toString() }, user: { role: "admin", userId: new mongoose.Types.ObjectId().toString() } },
      compRes,
      (err) => { throw err; }
    );
    assert.equal(compRes.statusCode, 200);
    assert.equal(compRes.data.questionCodeSubmissions.length, 1);
    assert.equal(compRes.data.questionCodeSubmissions[0].code, latestCode);
    assert.equal(compRes.data.questionCodeSubmissions[0].testCasesPassed, 0);
    assert.equal(compRes.data.questionCodeSubmissions[0].totalTestCases, 10);
  } finally {
    User.findById = origUserFindById;
    Exam.findById = origExamFindById;
    ExamAllocation.findOne = origAllocFindOne;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAnswerSubmission.find = origAnsFind;
    ExamAnswerSubmission.findOne = origAnsFindOne;
    ExamCodeSubmission.findOne = origCodeFindOne;
    ExamCodeSubmission.find = origCodeFind;
  }
});

test("4. Strict rubric evaluation: unrelated C code for Reverse a Number does not receive full marks", () => {
  const result = generateConceptualFallback({
    question: {
      title: "Reverse a Number",
      problemStatement: "Write a C program to reverse the digits of a given integer.",
      marks: 10,
    },
    studentAnswer:
      "1. Algorithm\n- Declare two variables and add them\n2. Code Logic\nint main() {\n  int a = 1 + 2;\n  return 0;\n}\n3. Expected Output\n3",
  });
  assert.ok(result.totalMarks < result.maximumMarks, "Unrelated code must not receive full marks");
  assert.ok(result.errorPercentage >= 50, "Unrelated code must not pass the <50% error threshold");
});

test("5. getStudentConceptualReport handles 'undefined' questionId and falls back to StudentExamProgress.currentCode when needed", async () => {
  const origUserFindById = User.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFindOne = ExamCodeSubmission.findOne;
  const origQFindById = ExamQuestion.findById;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const savedCode = "#include <stdio.h>\nint main(){ printf(\"ok\"); return 0; }";

  try {
    User.findById = () => ({
      select: async () => ({ _id: studentId, username: "Test", rollNo: "R10", email: "t@c.edu" }),
    });
    ExamAnswerSubmission.find = () => ({
      populate: () => ({
        sort: () => ({ lean: async () => [] }),
      }),
    });
    ExamQuestion.findById = () => ({
      select: () => ({ lean: async () => ({ _id: qId, title: "Q1", questionNumber: "Q1", marks: 100 }) }),
    });
    ExamCodeSubmission.findOne = () => ({
      sort: () => ({
        select: () => ({ lean: async () => null }),
      }),
    });
    StudentExamProgress.findOne = () => ({
      lean: async () => ({
        examId,
        studentId,
        status: "completed",
        currentCode: savedCode,
        questionProgress: {
          [qId.toString()]: { questionId: qId, currentCode: savedCode, isCompleted: true },
        },
      }),
    });

    const res = createMockRes();
    await getStudentConceptualReport(
      { params: { examId: examId.toString(), studentId: studentId.toString() }, query: { questionId: qId.toString() } },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.latestCodeSubmission.code, savedCode);
    assert.equal(res.data.latestCodeSubmission.allPassed, true);
  } finally {
    User.findById = origUserFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.findOne = origCodeFindOne;
    ExamQuestion.findById = origQFindById;
  }
});

test("3. getExamFinalReports hides reports before exam ends and returns 1 report per student with latest Notepad & Code Editor submissions after exam ends", async () => {
  const origExamFindById = Exam.findById;
  const origAllocFind = ExamAllocation.find;
  const origProgFind = StudentExamProgress.find;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFind = ExamCodeSubmission.find;

  const examId = new mongoose.Types.ObjectId();
  const s1 = new mongoose.Types.ObjectId();
  const s2 = new mongoose.Types.ObjectId();
  const q1 = new mongoose.Types.ObjectId();
  const q2 = new mongoose.Types.ObjectId();

  let currentExamStatus = "in_progress";

  try {
    Exam.findById = () => ({
      select: () => ({
        lean: async () => ({
          _id: examId,
          title: "Multi-Student C Exam",
          examType: "internal",
          status: currentExamStatus,
          startedAt: new Date(Date.now() - 5 * 60 * 1000),
          durationMinutes: 60,
          completedAt: currentExamStatus === "completed" ? new Date() : null,
        }),
      }),
    });

    // 1. Before exam ends -> examEnded: false, reports: []
    const resBefore = createMockRes();
    await getExamFinalReports({ params: { examId: examId.toString() } }, resBefore, (e) => { throw e; });
    assert.equal(resBefore.statusCode, 200);
    assert.equal(resBefore.data.examEnded, false);
    assert.deepEqual(resBefore.data.reports, []);

    // 2. After exam ends -> 1 report per student with latest Notepad & Code submissions
    currentExamStatus = "completed";

    ExamAllocation.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: async () => [
              {
                studentId: { _id: s1, username: "Harsha", rollNo: "R001", email: "h@c.edu" },
                assignedQuestionIds: [
                  { _id: q1, questionNumber: "Q1", title: "Reverse Number", difficulty: "Easy" },
                  { _id: q2, questionNumber: "Q2", title: "Strong Number", difficulty: "Medium" },
                ],
              },
              {
                studentId: { _id: s2, username: "Priya", rollNo: "R002", email: "p@c.edu" },
                assignedQuestionIds: [
                  { _id: q1, questionNumber: "Q1", title: "Reverse Number", difficulty: "Easy" },
                  { _id: q2, questionNumber: "Q2", title: "Strong Number", difficulty: "Medium" },
                ],
              },
            ],
          }),
        }),
      }),
    });

    StudentExamProgress.find = () => ({
      lean: async () => [
        { studentId: s1, status: "completed", instructionsAcknowledged: true },
        { studentId: s2, status: "test_cases_failed", instructionsAcknowledged: true },
      ],
    });

    ExamAnswerSubmission.find = () => ({
      sort: () => ({
        lean: async () => [
          {
            studentId: s1,
            questionId: q1,
            answerText: "S1 Q1 latest notepad answer",
            attemptNumber: 2,
            aiEvaluation: { understandingPercentage: 85, errorPercentage: 15, overallFeedback: "Good logic" },
          },
          {
            studentId: s1,
            questionId: q2,
            answerText: "S1 Q2 notepad answer",
            attemptNumber: 1,
            aiEvaluation: { understandingPercentage: 90, errorPercentage: 10, overallFeedback: "Clear steps" },
          },
        ],
      }),
    });

    // Sorted newest first ({ submittedAt: -1, createdAt: -1 })
    ExamCodeSubmission.find = () => ({
      sort: () => ({
        lean: async () => [
          {
            studentId: s1,
            questionId: q1,
            code: "int main(){ prit }",
            language: "c",
            status: "compile_error",
            testCasesPassed: 0,
            totalTestCases: 2,
            allPassed: false,
            testCaseResults: [
              { testCaseNumber: 1, status: "compile_error" },
              { testCaseNumber: 2, status: "compile_error" },
            ],
            compilerOutput: "error: 'prit' undeclared",
            submittedAt: new Date(Date.now() + 2000),
          },
          {
            studentId: s1,
            questionId: q1,
            code: "int main(){ return 0; }",
            language: "c",
            status: "accepted",
            testCasesPassed: 2,
            totalTestCases: 2,
            allPassed: true,
            submittedAt: new Date(Date.now() + 1000),
          },
          {
            studentId: s1,
            questionId: q2,
            code: "int main(){ /* Q2 */ return 0; }",
            language: "c",
            status: "accepted",
            testCasesPassed: 2,
            totalTestCases: 2,
            allPassed: true,
            testCaseResults: [
              { testCaseNumber: 1, status: "passed" },
              { testCaseNumber: 2, status: "passed" },
            ],
            submittedAt: new Date(Date.now() + 1500),
          },
          {
            studentId: s2,
            questionId: q1,
            code: "int main(){ printf(\"wrong\"); }",
            language: "c",
            status: "wrong_answer",
            testCasesPassed: 1,
            totalTestCases: 2,
            allPassed: false,
            testCaseResults: [
              { testCaseNumber: 1, status: "passed" },
              { testCaseNumber: 2, status: "failed" },
            ],
            submittedAt: new Date(Date.now() + 1200),
          },
        ],
      }),
    });

    const resAfter = createMockRes();
    await getExamFinalReports({ params: { examId: examId.toString() } }, resAfter, (e) => { throw e; });
    assert.equal(resAfter.statusCode, 200);
    assert.equal(resAfter.data.examEnded, true);
    assert.equal(resAfter.data.reports.length, 2); // 1 per student, no duplicates

    const harsha = resAfter.data.reports.find((r) => r.studentId === s1.toString());
    assert.equal(harsha.questions.length, 2);
    assert.equal(harsha.questions[0].notepadReport.answerText, "S1 Q1 latest notepad answer");
    assert.equal(harsha.questions[0].codeReport.code, "int main(){ prit }"); // latest, NOT older accepted
    assert.equal(harsha.questions[0].codeReport.status, "compile_error");
    assert.equal(harsha.questions[0].codeReport.testCasesPassed, 0);
    assert.equal(harsha.questions[0].codeReport.totalTestCases, 2);
    assert.equal(harsha.questions[1].codeReport.allPassed, true);

    const priya = resAfter.data.reports.find((r) => r.studentId === s2.toString());
    assert.equal(priya.questions[0].codeReport.testCasesPassed, 1);
    assert.equal(priya.questions[0].codeReport.totalTestCases, 2);
    assert.equal(priya.questions[1].codeReport.hasSubmission, false);
    assert.equal(priya.questions[1].codeReport.code, null);
  } finally {
    Exam.findById = origExamFindById;
    ExamAllocation.find = origAllocFind;
    StudentExamProgress.find = origProgFind;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.find = origCodeFind;
  }
});

test("4. Strict rubric evaluation: unrelated C code for Reverse a Number does not receive full marks", () => {
  const result = generateConceptualFallback({
    question: {
      title: "Reverse a Number",
      problemStatement: "Write a C program to reverse the digits of a given integer.",
      marks: 10,
    },
    studentAnswer:
      "1. Algorithm\n- Declare two variables and add them\n2. Code Logic\nint main() {\n  int a = 1 + 2;\n  return 0;\n}\n3. Expected Output\n3",
  });
  assert.ok(result.totalMarks < result.maximumMarks, "Unrelated code must not receive full marks");
  assert.ok(result.errorPercentage >= 50, "Unrelated code must not pass the <50% error threshold");
});

test("5. getStudentConceptualReport handles 'undefined' questionId and falls back to StudentExamProgress.currentCode when needed", async () => {
  const origUserFindById = User.findById;
  const origProgFindOne = StudentExamProgress.findOne;
  const origAnsFind = ExamAnswerSubmission.find;
  const origCodeFindOne = ExamCodeSubmission.findOne;
  const origQFindById = ExamQuestion.findById;

  const examId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const qId = new mongoose.Types.ObjectId();
  const savedCode = "#include <stdio.h>\nint main(){ printf(\"ok\"); return 0; }";

  try {
    User.findById = () => ({
      select: async () => ({ _id: studentId, username: "Test", rollNo: "R10", email: "t@c.edu" }),
    });
    ExamAnswerSubmission.find = () => ({
      populate: () => ({
        sort: () => ({ lean: async () => [] }),
      }),
    });
    ExamQuestion.findById = () => ({
      select: () => ({ lean: async () => ({ _id: qId, title: "Q1", questionNumber: "Q1", marks: 100 }) }),
    });
    ExamCodeSubmission.findOne = () => ({
      sort: () => ({
        select: () => ({ lean: async () => null }),
      }),
    });
    StudentExamProgress.findOne = () => ({
      lean: async () => ({
        examId,
        studentId,
        status: "completed",
        currentCode: savedCode,
        questionProgress: {
          [qId.toString()]: { questionId: qId, currentCode: savedCode, isCompleted: true },
        },
      }),
    });

    const res = createMockRes();
    await getStudentConceptualReport(
      { params: { examId: examId.toString(), studentId: studentId.toString() }, query: { questionId: qId.toString() } },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.latestCodeSubmission.code, savedCode);
    assert.equal(res.data.latestCodeSubmission.allPassed, true);
  } finally {
    User.findById = origUserFindById;
    StudentExamProgress.findOne = origProgFindOne;
    ExamAnswerSubmission.find = origAnsFind;
    ExamCodeSubmission.findOne = origCodeFindOne;
    ExamQuestion.findById = origQFindById;
  }
});
