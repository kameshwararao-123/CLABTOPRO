import mongoose from "mongoose";

const leaderboardEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
    },

    rollNo: {
      type: String,
      default: "",
      trim: true,
    },

    // Historical metrics (0-100)
    consistencyScore: {
      type: Number,
      default: 0,
    },

    accuracyScore: {
      type: Number,
      default: 0,
    },

    problemSolvingScore: {
      type: Number,
      default: 0,
    },

    historicalScore: {
      type: Number,
      default: 0,
    },

    // Today's metrics (0-100, keyed by Asia/Kolkata YYYY-MM-DD)
    todayDateKey: {
      type: String,
      default: "",
    },

    todayAttempted: {
      type: Number,
      default: 0,
    },

    todayAccepted: {
      type: Number,
      default: 0,
    },

    todayUniqueSolvedCount: {
      type: Number,
      default: 0,
    },

    todayDifficultyPoints: {
      type: Number,
      default: 0,
    },

    todayScore: {
      type: Number,
      default: 0,
    },

    // Final unified score: (historicalScore * 0.70) + (todayScore * 0.30)
    overallScore: {
      type: Number,
      default: 0,
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

    accuracyPercent: {
      type: Number,
      default: 0,
    },

    currentStreak: {
      type: Number,
      default: 0,
    },

    practiceDays30: {
      type: Number,
      default: 0,
    },

    currentRank: {
      type: Number,
      default: 0,
    },

    previousRank: {
      type: Number,
      default: null,
    },

    previousRankDateKey: {
      type: String,
      default: null,
    },

    lastEvaluatedSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

leaderboardEntrySchema.index({
  overallScore: -1,
  historicalScore: -1,
  totalSolved: -1,
  accuracyPercent: -1,
  user: 1,
});
leaderboardEntrySchema.index({ todayDateKey: 1 });

const LeaderboardEntry = mongoose.model(
  "LeaderboardEntry",
  leaderboardEntrySchema
);

export default LeaderboardEntry;
