import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


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