import Submission from "../models/Submission.js";
import Problem from "../models/Problem.js";


// ================= SUBMIT CODE =================

export const submitCode = async (req, res) => {
  try {
    const { problemId, code } = req.body;

    // Check problem
    const problem = await Problem.findById(problemId);

    if (!problem) {
      return res.status(404).json({
        message: "Problem not found",
      });
    }

    // Create submission
    const submission = await Submission.create({
      user: req.user.userId,
      problem: problemId,
      code,
      language: "c",
      status: "pending",
      totalTestCases: problem.testCases.length,
    });

    res.status(201).json({
        message: "Code submitted successfully",
        submissionId: submission._id,
        status: submission.status
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Submission failed",
    });
  }
};


// ================= MY SUBMISSIONS =================

export const getMySubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({
      user: req.user.userId,
    })
      .populate("problem", "title difficulty")
      .sort({ createdAt: -1 });

    res.status(200).json({
      submissions,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to fetch submissions",
    });
  }
};


// ================= SUBMISSION BY ID =================

export const getSubmissionById = async (req, res) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      user: req.user.userId,
    }).populate("problem");

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found",
      });
    }

    res.status(200).json({
      submission,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to fetch submission",
    });
  }
};