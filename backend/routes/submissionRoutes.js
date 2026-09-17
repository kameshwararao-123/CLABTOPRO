import express from "express";

import {
  submitCode,
  getMySubmissions,
  getSubmissionById,
} from "../controllers/submissionController.js";

import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();


// Submit C code
router.post(
  "/",
  authMiddleware,
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