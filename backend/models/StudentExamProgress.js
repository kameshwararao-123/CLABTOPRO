import mongoose from "mongoose";

const studentExamProgressSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: [
        "not_started",
        "instructions_acknowledged",
        "question_assigned",
        "answer_in_progress",
        "evaluation_pending",
        "correction_required",
        "execution_allowed",
        "completed",
        "review_required",
      ],
      default: "not_started",
      index: true,
    },
    instructionsAcknowledged: {
      type: Boolean,
      default: false,
    },
    instructionsAcknowledgedAt: {
      type: Date,
      default: null,
    },
    conceptualAttemptsCount: {
      type: Number,
      default: 0,
    },
    lastConceptualAnswer: {
      type: String,
      default: "",
    },
    lastAIEvaluation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    compilerAllowed: {
      type: Boolean,
      default: false,
    },
    compilerAllowedAt: {
      type: Date,
      default: null,
    },
    currentCode: {
      type: String,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
    finalScore: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

studentExamProgressSchema.index({ examId: 1, studentId: 1 }, { unique: true });

const StudentExamProgress = mongoose.model(
  "StudentExamProgress",
  studentExamProgressSchema
);
export default StudentExamProgress;
