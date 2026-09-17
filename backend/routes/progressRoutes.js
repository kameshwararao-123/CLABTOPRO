import express from "express";

import {
  getMyProgress,
  getMyStreak,
} from "../controllers/progressController.js";

import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();


// Complete progress
router.get(
  "/",
  authMiddleware,
  getMyProgress
);


// Streak
router.get(
  "/streak",
  authMiddleware,
  getMyStreak
);

export default router;