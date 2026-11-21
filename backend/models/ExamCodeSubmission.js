import mongoose from "mongoose";

const examTestCaseResultSchema = new mongoose.Schema(
  {
    testCaseNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["passed", "failed", "compile_error", "runtime_error", "time_limit"],
      required: true,
    },
    executionTime: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: "",
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    // Raw inputs/outputs are saved for audit/instructor review,
    // but sanitized before sending back to the student if isHidden is true
    input: {
      type: String,
      default: "",
    },
    expectedOutput: {
      type: String,
      default: "",
    },
    actualOutput: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const examCodeSubmissionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamQuestion",
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      default: "c",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "wrong_answer",
        "compile_error",
        "runtime_error",
        "time_limit",
      ],
      default: "pending",
    },
    testCasesPassed: {
      type: Number,
      default: 0,
    },
    totalTestCases: {
      type: Number,
      default: 0,
    },
    testCaseResults: {
      type: [examTestCaseResultSchema],
      default: [],
    },
    allPassed: {
      type: Boolean,
      default: false,
    },
    executionTime: {
      type: Number,
      default: 0,
    },
    compilerOutput: {
      type: String,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

examCodeSubmissionSchema.index({ examId: 1, studentId: 1, createdAt: -1 });

export const sanitizeExamCodeSubmissionForStudent = (submission) => {
  if (!submission) return null;
  const subObj = submission.toObject ? submission.toObject() : { ...submission };

  if (Array.isArray(subObj.testCaseResults)) {
    subObj.testCases = subObj.testCaseResults.map((tc) => {
      const isPassed = tc.status === "passed";
      const isHidden = Boolean(tc.isHidden);
      if (isHidden) {
        return {
          testCaseNumber: tc.testCaseNumber,
          visibility: "hidden",
          status: tc.status,
          passed: isPassed,
          executionTime: tc.executionTime,
          isHidden: true,
          error: isPassed ? "" : tc.error || "Hidden test case failed",
        };
      }
      return {
        testCaseNumber: tc.testCaseNumber,
        visibility: "visible",
        status: tc.status,
        passed: isPassed,
        executionTime: tc.executionTime,
        isHidden: false,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: tc.actualOutput,
        error: tc.error,
      };
    });
    subObj.testCaseResults = subObj.testCases;
    subObj.testResults = subObj.testCases;
  }

  const passedTests =
    subObj.testCasesPassed ??
    (subObj.testCases?.filter((tc) => tc.passed).length || 0);
  const totalTests = subObj.totalTestCases ?? (subObj.testCases?.length || 0);
  const failedTests = Math.max(0, totalTests - passedTests);

  subObj.summary = {
    passedTests,
    failedTests,
    totalTests,
  };

  return subObj;
};

const ExamCodeSubmission = mongoose.model(
  "ExamCodeSubmission",
  examCodeSubmissionSchema
);
export default ExamCodeSubmission;
