import api from "./api";
import { PHASE3_SECURITY_ENABLED } from "../configs/securityConfig";

// =========================================================================
// FACULTY EXAM SERVICE
// =========================================================================

export const createExam = async (examData) => {
  const response = await api.post("/exams", examData);
  return response.data;
};

export const getFacultyExams = async (params = {}) => {
  const response = await api.get("/exams/faculty", { params });
  return response.data;
};

export const getExamById = async (examId) => {
  const response = await api.get(`/exams/${examId}`);
  return response.data;
};

export const updateExam = async (examId, data) => {
  const response = await api.patch(`/exams/${examId}`, data);
  return response.data;
};

export const deleteExam = async (examId) => {
  const response = await api.delete(`/exams/${examId}`);
  return response.data;
};

export const addExamQuestion = async (examId, questionData) => {
  const response = await api.post(`/exams/${examId}/questions`, questionData);
  return response.data;
};

export const updateExamQuestion = async (questionId, questionData) => {
  const response = await api.put(`/exams/questions/${questionId}`, questionData);
  return response.data;
};

export const deleteExamQuestion = async (questionId) => {
  const response = await api.delete(`/exams/questions/${questionId}`);
  return response.data;
};

export const getCandidateStudents = async (search = "") => {
  const response = await api.get("/exams/students-candidates", {
    params: { search },
  });
  return response.data;
};

export const setParticipatingStudents = async (examId, studentIds) => {
  const response = await api.post(`/exams/${examId}/students`, { studentIds });
  return response.data;
};

export const allocateExamQuestions = async (examId, questionsPerStudent = 1) => {
  const response = await api.post(`/exams/${examId}/allocate`, { questionsPerStudent });
  return response.data;
};

export const getExamAllocations = async (examId) => {
  const response = await api.get(`/exams/${examId}/allocations`);
  return response.data;
};

export const startExam = async (examId, questionsPerStudent) => {
  const response = await api.post(`/exams/${examId}/start`, { questionsPerStudent });
  return response.data;
};

export const completeExam = async (examId) => {
  const response = await api.post(`/exams/${examId}/complete`);
  return response.data;
};

export const getExamMonitoring = async (examId) => {
  const response = await api.get(`/exams/${examId}/monitoring`);
  return response.data;
};

export const inspectStudentVivaExam = async (examId, studentId) => {
  const response = await api.get(`/exams/${examId}/students/${studentId}/viva-inspect`);
  return response.data;
};

// =========================================================================
// BULK QUESTION UPLOAD & AI EXTRACTION SERVICE
// =========================================================================

