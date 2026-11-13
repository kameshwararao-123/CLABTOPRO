import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  getDraft,
  upsertDraft,
  deleteDraft,
} from "../controllers/draftController.js";

const router = express.Router();

// All draft routes require valid JWT authentication
router.get("/:problemId", authMiddleware, getDraft);
router.put("/:problemId", authMiddleware, upsertDraft);
router.delete("/:problemId", authMiddleware, deleteDraft);

export default router;
