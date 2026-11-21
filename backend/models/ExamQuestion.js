import mongoose from "mongoose";

const rubricCriterionSchema = new mongoose.Schema(
  {
    criterion: {
      type: String,
      default: "Algorithm Correctness & Logic",
      trim: true,
    },
    weight: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      default: 25,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const examTestCaseSchema = new mongoose.Schema(
  {
    input: {
      type: String,
      default: "",
    },
    expectedOutput: {
      type: String,
      required: true,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    timeLimitMs: {
      type: Number,
      default: 3000,
    },
  },
  { _id: false }
);

const examQuestionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    questionNumber: {
      type: String,
      default: "",
      trim: true,
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
    source: {
      type: String,
      enum: ["manual", "bulk_extracted"],
      default: "manual",
    },
    contentType: {
      type: String,
      enum: ["text", "pattern", "matrix", "math", "image", "code", "table"],
      default: "text",
    },
    hasPatternOrMatrix: {
      type: Boolean,
      default: false,
    },
    matrixData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    extractionMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    problemStatement: {
      type: String,
      required: true,
    },
    inputFormat: {
      type: String,
      default: "",
    },
    outputFormat: {
      type: String,
      default: "",
    },
    constraints: {
      type: String,
      default: "",
    },
    explanation: {
      type: String,
      default: "",
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium",
    },
    marks: {
      type: Number,
      default: 100,
    },
    evaluationRubric: {
      type: [rubricCriterionSchema],
      default: () => [
        { criterion: "Algorithm Correctness & Logic", weight: 35, description: "Flow of steps, edge case handling, correctness" },
        { criterion: "Time & Space Complexity", weight: 20, description: "Efficiency and asymptotic bounds" },
        { criterion: "Data Structures & Types", weight: 25, description: "Appropriate choice of variables, arrays, or pointers" },
        { criterion: "I/O & Boundary Conditions", weight: 20, description: "Correct input format handling, zero/negative bounds" },
      ],
    },
    testCases: {
      type: [examTestCaseSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

examQuestionSchema.index({ examId: 1, createdAt: 1 });

const ExamQuestion = mongoose.model("ExamQuestion", examQuestionSchema);
export default ExamQuestion;
