import { getLeaderboardForUser } from "../services/leaderboardService.js";

/**
 * GET /api/leaderboard
 * Returns the single unified performance-based leaderboard and the authenticated student's rank & details.
 */
export const getLeaderboard = async (req, res, next) => {
  try {
    const rawLimit = parseInt(req.query.limit || "50", 10);
    const limit = Math.min(100, Math.max(10, Number.isFinite(rawLimit) ? rawLimit : 50));

    const data = await getLeaderboardForUser({
      userId: req.user.userId,
      limit,
    });

    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};
