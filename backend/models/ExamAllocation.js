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
    // Maintained for backward compatibility with 1-to-1 callers (set to assignedQuestionIds[0])
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamQuestion",
      index: true,
    },
    // Array of unique question IDs allocated to this student for the exam
    assignedQuestionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExamQuestion",
        required: true,
      },
    ],
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
// Each student receives exactly ONE allocation record per exam containing their assignedQuestionIds
examAllocationSchema.index({ examId: 1, studentId: 1 }, { unique: true });
// Index for querying allocations by questionId (non-unique, since questions can be shared across multiple students)
examAllocationSchema.index({ examId: 1, questionId: 1 });
examAllocationSchema.index({ examId: 1, assignedQuestionIds: 1 });

const ExamAllocation = mongoose.model("ExamAllocation", examAllocationSchema);
export default ExamAllocation;
