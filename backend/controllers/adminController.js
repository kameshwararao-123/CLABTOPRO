import User from "../models/User.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import Progress from "../models/Progress.js";

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

export const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "student" })
      .select("-password")
      .sort({ createdAt: -1 });

    const studentIds = students.map((s) => s._id);
    const progressList = await Progress.find({ user: { $in: studentIds } });
    const progressMap = {};
    progressList.forEach((p) => {
      progressMap[p.user.toString()] = p;
    });

    const studentsWithStats = students.map((student) => {
      const prog = progressMap[student._id.toString()];
      return {
        ...student.toObject(),
        totalSolved: prog?.totalSolved || 0,
        totalAttempted: prog?.totalAttempted || 0,
        currentStreak: prog?.currentStreak || student.currentStreak || 0,
        longestStreak: prog?.longestStreak || student.longestStreak || 0,
        lastSolvedDate: prog?.lastSolvedDate || student.lastSolvedDate || null,
      };
    });

    res.status(200).json({
      students: studentsWithStats,
    });
  } catch (error) {
    console.error("GET ALL STUDENTS ERROR:", error.message);
    res.status(500).json({
      message: "Failed to fetch students",
    });
  }
};