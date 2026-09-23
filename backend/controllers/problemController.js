import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";


// ================= CREATE PROBLEM =================

export const createProblem = async (req, res) => {
  try {
    const {
      title,
      description,
      topic,
      difficulty,
      inputFormat,
      outputFormat,
      constraints,
      sampleInput,
      sampleOutput,
      testCases,
      publishDate,
    } = req.body;

    const problem = await Problem.create({
      title,
      description,
      topic,
      difficulty,
      inputFormat,
      outputFormat,
      constraints,
      sampleInput,
      sampleOutput,
      testCases,
      publishDate,
      createdBy: req.user.userId,
      status: "published",
    });

    res.status(201).json({
      message: "Problem created successfully",
      problem,
    });

  } catch (error) {
    console.error("CREATE PROBLEM ERROR:", error);

    res.status(500).json({
      message: error.message || "Failed to create problem",
    });
  }
};


// ================= TODAY'S PROBLEM =================

export const getTodayProblem = async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const problem = await Problem.findOne({
      publishDate: {
        $gte: start,
        $lte: end,
      },
      status: "published",
    }).populate("createdBy", "username email");

    if (!problem) {
      return res.status(404).json({
        message: "Today's problem has not been published yet",
      });
    }

    let isSolved = false;
    let lastSubmission = null;

    if (req.user?.userId) {
      const acceptedSub = await Submission.findOne({
        user: req.user.userId,
        problem: problem._id,
        status: "accepted",
      }).sort({ createdAt: -1 });

      if (acceptedSub) {
        isSolved = true;
        lastSubmission = acceptedSub;
      } else {
        lastSubmission = await Submission.findOne({
          user: req.user.userId,
          problem: problem._id,
        }).sort({ createdAt: -1 });
      }
    }

    res.status(200).json({
      problem: {
        ...problem.toObject(),
        isSolved: Boolean(isSolved),
      },
      lastSubmission: lastSubmission
        ? {
            _id: lastSubmission._id,
            code: lastSubmission.code,
            status: lastSubmission.status,
            allPassed: lastSubmission.status === "accepted",
            aiEvaluation: lastSubmission.aiEvaluation,
            submittedAt: lastSubmission.submittedAt || lastSubmission.createdAt,
          }
        : null,
    });

  } catch (error) {
    console.error("GET TODAY PROBLEM ERROR:", error);

    res.status(500).json({
      message: error.message || "Failed to fetch today's problem",
    });
  }
};


// ================= GET ALL PROBLEMS =================

export const getAllProblems = async (req, res) => {
  try {
    const filter =
      req.user && req.user.role === "admin" ? {} : { status: "published" };

    const problems = await Problem.find(filter).sort({
      publishDate: -1,
      createdAt: -1,
    });

    let solvedSet = new Set();
    if (req.user?.userId) {
      const solvedIds = await Submission.distinct("problem", {
        user: req.user.userId,
        status: "accepted",
      });
      solvedSet = new Set(solvedIds.map((id) => id.toString()));
    }

    const problemsWithSolved = problems.map((p) => ({
      ...p.toObject(),
      isSolved: solvedSet.has(p._id.toString()),
    }));

    res.status(200).json({
      problems: problemsWithSolved,
    });

  } catch (error) {
    console.error("GET ALL PROBLEMS ERROR:", error);

    res.status(500).json({
      message: error.message || "Failed to fetch problems",
    });
  }
};


// ================= GET PROBLEM BY ID =================

export const getProblemById = async (req, res) => {
  try {
    const problem = await Problem.findById(req.params.id)
      .populate("topic")
      .populate("createdBy", "username email");

    if (!problem) {
      return res.status(404).json({
        message: "Problem not found",
      });
    }

    let isSolved = false;
    let lastSubmission = null;

    if (req.user?.userId) {
      const acceptedSub = await Submission.findOne({
        user: req.user.userId,
        problem: problem._id,
        status: "accepted",
      }).sort({ createdAt: -1 });

      if (acceptedSub) {
        isSolved = true;
        lastSubmission = acceptedSub;
      } else {
        lastSubmission = await Submission.findOne({
          user: req.user.userId,
          problem: problem._id,
        }).sort({ createdAt: -1 });
      }
    }

    res.status(200).json({
      problem: {
        ...problem.toObject(),
        isSolved: Boolean(isSolved),
      },
      lastSubmission: lastSubmission
        ? {
            _id: lastSubmission._id,
            code: lastSubmission.code,
            status: lastSubmission.status,
            allPassed: lastSubmission.status === "accepted",
            aiEvaluation: lastSubmission.aiEvaluation,
            submittedAt: lastSubmission.submittedAt || lastSubmission.createdAt,
          }
        : null,
    });

  } catch (error) {
    console.error("GET PROBLEM BY ID ERROR:", error);

    res.status(500).json({
      message: "Failed to fetch problem",
    });
  }
};


// ================= UPDATE PROBLEM =================

export const updateProblem = async (req, res) => {
  try {
    const problem = await Problem.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!problem) {
      return res.status(404).json({
        message: "Problem not found",
      });
    }

    res.status(200).json({
      message: "Problem updated successfully",
      problem,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to update problem",
    });
  }
};


// ================= DELETE PROBLEM =================

export const deleteProblem = async (req, res) => {
  try {
    const problem = await Problem.findByIdAndDelete(
      req.params.id
    );

    if (!problem) {
      return res.status(404).json({
        message: "Problem not found",
      });
    }

    res.status(200).json({
      message: "Problem deleted successfully",
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to delete problem",
    });
  }
};