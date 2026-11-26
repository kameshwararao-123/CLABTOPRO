import mongoose from "mongoose";

const aiEvaluationJobSchema = new mongoose.Schema(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamAnswerSubmission",
      required: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "queued", "processing", "completed", "failed", "retry_scheduled"],
      default: "queued",
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
    nextRunAt: {
      type: Date,
      default: Date.now,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
    },
    modelUsed: {
      type: String,
      default: "",
    },
    isFallback: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

aiEvaluationJobSchema.index({ status: 1, nextRunAt: 1, createdAt: 1 });
aiEvaluationJobSchema.index({ examId: 1, studentId: 1, questionId: 1, attemptNumber: -1 });

const AIEvaluationJob = mongoose.model("AIEvaluationJob", aiEvaluationJobSchema);
export default AIEvaluationJob;
