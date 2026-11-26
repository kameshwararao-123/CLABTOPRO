import express from "express";
import {
  registerController,
  loginController,
  forgotPasswordController,
  resetPasswordController,
} from "../controllers/userController.js";
import {
  loginAccountRateLimiter,
  loginIpSafetyLimiter,
  registerAccountRateLimiter,
  registerIpSafetyLimiter,
  forgotPasswordAccountLimiter,
  forgotPasswordIpLimiter,
  resetPasswordRateLimiter,
  resetPasswordIpLimiter,
} from "../middleware/rateLimit.js";

const router = express.Router();

router.post("/register", registerIpSafetyLimiter, registerAccountRateLimiter, registerController);
router.post("/login", loginIpSafetyLimiter, loginAccountRateLimiter, loginController);
router.post("/forgot-password", forgotPasswordIpLimiter, forgotPasswordAccountLimiter, forgotPasswordController);
router.post("/reset-password/:token", resetPasswordIpLimiter, resetPasswordRateLimiter, resetPasswordController);

export default router;
