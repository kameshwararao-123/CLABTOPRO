import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    semester: {
      type: String,
      required: true,
      trim: true,
    },
    examType: {
      type: String,
      enum: ["internal", "external"],
      required: true,
      index: true,
    },
    examDate: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      default: "",
    },
    endTime: {
      type: String,
      default: "",
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 15,
      max: 360,
      default: 90,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
      default: 100,
    },
    instructions: {
      type: String,
      default:
        "1. Do not switch tabs or minimize the examination window.\n2. Write your conceptual solution, algorithm, and logic in the Paper Writing Notepad.\n3. You must score an error percentage below 50% on conceptual evaluation to unlock the code execution environment.\n4. Complete and test all test cases before submitting your code.",
    },
    maxConceptualAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10,
    },
    status: {
      type: String,
      enum: ["draft", "allocated", "scheduled", "in_progress", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    participatingStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    startedAt: {
      type: Date,
      default: null,
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

examSchema.index({ examType: 1, status: 1, createdAt: -1 });

const Exam = mongoose.model("Exam", examSchema);
export default Exam;
