import express from "express";

import {
  createTopic,
  getAllTopics,
  getTopicById,
} from "../controllers/topicController.js";

import { authMiddleware } from "../middleware/auth.js";
import { adminMiddleware } from "../middleware/admin.js";

const router = express.Router();


// Student + Admin
router.get("/", authMiddleware, getAllTopics);

router.get("/:id", authMiddleware, getTopicById);


// Admin only
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  createTopic
);

export default router;