import mongoose from "mongoose";
import CodeDraft from "../models/CodeDraft.js";
import Problem from "../models/Problem.js";

/**
 * Verifies the problem exists and the authenticated user is allowed to access it.
 */
const verifyAccessibleProblem = async (problemId, userRole) => {
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    return { error: "Invalid Problem ID format", status: 400 };
  }

  const problem = await Problem.findById(problemId).select("_id status");
  if (!problem) {
    return { error: "Problem not found", status: 404 };
  }

  if (userRole !== "admin" && problem.status !== "published") {
    return { error: "You do not have access to this problem", status: 403 };
  }

  return { problem };
};

// ================= GET DRAFT =================

export const getDraft = async (req, res) => {
  try {
    const { problemId } = req.params;
    const studentId = req.user?.userId;

    if (!studentId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const check = await verifyAccessibleProblem(problemId, req.user.role);
    if (check.error) {
      return res.status(check.status).json({ message: check.error });
    }

    const draft = await CodeDraft.findOne({ studentId, problemId });

    return res.status(200).json({
      draft: draft || null,
    });
  } catch (error) {
    console.error("[GET DRAFT ERROR]:", error.message);
    return res.status(500).json({
      message: "Failed to fetch code draft",
    });
  }
};

// ================= SAVE / UPDATE DRAFT =================

export const upsertDraft = async (req, res) => {
  try {
    const { problemId } = req.params;
    const { code, language = "c" } = req.body;
    const studentId = req.user?.userId;

    if (!studentId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const check = await verifyAccessibleProblem(problemId, req.user.role);
    if (check.error) {
      return res.status(check.status).json({ message: check.error });
    }

    if (typeof code !== "string") {
      return res.status(400).json({ message: "Code must be a string" });
    }

    // Never overwrite a previously saved draft with empty/whitespace-only code
    if (!code.trim()) {
      return res.status(400).json({
        message: "Cannot save an empty draft. Use Reset Code to clear a draft.",
      });
    }

    if (code.length > 65536) {
      return res.status(400).json({
        message: "Code exceeds maximum size of 64KB",
      });
    }

    const normalizedLanguage = language === "c" ? "c" : "c";

    const draft = await CodeDraft.findOneAndUpdate(
      { studentId, problemId },
      {
        $set: {
          code,
          language: normalizedLanguage,
        },
        $setOnInsert: {
          studentId,
          problemId,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      message: "Draft saved",
      draft,
    });
  } catch (error) {
    console.error("[UPSERT DRAFT ERROR]:", error.message);
    return res.status(500).json({
      message: "Failed to save code draft",
    });
  }
};

// ================= DELETE DRAFT =================

export const deleteDraft = async (req, res) => {
  try {
    const { problemId } = req.params;
    const studentId = req.user?.userId;

    if (!studentId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const check = await verifyAccessibleProblem(problemId, req.user.role);
    if (check.error) {
      return res.status(check.status).json({ message: check.error });
    }

    await CodeDraft.findOneAndDelete({ studentId, problemId });

    return res.status(200).json({
      message: "Draft deleted",
    });
  } catch (error) {
    console.error("[DELETE DRAFT ERROR]:", error.message);
    return res.status(500).json({
      message: "Failed to delete code draft",
    });
  }
};
