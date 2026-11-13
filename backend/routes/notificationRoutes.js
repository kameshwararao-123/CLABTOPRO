import express from "express";
import {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../controllers/notificationController.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authMiddleware, getMyNotifications);
router.patch("/read-all", authMiddleware, markAllNotificationsAsRead);
router.patch("/:id/read", authMiddleware, markNotificationAsRead);

export default router;
