import mongoose from "mongoose";

const extractedTestCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: "" },
    expectedOutput: { type: String, default: "" },
    explanation: { type: String, default: "" },
    isHidden: { type: Boolean, default: false },
    type: {
      type: String,
      enum: ["sample", "hidden"],
      default: function () {
        return this.isHidden ? "hidden" : "sample";
      },
    },
  },
  { _id: false }
);

const extractedQuestionSchema = new mongoose.Schema({
  questionType: {
    type: String,
    enum: ["coding", "mcq"],
    default: "coding",
  },
  questionText: {
    type: String,
    default: "",
  },
  options: [
    {
      optionId: { type: String, default: "" },
      text: { type: String, default: "" },
      _id: false,
    },
  ],
  correctAnswer: {
    type: String,
    default: "",
    trim: true,
  },
  originalQuestionNumber: {
    type: String,
    default: "",
    trim: true,
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
  sourcePageNumber: {
    type: Number,
    default: 1,
  },
  status: {
    type: String,
    enum: [
      "approved",
      "needs_review",
      "incomplete_extraction",
      "extraction_failed",
      "successfully_extracted",
    ],
    default: "approved",
  },
  reviewReason: {
    type: String,
    default: "",
  },
  orderIndex: {
    type: Number,
    default: 0,
  },
  batchNumber: {
    type: Number,
    default: 1,
  },
  sampleTestCases: {
    type: [extractedTestCaseSchema],
    default: [],
  },
  hiddenTestCases: {
    type: [extractedTestCaseSchema],
    default: [],
  },
  rawExcerpt: {
    type: String,
    default: "",
  },
});

const batchStatusSchema = new mongoose.Schema(
  {
    batchIndex: { type: Number, required: true },
    questionCount: { type: Number, default: 0 },
    startQuestionNum: { type: String, default: "" },
    endQuestionNum: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    error: { type: String, default: "" },
    retryCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const questionExtractionJobSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobType: {
      type: String,
      enum: ["coding", "viva_mcq"],
      default: "coding",
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ["pdf", "xlsx", "xls"],
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "parsing_document",
        "extracting_batches",
        "completed",
        "failed",
      ],
      default: "pending",
    },
    totalDetected: {
      type: Number,
      default: 0,
    },
    totalExtracted: {
      type: Number,
      default: 0,
    },
    totalValidated: {
      type: Number,
      default: 0,
    },
    totalNeedsReview: {
      type: Number,
      default: 0,
    },
    totalFailed: {
      type: Number,
      default: 0,
    },
    progressMessage: {
      type: String,
      default: "Upload initiated...",
    },
    currentBatch: {
      type: Number,
      default: 0,
    },
    totalBatches: {
      type: Number,
      default: 0,
    },
    temporaryFilePath: {
      type: String,
      default: "",
    },
    batches: {
      type: [batchStatusSchema],
      default: [],
    },
    extractedQuestions: {
      type: [extractedQuestionSchema],
      default: [],
    },
    error: {
      type: String,
      default: "",
    },
    isSavedToExam: {
      type: Boolean,
      default: false,
    },
    savedQuestionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

questionExtractionJobSchema.index({ examId: 1, createdAt: -1 });

const QuestionExtractionJob = mongoose.model(
  "QuestionExtractionJob",
  questionExtractionJobSchema
);

export default QuestionExtractionJob;
