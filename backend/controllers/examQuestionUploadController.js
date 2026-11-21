import fs from "fs";
import path from "path";
import multer from "multer";
import Exam from "../models/Exam.js";
import ExamQuestion from "../models/ExamQuestion.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import QuestionExtractionJob from "../models/QuestionExtractionJob.js";
import { runQuestionExtractionJob } from "../services/questionExtractionOrchestrator.js";
import {
  decodeHtmlEntities,
  normalizeSampleContent,
  cleanProblemStatement,
} from "../utils/textNormalization.js";

// Ensure uploads directory exists
const UPLOAD_DIR = path.resolve(
  fs.existsSync(path.resolve("backend")) ? "backend/uploads/temp" : "uploads/temp"
);
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`);
  },
});

// File filter to allow only PDF, XLSX, and XLS
const fileFilter = (req, file, cb) => {
  const allowedExts = [".pdf", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();

  const allowedMimes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
  ];

  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Please upload a PDF (.pdf) or Excel (.xlsx, .xls) document."),
      false
    );
  }
};

export const uploadQuestionsMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
}).single("file");

/**
 * Upload a question document (.pdf, .xlsx, .xls) and initiate background extraction.
 * POST /api/v1/exams/:examId/questions/upload
 */
export const uploadExamQuestions = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status === "in_progress" || exam.status === "completed") {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        message: "Cannot add questions to an active or completed examination.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "No document file was uploaded. Please select a PDF or Excel file.",
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase().replace(".", "");
    const fileType = ext === "pdf" ? "pdf" : ext === "xls" ? "xls" : "xlsx";

    // Create the background extraction tracking job
    const job = await QuestionExtractionJob.create({
      examId: exam._id,
      facultyId: req.user.userId,
      fileName: req.file.originalname,
      fileType,
      fileSize: req.file.size,
      status: "pending",
      progressMessage: "Document uploaded successfully. Starting background extraction...",
      temporaryFilePath: req.file.path,
    });

    // Asynchronously dispatch extraction job without blocking HTTP response
    setImmediate(() => {
      runQuestionExtractionJob(job._id).catch((err) => {
        console.error(`[UploadController] Unhandled error in extraction job ${job._id}:`, err);
      });
    });

    res.status(202).json({
      success: true,
      jobId: job._id,
      message: "File uploaded successfully. Question extraction is in progress.",
      fileName: job.fileName,
      fileSize: job.fileSize,
      status: job.status,
    });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(error);
  }
};

/**
 * Get the live progress and status of an extraction job.
 * GET /api/v1/exams/:examId/questions/extraction/:jobId
 */
export const getExtractionJobStatus = async (req, res, next) => {
  try {
    const { examId, jobId } = req.params;
    const job = await QuestionExtractionJob.findOne({
      _id: jobId,
      examId,
    }).select("-extractedQuestions");

    if (!job) {
      return res.status(404).json({ message: "Extraction job not found." });
    }

    res.status(200).json({
      success: true,
      job: {
        id: job._id,
        examId: job.examId,
        fileName: job.fileName,
        fileType: job.fileType,
        fileSize: job.fileSize,
        status: job.status,
        totalDetected: job.totalDetected,
        totalExtracted: job.totalExtracted,
        totalValidated: job.totalValidated,
        totalNeedsReview: job.totalNeedsReview,
        totalFailed: job.totalFailed,
        progressMessage: job.progressMessage,
        currentBatch: job.currentBatch,
        totalBatches: job.totalBatches,
        error: job.error,
        isSavedToExam: job.isSavedToExam,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get paginated and searchable extracted questions for faculty preview.
 * GET /api/v1/exams/:examId/questions/extraction/:jobId/preview
 */
export const getExtractedQuestionsPreview = async (req, res, next) => {
  try {
    const { examId, jobId } = req.params;
    const { q = "", status = "all", page = 1, limit = 20 } = req.query;

    const job = await QuestionExtractionJob.findOne({ _id: jobId, examId });
    if (!job) {
      return res.status(404).json({ message: "Extraction job not found." });
    }

    let allQuestions = job.extractedQuestions || [];

    // Filter by search query
    if (q && q.trim()) {
      const queryLower = q.toLowerCase().trim();
      allQuestions = allQuestions.filter(
        (item) =>
          item.originalQuestionNumber?.toLowerCase().includes(queryLower) ||
          item.title?.toLowerCase().includes(queryLower) ||
          item.problemStatement?.toLowerCase().includes(queryLower)
      );
    }

    // Filter by status
    if (status && status !== "all") {
      allQuestions = allQuestions.filter((item) => item.status === status);
    }

    const totalMatching = allQuestions.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedQuestions = allQuestions.slice(startIndex, startIndex + limitNum);

    // Calculate overall job metrics
    const fullList = job.extractedQuestions || [];
    const summary = {
      totalDetected: job.totalDetected,
      totalExtracted: fullList.length,
      approvedCount: fullList.filter((q) => q.status === "approved" || q.status === "successfully_extracted").length,
      needsReviewCount: fullList.filter((q) => q.status === "needs_review").length,
      incompleteCount: fullList.filter((q) => q.status === "incomplete_extraction").length,
      failedCount: fullList.filter((q) => q.status === "extraction_failed").length,
      isSavedToExam: job.isSavedToExam,
    };

    res.status(200).json({
      success: true,
      summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: totalMatching,
        totalPages: Math.ceil(totalMatching / limitNum) || 1,
      },
      questions: paginatedQuestions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Edit or approve a specific extracted question in preview before saving.
 * PATCH /api/v1/exams/:examId/questions/extraction/:jobId/questions/:questionId
 */
export const updateExtractedQuestion = async (req, res, next) => {
  try {
    const { examId, jobId, questionId } = req.params;
    const job = await QuestionExtractionJob.findOne({ _id: jobId, examId });

    if (!job) {
      return res.status(404).json({ message: "Extraction job not found." });
    }

    const questionIndex = job.extractedQuestions.findIndex(
      (q) => q._id.toString() === questionId
    );

    if (questionIndex === -1) {
      return res.status(404).json({ message: "Extracted question not found in job." });
    }

    const allowedUpdates = [
      "title",
      "problemStatement",
      "inputFormat",
      "outputFormat",
      "constraints",
      "difficulty",
      "marks",
      "sampleTestCases",
      "status",
      "reviewReason",
      "originalQuestionNumber",
      "contentType",
      "matrixData",
      "sourcePageNumber",
    ];

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        if (key === "sampleTestCases" && Array.isArray(req.body[key])) {
          job.extractedQuestions[questionIndex][key] = req.body[key].map((tc) => ({
            input: normalizeSampleContent(tc.input || "", "input"),
            expectedOutput: normalizeSampleContent(tc.expectedOutput || "", "output"),
            explanation: decodeHtmlEntities(tc.explanation || ""),
            isHidden: false,
          }));
        } else if (key === "problemStatement") {
          job.extractedQuestions[questionIndex][key] = cleanProblemStatement(req.body[key]);
        } else if (typeof req.body[key] === "string") {
          job.extractedQuestions[questionIndex][key] = decodeHtmlEntities(req.body[key]);
        } else {
          job.extractedQuestions[questionIndex][key] = req.body[key];
        }
      }
    }

    // Recalculate summary counters
    job.totalValidated = job.extractedQuestions.filter(
      (q) => q.status === "approved" || q.status === "successfully_extracted"
    ).length;
    job.totalNeedsReview = job.extractedQuestions.filter(
      (q) => q.status === "needs_review"
    ).length;
    job.totalFailed = job.extractedQuestions.filter(
      (q) => q.status === "extraction_failed"
    ).length;

    await job.save();

    res.status(200).json({
      success: true,
      message: "Question updated successfully in preview.",
      question: job.extractedQuestions[questionIndex],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a specific extracted question from the preview list.
 * DELETE /api/v1/exams/:examId/questions/extraction/:jobId/questions/:questionId
 */
export const deleteExtractedQuestion = async (req, res, next) => {
  try {
    const { examId, jobId, questionId } = req.params;
    const job = await QuestionExtractionJob.findOne({ _id: jobId, examId });

    if (!job) {
      return res.status(404).json({ message: "Extraction job not found." });
    }

    const originalLength = job.extractedQuestions.length;
    job.extractedQuestions = job.extractedQuestions.filter(
      (q) => q._id.toString() !== questionId
    );

    if (job.extractedQuestions.length === originalLength) {
      return res.status(404).json({ message: "Question not found." });
    }

    job.totalExtracted = job.extractedQuestions.length;
    job.totalValidated = job.extractedQuestions.filter(
      (q) => q.status === "approved" || q.status === "successfully_extracted"
    ).length;
    job.totalNeedsReview = job.extractedQuestions.filter(
      (q) => q.status === "needs_review"
    ).length;

    await job.save();

    res.status(200).json({
      success: true,
      message: "Question removed from preview list.",
      totalRemaining: job.extractedQuestions.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk approve all validated questions in an extraction job.
 * POST /api/v1/exams/:examId/questions/extraction/:jobId/approve-all
 */
export const approveAllExtractedQuestions = async (req, res, next) => {
  try {
    const { examId, jobId } = req.params;
    const job = await QuestionExtractionJob.findOne({ _id: jobId, examId });

    if (!job) {
      return res.status(404).json({ message: "Extraction job not found." });
    }

    let approvedCount = 0;
    job.extractedQuestions.forEach((q) => {
      if (q.status !== "extraction_failed") {
        q.status = "approved";
        approvedCount++;
      }
    });

    job.totalValidated = approvedCount;
    job.totalNeedsReview = 0;
    await job.save();

    res.status(200).json({
      success: true,
      message: `Approved ${approvedCount} questions.`,
      approvedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save extracted & approved questions into the actual Examination Question Bank.
 * POST /api/v1/exams/:examId/questions/extraction/:jobId/save
 */
export const saveExtractedQuestionsToExam = async (req, res, next) => {
  try {
    const { examId, jobId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status === "in_progress" || exam.status === "completed") {
      return res.status(400).json({
        message: "Cannot add questions to an examination that is in progress or completed.",
      });
    }

    const job = await QuestionExtractionJob.findOne({ _id: jobId, examId });
    if (!job) {
      return res.status(404).json({ message: "Extraction job not found." });
    }

    if (job.isSavedToExam && job.savedQuestionIds?.length > 0) {
      return res.status(200).json({
        success: true,
        savedCount: job.savedQuestionIds.length,
        message: `Questions were already saved to this examination (${job.savedQuestionIds.length} questions).`,
      });
    }

    // Filter questions that are ready to save (approved or successfully extracted)
    const questionsToSave = job.extractedQuestions.filter(
      (q) => q.status === "approved" || q.status === "successfully_extracted"
    );

    if (questionsToSave.length === 0) {
      return res.status(400).json({
        message: "No approved questions to save. Please review and approve questions first.",
      });
    }

    const savedQuestionDocs = [];

    // Save in sequence to preserve question order and indexing
    for (const item of questionsToSave) {
      const testCases = [
        ...(item.sampleTestCases || []).map((tc) => ({
          input: normalizeSampleContent(tc.input || "", "input"),
          expectedOutput: normalizeSampleContent(tc.expectedOutput || "", "output"),
          isHidden: false,
          timeLimitMs: 3000,
        })),
        ...(item.hiddenTestCases || []).map((tc) => ({
          input: normalizeSampleContent(tc.input || "", "input"),
          expectedOutput: normalizeSampleContent(tc.expectedOutput || "", "output"),
          isHidden: true,
          timeLimitMs: 3000,
        })),
      ];

      const questionDoc = await ExamQuestion.create({
        examId: exam._id,
        questionNumber: item.originalQuestionNumber || `Q${item.orderIndex}`,
        orderIndex: item.orderIndex || 0,
        source: "bulk_extracted",
        contentType: item.contentType || "text",
        hasPatternOrMatrix: item.contentType === "pattern" || item.contentType === "matrix",
        matrixData: item.matrixData || null,
        title: decodeHtmlEntities(item.title.trim()),
        problemStatement: cleanProblemStatement(item.problemStatement),
        inputFormat: decodeHtmlEntities(item.inputFormat || ""),
        outputFormat: decodeHtmlEntities(item.outputFormat || ""),
        constraints: decodeHtmlEntities(item.constraints || ""),
        difficulty: item.difficulty || "Medium",
        marks: item.marks || 100,
        testCases,
        extractionMeta: {
          jobId: job._id,
          fileName: job.fileName,
          originalQuestionNumber: item.originalQuestionNumber,
          sourcePageNumber: item.sourcePageNumber || 1,
        },
      });

      savedQuestionDocs.push(questionDoc._id);
    }

    // Mark job as saved and record created question IDs
    job.isSavedToExam = true;
    job.savedQuestionIds = savedQuestionDocs;
    await job.save();

    // Clean up temporary file from disk
    if (job.temporaryFilePath && fs.existsSync(job.temporaryFilePath)) {
      fs.unlink(job.temporaryFilePath, () => {});
    }

    // Audit log
    await ExamAuditLog.create({
      examId: exam._id,
      actorId: req.user.userId,
      action: "bulk_questions_extracted",
      details: {
        jobId: job._id,
        fileName: job.fileName,
        savedCount: savedQuestionDocs.length,
      },
    });

    res.status(200).json({
      success: true,
      savedCount: savedQuestionDocs.length,
      message: `Successfully saved ${savedQuestionDocs.length} questions to ${exam.title}.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel or clean up an extraction job.
 * DELETE /api/v1/exams/:examId/questions/extraction/:jobId
 */
export const deleteExtractionJob = async (req, res, next) => {
  try {
    const { examId, jobId } = req.params;
    const job = await QuestionExtractionJob.findOne({ _id: jobId, examId });

    if (!job) {
      return res.status(404).json({ message: "Extraction job not found." });
    }

    // Clean up temporary file if present
    if (job.temporaryFilePath && fs.existsSync(job.temporaryFilePath)) {
      fs.unlink(job.temporaryFilePath, () => {});
    }

    await QuestionExtractionJob.findByIdAndDelete(jobId);

    res.status(200).json({
      success: true,
      message: "Extraction job and temporary files cleaned up.",
    });
  } catch (error) {
    next(error);
  }
};
