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