import mongoose from "mongoose";

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

    executionTime: {
      type: Number,
    },

    aiEvaluation: {
      overallStatus: {
        type: String,
        enum: [
          "likely_correct",
          "likely_incorrect",
          "needs_verification",
          "evaluation_unavailable",
        ],
      },
      confidence: {
        type: Number,
        min: 0,
        max: 100,
      },
      summary: {
        type: String,
      },
      testCaseAnalysis: [
        {
          testCaseNumber: Number,
          prediction: {
            type: String,
            enum: ["likely_pass", "likely_fail", "uncertain"],
          },
          reason: String,
        },
      ],
      detectedIssues: [
        {
          type: {
            type: String,
          },
          severity: String,
          message: String,
        },
      ],
      edgeCases: [String],
      timeComplexity: String,
      spaceComplexity: String,
      concepts: [String],
      suggestions: [String],
      learningFeedback: String,
      verificationRequired: {
        type: Boolean,
        default: true,
      },
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

const Submission = mongoose.model("Submission", submissionSchema);

export default Submission;