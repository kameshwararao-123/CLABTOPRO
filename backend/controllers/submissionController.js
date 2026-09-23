import crypto from "crypto";
import mongoose from "mongoose";
import Submission from "../models/Submission.js";
import Problem from "../models/Problem.js";
import Progress from "../models/Progress.js";
import User from "../models/User.js";
import { evaluateCodeWithAI } from "../services/aiEvaluationService.js";

// In-memory cooldown tracking (2 seconds per user)
const userLastSubmission = new Map();

/**
 * Updates student Progress and User streak/accuracy metrics.
 * Reliably calculates unique problems solved, accepted submissions, total attempts, and daily streak.
 */
const updateStudentProgress = async (userId, problemId, allPassed) => {
  try {
    let progress = await Progress.findOne({ user: userId });
    if (!progress) {
      progress = await Progress.create({ user: userId });
    }

    // 1. Accurately count unique solved problems from accepted submissions
    const solvedProblems = await Submission.distinct("problem", {
      user: userId,
      status: "accepted",
    });

    progress.totalSolved = solvedProblems.length;

    // 2. Count total accepted submissions
    progress.totalAccepted = await Submission.countDocuments({
      user: userId,
      status: "accepted",
    });

    // 3. Count total attempts across all problems
    progress.totalAttempted = await Submission.countDocuments({
      user: userId,
    });

    if (allPassed) {
      // 4. Daily streak calculation based on calendar date (YYYY-MM-DD)
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      if (!progress.lastSolvedDate) {
        // First solve ever!
        progress.currentStreak = 1;
        progress.longestStreak = Math.max(progress.longestStreak || 0, 1);
        progress.lastSolvedDate = now;
      } else {
        const lastSolvedStr = new Date(progress.lastSolvedDate)
          .toISOString()
          .slice(0, 10);

        if (lastSolvedStr === todayStr) {
          // Already solved today, ensure streak is at least 1 and keep going
          if (!progress.currentStreak || progress.currentStreak < 1) {
            progress.currentStreak = 1;
          }
          progress.lastSolvedDate = now;
        } else {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().slice(0, 10);

          if (lastSolvedStr === yesterdayStr) {
            // Consecutive day: increment streak
            progress.currentStreak = (progress.currentStreak || 0) + 1;
          } else {
            // Missed a day or more: reset streak to 1
            progress.currentStreak = 1;
          }

          progress.longestStreak = Math.max(
            progress.longestStreak || 0,
            progress.currentStreak
          );
          progress.lastSolvedDate = now;
        }
      }

      // Sync User model with updated streak
      await User.findByIdAndUpdate(userId, {
        currentStreak: progress.currentStreak,
        longestStreak: progress.longestStreak,
        lastSolvedDate: progress.lastSolvedDate,
      });
    }

    await progress.save();
    return progress;
  } catch (err) {
    console.error("[UPDATE PROGRESS ERROR]:", err.message);
    return null;
  }
};

// ================= SUBMIT CODE =================

