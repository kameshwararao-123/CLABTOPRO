import mongoose from "mongoose";

const snapshotRankSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rank: {
      type: Number,
      required: true,
    },
    overallScore: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const leaderboardSnapshotSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      unique: true,
    },
    ranks: {
      type: [snapshotRankSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const LeaderboardSnapshot = mongoose.model(
  "LeaderboardSnapshot",
  leaderboardSnapshotSchema
);

export default LeaderboardSnapshot;
