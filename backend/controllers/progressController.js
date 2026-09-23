import Progress from "../models/Progress.js";
import Submission from "../models/Submission.js";

// ================= GET MY PROGRESS =================

export const getMyProgress = async (req, res) => {
  try {
    let progress = await Progress.findOne({
      user: req.user.userId,
    });

    // Create progress if it doesn't exist
    if (!progress) {
      progress = await Progress.create({
        user: req.user.userId,
      });
    }

    // Accurately calculate stats based on actual submissions in MongoDB
    const solvedCount = (
      await Submission.distinct("problem", {
        user: req.user.userId,
        status: "accepted",
      })
    ).length;

    const acceptedCount = await Submission.countDocuments({
      user: req.user.userId,
      status: "accepted",
    });

    const attemptedCount = await Submission.countDocuments({
      user: req.user.userId,
    });

    // Auto-sync if numbers differ
    if (
      progress.totalSolved !== solvedCount ||
      progress.totalAccepted !== acceptedCount ||
      progress.totalAttempted !== attemptedCount
    ) {
      progress.totalSolved = solvedCount;
      progress.totalAccepted = acceptedCount;
      progress.totalAttempted = attemptedCount;
      await progress.save();
    }

    res.status(200).json({
      progress,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to fetch progress",
    });
  }
};


// ================= GET STREAK =================

export const getMyStreak = async (req, res) => {
  try {
    let progress = await Progress.findOne({
      user: req.user.userId,
    });

    if (!progress) {
      progress = await Progress.create({
        user: req.user.userId,
      });
    }

    res.status(200).json({
      currentStreak: progress.currentStreak,
      longestStreak: progress.longestStreak,
      lastSolvedDate: progress.lastSolvedDate,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to fetch streak",
    });
  }
};