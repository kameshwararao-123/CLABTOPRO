import express from "express";

import {
  submitCode,
  runCode,
  getMySubmissions,
  getSubmissionById,
} from "../controllers/submissionController.js";

import { authMiddleware } from "../middleware/auth.js";
import { executionRateLimiter } from "../middleware/rateLimit.js";

const router = express.Router();


// Run C code (sample or custom input; never persists submission or updates progress)
router.post(
  "/run",
  authMiddleware,
  executionRateLimiter,
  runCode
);


// Submit C code
router.post(
  "/",
  authMiddleware,
  executionRateLimiter,
  submitCode
);


// Get student's submissions
router.get(
  "/my",
  authMiddleware,
  getMySubmissions
);


// Get one submission
router.get(
  "/:id",
  authMiddleware,
  getSubmissionById
);

export default router;