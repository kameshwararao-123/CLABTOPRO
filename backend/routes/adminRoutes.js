import express from "express";

import {
  getAdminDashboard,
  getAllStudents,
} from "../controllers/adminController.js";

import { authMiddleware } from "../middleware/auth.js";
import { adminMiddleware } from "../middleware/admin.js";

const router = express.Router();


router.get(
  "/dashboard",
  authMiddleware,
  adminMiddleware,
  getAdminDashboard
);

router.get(
  "/students",
  authMiddleware,
  adminMiddleware,
  getAllStudents
);

export default router;