import Problem from "../models/Problem.js";
import Submission, { sanitizeSubmissionForStudent } from "../models/Submission.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";



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

    // Notify every user in the application about the newly posted problem/task
    try {
      const [users, creator] = await Promise.all([
        User.find({}, "_id").lean(),
        User.findById(req.user.userId).select("username").lean(),
      ]);

      if (users.length > 0) {
        const posterName = creator?.username || "Faculty";
        const difficultyLabel = difficulty ? ` (${difficulty})` : "";
        const notifications = users.map((u) => ({
          recipient: u._id,
          title: "New Problem Posted",
          message: `${posterName} posted a new problem: ${problem.title}${difficultyLabel}`,
          type: "problem_posted",
          problem: problem._id,
          createdBy: req.user.userId,
        }));

        await Notification.insertMany(notifications, { ordered: false });
      }
    } catch (notifyErr) {
      console.error("CREATE PROBLEM NOTIFICATION ERROR:", notifyErr);
    }

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
      return res.status(200).json({
        message: "Today's problem has not been published yet",
        problem: null,
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
            ...sanitizeSubmissionForStudent(lastSubmission),
            allPassed: lastSubmission.status === "accepted",
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
    const isAdmin = Boolean(req.user && req.user.role === "admin");
    const filter = isAdmin ? {} : { status: "published" };

    const hasPagination =
      req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10) || 20));

    let query = Problem.find(filter)
      .select(
        isAdmin
          ? "title description topic difficulty publishDate status createdAt testCases"
          : "title description topic difficulty publishDate status createdAt"
      )
      .sort({
        publishDate: -1,
        createdAt: -1,
      });

    if (hasPagination) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const [problems, total, solvedIds] = await Promise.all([
      query.lean(),
      hasPagination ? Problem.countDocuments(filter) : Promise.resolve(null),
      req.user?.userId
        ? Submission.distinct("problem", {
            user: req.user.userId,
            status: "accepted",
          })
        : Promise.resolve([]),
    ]);

    const solvedSet = new Set(solvedIds.map((id) => id.toString()));

    const problemsWithSolved = problems.map((p) => ({
      ...p,
      isSolved: solvedSet.has(p._id.toString()),
    }));

    const payload = {
      problems: problemsWithSolved,
    };

    if (hasPagination) {
      payload.pagination = {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }

    res.status(200).json(payload);

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
            ...sanitizeSubmissionForStudent(lastSubmission),
            allPassed: lastSubmission.status === "accepted",
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