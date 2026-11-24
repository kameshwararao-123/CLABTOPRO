import mongoose from "mongoose";

const questionProgressSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamQuestion",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "not_started",
        "in_progress",
        "instructions_acknowledged",
        "notepad_pending",
        "notepad_submitted",
        "awaiting_faculty_evaluation",
        "evaluating",
        "ai_evaluation_pending",
        "waiting_faculty_decision",
        "notepad_correction_required",
        "notepad_resubmitted",
        "conceptual_evaluation_failed",
        "compiler_access_granted",
        "coding_in_progress",
        "submission_pending",
        "test_cases_failed",
        "successfully_completed",
        "time_expired",
        "answer_in_progress",
        "evaluation_pending",
        "correction_required",
        "execution_allowed",
        "completed",
        "review_required",
      ],
      default: "not_started",
    },
    conceptualStatus: {
      type: String,
      enum: ["pending", "submitted", "evaluating", "evaluated", "approved", "correction_required"],
      default: "pending",
    },
    facultyDecision: {
      type: String,
      enum: ["pending", "allow_to_code", "return_to_notepad"],
      default: "pending",
    },
    facultyDecisionAt: {
      type: Date,
      default: null,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    facultyFeedback: {
      type: String,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    evaluatedAt: {
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
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    score: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const vivaAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    selectedOption: {
      type: String,
      default: "",
      trim: true,
    },
    isAnswered: {
      type: Boolean,
      default: false,
    },
    isMarkedForReview: {
      type: Boolean,
      default: false,
    },
    answeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const vivaResultSchema = new mongoose.Schema(
  {
    totalQuestions: { type: Number, default: 0 },
    attempted: { type: Number, default: 0 },
    attemptedQuestions: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    incorrect: { type: Number, default: 0 },
    incorrectAnswers: { type: Number, default: 0 },
    unanswered: { type: Number, default: 0 },
    unansweredQuestions: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    totalPossibleMarks: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
        "in_progress",
        "instructions_acknowledged",
        "notepad_pending",
        "notepad_submitted",
        "awaiting_faculty_evaluation",
        "evaluating",
        "ai_evaluation_pending",
        "waiting_faculty_decision",
        "notepad_correction_required",
        "notepad_resubmitted",
        "conceptual_evaluation_failed",
        "compiler_access_granted",
        "coding_in_progress",
        "submission_pending",
        "test_cases_failed",
        "successfully_completed",
        "time_expired",
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
    conceptualStatus: {
      type: String,
      enum: ["pending", "submitted", "evaluating", "evaluated", "approved", "correction_required"],
      default: "pending",
    },
    facultyDecision: {
      type: String,
      enum: ["pending", "allow_to_code", "return_to_notepad"],
      default: "pending",
    },
    facultyDecisionAt: {
      type: Date,
      default: null,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    facultyFeedback: {
      type: String,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
    instructionsAcknowledged: {
      type: Boolean,
      default: false,
    },
    instructionsAcknowledgedAt: {
      type: Date,
      default: null,
    },
    // Top-level fields maintained for backward compatibility with 1-to-1 allocations
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
    // Multi-question per-question tracking map: questionId.toString() -> questionProgress
    questionProgress: {
      type: Map,
      of: questionProgressSchema,
      default: () => new Map(),
    },
    // Viva MCQ Answers and Results
    vivaAnswers: {
      type: Map,
      of: vivaAnswerSchema,
      default: () => new Map(),
    },
    vivaResult: {
      type: vivaResultSchema,
      default: null,
    },
    vivaStartedAt: {
      type: Date,
      default: null,
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
