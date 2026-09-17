import Progress from "../models/Progress.js";


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