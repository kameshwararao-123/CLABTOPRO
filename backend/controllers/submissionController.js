import crypto from "crypto";
import mongoose from "mongoose";
import Submission, { sanitizeSubmissionForStudent } from "../models/Submission.js";
import Problem from "../models/Problem.js";
import Progress from "../models/Progress.js";
import User from "../models/User.js";
import { judgeSubmission, ExecutionServiceError } from "../services/judgeService.js";
import { explainFailureWithAI } from "../services/aiEvaluationService.js";
import submissionQueue from "../services/submissionQueue.js";

// In-memory cooldown tracking (2 seconds per user)
const userLastSubmission = new Map();

/**
 * Updates student Progress and User streak/accuracy metrics.
 * Accurately tracks unique problems solved, accepted submissions, total attempts, and daily streak.
 */
const updateStudentProgress = async (userId, problemId, allPassed) => {
  try {
    let progress = await Progress.findOne({ user: userId });
    if (!progress) {
      progress = await Progress.create({ user: userId });
    }

    // 1. Unique solved problems from accepted submissions
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
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      if (!progress.lastSolvedDate) {
        progress.currentStreak = 1;
        progress.longestStreak = Math.max(progress.longestStreak || 0, 1);
        progress.lastSolvedDate = now;
      } else {
        const lastSolvedStr = new Date(progress.lastSolvedDate)
          .toISOString()
          .slice(0, 10);

        if (lastSolvedStr === todayStr) {
          if (!progress.currentStreak || progress.currentStreak < 1) {
            progress.currentStreak = 1;
          }
          progress.lastSolvedDate = now;
        } else {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().slice(0, 10);

          if (lastSolvedStr === yesterdayStr) {
            progress.currentStreak = (progress.currentStreak || 0) + 1;
          } else {
            progress.currentStreak = 1;
          }

          progress.longestStreak = Math.max(
            progress.longestStreak || 0,
            progress.currentStreak
          );
          progress.lastSolvedDate = now;
        }
      }

      await User.findByIdAndUpdate(userId, {
        currentStreak: progress.currentStreak,
        longestStreak: progress.longestStreak,
        lastSolvedDate: progress.lastSolvedDate,
      });
    }

    await progress.save();
    return progress;
  } catch (err) {
    console.error("[UpdateProgress] Error syncing student metrics:", err.message);
    return null;
  }
};

// ================= SUBMIT CODE =================

