import mongoose from "mongoose";

const examAuditLogSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorRole: {
      type: String,
      default: "admin",
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

examAuditLogSchema.index({ examId: 1, createdAt: -1 });

const ExamAuditLog = mongoose.model("ExamAuditLog", examAuditLogSchema);
export default ExamAuditLog;
