import mongoose from "mongoose";

const examAnswerSubmissionSchema = new mongoose.Schema(
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
    },
    attemptNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    answerText: {
      type: String,
      required: true,
    },
    aiEvaluation: {
      status: { type: String, default: "success" },
      errorPercentage: { type: Number, default: 0 },
      understandingPercentage: { type: Number, default: 0 },
      rawScore: { type: Number, default: 0 },
      totalMarks: { type: Number, default: 0 },
      maximumMarks: { type: Number, default: 10 },
      percentage: { type: Number, default: 0 },
      overallFeedback: { type: String, default: "" },
      criteriaEvaluation: [
        {
          criterion: String,
          maximumMarks: Number,
          awardedMarks: Number,
          status: String, // "fully_satisfied" | "partially_satisfied" | "not_satisfied" | "incorrect"
          evidence: String,
          feedback: String,
        },
      ],
      identifiedIssues: [
        {
          criterion: String,
          severity: String, // "major" | "moderate" | "minor"
          description: String,
          hint: String,
        },
      ],
      correctConcepts: [String],
      missingConcepts: [String],
      strengths: [String],
      incorrectConcepts: [String],
      improvementSuggestions: [String],
      suggestions: [String],
      rubricWarnings: [String],
      rubricSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
      evaluationConfidence: { type: Number, default: 1 },
      feedbackSummary: { type: String, default: "" },
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["submitted", "evaluating", "evaluated", "approved", "correction_required"],
      default: "submitted",
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
    evaluatedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

examAnswerSubmissionSchema.index({ examId: 1, studentId: 1, attemptNumber: 1 });
examAnswerSubmissionSchema.index({ examId: 1, submittedAt: -1 });

const ExamAnswerSubmission = mongoose.model(
  "ExamAnswerSubmission",
  examAnswerSubmissionSchema
);
export default ExamAnswerSubmission;
