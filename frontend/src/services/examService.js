import api from "./api";

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

export const allocateExamQuestions = async (examId) => {
  const response = await api.post(`/exams/${examId}/allocate`);
  return response.data;
};

export const getExamAllocations = async (examId) => {
  const response = await api.get(`/exams/${examId}/allocations`);
  return response.data;
};

export const startExam = async (examId) => {
  const response = await api.post(`/exams/${examId}/start`);
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

export const getMyAssignedQuestion = async (examId) => {
  const response = await api.get(`/exams/${examId}/my-question`);
  return response.data;
};

export const autosaveAnswerDraft = async (examId, answerText) => {
  const response = await api.post(`/exams/${examId}/answers/autosave`, {
    answerText,
  });
  return response.data;
};

export const evaluatePaperAnswer = async (examId, answerText) => {
  const response = await api.post(`/exams/${examId}/answers/evaluate`, {
    answerText,
  });
  return response.data;
};

export const runExamCode = async (examId, code) => {
  const response = await api.post(`/exams/${examId}/compiler/run`, { code });
  return response.data;
};

export const submitExamCode = async (examId, code) => {
  const response = await api.post(`/exams/${examId}/compiler/submit`, { code });
  return response.data;
};

export const getStudentExamCompletion = async (examId) => {
  const response = await api.get(`/exams/${examId}/completion`);
  return response.data;
};
