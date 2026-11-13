import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../services/emailService.js";


// ================= REGISTER =================

export const registerController = async (req, res) => {
  try {
    console.log("REGISTER REQUEST RECEIVED");
    console.log("BODY:", req.body);
    const { username, email, password, rollNo } = req.body;

    if (
      !username ||
      !rollNo ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }
    // Check email
    const isEmailExists = await User.findOne({ email });

    if (isEmailExists) {
      return res.status(400).json({
        message: "Account already exists with this email",
      });
    }

    // Check roll number
    const isRollNoExists = await User.findOne({ rollNo });

    if (isRollNoExists) {
      return res.status(400).json({
        message: "Account already exists with this roll number",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      rollNo,
      role: "student"
    });

    res.status(201).json({
      message: "User registered successfully",

      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        rollNo: user.rollNo,
        role: user.role,
      },
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Registration failed",
    });
  }
};


// ================= LOGIN =================

export const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(200).json({
      message: "Login successful",

      token,

      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        rollNo: user.rollNo,
        role: user.role,
      },
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Login failed",
    });
  }
};


// ================= FORGOT PASSWORD =================

export const forgotPasswordController = async (req, res) => {
  try {
    const email = req.body?.email?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "No account found with this email address",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const origin =
      req.headers.origin || process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${origin}/reset-password/${rawToken}`;

    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      resetUrl,
    });

    if (emailResult.sent) {
      return res.status(200).json({
        message: "Password reset link has been sent to your email.",
        emailSent: true,
      });
    }

    console.log(`PASSWORD RESET LINK for ${user.email}: ${resetUrl}`);

    res.status(200).json({
      message:
        "SMTP is not configured in backend/.env; generated a local reset link below.",
      emailSent: false,
      resetToken: rawToken,
      resetUrl,
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);

    res.status(500).json({
      message: "Failed to process forgot password request",
    });
  }
};


// ================= RESET PASSWORD =================

export const resetPasswordController = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({
        message: "Reset token is required",
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Reset link is invalid or has expired",
      });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);

    res.status(500).json({
      message: "Failed to reset password",
    });
  }
};