export const uploadExamQuestions = async (examId, formData) => {
  const response = await api.post(`/exams/${examId}/questions/upload`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const getExtractionJobStatus = async (examId, jobId) => {
  const response = await api.get(`/exams/${examId}/questions/extraction/${jobId}`);
  return response.data;
};

export const getExtractedQuestionsPreview = async (examId, jobId, params = {}) => {
  const response = await api.get(`/exams/${examId}/questions/extraction/${jobId}/preview`, {
    params,
  });
  return response.data;
};

export const updateExtractedQuestion = async (examId, jobId, questionId, data) => {
  const response = await api.patch(
    `/exams/${examId}/questions/extraction/${jobId}/questions/${questionId}`,
    data
  );
  return response.data;
};

export const deleteExtractedQuestion = async (examId, jobId, questionId) => {
  const response = await api.delete(
    `/exams/${examId}/questions/extraction/${jobId}/questions/${questionId}`
  );
  return response.data;
};

export const approveAllExtractedQuestions = async (examId, jobId) => {
  const response = await api.post(
    `/exams/${examId}/questions/extraction/${jobId}/approve-all`
  );
  return response.data;
};

export const saveExtractedQuestionsToExam = async (examId, jobId) => {
  const response = await api.post(`/exams/${examId}/questions/extraction/${jobId}/save`);
  return response.data;
};

export const deleteExtractionJob = async (examId, jobId) => {
  const response = await api.delete(`/exams/${examId}/questions/extraction/${jobId}`);
  return response.data;
};

// =========================================================================
// STUDENT EXAM SERVICE
// =========================================================================

export const enrollStudentWithCode = async (examCode) => {
  const response = await api.post("/exams/student/enroll", { examCode });
  return response.data;
};

export const getStudentExams = async (examType) => {
  const response = await api.get("/exams/student/list", {
    params: { examType },
  });
  return response.data;
};

export const getStudentExamInstructions = async (examId) => {
  const response = await api.get(`/exams/${examId}/instructions`);
  return response.data;
};

export const acknowledgeInstructions = async (examId) => {
  const response = await api.post(`/exams/${examId}/acknowledge-instructions`);
  return response.data;
};

export const getMyAssignedQuestion = async (examId, params = {}) => {
  const response = await api.get(`/exams/${examId}/my-question`, { params });
  return response.data;
};

export const autosaveAnswerDraft = async (examId, answerText, questionId, version) => {
  const response = await api.post(`/exams/${examId}/answers/autosave`, {
    answerText,
    questionId,
    version,
  });
  return response.data;
};

export const evaluatePaperAnswer = async (examId, answerText, questionId) => {
  const response = await api.post(`/exams/${examId}/answers/submit`, {
    answerText,
    questionId,
  });
  return response.data;
};

export const submitPaperAnswer = async (examId, answerText, questionId) => {
  const response = await api.post(`/exams/${examId}/answers/submit`, {
    answerText,
    questionId,
  });
  return response.data;
};

export const facultyEvaluateStudentPaper = async (examId, studentId, questionId) => {
  const response = await api.post(`/exams/${examId}/students/${studentId}/evaluate-paper`, {
    questionId,
  });
  return response.data;
};

export const facultyAuthorizeCompiler = async (examId, studentId, questionId) => {
  const response = await api.post(`/exams/${examId}/students/${studentId}/authorize-compiler`, {
    questionId,
  });
  return response.data;
};

export const facultyReturnToNotepad = async (examId, studentId, questionId, feedback) => {
  const response = await api.post(`/exams/${examId}/students/${studentId}/return-to-notepad`, {
    questionId,
    feedback,
  });
  return response.data;
};

export const getStudentConceptualReport = async (examId, studentId, questionId) => {
  const response = await api.get(`/exams/${examId}/students/${studentId}/conceptual-report`, {
    params: { questionId },
  });
  return response.data;
};

export const runExamCode = async (examId, code, questionId) => {
  const response = await api.post(`/exams/${examId}/compiler/run`, {
    code,
    questionId,
  });
  return response.data;
};

export const submitExamCode = async (examId, code, questionId) => {
  const response = await api.post(`/exams/${examId}/compiler/submit`, {
    code,
    questionId,
  });
  return response.data;
};

export const autosaveCodeDraft = async (examId, code, questionId, version) => {
  const response = await api.post(`/exams/${examId}/code/autosave`, {
    code,
    questionId,
    version,
  });
  return response.data;
};

export const logExamSecurityEvent = async (examId, eventType, details = {}) => {
  // If Phase 3 security is temporarily disabled, avoid generating new security events
  if (!PHASE3_SECURITY_ENABLED) {
    return { success: true, disabled: true };
  }

  try {
    const response = await api.post(`/exams/${examId}/security-event`, {
      eventType,
      details,
      timestamp: new Date(),
    });
    return response.data;
  } catch (err) {
    // Suppress security log failure so student UI doesn't crash
    console.warn("Security event log failed", err);
  }
};

export const endStudentExam = async (examId) => {
  const response = await api.post(`/exams/${examId}/student/end`);
  return response.data;
};

export const expireStudentExam = async (examId) => {
  const response = await api.post(`/exams/${examId}/student/expire`);
  return response.data;
};

export const getStudentExamCompletion = async (examId) => {
  const response = await api.get(`/exams/${examId}/completion`);
  return response.data;
};

export const getFacultyStudentCompletion = async (examId, studentId) => {
  const response = await api.get(`/exams/${examId}/students/${studentId}/completion`);
  return response.data;
};

// =========================================================================
// STUDENT VIVA MCQ EXAM SERVICE
// =========================================================================

export const getVivaExamInstructions = async (examId) => {
  const response = await api.get(`/exams/${examId}/viva/instructions`);
  return response.data;
};

export const acknowledgeVivaInstructions = async (examId) => {
  const response = await api.post(`/exams/${examId}/viva/acknowledge`);
  return response.data;
};

export const getVivaExamQuestions = async (examId) => {
  const response = await api.get(`/exams/${examId}/viva/questions`);
  return response.data;
};

export const saveVivaAnswerDraft = async (examId, questionId, selectedOption, isMarkedForReview = false) => {
  const response = await api.post(`/exams/${examId}/viva/answers/draft`, {
    questionId,
    selectedOption,
    isMarkedForReview,
  });
  return response.data;
};

export const submitVivaExam = async (examId, answers = {}) => {
  const response = await api.post(`/exams/${examId}/viva/submit`, { answers });
  return response.data;
};

export const getVivaStudentResults = async (examId) => {
  const response = await api.get(`/exams/${examId}/viva/results`);
  return response.data;
};