export const submitCode = async (req, res) => {
  try {
    const { problemId, code } = req.body;

    // 1. Validation
    if (!problemId) {
      return res.status(400).json({
        message: "Problem ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({
        message: "Invalid Problem ID format",
      });
    }

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        message: "Code cannot be empty",
      });
    }

    // Rate limit per user (2-second cooldown)
    const userId = req.user?.userId;
    if (userId) {
      const lastTime = userLastSubmission.get(userId.toString());
      if (lastTime && Date.now() - lastTime < 2000) {
        return res.status(429).json({
          message: "Please wait a moment before submitting again.",
        });
      }
      userLastSubmission.set(userId.toString(), Date.now());
    }

    // 2. Check problem existence
    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({
        message: "Problem not found",
      });
    }

    // 3. Generate codeHash for evaluation deduplication
    const normalizedCode = code.trim();
    const codeHash = crypto
      .createHash("sha256")
      .update(`${problemId}:${normalizedCode}`)
      .digest("hex");

    // 4. Save submission ALWAYS before AI evaluation
    const submission = await Submission.create({
      user: req.user.userId,
      problem: problemId,
      code,
      language: "c",
      status: "pending",
      totalTestCases: problem.testCases?.length || 0,
      codeHash,
      submittedAt: new Date(),
    });

    // 5. Check for cached evaluation for identical problem + code
    const cachedSubmission = await Submission.findOne({
      problem: problemId,
      codeHash,
      "aiEvaluation.overallStatus": {
        $in: ["likely_correct", "likely_incorrect", "needs_verification"],
      },
      _id: { $ne: submission._id },
    }).sort({ createdAt: -1 });

    if (cachedSubmission && cachedSubmission.aiEvaluation) {
      submission.aiEvaluation = cachedSubmission.aiEvaluation;
      submission.aiEvaluatedAt = new Date();

      const totalCases =
        problem.testCases?.length ||
        submission.aiEvaluation.testCaseAnalysis?.length ||
        0;
      const passedCount = (
        submission.aiEvaluation.testCaseAnalysis || []
      ).filter((tc) => tc.prediction === "likely_pass").length;

      const allPassed =
        submission.aiEvaluation.overallStatus === "likely_correct" ||
        (totalCases > 0 && passedCount === totalCases);

      if (allPassed) {
        submission.status = "accepted";
        submission.testCasesPassed = totalCases;
      } else {
        submission.status = "wrong_answer";
        submission.testCasesPassed = passedCount;
      }

      await submission.save();

      // Update student dashboard, streak, and problems solved count
      const progress = await updateStudentProgress(
        req.user.userId,
        problemId,
        allPassed
      );

      return res.status(201).json({
        message: allPassed
          ? "All test cases passed! Streak and dashboard updated."
          : "Code evaluated. Some test cases failed.",
        submissionId: submission._id,
        status: submission.status,
        allPassed,
        aiEvaluation: submission.aiEvaluation,
        progress,
      });
    }

    // 6. Perform AI Static Evaluation via Gemini Service
    const aiResult = await evaluateCodeWithAI({
      problem,
      studentCode: code,
    });

    if (aiResult && aiResult.success) {
      const { success, ...cleanEvaluation } = aiResult;

      const totalCases =
        problem.testCases?.length ||
        cleanEvaluation.testCaseAnalysis?.length ||
        0;

      // Calculate likely passed test cases count
      const passedCount = (cleanEvaluation.testCaseAnalysis || []).filter(
        (tc) => tc.prediction === "likely_pass"
      ).length;

      const allPassed =
        cleanEvaluation.overallStatus === "likely_correct" ||
        (totalCases > 0 && passedCount === totalCases);

      if (allPassed) {
        submission.status = "accepted";
        submission.testCasesPassed = totalCases;
      } else {
        submission.status = "wrong_answer";
        submission.testCasesPassed = passedCount;
      }

      submission.aiEvaluation = cleanEvaluation;
      submission.aiEvaluatedAt = new Date();
      await submission.save();

      // Update student dashboard, streak, and problems solved count
      const progress = await updateStudentProgress(
        req.user.userId,
        problemId,
        allPassed
      );

      return res.status(201).json({
        message: allPassed
          ? "All test cases passed! Streak and dashboard updated."
          : "Code evaluated. Some test cases failed.",
        submissionId: submission._id,
        status: submission.status,
        allPassed,
        aiEvaluation: submission.aiEvaluation,
        progress,
      });
    }

    // 7. Fallback if AI Evaluation is unavailable (submission is kept safely)
    submission.aiEvaluation = {
      overallStatus: "evaluation_unavailable",
      confidence: 0,
      summary:
        "Your code was submitted successfully, but AI evaluation is temporarily unavailable.",
      testCaseAnalysis: [],
      detectedIssues: [],
      edgeCases: [],
      timeComplexity: "Unknown",
      spaceComplexity: "Unknown",
      concepts: [],
      suggestions: [
        "Check back later or review your logic against problem constraints manually.",
      ],
      learningFeedback:
        "The submission was recorded. AI analysis could not be completed at this time.",
      verificationRequired: true,
    };
    submission.aiEvaluatedAt = new Date();
    await submission.save();

    const progress = await updateStudentProgress(
      req.user.userId,
      problemId,
      false
    );

    return res.status(201).json({
      message: "Submission saved, but AI evaluation is currently unavailable.",
      submissionId: submission._id,
      status: submission.status,
      allPassed: false,
      aiEvaluation: submission.aiEvaluation,
      progress,
    });
  } catch (error) {
    console.error("[SUBMIT CODE ERROR]:", error);
    res.status(500).json({
      message: error.message || "Submission failed",
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
    console.error("[GET MY SUBMISSIONS ERROR]:", error);
    res.status(500).json({
      message: "Failed to fetch submissions",
    });
  }
};

// ================= SUBMISSION BY ID =================

export const getSubmissionById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid submission ID format",
      });
    }

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
    console.error("[GET SUBMISSION BY ID ERROR]:", error);
    res.status(500).json({
      message: "Failed to fetch submission",
    });
  }
};