import mongoose from "mongoose";

const progressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    currentStreak: {
      type: Number,
      default: 0,
    },

    longestStreak: {
      type: Number,
      default: 0,
    },

    lastSolvedDate: {
      type: Date,
      default: null,
    },

    totalSolved: {
      type: Number,
      default: 0,
    },

    totalAttempted: {
      type: Number,
      default: 0,
    },

    totalAccepted: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Progress = mongoose.model("Progress", progressSchema);

export default Progress;