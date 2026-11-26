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
      enum: ["internal", "external", "viva"],
      required: true,
      index: true,
    },
    marksPerQuestion: {
      type: Number,
      default: 1,
      min: 0,
    },
    negativeMarking: {
      type: Number,
      default: 0,
      min: 0,
    },
    negativeMarkingEnabled: {
      type: Boolean,
      default: false,
    },
    maxAttempts: {
      type: Number,
      default: 1,
      min: 1,
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
      max: 720,
      default: 180,
    },
    officialEndTime: {
      type: Date,
      default: null,
    },
    extendedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
      default: 100,
    },
    questionsPerStudent: {
      type: Number,
      min: 1,
      default: 1,
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
    examCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    enrolledStudents: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        enrolledAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    enrollmentClosed: {
      type: Boolean,
      default: false,
    },
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
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
