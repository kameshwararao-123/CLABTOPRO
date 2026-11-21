import express from "express";
import {
  createExam,
  getFacultyExams,
  getExamById,
  updateExam,
  deleteExam,
  addExamQuestion,
  updateExamQuestion,
  deleteExamQuestion,
  getCandidateStudents,
  setParticipatingStudents,
  allocateExamQuestions,
  getExamAllocations,
  startExam,
  completeExam,
  getExamMonitoring,
  getStudentExams,
  getStudentExamInstructions,
  acknowledgeInstructions,
  getMyAssignedQuestion,
  autosaveAnswerDraft,
  evaluatePaperAnswer,
  runExamCode,
  submitExamCode,
  getStudentExamCompletion,
} from "../controllers/examController.js";
import {
  uploadQuestionsMiddleware,
  uploadExamQuestions,
  getExtractionJobStatus,
  getExtractedQuestionsPreview,
  updateExtractedQuestion,
  deleteExtractedQuestion,
  approveAllExtractedQuestions,
  saveExtractedQuestionsToExam,
  deleteExtractionJob,
} from "../controllers/examQuestionUploadController.js";
import { authMiddleware } from "../middleware/auth.js";
import { adminMiddleware } from "../middleware/admin.js";
import { executionRateLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

// =========================================================================
// FACULTY / ADMIN EXAM ROUTES
// =========================================================================
router.post("/", authMiddleware, adminMiddleware, createExam);
router.get("/faculty", authMiddleware, adminMiddleware, getFacultyExams);
router.get("/students-candidates", authMiddleware, adminMiddleware, getCandidateStudents);
router.get("/:examId", authMiddleware, adminMiddleware, getExamById);
router.patch("/:examId", authMiddleware, adminMiddleware, updateExam);
router.delete("/:examId", authMiddleware, adminMiddleware, deleteExam);

// Question Management
router.post("/:examId/questions", authMiddleware, adminMiddleware, addExamQuestion);
router.put("/questions/:questionId", authMiddleware, adminMiddleware, updateExamQuestion);
router.delete("/questions/:questionId", authMiddleware, adminMiddleware, deleteExamQuestion);

// Bulk Question Upload & AI Extraction Management
router.post(
  "/:examId/questions/upload",
  authMiddleware,
  adminMiddleware,
  uploadQuestionsMiddleware,
  uploadExamQuestions
);
router.get(
  "/:examId/questions/extraction/:jobId",
  authMiddleware,
  adminMiddleware,
  getExtractionJobStatus
);
router.get(
  "/:examId/questions/extraction/:jobId/preview",
  authMiddleware,
  adminMiddleware,
  getExtractedQuestionsPreview
);
router.patch(
  "/:examId/questions/extraction/:jobId/questions/:questionId",
  authMiddleware,
  adminMiddleware,
  updateExtractedQuestion
);
router.delete(
  "/:examId/questions/extraction/:jobId/questions/:questionId",
  authMiddleware,
  adminMiddleware,
  deleteExtractedQuestion
);
router.post(
  "/:examId/questions/extraction/:jobId/approve-all",
  authMiddleware,
  adminMiddleware,
  approveAllExtractedQuestions
);
router.post(
  "/:examId/questions/extraction/:jobId/save",
  authMiddleware,
  adminMiddleware,
  saveExtractedQuestionsToExam
);
router.delete(
  "/:examId/questions/extraction/:jobId",
  authMiddleware,
  adminMiddleware,
  deleteExtractionJob
);

// Student Roster & Allocation
router.post("/:examId/students", authMiddleware, adminMiddleware, setParticipatingStudents);
router.post("/:examId/allocate", authMiddleware, adminMiddleware, allocateExamQuestions);
router.get("/:examId/allocations", authMiddleware, adminMiddleware, getExamAllocations);

// Lifecycle & Monitoring
router.post("/:examId/start", authMiddleware, adminMiddleware, startExam);
router.post("/:examId/complete", authMiddleware, adminMiddleware, completeExam);
router.get("/:examId/monitoring", authMiddleware, adminMiddleware, getExamMonitoring);

// =========================================================================
// STUDENT EXAM ROUTES
// =========================================================================
router.get("/student/list", authMiddleware, getStudentExams);
router.get("/:examId/instructions", authMiddleware, getStudentExamInstructions);
router.post("/:examId/acknowledge-instructions", authMiddleware, acknowledgeInstructions);
router.get("/:examId/my-question", authMiddleware, getMyAssignedQuestion);
router.post("/:examId/answers/autosave", authMiddleware, autosaveAnswerDraft);
router.post("/:examId/answers/evaluate", authMiddleware, evaluatePaperAnswer);
router.post("/:examId/compiler/run", authMiddleware, executionRateLimiter, runExamCode);
router.post("/:examId/compiler/submit", authMiddleware, executionRateLimiter, submitExamCode);
router.get("/:examId/completion", authMiddleware, getStudentExamCompletion);

export default router;
