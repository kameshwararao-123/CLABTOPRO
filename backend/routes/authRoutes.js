import express from "express";
import {
  registerController,
  loginController,
  forgotPasswordController,
  resetPasswordController,
} from "../controllers/userController.js";
import { authRateLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

router.post("/register", authRateLimiter, registerController);
router.post("/login", authRateLimiter, loginController);
router.post("/forgot-password", authRateLimiter, forgotPasswordController);
router.post("/reset-password/:token", authRateLimiter, resetPasswordController);

export default router;