export const submitCode = async (req, res) => {
  try {
    const { problemId, code } = req.body;

    // 1. Validation
    if (!problemId) {
      return res.status(400).json({ message: "Problem ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ message: "Invalid Problem ID format" });
    }

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "Code cannot be empty" });
    }

    if (code.length > 65536) {
      return res.status(400).json({ message: "Code exceeds maximum size of 64KB" });
    }

    // Rate limit per user (2-second cooldown)
    const userId = req.user?.userId;
    if (userId) {
      const lastTime = userLastSubmission.get(userId.toString());
      if (lastTime && Date.now() - lastTime < 2000) {
        return res.status(429).json({
          message: "Please wait 2 seconds before submitting again.",
        });
      }
      userLastSubmission.set(userId.toString(), Date.now());
    }

    // 2. Fetch problem and test cases
    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const codeHash = crypto
      .createHash("sha256")
      .update(`${problemId}:${code.trim()}`)
      .digest("hex");

    // 3. Pre-create submission in MongoDB
    const submission = await Submission.create({
      user: req.user.userId,
      problem: problemId,
      code,
      language: "c",
      status: "pending",
      totalTestCases: problem.testCases?.length || 0,
      tabSwitches: Number(req.body.tabSwitches || 0),
      codeHash,
      submittedAt: new Date(),
    });

    console.log(
      `[Submission] Created submission ${submission._id} for user ${req.user.userId} on problem "${problem.title}". Queuing...`
    );

    // 4. Enqueue execution through the concurrency-controlled queue
    const executionTask = async () => {
      // A. Deterministic Judgment through Piston
      const judgeResult = await judgeSubmission({
        code,
        testCases: problem.testCases || [],
        problemTitle: problem.title,
      });

      submission.status = judgeResult.status;
      submission.compilerOutput = judgeResult.compilerOutput || "";
      submission.testCasesPassed = judgeResult.testCasesPassed || 0;
      submission.totalTestCases = judgeResult.totalTestCases || 0;
      submission.executionTime = judgeResult.executionTime || 0;
      submission.testCaseResults = judgeResult.testCaseResults || [];

      // B. Optional AI Learning Assistant (Failure explanation & hints)
      const allPassed = judgeResult.status === "accepted";

      if (!allPassed) {
        const firstFailedTest = judgeResult.testCaseResults.find(
          (tc) => tc.status !== "passed" && tc.status !== "skipped"
        );

        const explanation = await explainFailureWithAI({
          problem,
          studentCode: code,
          verdict: judgeResult.status,
          executionEvidence: {
            testCaseNumber: firstFailedTest?.testCaseNumber,
            isHidden: firstFailedTest?.isHidden,
            expectedOutput: firstFailedTest?.expectedOutput,
            actualOutput: firstFailedTest?.actualOutput,
            compilerError: judgeResult.compilerOutput,
            runtimeError: firstFailedTest?.error,
          },
        });

        submission.aiEvaluation = explanation;
        submission.aiEvaluatedAt = new Date();
      } else {
        submission.aiEvaluation = {
          summary: "All test cases passed! Clean implementation.",
          detectedIssues: [],
          suggestions: ["Great job! You can explore alternative algorithmic approaches to further optimize time complexity."],
          concepts: [problem.topic || "C Basics"],
          learningFeedback: "Excellent work! Your code successfully handled all test cases.",
        };
        submission.aiEvaluatedAt = new Date();
      }

      await submission.save();

      // C. Update student progress metrics
      const progress = await updateStudentProgress(
        req.user.userId,
        problemId,
        allPassed
      );

      return {
        submission,
        progress,
        allPassed,
      };
    };

    let result;
    try {
      result = await submissionQueue.enqueue(executionTask, {
        userId: req.user.userId,
        problemId,
        submissionId: submission._id,
      });
    } catch (queueErr) {
      // If Piston is unavailable or queue overloaded, handle gracefully
      if (queueErr instanceof ExecutionServiceError) {
        console.error(`[Submission Error] Execution service failure for ${submission._id}:`, queueErr.message);
        // Do NOT mark as wrong_answer! Keep as pending or remove
        await Submission.findByIdAndDelete(submission._id).catch(() => {});
        return res.status(503).json({
          message: queueErr.message,
          retryable: true,
        });
      }

      if (queueErr.code === "QUEUE_OVERLOAD") {
        await Submission.findByIdAndDelete(submission._id).catch(() => {});
        return res.status(503).json({
          message: queueErr.message,
          retryable: true,
        });
      }

      throw queueErr;
    }

    // 5. Sanitize submission for student response (never reveal hidden inputs/outputs)
    const sanitizedSubmission = sanitizeSubmissionForStudent(result.submission);

    const messageMap = {
      accepted: "✓ Accepted! All test cases passed.",
      wrong_answer: "✗ Wrong Answer. Some test cases failed.",
      compile_error: "✗ Compilation Error. Check compiler output.",
      runtime_error: "✗ Runtime Error occurred during execution.",
      time_limit: "✗ Time Limit Exceeded. Program took too long to finish.",
    };

    return res.status(201).json({
      message: messageMap[sanitizedSubmission.status] || "Submission evaluated.",
      submissionId: sanitizedSubmission._id,
      status: sanitizedSubmission.status,
      allPassed: result.allPassed,
      testCasesPassed: sanitizedSubmission.testCasesPassed,
      totalTestCases: sanitizedSubmission.totalTestCases,
      executionTime: sanitizedSubmission.executionTime,
      compilerOutput: sanitizedSubmission.compilerOutput,
      testCases: sanitizedSubmission.testCases,
      aiEvaluation: sanitizedSubmission.aiEvaluation,
      progress: result.progress,
    });
  } catch (error) {
    console.error("[SUBMIT CODE ERROR]:", error);
    res.status(500).json({
      message: error.message || "An unexpected error occurred during submission evaluation.",
    });
  }
};

// ================= MY SUBMISSIONS =================

export const getMySubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({
      user: req.user.userId,
    })
      .populate("problem", "title difficulty topic")
      .sort({ createdAt: -1 });

    const sanitized = submissions.map((s) => sanitizeSubmissionForStudent(s));

    res.status(200).json({
      submissions: sanitized,
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
    }).populate("problem", "title difficulty description topic");

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found",
      });
    }

    res.status(200).json({
      submission: sanitizeSubmissionForStudent(submission),
    });
  } catch (error) {
    console.error("[GET SUBMISSION BY ID ERROR]:", error);
    res.status(500).json({
      message: "Failed to fetch submission",
    });
  }
};