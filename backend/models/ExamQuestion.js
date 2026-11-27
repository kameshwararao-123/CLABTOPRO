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
      min: 0,
      max: 100,
      default: 25,
    },
    maxMarks: {
      type: Number,
      min: 0,
      default: null,
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
    type: {
      type: String,
      enum: ["sample", "hidden"],
      default: function () {
        return this.isHidden ? "hidden" : "sample";
      },
    },
    timeLimitMs: {
      type: Number,
      default: 3000,
    },
  },
  { _id: false }
);

const mcqOptionSchema = new mongoose.Schema(
  {
    optionId: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
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
    questionType: {
      type: String,
      enum: ["coding", "mcq"],
      default: "coding",
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
    // MCQ-specific fields
    questionText: {
      type: String,
      default: "",
    },
    options: {
      type: [mcqOptionSchema],
      default: [],
    },
    correctAnswer: {
      type: String,
      default: "",
      trim: true,
    },
    negativeMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    extractionStatus: {
      type: String,
      enum: ["extracted", "needs_review", "approved", "Auto-Detected", "Needs Review"],
      default: "approved",
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
    expectedAnswer: {
      type: String,
      default: "",
    },
    keyConcepts: {
      type: [String],
      default: [],
    },
    evaluationInstructions: {
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
        {
          criterion: "Algorithmic Approach",
          weight: 40,
          description: "Logically correct problem-solving approach, correct operations and sequence, conditions/iterations, and edge case handling",
        },
        {
          criterion: "Code Logic, Correctness & Syntax",
          weight: 55,
          description: "Correct code implementation of the algorithm, conditions, loops, calculations, program flow, edge cases, and syntax/compilation correctness",
        },
        {
          criterion: "Expected Output",
          weight: 5,
          description: "Presence and correctness of expected output for the given input, matching the intended algorithm and code logic",
        },
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

examQuestionSchema.pre("validate", function () {
  if (this.questionType === "mcq") {
    if (!this.problemStatement && this.questionText) {
      this.problemStatement = this.questionText;
    }
    if (!this.title) {
      this.title = this.questionText
        ? this.questionText.slice(0, 100).trim()
        : `MCQ ${this.questionNumber || ""}`;
    }
  }
});

examQuestionSchema.index({ examId: 1, createdAt: 1 });
examQuestionSchema.index({ examId: 1, questionType: 1 });

const ExamQuestion = mongoose.model("ExamQuestion", examQuestionSchema);
export default ExamQuestion;
