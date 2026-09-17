import User from "../models/User.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";

export const getAdminDashboard = async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({
      role: "student",
    });

    const totalProblems = await Problem.countDocuments();

    const totalSubmissions = await Submission.countDocuments();

    const acceptedSubmissions = await Submission.countDocuments({
      status: "accepted",
    });

    res.status(200).json({
      totalStudents,
      totalProblems,
      totalSubmissions,
      acceptedSubmissions,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to fetch dashboard",
    });
  }
};