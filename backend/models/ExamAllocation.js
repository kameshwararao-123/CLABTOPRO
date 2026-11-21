import mongoose from "mongoose";

const examAllocationSchema = new mongoose.Schema(
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
      index: true,
    },
    allocatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce database-level uniqueness:
// 1. A student receives at most one question per exam
examAllocationSchema.index({ examId: 1, studentId: 1 }, { unique: true });
// 2. A question is assigned to at most one student per exam
examAllocationSchema.index({ examId: 1, questionId: 1 }, { unique: true });

const ExamAllocation = mongoose.model("ExamAllocation", examAllocationSchema);
export default ExamAllocation;
