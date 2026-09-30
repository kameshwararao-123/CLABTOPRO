import express from "express";
import { checkJudgeEngineHealth } from "../services/judgeService.js";
import submissionQueue from "../services/submissionQueue.js";

const router = express.Router();

/**
 * Health check endpoint for execution engine and queue.
 * GET /api/execution/health
 */
router.get("/health", async (req, res) => {
  try {
    const engineHealth = await checkJudgeEngineHealth();
    const queueStats = submissionQueue.getStats();

    const isHealthy = Boolean(engineHealth.connected);

    const payload = {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      activeEngine: engineHealth.engine,
      engine: engineHealth,
      queue: queueStats,
    };

    return res.status(isHealthy ? 200 : 503).json(payload);
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

export default router;
