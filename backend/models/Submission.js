import mongoose from "mongoose";

const testCaseResultSchema = new mongoose.Schema(
  {
    testCaseNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["passed", "failed", "compile_error", "runtime_error", "time_limit", "skipped"],
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
    // Raw outputs are recorded in database for instructor review,
    // but sanitized before sending to students for hidden test cases.
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

const submissionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
    },

    code: {
      type: String,
      required: true,
    },

    codeHash: {
      type: String,
      index: true,
    },

    language: {
      type: String,
      enum: ["c"],
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

    tabSwitches: {
      type: Number,
      default: 0,
    },

    executionTime: {
      type: Number,
      default: 0,
    },

    compilerOutput: {
      type: String,
      default: "",
    },

    testCaseResults: {
      type: [testCaseResultSchema],
      default: [],
    },

    // AI is used solely as an educational assistant and never decides verdicts
    aiEvaluation: {
      summary: {
        type: String,
        default: "",
      },
      detectedIssues: [
        {
          type: {
            type: String,
          },
          severity: String,
          message: String,
        },
      ],
      suggestions: [String],
      concepts: [String],
      learningFeedback: String,
    },

    aiEvaluatedAt: {
      type: Date,
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

/**
 * Strips secret inputs, expected outputs, and actual outputs for hidden test cases
 * before returning submission objects to students.
 */
export const sanitizeSubmissionForStudent = (submission) => {
  if (!submission) return null;
  const subObj = submission.toObject ? submission.toObject() : { ...submission };

  if (Array.isArray(subObj.testCaseResults)) {
    subObj.testCases = subObj.testCaseResults.map((tc) => {
      if (tc.isHidden) {
        return {
          testCaseNumber: tc.testCaseNumber,
          status: tc.status,
          executionTime: tc.executionTime,
          isHidden: true,
          // Securely omitted for student privacy/assessment integrity:
          // input, expectedOutput, actualOutput
        };
      }
      return {
        testCaseNumber: tc.testCaseNumber,
        status: tc.status,
        executionTime: tc.executionTime,
        isHidden: false,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: tc.actualOutput,
        error: tc.error,
      };
    });
    // Remove internal raw array to avoid leaking hidden outputs
    delete subObj.testCaseResults;
  }

  return subObj;
};

const Submission = mongoose.model("Submission", submissionSchema);

export default Submission;