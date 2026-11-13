import mongoose from "mongoose";

const codeDraftSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
    },
    code: {
      type: String,
      required: true,
      maxlength: 65536,
    },
    language: {
      type: String,
      enum: ["c"],
      default: "c",
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index ensuring one draft per student per problem
codeDraftSchema.index({ studentId: 1, problemId: 1 }, { unique: true });

const CodeDraft = mongoose.model("CodeDraft", codeDraftSchema);

export default CodeDraft;
