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
  extendExamDuration,
  getExamMonitoring,
  getExamFinalReports,
  inspectStudentVivaExam,
  getStudentExams,
  getStudentExamInstructions,
  acknowledgeInstructions,
  getMyAssignedQuestion,
  autosaveAnswerDraft,
  autosaveCodeDraft,
  logExamSecurityEvent,
  endStudentExam,
  expireStudentExam,
  evaluatePaperAnswer,
  runExamCode,
  submitExamCode,
  getStudentExamCompletion,
  submitStudentPaperAnswer,
  facultyEvaluateStudentPaper,
  facultyAuthorizeCompiler,
  facultyReturnToNotepad,
  getStudentConceptualReport,
  getVivaExamDetailsAndInstructions,
  acknowledgeVivaInstructions,
  getVivaExamQuestions,
  saveVivaAnswerDraft,
  submitVivaExam,
  getVivaStudentResults,
  enrollStudentWithCode,
  getAIEvaluationQueueStatus,
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
router.patch("/:examId/extend-duration", authMiddleware, adminMiddleware, extendExamDuration);
router.get("/:examId/monitoring", authMiddleware, adminMiddleware, getExamMonitoring);
router.get("/:examId/students/:studentId/viva-inspect", authMiddleware, adminMiddleware, inspectStudentVivaExam);

// Faculty-Controlled AI Evaluation & Authorization
router.post(
  "/:examId/students/:studentId/evaluate-paper",
  authMiddleware,
  adminMiddleware,
  facultyEvaluateStudentPaper
);
router.post(
  "/:examId/students/:studentId/authorize-compiler",
  authMiddleware,
  adminMiddleware,
  facultyAuthorizeCompiler
);
router.post(
  "/:examId/students/:studentId/return-to-notepad",
  authMiddleware,
  adminMiddleware,
  facultyReturnToNotepad
);
router.get(
  "/:examId/students/:studentId/conceptual-report",
  authMiddleware,
  adminMiddleware,
  getStudentConceptualReport
);
router.get(
  "/:examId/final-reports",
  authMiddleware,
  adminMiddleware,
  getExamFinalReports
);

// =========================================================================
// STUDENT EXAM ROUTES
// =========================================================================
router.post("/student/enroll", authMiddleware, enrollStudentWithCode);
router.get("/student/list", authMiddleware, getStudentExams);
router.get("/:examId/instructions", authMiddleware, getStudentExamInstructions);
router.post("/:examId/acknowledge-instructions", authMiddleware, acknowledgeInstructions);
router.get("/:examId/my-question", authMiddleware, getMyAssignedQuestion);
router.post("/:examId/answers/autosave", authMiddleware, autosaveAnswerDraft);
router.post("/:examId/code/autosave", authMiddleware, autosaveCodeDraft);
router.post("/:examId/security-event", authMiddleware, logExamSecurityEvent);
router.post("/:examId/student/end", authMiddleware, endStudentExam);
router.post("/:examId/student/expire", authMiddleware, expireStudentExam);
router.post("/:examId/answers/submit", authMiddleware, submitStudentPaperAnswer);
router.post("/:examId/answers/evaluate", authMiddleware, submitStudentPaperAnswer);
router.post("/:examId/compiler/run", authMiddleware, executionRateLimiter, runExamCode);
router.post("/:examId/compiler/submit", authMiddleware, executionRateLimiter, submitExamCode);
router.get("/:examId/completion", authMiddleware, getStudentExamCompletion);
router.get("/:examId/students/:studentId/completion", authMiddleware, adminMiddleware, getStudentExamCompletion);
router.get("/:examId/ai-evaluations/status", authMiddleware, adminMiddleware, getAIEvaluationQueueStatus);

// Viva MCQ Student Routes
router.get("/:examId/viva/instructions", authMiddleware, getVivaExamDetailsAndInstructions);
router.post("/:examId/viva/acknowledge", authMiddleware, acknowledgeVivaInstructions);
router.get("/:examId/viva/questions", authMiddleware, getVivaExamQuestions);
router.post("/:examId/viva/answers/draft", authMiddleware, saveVivaAnswerDraft);
router.post("/:examId/viva/submit", authMiddleware, submitVivaExam);
router.get("/:examId/viva/results", authMiddleware, getVivaStudentResults);

export default router;
