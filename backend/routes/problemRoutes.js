import express from "express";

import {
  createProblem,
  getTodayProblem,
  getAllProblems,
  getProblemById,
  updateProblem,
  deleteProblem,
} from "../controllers/problemController.js";

import { authMiddleware } from "../middleware/auth.js";
import { adminMiddleware } from "../middleware/admin.js";

const router = express.Router();


// ================= STUDENT =================

// Today's Problem
router.get(
  "/today",
  authMiddleware,
  getTodayProblem
);

// All Problems
router.get(
  "/",
  authMiddleware,
  getAllProblems
);

// Single Problem
router.get(
  "/:id",
  authMiddleware,
  getProblemById
);


// ================= ADMIN =================

// Create Problem
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  createProblem
);

// Update Problem
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  updateProblem
);

// Delete Problem
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  deleteProblem
);

export default router;