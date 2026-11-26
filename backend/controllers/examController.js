
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import ExamQuestion from "../models/ExamQuestion.js";
import ExamAllocation from "../models/ExamAllocation.js";
import StudentExamProgress from "../models/StudentExamProgress.js";
import ExamAnswerSubmission from "../models/ExamAnswerSubmission.js";
import ExamCodeSubmission, {
  sanitizeExamCodeSubmissionForStudent,
} from "../models/ExamCodeSubmission.js";
import ExamAuditLog from "../models/ExamAuditLog.js";
import User from "../models/User.js";
import {
  evaluateConceptualAnswer,
  generateConceptualFallback,
} from "../services/examAIService.js";
import aiEvaluationQueue from "../services/aiEvaluationQueue.js";
import AIEvaluationJob from "../models/AIEvaluationJob.js";
import { judgeSubmission, runCCode, ExecutionServiceError } from "../services/judgeService.js";
import submissionQueue from "../services/submissionQueue.js";
import { parseGccDiagnostics } from "../utils/compilerParser.js";
import { PHASE3_SECURITY_ENABLED } from "../configs/securityConfig.js";

const isCompletedProgressStatus = (status) =>
  status === "completed" || status === "successfully_completed";

export const getExamEndTimeMs = (exam) => {
  if (!exam) return null;
  if (exam.officialEndTime) {
    return new Date(exam.officialEndTime).getTime();
  }
  if (exam.startedAt && exam.durationMinutes) {
    return new Date(exam.startedAt).getTime() + Number(exam.durationMinutes) * 60 * 1000;
  }
  return null;
};

// Helper: Fisher-Yates Shuffle
export const fisherYatesShuffle = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Generate a unique, readable exam code (e.g. CLAB9482 or EXAM5821).
 */
export const generateUniqueExamCode = async (prefix = "CLAB") => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 15; attempt++) {
    let randomPart = "";
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const code = `${prefix}${randomPart}`;
    // If database connection is active, ensure uniqueness in DB; otherwise return code
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const exists = await Exam.findOne({ examCode: code }).select("_id").lean();
      if (!exists) {
        return code;
      }
    } else {
      return code;
    }
  }
  // Fallback with timestamp slice
  return `${prefix}${Date.now().toString(36).toUpperCase().slice(-4)}`;
};

/**
 * Select k distinct questions for a student using Fisher-Yates shuffle.
 * Ensures a student never receives duplicate questions within their assignment.
 * When multiple students are allocated, maximizes combination diversity.
 */
export const selectDistinctQuestionsForStudent = (questions, k, usedCombos = new Set()) => {
  let selected = [];
  let attempts = 0;
  let comboKey = "";

  do {
    const shuffled = fisherYatesShuffle(questions);
    selected = shuffled.slice(0, k);
    comboKey = selected
      .map((q) => (q._id ? q._id.toString() : String(q)))
      .sort()
      .join(",");
    attempts++;
  } while (usedCombos.has(comboKey) && attempts < 30);

  usedCombos.add(comboKey);
  return selected;
};

// =========================================================================
// FACULTY / ADMIN EXAM ACTIONS
// =========================================================================

/**
 * Create a new examination (Internal or External).
 */
export const createExam = async (req, res, next) => {
  try {
    const {
      title,
      description,
      subject,
      academicYear,
      semester,
      examType,
      examDate,
      startTime,
      endTime,
      durationMinutes,
      totalMarks,
      instructions,
      maxConceptualAttempts,
      marksPerQuestion,
      negativeMarking,
      negativeMarkingEnabled,
      maxAttempts,
      status,
    } = req.body;

    if (!title || !subject || !academicYear || !semester || !examType || !examDate) {
      return res.status(400).json({
        message: "Title, subject, academic year, semester, exam type, and exam date are required.",
      });
    }

    if (!["internal", "external", "viva"].includes(examType)) {
      return res.status(400).json({
        message: "Invalid exam type. Must be 'internal', 'external', or 'viva'.",
      });
    }

    const examCode = await generateUniqueExamCode(
      examType === "viva" ? "VIVA" : examType === "internal" ? "INT" : "EXT"
    );

    const exam = await Exam.create({
      title,
      description: description || "",
      subject,
      academicYear,
      semester,
      examType,
      examCode,
      examDate: new Date(examDate),
      startTime: startTime || "",
      endTime: endTime || "",
      durationMinutes: durationMinutes ? Number(durationMinutes) : examType === "viva" ? 30 : 180,
      totalMarks: totalMarks ? Number(totalMarks) : 100,
      instructions: instructions || undefined,
      maxConceptualAttempts: maxConceptualAttempts ? Number(maxConceptualAttempts) : 3,
      marksPerQuestion: marksPerQuestion !== undefined ? Number(marksPerQuestion) : 1,
      negativeMarking: negativeMarking !== undefined ? Number(negativeMarking) : 0,
      negativeMarkingEnabled: Boolean(negativeMarkingEnabled),
      maxAttempts: maxAttempts !== undefined ? Number(maxAttempts) : 1,
      status: status && ["draft", "scheduled"].includes(status) ? status : "draft",
      createdBy: req.user.userId,
    });

    await ExamAuditLog.create({
      examId: exam._id,
      actorId: req.user.userId,
      action: "exam_created",
      details: { title: exam.title, examType: exam.examType },
    });

    res.status(201).json({
      message: `${examType === "viva" ? "Viva" : examType === "internal" ? "Internal" : "External"} Exam created successfully.`,
      exam,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all exams for faculty with optional type filter.
 */
export const getFacultyExams = async (req, res, next) => {
  try {
    const { examType, status } = req.query;
    const filter = {};
    if (examType && ["internal", "external", "viva"].includes(examType)) {
      filter.examType = examType;
    }
    if (status) {
      filter.status = status;
    }

    const exams = await Exam.find(filter)
      .populate("createdBy", "username email")
      .sort({ examDate: -1, createdAt: -1 })
      .lean();

    // Attach count of questions and participating students
    const examIds = exams.map((e) => e._id);
    const [questionCounts, allocationCounts] = await Promise.all([
      ExamQuestion.aggregate([
        { $match: { examId: { $in: examIds } } },
        { $group: { _id: "$examId", count: { $sum: 1 } } },
      ]),
      ExamAllocation.aggregate([
        { $match: { examId: { $in: examIds } } },
        { $group: { _id: "$examId", count: { $sum: 1 } } },
      ]),
    ]);

    const qMap = new Map(questionCounts.map((q) => [q._id.toString(), q.count]));
    const aMap = new Map(allocationCounts.map((a) => [a._id.toString(), a.count]));

    const enrichedExams = exams.map((e) => ({
      ...e,
      questionCount: qMap.get(e._id.toString()) || 0,
      studentCount: e.participatingStudents?.length || 0,
      allocatedCount: aMap.get(e._id.toString()) || 0,
    }));

    res.status(200).json({ exams: enrichedExams });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single exam details for faculty management.
 */
export const getExamById = async (req, res, next) => {
  try {
    const { examId } = req.params;
    let exam = await Exam.findById(examId)
      .populate("createdBy", "username email")
      .populate("participatingStudents", "username rollNo email")
      .lean();

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    // Auto-generate examCode for existing legacy exams that don't have one yet
    if (!exam.examCode) {
      const newCode = await generateUniqueExamCode(
        exam.examType === "viva" ? "VIVA" : exam.examType === "internal" ? "INT" : "EXT"
      );
      await Exam.updateOne({ _id: examId }, { $set: { examCode: newCode } });
      exam.examCode = newCode;
    }

    const [questions, allocations] = await Promise.all([
      ExamQuestion.find({ examId }).sort({ createdAt: 1 }).lean(),
      ExamAllocation.find({ examId })
        .populate("studentId", "username rollNo email")
        .populate("questionId", "title difficulty questionNumber marks")
        .populate("assignedQuestionIds", "title difficulty questionNumber marks")
        .sort({ "studentId.rollNo": 1, allocatedAt: 1 })
        .lean(),
    ]);

    const formattedAllocations = allocations.map((alloc) => {
      const assigned =
        alloc.assignedQuestionIds && alloc.assignedQuestionIds.length > 0
          ? alloc.assignedQuestionIds
          : alloc.questionId
          ? [alloc.questionId]
          : [];
      return {
        ...alloc,
        assignedQuestionIds: assigned,
        totalAssigned: assigned.length,
        questionNumbers: assigned.map(
          (q, idx) => q.questionNumber || `Q${idx + 1}`
        ),
      };
    });

    res.status(200).json({
      exam,
      questions,
      allocations: formattedAllocations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update exam details (only allowed in draft or scheduled state).
 */
export const updateExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status === "in_progress" || exam.status === "completed") {
      return res.status(400).json({
        message: "Cannot modify an examination that is in progress or completed.",
      });
    }

    const allowedUpdates = [
      "title",
      "description",
      "subject",
      "academicYear",
      "semester",
      "examDate",
      "startTime",
      "endTime",
      "durationMinutes",
      "totalMarks",
      "instructions",
      "maxConceptualAttempts",
      "marksPerQuestion",
      "negativeMarking",
      "negativeMarkingEnabled",
      "maxAttempts",
      "status",
    ];

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        if (key === "examDate") {
          exam.examDate = new Date(req.body[key]);
        } else {
          exam[key] = req.body[key];
        }
      }
    }

    await exam.save();

    await ExamAuditLog.create({
      examId: exam._id,
      actorId: req.user.userId,
      action: "exam_updated",
      details: { updatedFields: Object.keys(req.body) },
    });

    res.status(200).json({
      message: "Exam updated successfully.",
      exam,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete draft exam.
 */
export const deleteExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status !== "draft") {
      return res.status(400).json({
        message: "Only exams in 'draft' status can be deleted.",
      });
    }

    await Promise.all([
      Exam.findByIdAndDelete(examId),
      ExamQuestion.deleteMany({ examId }),
      ExamAllocation.deleteMany({ examId }),
      StudentExamProgress.deleteMany({ examId }),
      ExamAuditLog.deleteMany({ examId }),
    ]);

    res.status(200).json({ message: "Exam deleted successfully." });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// QUESTION MANAGEMENT
// =========================================================================

const normalizeEvaluationRubric = (rawRubric) => {
  if (!rawRubric) return undefined;

  // Case 1: If it's already an array
  if (Array.isArray(rawRubric) && rawRubric.length > 0) {
    const valid = rawRubric
      .filter((item) => item && (item.criterion || item.name || item.title))
      .map((item) => ({
        criterion: String(item.criterion || item.name || item.title || "Algorithm Correctness & Logic").trim(),
        weight: Number(item.weight) || 20,
        description: item.description ? String(item.description).trim() : "",
      }));
    if (valid.length > 0) return valid;
  }

  // Case 2: If it's an object with keys
  if (typeof rawRubric === "object" && !Array.isArray(rawRubric)) {
    const list = [];
    const algo = rawRubric.algorithmicApproachWeight ?? rawRubric.algorithmicApproach ?? rawRubric.algorithm;
    const logic = rawRubric.codeLogicCorrectnessWeight ?? rawRubric.codeLogicCorrectness ?? rawRubric.logicCorrectnessWeight ?? rawRubric.logicCorrectness ?? rawRubric.logic;

    if (algo !== undefined) {
      list.push({
        criterion: "Algorithmic Approach",
        weight: Number(algo) || 50,
        description: "Correct problem-solving approach, logical sequence of steps, algorithm selection, conditions/iterations, and edge case handling",
      });
    }
    if (logic !== undefined) {
      list.push({
        criterion: "Code Logic & Correctness",
        weight: Number(logic) || 50,
        description: "Correct implementation of algorithm, conditions, loops, calculations, data handling, program flow, edge cases, and expected output consistency",
      });
    }

    if (list.length > 0) return list;
  }

  return undefined;
};

/**
 * Add a question to an exam.
 */
export const addExamQuestion = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status === "in_progress" || exam.status === "completed") {
      return res.status(400).json({
        message: "Cannot add questions to an active or completed examination.",
      });
    }

    const {
      title,
      problemStatement,
      questionText,
      questionType,
      options,
      correctAnswer,
      negativeMarks,
      extractionStatus,
      inputFormat,
      outputFormat,
      constraints,
      explanation,
      difficulty,
      marks,
      evaluationRubric,
      testCases,
    } = req.body;

    const isMCQ = exam.examType === "viva" || questionType === "mcq";
    const resolvedText = questionText || problemStatement || "";
    const resolvedTitle = (title || resolvedText.slice(0, 80) || "Question").trim();

    if (!resolvedTitle || (!resolvedText && !isMCQ)) {
      return res.status(400).json({
        message: "Question title and problem statement/text are required.",
      });
    }

    const formattedTestCases = Array.isArray(testCases)
      ? testCases.map((tc) => ({
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          isHidden: Boolean(tc.isHidden),
          timeLimitMs: tc.timeLimitMs ? Number(tc.timeLimitMs) : 3000,
        }))
      : [];

    const question = await ExamQuestion.create({
      examId,
      questionType: isMCQ ? "mcq" : "coding",
      title: resolvedTitle,
      problemStatement: resolvedText,
      questionText: resolvedText,
      options: Array.isArray(options) ? options : [],
      correctAnswer: correctAnswer || "Answer Not Provided",
      negativeMarks: negativeMarks !== undefined ? Number(negativeMarks) : (exam.negativeMarkingEnabled ? exam.negativeMarking : 0),
      extractionStatus: extractionStatus || "Approved",
      inputFormat: inputFormat || "",
      outputFormat: outputFormat || "",
      constraints: constraints || "",
      explanation: explanation || "",
      difficulty: difficulty || "Medium",
      marks: marks ? Number(marks) : (isMCQ ? (exam.marksPerQuestion || 1) : 100),
      evaluationRubric: normalizeEvaluationRubric(evaluationRubric),
      testCases: formattedTestCases,
    });

    await ExamAuditLog.create({
      examId,
      actorId: req.user.userId,
      action: "question_added",
      details: { questionId: question._id, title: question.title },
    });

    res.status(201).json({
      message: "Question added successfully.",
      question,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an exam question.
 */
export const updateExamQuestion = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const question = await ExamQuestion.findById(questionId);

    if (!question) {
      return res.status(404).json({ message: "Question not found." });
    }

    const exam = await Exam.findById(question.examId);
    if (exam && (exam.status === "in_progress" || exam.status === "completed")) {
      return res.status(400).json({
        message: "Cannot modify questions once examination has started.",
      });
    }

    const allowed = [
      "title",
      "problemStatement",
      "questionText",
      "questionType",
      "options",
      "correctAnswer",
      "negativeMarks",
      "extractionStatus",
      "inputFormat",
      "outputFormat",
      "constraints",
      "explanation",
      "difficulty",
      "marks",
      "evaluationRubric",
      "testCases",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "evaluationRubric") {
          question.evaluationRubric = normalizeEvaluationRubric(req.body[key]);
        } else {
          question[key] = req.body[key];
        }
      }
    }

    await question.save();

    res.status(200).json({
      message: "Question updated successfully.",
      question,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an exam question.
 */
export const deleteExamQuestion = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const question = await ExamQuestion.findById(questionId);

    if (!question) {
      return res.status(404).json({ message: "Question not found." });
    }

    const exam = await Exam.findById(question.examId);
    if (exam && exam.status !== "draft") {
      return res.status(400).json({
        message: "Questions can only be removed while the exam is in draft status.",
      });
    }

    await ExamQuestion.findByIdAndDelete(questionId);
    // Remove any allocation referencing this question
    await ExamAllocation.deleteMany({ questionId });

    res.status(200).json({ message: "Question deleted successfully." });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// STUDENT SELECTION & RANDOM QUESTION ALLOCATION
// =========================================================================

/**
 * Search/List eligible students for exam participation.
 */
export const getCandidateStudents = async (req, res, next) => {
  try {
    const { search = "" } = req.query;
    const filter = { role: "student" };

    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ username: regex }, { rollNo: regex }, { email: regex }];
    }

    const students = await User.find(filter)
      .select("_id username rollNo email")
      .sort({ rollNo: 1, username: 1 })
      .limit(200)
      .lean();

    res.status(200).json({ students });
  } catch (error) {
    next(error);
  }
};

/**
 * Update participating students list for an exam.
 */
export const setParticipatingStudents = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds)) {
      return res.status(400).json({ message: "studentIds must be an array of student IDs." });
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status === "in_progress" || exam.status === "completed") {
      return res.status(400).json({
        message: "Cannot modify student roster after exam has started.",
      });
    }

    // Verify all student IDs exist
    const validStudents = await User.find({
      _id: { $in: studentIds },
      role: "student",
    }).select("_id");

    exam.participatingStudents = validStudents.map((s) => s._id);
    await exam.save();

    await ExamAuditLog.create({
      examId,
      actorId: req.user.userId,
      action: "roster_updated",
      details: { count: exam.participatingStudents.length },
    });

    res.status(200).json({
      message: "Participating students updated.",
      count: exam.participatingStudents.length,
      participatingStudents: exam.participatingStudents,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Allocate questions to participating students using Fisher-Yates shuffle.
 * Supports faculty-specified questionsPerStudent.
 * Guarantees that no student receives duplicate questions within their assignment.
 * Generates varied random combinations across students.
 */
export const allocateExamQuestions = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const { questionsPerStudent = 1 } = req.body || {};
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status === "in_progress" || exam.status === "completed") {
      return res.status(400).json({
        message: "Cannot allocate questions for an exam that is already in progress or completed.",
      });
    }

    const studentIds = exam.participatingStudents || [];
    if (studentIds.length === 0) {
      return res.status(400).json({
        message: "No participating students selected. Add students before allocating questions.",
      });
    }

    const k = parseInt(questionsPerStudent, 10);
    if (isNaN(k) || k < 1) {
      return res.status(400).json({
        message: "Number of questions per student must be at least 1.",
      });
    }

    const questions = await ExamQuestion.find({ examId })
      .select("_id title questionNumber difficulty marks")
      .lean();

    if (questions.length === 0) {
      return res.status(400).json({
        message: "No questions available in this examination. Please add or upload questions first.",
      });
    }

    if (k > questions.length) {
      return res.status(400).json({
        message: `Insufficient questions available! The exam has only ${questions.length} question(s) in the bank, but ${k} question(s) per student were requested. Maximum allowed is ${questions.length}.`,
      });
    }

    // Try dropping legacy unique index if it exists in MongoDB
    try {
      await ExamAllocation.collection.dropIndex("examId_1_questionId_1");
    } catch (_) {}

    // Clear previous draft allocations for this exam
    await ExamAllocation.deleteMany({ examId });

    // Select k distinct questions per student using Fisher-Yates shuffle
    const usedCombinations = new Set();
    const allocationsToInsert = studentIds.map((studentId) => {
      const selectedQuestions = selectDistinctQuestionsForStudent(questions, k, usedCombinations);
      const assignedQIds = selectedQuestions.map((q) => q._id);
      return {
        examId,
        studentId,
        questionId: assignedQIds[0], // backward compatibility
        assignedQuestionIds: assignedQIds,
        allocatedAt: new Date(),
      };
    });

    // Atomically insert all allocations (enforced by DB unique index { examId: 1, studentId: 1 })
    await ExamAllocation.insertMany(allocationsToInsert, { ordered: true });

    // Initialize or update StudentExamProgress records for all participating students
    const progressOps = allocationsToInsert.map((alloc) => {
      const qProgMap = {};
      alloc.assignedQuestionIds.forEach((qId) => {
        qProgMap[qId.toString()] = {
          questionId: qId,
          status: "not_started",
          conceptualAttemptsCount: 0,
          lastConceptualAnswer: "",
          compilerAllowed: false,
          currentCode: "",
          isCompleted: false,
        };
      });

      return {
        updateOne: {
          filter: { examId, studentId: alloc.studentId },
          update: {
            $setOnInsert: {
              examId,
              studentId: alloc.studentId,
              status: "not_started",
              instructionsAcknowledged: false,
              compilerAllowed: false,
            },
            $set: {
              questionProgress: qProgMap,
            },
          },
          upsert: true,
        },
      };
    });
    await StudentExamProgress.bulkWrite(progressOps, { ordered: false });

    exam.questionsPerStudent = k;
    exam.status = "allocated";
    await exam.save();

    await ExamAuditLog.create({
      examId,
      actorId: req.user.userId,
      action: "questions_allocated",
      details: {
        studentCount: studentIds.length,
        questionCount: questions.length,
        questionsPerStudent: k,
      },
    });

    const report = await ExamAllocation.find({ examId })
      .populate("studentId", "username rollNo email")
      .populate("questionId", "title difficulty questionNumber marks")
      .populate("assignedQuestionIds", "title difficulty questionNumber marks")
      .sort({ "studentId.rollNo": 1, allocatedAt: 1 })
      .lean();

    const formattedReport = report.map((alloc) => {
      const assigned =
        alloc.assignedQuestionIds && alloc.assignedQuestionIds.length > 0
          ? alloc.assignedQuestionIds
          : alloc.questionId
          ? [alloc.questionId]
          : [];
      return {
        ...alloc,
        assignedQuestionIds: assigned,
        totalAssigned: assigned.length,
        questionNumbers: assigned.map(
          (q, idx) => q.questionNumber || `Q${idx + 1}`
        ),
      };
    });

    res.status(200).json({
      message: `Successfully allocated ${k} question(s) per student to all ${studentIds.length} participating students.`,
      allocationsCount: allocationsToInsert.length,
      questionsPerStudent: k,
      allocations: formattedReport,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get allocations report for an exam.
 */
export const getExamAllocations = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const allocations = await ExamAllocation.find({ examId })
      .populate("studentId", "username rollNo email")
      .populate("questionId", "title difficulty marks questionNumber")
      .populate("assignedQuestionIds", "title difficulty marks questionNumber")
      .sort({ "studentId.rollNo": 1, allocatedAt: 1 })
      .lean();

    const formattedAllocations = allocations.map((alloc) => {
      const assigned =
        alloc.assignedQuestionIds && alloc.assignedQuestionIds.length > 0
          ? alloc.assignedQuestionIds
          : alloc.questionId
          ? [alloc.questionId]
          : [];
      return {
        ...alloc,
        assignedQuestionIds: assigned,
        totalAssigned: assigned.length,
        questionNumbers: assigned.map(
          (q, idx) => q.questionNumber || `Q${idx + 1}`
        ),
      };
    });

    res.status(200).json({ allocations: formattedAllocations });
  } catch (error) {
    next(error);
  }
};

/**
 * Student enrolls in an examination using an Exam Code.
 * Validates the code, ensures enrollment is open, registers the student in MongoDB,
 * and sets status to successfully enrolled.
 *
 * CRITICAL WORKFLOW REQUIREMENT:
 * - NO question allocation at enrollment time.
 * - NO assignedQuestionIds generated or saved at this stage.
 * - NO questions, test cases, or question IDs returned or exposed.
 * - The student remains on a waiting screen until faculty starts the exam.
 */
export const enrollStudentWithCode = async (req, res, next) => {
  try {
    const studentId = req.user.userId;
    const { examCode } = req.body;

    if (!examCode || typeof examCode !== "string" || !examCode.trim()) {
      return res.status(400).json({
        message: "Invalid Exam Code. Please check and try again.",
      });
    }

    const normalizedCode = examCode.trim().toUpperCase();

    const exam = await Exam.findOne({ examCode: normalizedCode });
    if (!exam) {
      return res.status(404).json({
        message: "Invalid Exam Code. Please check and try again.",
      });
    }

    if (exam.status === "completed" || exam.status === "cancelled") {
      return res.status(400).json({
        message: "Enrollment for this examination is closed.",
      });
    }

    // Check if already enrolled (already-enrolled students are never blocked or invalidated)
    const alreadyParticipating = (exam.participatingStudents || []).some(
      (s) => s.toString() === studentId.toString()
    );

    if (alreadyParticipating) {
      return res.status(400).json({
        message: "You are already enrolled in this examination.",
      });
    }

    const ENROLLMENT_WINDOW_MS = 30 * 60 * 1000;
    const isExamInProgress = exam.status === "in_progress";

    if (isExamInProgress) {
      const startedAtMs = exam.startedAt ? new Date(exam.startedAt).getTime() : 0;
      const enrollmentDeadlineMs = startedAtMs + ENROLLMENT_WINDOW_MS;
      if (!startedAtMs || Date.now() >= enrollmentDeadlineMs) {
        return res.status(403).json({
          message: "Enrollment closed. The 30-minute enrollment window for this exam has expired.",
        });
      }
    } else if (exam.enrollmentClosed) {
      return res.status(400).json({
        message: "Enrollment for this examination is closed.",
      });
    }

    // Atomically register student in exam roster to prevent race conditions and enforce deadline server-side
    const atomicFilter = isExamInProgress
      ? {
          _id: exam._id,
          participatingStudents: { $ne: studentId },
          status: "in_progress",
          startedAt: { $gt: new Date(Date.now() - ENROLLMENT_WINDOW_MS) },
        }
      : {
          _id: exam._id,
          participatingStudents: { $ne: studentId },
          status: { $in: ["draft", "allocated", "scheduled"] },
        };

    const updatedExam = await Exam.findOneAndUpdate(
      atomicFilter,
      {
        $addToSet: { participatingStudents: studentId },
        $push: {
          enrolledStudents: {
            studentId,
            enrolledAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!updatedExam) {
      if (isExamInProgress) {
        return res.status(403).json({
          message: "Enrollment closed. The 30-minute enrollment window for this exam has expired.",
        });
      }
      return res.status(400).json({
        message: "Enrollment failed. You may already be enrolled or enrollment has closed.",
      });
    }

    // If joining an already-active coding exam within the 30-minute window, allocate questions for this student
    let allocatedCount = 0;
    const initialQuestionProgress = {};
    if (isExamInProgress && exam.examType !== "viva") {
      const existingAlloc = await ExamAllocation.findOne({ examId: exam._id, studentId }).lean();
      if (!existingAlloc) {
        const questionPool = await ExamQuestion.find({
          examId: exam._id,
          questionType: { $ne: "mcq" },
        }).lean();
        if (questionPool.length > 0) {
          const k = Math.min(Math.max(1, Number(exam.questionsPerStudent) || 1), questionPool.length);
          const existingAllocs = await ExamAllocation.find({ examId: exam._id })
            .select("assignedQuestionIds")
            .lean();
          const usedCombos = new Set(
            existingAllocs
              .map((a) => (a.assignedQuestionIds || []).map((id) => id.toString()).sort().join(","))
              .filter(Boolean)
          );
          const selected = selectDistinctQuestionsForStudent(questionPool, k, usedCombos);
          const selectedIds = selected.map((q) => q._id);
          await ExamAllocation.create({
            examId: exam._id,
            studentId,
            questionId: selectedIds[0],
            assignedQuestionIds: selectedIds,
          });
          allocatedCount = selectedIds.length;
          for (const qId of selectedIds) {
            initialQuestionProgress[qId.toString()] = {
              questionId: qId,
              status: "not_started",
              conceptualStatus: "pending",
              conceptualAttemptsCount: 0,
              compilerAllowed: false,
            };
          }
        }
      }
    }

    // Initialize StudentExamProgress record
    await StudentExamProgress.findOneAndUpdate(
      { examId: exam._id, studentId },
      {
        $setOnInsert: {
          examId: exam._id,
          studentId,
          status: isExamInProgress ? "question_assigned" : "not_started",
          instructionsAcknowledged: false,
          allocatedCount,
          questionProgress: initialQuestionProgress,
        },
      },
      { upsert: true }
    );

    // Audit log
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await ExamAuditLog.create({
        examId: exam._id,
        actorId: studentId,
        action: "student_enrolled_via_code",
        details: {
          examCode: normalizedCode,
          enrolledDuringActiveWindow: isExamInProgress,
        },
      });
    }

    // Return enrolled status and waiting/active message
    res.status(200).json({
      message: isExamInProgress
        ? "You have successfully joined the active exam. You can start immediately."
        : "You have successfully joined the exam. Please wait for your faculty to start the exam.",
      enrollmentStatus: "Successfully Enrolled",
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        examType: exam.examType,
        status: exam.status,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
      },
    });
  } catch (error) {
    if (typeof next === "function") {
      next(error);
    } else {
      res.status(500).json({ message: error.message });
    }
  }
};

/**
 * Start Examination.
 * CRITICAL WORKFLOW REQUIREMENT:
 * Allocates questions to all enrolled students at exam start time using server-side Fisher-Yates shuffle.
 *
 * Sequence:
 * STEP 1: Verify authenticated faculty ownership / authorization.
 * STEP 2: Verify exam status (must not already be in_progress/completed) and lock enrollment.
 * STEP 3: Retrieve all successfully enrolled students from MongoDB.
 * STEP 4: Retrieve faculty-configured number of questions per student (questionsPerStudent).
 * STEP 5: Retrieve all approved questions available for allocation.
 * STEP 6: Validate that enough questions are available in the pool.
 * STEP 7: Randomly select exactly the configured number of distinct questions for every enrolled student.
 * STEP 8: Save each student's assignedQuestionIds permanently in MongoDB.
 * STEP 9: Verify every enrolled student has exactly the configured number of assigned questions.
 * STEP 10: Atomically transition exam status to in_progress and record startedAt / startedBy.
 * STEP 11: Respond with success so real-time clients/polling refresh to the live exam.
 */
export const startExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const requestedK = req.body?.questionsPerStudent;

    // STEP 1: Retrieve exam and verify authorization
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (
      req.user.role !== "admin" &&
      exam.createdBy.toString() !== req.user.userId.toString()
    ) {
      return res.status(403).json({
        message: "You do not have permission to start this examination.",
      });
    }

    // STEP 2: Verify status and prevent concurrent/duplicate start
    if (exam.status === "in_progress") {
      return res.status(400).json({ message: "Exam is already in progress." });
    }

    if (exam.status === "completed" || exam.status === "cancelled") {
      return res.status(400).json({
        message: `Cannot start an exam with status: ${exam.status}.`,
      });
    }

    // STEP 3: Retrieve all enrolled students
    const studentIds = (exam.participatingStudents || []).map((s) => s.toString());
    if (studentIds.length === 0) {
      return res.status(400).json({
        message: "Cannot start exam: No students have enrolled yet. Please wait for students to join using the Exam Code.",
      });
    }

    // STEP 4: Retrieve and validate questionsPerStudent
    let k = exam.questionsPerStudent || 1;
    if (requestedK !== undefined && requestedK !== null && requestedK !== "") {
      const parsedK = parseInt(requestedK, 10);
      if (!isNaN(parsedK) && parsedK >= 1) {
        k = parsedK;
        exam.questionsPerStudent = k;
      }
    }

    // STEP 5: Retrieve all questions available for allocation
    const questions = await ExamQuestion.find({ examId })
      .select("_id title questionNumber difficulty marks")
      .lean();

    if (questions.length === 0) {
      return res.status(400).json({
        message: "Cannot start exam: No questions available in this examination. Please add or upload questions first.",
      });
    }

    // STEP 6: Validate question availability against configured k
    if (k > questions.length) {
      return res.status(400).json({
        message: `Insufficient questions available! The exam has only ${questions.length} question(s) in the bank, but ${k} question(s) per student were configured. Maximum allowed is ${questions.length}.`,
      });
    }

    // STEP 7 & 8: Perform Fisher-Yates allocation for all enrolled students
    const usedCombinations = new Set();
    const allocationsToInsert = studentIds.map((studentId) => {
      const selectedQuestions = selectDistinctQuestionsForStudent(questions, k, usedCombinations);
      const assignedQIds = selectedQuestions.map((q) => q._id);
      return {
        examId,
        studentId,
        questionId: assignedQIds[0], // backward compatibility
        assignedQuestionIds: assignedQIds,
        allocatedAt: new Date(),
      };
    });

    // Clean up any stale draft allocations for this exam
    await ExamAllocation.deleteMany({ examId });

    // Atomically insert all fresh allocations
    await ExamAllocation.insertMany(allocationsToInsert, { ordered: true });

    // Initialize or update StudentExamProgress records for all participating students
    const progressOps = allocationsToInsert.map((alloc) => {
      const qProgMap = {};
      alloc.assignedQuestionIds.forEach((qId) => {
        qProgMap[qId.toString()] = {
          questionId: qId,
          status: "not_started",
          conceptualAttemptsCount: 0,
          lastConceptualAnswer: "",
          compilerAllowed: false,
          currentCode: "",
          isCompleted: false,
        };
      });

      return {
        updateOne: {
          filter: { examId, studentId: alloc.studentId },
          update: {
            $set: {
              examId,
              studentId: alloc.studentId,
              questionProgress: qProgMap,
            },
          },
          upsert: true,
        },
      };
    });

    if (progressOps.length > 0) {
      await StudentExamProgress.bulkWrite(progressOps);
    }

    // STEP 9: Verify that every enrolled student has exactly the configured number of assigned questions
    const savedAllocations = await ExamAllocation.find({ examId }).lean();
    if (savedAllocations.length !== studentIds.length) {
      // Rollback if incomplete
      await ExamAllocation.deleteMany({ examId });
      return res.status(500).json({
        message: "Question allocation failed to complete for all enrolled students. Please try starting the exam again.",
      });
    }

    const hasInvalidCount = savedAllocations.some(
      (a) => (a.assignedQuestionIds || []).length !== k
    );
    if (hasInvalidCount) {
      await ExamAllocation.deleteMany({ examId });
      return res.status(500).json({
        message: "Question allocation integrity check failed. Please try starting the exam again.",
      });
    }

    // STEP 10: Lock enrollment and transition exam status to in_progress
    exam.status = "in_progress";
    exam.enrollmentClosed = true;
    exam.startedAt = new Date();
    exam.officialEndTime = new Date(
      exam.startedAt.getTime() + (Number(exam.durationMinutes) || 180) * 60 * 1000
    );
    exam.startedBy = req.user.userId;
    await exam.save();

    // STEP 11: Audit log and respond
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await ExamAuditLog.create({
        examId,
        actorId: req.user.userId,
        action: "exam_started",
        details: {
          startedAt: exam.startedAt,
          studentCount: studentIds.length,
          questionsPerStudent: k,
          totalAllocations: savedAllocations.length,
        },
      });
    }

    res.status(200).json({
      message: "Examination has been started successfully and questions have been allocated to all enrolled students.",
      exam,
      allocationsCount: savedAllocations.length,
      questionsPerStudent: k,
    });
  } catch (error) {
    if (typeof next === "function") {
      next(error);
    } else {
      res.status(500).json({ message: error.message });
    }
  }
};

/**
 * Faculty extends the duration of an ongoing exam.
 * Adds extraMinutes to officialEndTime and durationMinutes without resetting startedAt
 * and without extending the 30-minute enrollment window.
 */
export const extendExamDuration = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const rawExtra = req.body?.extraMinutes ?? req.body?.minutes ?? req.body?.extendMinutes;
    const extraMinutes = Number(rawExtra);

    if (!Number.isFinite(extraMinutes) || extraMinutes <= 0 || extraMinutes > 360) {
      return res.status(400).json({
        message: "Please provide a valid extension between 1 and 360 minutes.",
      });
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status !== "in_progress") {
      return res.status(400).json({
        message: "Only an ongoing (in_progress) examination can be extended.",
      });
    }

    const currentEndMs = getExamEndTimeMs(exam) || Date.now();
    const newEndTime = new Date(currentEndMs + extraMinutes * 60 * 1000);

    exam.officialEndTime = newEndTime;
    exam.durationMinutes = (Number(exam.durationMinutes) || (exam.examType === "viva" ? 30 : 180)) + extraMinutes;
    exam.extendedMinutes = (Number(exam.extendedMinutes) || 0) + extraMinutes;
    await exam.save();

    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await ExamAuditLog.create({
        examId: exam._id,
        actorId: req.user?.userId,
        actorRole: req.user?.role || "admin",
        action: "EXAM_DURATION_EXTENDED",
        details: {
          extraMinutes,
          newDurationMinutes: exam.durationMinutes,
          officialEndTime: exam.officialEndTime,
        },
      });
    }

    res.status(200).json({
      message: `Exam duration extended by ${extraMinutes} minutes.`,
      exam,
      durationMinutes: exam.durationMinutes,
      extendedMinutes: exam.extendedMinutes,
      officialEndTime: exam.officialEndTime,
    });
  } catch (error) {
    if (typeof next === "function") {
      next(error);
    } else {
      res.status(500).json({ message: error.message });
    }
  }
};

/**
 * End/Complete examination by faculty.
 */
export const completeExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const facultyId = req.user.userId;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const completedAt = new Date();
    exam.status = "completed";
    exam.completedAt = completedAt;
    exam.completedBy = facultyId;
    await exam.save();

    // Mark all in-progress / not-yet-completed student progress records as completed due to faculty end
    if (typeof StudentExamProgress.updateMany === "function") {
      await StudentExamProgress.updateMany(
        {
          examId,
          status: { $nin: ["successfully_completed", "completed"] },
        },
        {
          $set: {
            status: "completed",
            completionReason: "faculty_ended",
            completedAt,
          },
        }
      );
    }

    await ExamAuditLog.create({
      examId,
      actorId: facultyId,
      actorRole: "faculty",
      action: "exam_completed_by_faculty",
      details: { completedAt, facultyId },
    });

    res.status(200).json({
      message: "Examination marked as completed.",
      exam,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Live Monitoring & Results overview for faculty.
 */
export const getExamMonitoring = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const applySelect = (query, fields) =>
      query && typeof query.select === "function" ? query.select(fields) : query;

    const examQuery = Exam.findById(examId);
    const exam = await (
      typeof examQuery?.select === "function"
        ? examQuery.select(
            "title subject examType status startedAt completedAt durationMinutes participatingStudents questionsPerStudent totalMarks"
          )
        : examQuery
    ).lean();

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    let [allocations, progresses, answerSubs, codeSubs, vivaQuestionBank] = await Promise.all([
      ExamAllocation.find({ examId })
        .populate("studentId", "username rollNo email")
        .populate("questionId", "title difficulty questionNumber marks")
        .populate("assignedQuestionIds", "title difficulty questionNumber marks")
        .lean(),
      applySelect(
        StudentExamProgress.find({ examId }),
        exam.examType === "viva"
          ? "-currentCode -lastConceptualAnswer -facultyFeedback"
          : "-currentCode -lastConceptualAnswer -facultyFeedback -vivaAnswers"
      ).lean(),
      applySelect(
        ExamAnswerSubmission.find({ examId }).sort({ submittedAt: -1 }),
        "studentId questionId status isApproved facultyDecision aiEvaluation.errorPercentage submittedAt attemptNumber"
      ).lean(),
      applySelect(
        ExamCodeSubmission.find({ examId }).sort({ submittedAt: -1 }),
        "studentId questionId status testCasesPassed totalTestCases allPassed executionTime submittedAt"
      ).lean(),
      exam.examType === "viva"
        ? applySelect(ExamQuestion.find({ examId }), "_id correctAnswer").lean()
        : Promise.resolve([]),
    ]);

    const vivaCorrectAnswerMap = new Map();
    for (const vq of vivaQuestionBank || []) {
      if (vq?._id) {
        vivaCorrectAnswerMap.set(
          vq._id.toString(),
          String(vq.correctAnswer || "").trim().toUpperCase()
        );
      }
    }

    // Fallback: If no allocations have been created yet, generate virtual entries for participating students
    if (allocations.length === 0 && exam.participatingStudents?.length > 0) {
      const partStudents = await User.find({ _id: { $in: exam.participatingStudents } })
        .select("username rollNo email")
        .lean();
      allocations = partStudents.map((st) => ({
        studentId: st,
        questionId: null,
        assignedQuestionIds: [],
      }));
    }

    const progressMap = new Map(progresses.map((p) => [p.studentId.toString(), p]));
    // Map of studentId -> latest ExamAnswerSubmission
    const latestAnswerMap = new Map();
    // Map of "studentId_questionId" -> latest ExamAnswerSubmission
    const latestQuestionAnswerMap = new Map();

    for (const a of answerSubs) {
      const sId = a.studentId.toString();
      if (!latestAnswerMap.has(sId)) {
        latestAnswerMap.set(sId, a);
      }
      if (a.questionId) {
        const sqKey = `${sId}_${a.questionId.toString()}`;
        if (!latestQuestionAnswerMap.has(sqKey)) {
          latestQuestionAnswerMap.set(sqKey, a);
        }
      }
    }

    const latestCodeMap = new Map();
    const latestQuestionCodeMap = new Map();
    for (const c of codeSubs) {
      const sId = c.studentId.toString();
      if (!latestCodeMap.has(sId)) {
        latestCodeMap.set(sId, c);
      }
      if (c.questionId) {
        const sqKey = `${sId}_${c.questionId.toString()}`;
        if (!latestQuestionCodeMap.has(sqKey)) {
          latestQuestionCodeMap.set(sqKey, c);
        }
      }
    }

    const rows = [];
    const seenVivaStudentIds = new Set();
    for (const alloc of allocations) {
      const student = alloc.studentId;
      const sId = student?._id?.toString() || "";
      if (exam.examType === "viva") {
        if (!sId || seenVivaStudentIds.has(sId)) continue;
        seenVivaStudentIds.add(sId);
      }
      const prog = progressMap.get(sId);

      const assigned =
        alloc.assignedQuestionIds && alloc.assignedQuestionIds.length > 0
          ? alloc.assignedQuestionIds
          : alloc.questionId
          ? [alloc.questionId]
          : [];
      const assignedTitles = assigned.map((q) => q.title).join(", ");

      // Calculate Solved Questions (only successfully submitted/completed questions, deduplicated by questionId)
      const uniqueAssignedIds = [];
      const seenAssignedIds = new Set();
      for (const qItem of assigned) {
        const itemKey = qItem?._id?.toString();
        if (itemKey && !seenAssignedIds.has(itemKey)) {
          seenAssignedIds.add(itemKey);
          uniqueAssignedIds.push(itemKey);
        }
      }
      const studentTotalAssigned = uniqueAssignedIds.length || exam.questionsPerStudent || 1;
      let studentSolvedQuestions = 0;
      for (const itemKey of uniqueAssignedIds) {
        const itemProg = prog?.questionProgress
          ? (prog.questionProgress.get ? prog.questionProgress.get(itemKey) : prog.questionProgress[itemKey])
          : null;
        const itemCode = latestQuestionCodeMap.get(`${sId}_${itemKey}`) || (uniqueAssignedIds.length === 1 ? latestCodeMap.get(sId) : null);
        const isItemSubmittedSuccess = Boolean(
          itemProg?.isCompleted ||
          itemProg?.status === "completed" ||
          itemProg?.status === "successfully_completed" ||
          (itemCode && itemCode.allPassed && itemCode.testCasesPassed > 0 && itemCode.testCasesPassed === itemCode.totalTestCases)
        );
        if (isItemSubmittedSuccess) {
          studentSolvedQuestions += 1;
        }
      }
      const solvedQuestionsLabel = `${studentSolvedQuestions}/${studentTotalAssigned}`;

      const questionsToIterate =
        exam.examType === "viva"
          ? [null]
          : assigned.length > 0
          ? assigned
          : [null];

      for (let qIndex = 0; qIndex < questionsToIterate.length; qIndex++) {
        const currentTargetQ = questionsToIterate[qIndex];
        const assignedQId = currentTargetQ?._id || null;
        const assignedQTitle = currentTargetQ?.title || "";

        // Resolve question-specific answer submission
        const sqKey = assignedQId ? `${sId}_${assignedQId.toString()}` : null;
        const ans = (sqKey && latestQuestionAnswerMap.get(sqKey)) || (assigned.length <= 1 ? latestAnswerMap.get(sId) : null);
        const code = (sqKey && latestQuestionCodeMap.get(sqKey)) || (assigned.length <= 1 ? latestCodeMap.get(sId) : null);

        // Resolve question-specific progress
        const qProg = assignedQId && prog?.questionProgress
          ? (prog.questionProgress.get ? prog.questionProgress.get(assignedQId.toString()) : prog.questionProgress[assignedQId.toString()])
          : null;

        const vivaAnswersObj = prog?.vivaAnswers
          ? (prog.vivaAnswers instanceof Map ? Object.fromEntries(prog.vivaAnswers) : prog.vivaAnswers)
          : {};

        const liveAttemptedCount = Object.values(vivaAnswersObj).filter(
          (a) => a && a.selectedOption && String(a.selectedOption).trim() !== ""
        ).length;

        const vivaAttempted = prog?.vivaResult?.attempted ?? liveAttemptedCount;
        const vivaTotalQuestions =
          exam.examType === "viva"
            ? (uniqueAssignedIds.length > 0
                ? uniqueAssignedIds.length
                : prog?.vivaResult?.totalQuestions ||
                  vivaCorrectAnswerMap.size ||
                  Number(exam.questionsPerStudent) ||
                  0)
            : 0;

        let liveVivaCorrectCount = 0;
        if (exam.examType === "viva" && prog?.vivaResult?.correct === undefined) {
          const targetQIds =
            uniqueAssignedIds.length > 0
              ? uniqueAssignedIds
              : [...vivaCorrectAnswerMap.keys()];
          for (const vqId of targetQIds) {
            const ansObj = vivaAnswersObj[vqId];
            const selected = ansObj?.selectedOption
              ? String(ansObj.selectedOption).trim().toUpperCase()
              : "";
            const expected = vivaCorrectAnswerMap.get(vqId) || "";
            if (selected && expected && expected !== "ANSWER NOT PROVIDED" && selected === expected) {
              liveVivaCorrectCount += 1;
            }
          }
        }
        const vivaCorrectCount =
          exam.examType === "viva"
            ? (prog?.vivaResult?.correct ?? liveVivaCorrectCount)
            : 0;

        // Check time expiration
        const examEnded = exam.status === "completed";
        const examTimeExpired = exam.startedAt && exam.durationMinutes
          ? Date.now() > new Date(exam.startedAt).getTime() + exam.durationMinutes * 60 * 1000
          : false;
        const isTimeExpired =
          (examEnded || examTimeExpired) &&
          prog?.status !== "completed" &&
          prog?.status !== "successfully_completed";

        const currentQStatus = qProg?.status || (assigned.length <= 1 ? prog?.status : "not_started");
        const currentQConceptualStatus = qProg?.conceptualStatus || (assigned.length <= 1 ? prog?.conceptualStatus : "pending");

        const hasSubmittedConceptual = Boolean(
          ans ||
          currentQStatus === "awaiting_faculty_evaluation" ||
          currentQConceptualStatus === "submitted" ||
          currentQConceptualStatus === "evaluated" ||
          currentQConceptualStatus === "approved" ||
          currentQStatus === "evaluating" ||
          currentQConceptualStatus === "evaluating" ||
          currentQStatus === "waiting_faculty_decision"
        );
        const hasApprovedConceptual = Boolean(
          (ans && ans.isApproved) ||
          qProg?.compilerAllowed ||
          (assigned.length <= 1 && prog?.compilerAllowed) ||
          qProg?.status === "coding_in_progress" ||
          qProg?.status === "compiler_access_granted"
        );
        const hasSubmittedCode = Boolean(code);
        const allTestsPassed = Boolean(
          code && code.allPassed && code.testCasesPassed > 0 && code.testCasesPassed === code.totalTestCases
        );

        const isSuccessfullyCompleted =
          (prog?.status === "completed" || prog?.status === "successfully_completed") &&
          (exam.examType === "viva" ||
            (studentSolvedQuestions >= studentTotalAssigned &&
              hasApprovedConceptual &&
              hasSubmittedCode &&
              allTestsPassed));

        let notepadStatus = "Pending";

        if (currentQStatus === "notepad_correction_required" || currentQConceptualStatus === "correction_required") {
          notepadStatus = "Correction Required";
        } else if (hasSubmittedConceptual) {
          notepadStatus = "Submitted";
        } else if (
          currentQStatus === "answer_in_progress" ||
          (qProg?.lastConceptualAnswer && qProg.lastConceptualAnswer.trim().length > 0) ||
          (assigned.length <= 1 && prog?.lastConceptualAnswer && prog.lastConceptualAnswer.trim().length > 0)
        ) {
          notepadStatus = "In Progress";
        }

        // Evaluation Action & Status determination for Faculty Control
        let aiEvaluationStatus = "Pending";
        let evaluationAction = "not_submitted"; // not_submitted | evaluate | evaluating | allow_to_code | return_to_notepad | approved | returned
        let canAllowToCode = false;
        let canReturnToNotepad = false;

        const latestError = ans?.aiEvaluation?.errorPercentage ?? qProg?.lastAIEvaluation?.errorPercentage ?? (assigned.length <= 1 ? prog?.lastAIEvaluation?.errorPercentage : null) ?? null;

        if (hasApprovedConceptual || (ans && ans.facultyDecision === "allow_to_code")) {
          aiEvaluationStatus = "Approved (Compiler Unlocked)";
          evaluationAction = "approved";
        } else if (currentQStatus === "notepad_correction_required" || currentQConceptualStatus === "correction_required" || (ans && ans.facultyDecision === "return_to_notepad")) {
          aiEvaluationStatus = latestError !== null ? `Returned (Error: ${latestError}%)` : "Correction Required";
          evaluationAction = "return_to_notepad";
          canReturnToNotepad = true;
        } else if (latestError !== null && (ans?.status === "evaluated" || currentQConceptualStatus === "evaluated" || currentQStatus === "waiting_faculty_decision")) {
          if (latestError < 50) {
            aiEvaluationStatus = `Evaluated (${latestError}% Error)`;
            evaluationAction = "allow_to_code";
            canAllowToCode = true;
          } else {
            aiEvaluationStatus = `Evaluated (${latestError}% Error)`;
            evaluationAction = "return_to_notepad";
            canReturnToNotepad = true;
          }
        } else if (
          ans?.status === "evaluating" ||
          currentQStatus === "evaluating" ||
          currentQConceptualStatus === "evaluating"
        ) {
          aiEvaluationStatus = "Evaluating...";
          evaluationAction = "evaluating";
        } else if (hasSubmittedConceptual) {
          aiEvaluationStatus = "Waiting for Faculty Evaluation";
          evaluationAction = "evaluate";
        } else {
          aiEvaluationStatus = "Not Submitted";
          evaluationAction = "not_submitted";
        }

        let codingStatus = "Pending";
        if (allTestsPassed) {
          codingStatus = "Passed";
        } else if (hasSubmittedCode) {
          codingStatus = "Submitted";
        } else if (hasApprovedConceptual) {
          codingStatus = "In Progress";
        }

        let testCasesStatus = "Pending";
        if (hasSubmittedCode) {
          testCasesStatus = `${code.testCasesPassed} / ${code.totalTestCases} Passed`;
        }

        let studentExamStatus = "Not Started";
        if (isSuccessfullyCompleted) {
          studentExamStatus = "Successfully Completed";
        } else if (isTimeExpired) {
          studentExamStatus = "Time Expired";
        } else if (hasSubmittedCode && !allTestsPassed) {
          studentExamStatus = "Test Cases Failed";
        } else if (hasApprovedConceptual && !hasSubmittedCode) {
          studentExamStatus = "Coding In Progress";
        } else if (currentQStatus === "waiting_faculty_decision") {
          studentExamStatus = "Waiting for Faculty Decision";
        } else if (currentQStatus === "notepad_correction_required" || currentQConceptualStatus === "correction_required") {
          studentExamStatus = "Correction Required";
        } else if (currentQStatus === "evaluating") {
          studentExamStatus = "AI Evaluation in Progress";
        } else if (currentQStatus === "awaiting_faculty_evaluation" || (hasSubmittedConceptual && !ans?.aiEvaluation)) {
          studentExamStatus = "Waiting for Faculty Evaluation";
        } else if (hasSubmittedConceptual && !hasApprovedConceptual) {
          studentExamStatus = "Waiting for Faculty Evaluation";
        } else if (
          prog?.status === "instructions_acknowledged" ||
          prog?.status === "question_assigned" ||
          prog?.status === "notepad_pending" ||
          prog?.status === "answer_in_progress"
        ) {
          studentExamStatus = "Notepad Pending";
        } else {
          studentExamStatus = "Not Started";
        }

        const lastActivityTime =
          qProg?.lastCodeSavedAt ||
          qProg?.lastAnswerSavedAt ||
          code?.submittedAt ||
          ans?.submittedAt ||
          prog?.lastCodeSavedAt ||
          prog?.lastAnswerSavedAt ||
          prog?.lastDraftSavedAt ||
          prog?.updatedAt ||
          qProg?.completedAt ||
          prog?.completedAt ||
          null;

        rows.push({
          rowId: assignedQId ? `${sId}_${assignedQId.toString()}` : sId,
          studentId: sId,
          username: student?.username || "Unknown",
          rollNo: student?.rollNo || "",
          email: student?.email || "",
          assignedQuestion:
            assignedQTitle ||
            assignedTitles ||
            alloc.questionId?.title ||
            (exam.examType === "viva" ? "Viva MCQ Bank" : "Not Assigned"),
          questionNumber: currentTargetQ?.questionNumber || (assigned.length > 1 ? `Q${qIndex + 1}` : "Q1"),
          totalAssignedQuestions: studentTotalAssigned,
          solvedQuestionsCount: studentSolvedQuestions,
          solvedQuestionsLabel,
          difficulty: currentTargetQ?.difficulty || alloc.questionId?.difficulty || "Medium",
          status: currentQStatus || "not_started",
          instructionsAcknowledged: Boolean(prog?.instructionsAcknowledged),
          conceptualAttemptsCount: qProg?.conceptualAttemptsCount ?? (assigned.length <= 1 ? prog?.conceptualAttemptsCount : 0) ?? 0,
          conceptualApproved: Boolean(hasApprovedConceptual),
          lastConceptualError: latestError,
          lastUnderstandingPercentage: latestError !== null ? Math.max(0, 100 - latestError) : null,
          aiEvaluation: latestError !== null ? { errorPercentage: latestError } : null,
          targetQuestionId: assignedQId,
          questionTitle: assignedQTitle,
          facultyDecision: ans?.facultyDecision || qProg?.facultyDecision || (assigned.length <= 1 ? prog?.facultyDecision : "pending") || "pending",
          evaluationAction,
          canAllowToCode,
          canReturnToNotepad,
          codeStatus: code?.status || "not_submitted",
          testCasesPassed: code?.testCasesPassed || 0,
          totalTestCases: code?.totalTestCases || 0,
          completedAt: qProg?.completedAt || prog?.completedAt || null,
          submittedAt: ans?.submittedAt || qProg?.submittedAt || (assigned.length <= 1 ? prog?.submittedAt : null) || null,
          lastActivityTime,
          notepadStatus,
          aiEvaluationStatus,
          codingStatus,
          testCasesStatus,
          examStatus: studentExamStatus,
          isSuccessfullyCompleted,
          vivaResult: prog?.vivaResult || null,
          vivaScore: prog?.vivaResult?.score ?? null,
          vivaPercentage: prog?.vivaResult?.percentage ?? null,
          vivaAttempted,
          vivaTotalQuestions,
          vivaCorrectCount,
          vivaScoreLabel: exam.examType === "viva" ? `${vivaCorrectCount}/${vivaTotalQuestions}` : null,
          vivaCorrect: exam.examType === "viva" ? vivaCorrectCount : (prog?.vivaResult?.correct ?? 0),
          vivaIncorrect: prog?.vivaResult?.incorrect ?? 0,
          vivaUnanswered: prog?.vivaResult?.unanswered ?? 0,
        });
      }
    }

    let vivaSummary = null;
    let codingSummary = null;

    if (exam.examType === "viva") {
      let inProgressCount = 0;
      let completedCount = 0;
      let notStartedCount = 0;
      let totalScoreSum = 0;
      let completedScoresCount = 0;
      let passCount = 0;

      for (const r of rows) {
        if (r.status === "completed" || r.status === "successfully_completed") {
          completedCount++;
          if (r.vivaScore !== null && !isNaN(r.vivaScore)) {
            totalScoreSum += r.vivaScore;
            completedScoresCount++;
          }
          if (r.vivaPercentage !== null && r.vivaPercentage >= 40) {
            passCount++;
          }
        } else if (r.status === "in_progress" || r.status === "instructions_acknowledged") {
          inProgressCount++;
        } else {
          notStartedCount++;
        }
      }

      vivaSummary = {
        totalEnrolled: rows.length,
        inProgress: inProgressCount,
        completed: completedCount,
        notStarted: notStartedCount,
        averageScore: completedScoresCount > 0 ? Math.round((totalScoreSum / completedScoresCount) * 10) / 10 : 0,
        passRate: completedCount > 0 ? Math.round((passCount / completedCount) * 100) : 0,
        totalPossibleMarks: exam.totalMarks || 10,
      };
    } else {
      codingSummary = {
        totalEnrolled: rows.length,
        successfullyCompleted: rows.filter((r) => r.examStatus === "Successfully Completed").length,
        codingInProgress: rows.filter((r) => r.examStatus === "Coding In Progress").length,
        notepadPending: rows.filter(
          (r) => r.examStatus === "Notepad Pending" || r.notepadStatus === "Pending"
        ).length,
        failed: rows.filter(
          (r) => r.examStatus === "Test Cases Failed" || r.examStatus === "Conceptual Evaluation Failed"
        ).length,
        timeExpired: rows.filter((r) => r.examStatus === "Time Expired").length,
        notStarted: rows.filter((r) => r.examStatus === "Not Started").length,
      };
    }

    const getEvalPriority = (row) => {
      if (row.evaluationAction === "evaluate") return 0;
      if (
        row.evaluationAction === "evaluating" ||
        row.evaluationAction === "allow_to_code" ||
        row.evaluationAction === "return_to_notepad"
      ) {
        return 1;
      }
      return 2;
    };

    rows.sort((a, b) => {
      const pDiff = getEvalPriority(a) - getEvalPriority(b);
      if (pDiff !== 0) return pDiff;
      const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return 0;
    });

    const searchFilter = String(req.query?.search || "").trim().toLowerCase();
    const statusFilter = String(req.query?.status || "").trim();
    const filteredRows = rows.filter((r) => {
      if (statusFilter && statusFilter !== "all" && r.examStatus !== statusFilter) {
        return false;
      }
      if (searchFilter) {
        return (
          r.rollNo?.toLowerCase().includes(searchFilter) ||
          r.username?.toLowerCase().includes(searchFilter) ||
          r.email?.toLowerCase().includes(searchFilter)
        );
      }
      return true;
    });

    const hasPagination =
      req.query?.page !== undefined || req.query?.limit !== undefined;
    const pageNum = Math.max(1, parseInt(req.query?.page || "1", 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(req.query?.limit || "25", 10) || 25));
    const totalFiltered = filteredRows.length;
    const pagedRows = hasPagination
      ? filteredRows.slice((pageNum - 1) * limitNum, pageNum * limitNum)
      : filteredRows;

    res.status(200).json({
      examTitle: exam.title,
      examType: exam.examType,
      status: exam.status,
      startedAt: exam.startedAt,
      durationMinutes: exam.durationMinutes,
      totalStudents: allocations.length,
      vivaSummary,
      codingSummary,
      students: pagedRows,
      ...(hasPagination
        ? {
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: totalFiltered,
              totalPages: Math.max(1, Math.ceil(totalFiltered / limitNum)),
            },
          }
        : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Inspect detailed student Viva MCQ submission with question choices & answer keys.
 * GET /api/v1/exams/:examId/students/:studentId/viva-inspect
 */
export const inspectStudentVivaExam = async (req, res, next) => {
  try {
    const { examId, studentId } = req.params;

    const [exam, student, progress, allocation] = await Promise.all([
      Exam.findById(examId).lean(),
      User.findById(studentId).select("username rollNo email").lean(),
      StudentExamProgress.findOne({ examId, studentId }).lean(),
      ExamAllocation.findOne({ examId, studentId }).lean(),
    ]);

    if (!exam || !student) {
      return res.status(404).json({ message: "Exam or student record not found." });
    }

    let questionDocs = [];
    if (allocation && allocation.assignedQuestionIds?.length > 0) {
      questionDocs = await ExamQuestion.find({ _id: { $in: allocation.assignedQuestionIds } })
        .sort({ orderIndex: 1, questionNumber: 1 })
        .lean();
    } else if (allocation && allocation.questionId) {
      questionDocs = await ExamQuestion.find({ _id: allocation.questionId }).lean();
    } else {
      questionDocs = await ExamQuestion.find({ examId })
        .sort({ orderIndex: 1, questionNumber: 1 })
        .lean();
    }

    const vivaAnswers = progress?.vivaAnswers
      ? (progress.vivaAnswers instanceof Map ? Object.fromEntries(progress.vivaAnswers) : progress.vivaAnswers)
      : {};

    // Build question inspection details with student choices vs official answer keys
    const questions = questionDocs.map((q, idx) => {
      const qId = q._id.toString();
      const userAns = vivaAnswers[qId] || null;
      const selectedOption = userAns?.selectedOption || null;
      const normSelected = selectedOption ? String(selectedOption).trim().toUpperCase() : null;
      const normCorrect = q.correctAnswer ? String(q.correctAnswer).trim().toUpperCase() : "";

      let isCorrect = false;
      if (normSelected && normCorrect && normCorrect !== "ANSWER NOT PROVIDED") {
        if (normSelected === normCorrect) {
          isCorrect = true;
        } else {
          const matchOpt = (q.options || []).find(
            (o) => o.optionId?.toUpperCase() === normSelected || o.text?.trim().toUpperCase() === normSelected
          );
          if (
            matchOpt &&
            (matchOpt.optionId?.toUpperCase() === normCorrect || matchOpt.text?.trim().toUpperCase() === normCorrect)
          ) {
            isCorrect = true;
          }
        }
      }

      return {
        _id: q._id,
        questionNumber: q.questionNumber || `Q${idx + 1}`,
        title: q.title || `Question ${idx + 1}`,
        questionText: q.questionText || q.problemStatement || "",
        options: q.options || [],
        correctAnswer: q.correctAnswer || "Answer Not Provided",
        explanation: q.explanation || "",
        marks: q.marks || exam.marksPerQuestion || 1,
        studentSelectedOption: selectedOption,
        isAnswered: Boolean(selectedOption),
        isCorrect,
        answeredAt: userAns?.answeredAt || null,
      };
    });

    res.status(200).json({
      examTitle: exam.title,
      subject: exam.subject,
      totalMarks: exam.totalMarks,
      student,
      progress: {
        status: progress?.status || "not_started",
        vivaStartedAt: progress?.vivaStartedAt || null,
        completedAt: progress?.completedAt || null,
        vivaResult: progress?.vivaResult || null,
      },
      questions,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// STUDENT EXAM ACTIONS
// =========================================================================

/**
 * Get available exams for the logged-in student (filtered by internal or external).
 */
export const getStudentExams = async (req, res, next) => {
  try {
    const studentId = req.user.userId;
    const { examType } = req.query;

    const filter = {
      participatingStudents: studentId,
      status: { $in: ["draft", "allocated", "scheduled", "in_progress", "completed"] },
    };

    if (examType && ["internal", "external", "viva"].includes(examType)) {
      filter.examType = examType;
    }

    const exams = await Exam.find(filter)
      .populate("createdBy", "username")
      .sort({ startedAt: -1, examDate: -1 })
      .lean();

    const examIds = exams.map((e) => e._id);
    const progresses = await StudentExamProgress.find({
      examId: { $in: examIds },
      studentId,
    }).lean();

    const allocations = await ExamAllocation.find({
      examId: { $in: examIds },
      studentId,
    }).lean();

    const progMap = new Map(progresses.map((p) => [p.examId.toString(), p]));
    const allocMap = new Map(allocations.map((a) => [a.examId.toString(), a]));

    const enriched = exams.map((exam) => {
      const prog = progMap.get(exam._id.toString());
      const alloc = allocMap.get(exam._id.toString());
      const isExamCompleted = prog?.status === "completed" || prog?.status === "successfully_completed";
      const examEnded = exam.status === "completed";
      const examTimeExpired = exam.startedAt && exam.durationMinutes
        ? Date.now() > new Date(exam.startedAt).getTime() + exam.durationMinutes * 60 * 1000
        : false;
      const isTimeExpired = (examEnded || examTimeExpired) && !isExamCompleted;

      // Calculate per-question dynamic progress tracking
      let effectiveStatus = prog?.status || "not_started";
      let displayProgress = "Not Started";
      let completedCount = 0;
      let totalAssigned = 1;

      if (exam.examType === "viva") {
        totalAssigned = exam.questionsPerStudent || (Array.isArray(exam.vivaQuestions) ? exam.vivaQuestions.length : 1);
        if (isExamCompleted) {
          effectiveStatus = "successfully_completed";
          displayProgress = "Completed";
          completedCount = totalAssigned;
        } else if (isTimeExpired) {
          effectiveStatus = "time_expired";
          displayProgress = "Time Expired";
        } else if (prog?.status === "in_progress" || prog?.status === "instructions_acknowledged") {
          displayProgress = "In Progress";
        }
      } else {
        // Coding exam (internal / external)
        const assignedIds = alloc?.assignedQuestionIds?.length > 0
          ? alloc.assignedQuestionIds
          : alloc?.questionId
          ? [alloc.questionId]
          : [];
        totalAssigned = assignedIds.length || exam.questionsPerStudent || 1;

        if (prog?.questionProgress) {
          // prog.questionProgress may be an Object when .lean() is used
          const qpEntries = prog.questionProgress instanceof Map
            ? Array.from(prog.questionProgress.values())
            : Object.values(prog.questionProgress);
          completedCount = qpEntries.filter((qp) => Boolean(qp && qp.isCompleted)).length;
        } else if (isExamCompleted) {
          completedCount = totalAssigned;
        }

        // Check if student has started the exam (acknowledged instructions or progressed past not_started)
        const hasStarted = Boolean(
          prog &&
          (prog.instructionsAcknowledged ||
            (prog.status && prog.status !== "not_started"))
        );

        if (isExamCompleted) {
          effectiveStatus = "successfully_completed";
          displayProgress = `Completed (${totalAssigned}/${totalAssigned} Completed)`;
        } else if (isTimeExpired) {
          effectiveStatus = "time_expired";
          displayProgress = `Time Expired (${completedCount}/${totalAssigned} Completed)`;
        } else if (hasStarted) {
          effectiveStatus = "in_progress";
          displayProgress = `In Progress (${completedCount}/${totalAssigned} Completed)`;
        } else {
          effectiveStatus = "not_started";
          displayProgress = "Not Started";
        }
      }

      return {
        _id: exam._id,
        title: exam.title,
        description: exam.description,
        subject: exam.subject,
        academicYear: exam.academicYear,
        semester: exam.semester,
        examType: exam.examType,
        examDate: exam.examDate,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        marksPerQuestion: exam.marksPerQuestion || 1,
        negativeMarking: exam.negativeMarking || 0,
        negativeMarkingEnabled: Boolean(exam.negativeMarkingEnabled),
        maxAttempts: exam.maxAttempts || 1,
        status: exam.status,
        startedAt: exam.startedAt,
        studentStatus: effectiveStatus,
        displayProgress,
        completedQuestionsCount: completedCount,
        totalAssignedQuestions: totalAssigned,
        isCompleted: isExamCompleted,
        isTimeExpired,
        compilerAllowed: Boolean(prog?.compilerAllowed),
        vivaResult: prog?.vivaResult || null,
        completedAt: prog?.completedAt || null,
      };
    });

    res.status(200).json({ exams: enriched });
  } catch (error) {
    next(error);
  }
};

/**
 * Get exam instructions for student.
 */
export const getStudentExamInstructions = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const exam = await Exam.findOne({
      _id: examId,
      participatingStudents: studentId,
    })
      .select(
        "title subject examType durationMinutes totalMarks instructions maxConceptualAttempts status startedAt"
      )
      .lean();

    if (!exam) {
      return res.status(404).json({
        message: "Exam not found or you are not enrolled as a participating student.",
      });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId }).lean();

    // Check if examination has been completed (by student or faculty)
    if (
      exam.status === "completed" ||
      (progress && (progress.status === "completed" || progress.status === "successfully_completed"))
    ) {
      const facultyEnded = exam.status === "completed";
      return res.status(200).json({
        exam,
        progress,
        isCompleted: true,
        facultyEndedExam: facultyEnded,
        completionReason: facultyEnded ? "faculty_ended" : (progress?.completionReason || "all_questions_submitted"),
        redirect: `/exams/${examId}/completed`,
        message: facultyEnded
          ? "Examination has been ended by the faculty."
          : "Examination has already been completed.",
      });
    }

    if (exam.status !== "in_progress" && exam.status !== "completed") {
      return res.status(403).json({
        message: "This examination has not been started by the faculty yet.",
      });
    }

    if (!progress) {
      progress = await StudentExamProgress.create({
        examId,
        studentId,
        status: "not_started",
      });
    }

    res.status(200).json({
      exam,
      progress,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Acknowledge exam instructions.
 */
export const acknowledgeInstructions = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const exam = await Exam.findOne({
      _id: examId,
      participatingStudents: studentId,
    });

    if (!exam || exam.status !== "in_progress") {
      return res.status(403).json({
        message: "Cannot acknowledge instructions: Exam is not active.",
      });
    }

    const progress = await StudentExamProgress.findOneAndUpdate(
      { examId, studentId },
      {
        $set: {
          instructionsAcknowledged: true,
          instructionsAcknowledgedAt: new Date(),
          status: "in_progress",
        },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      message: "Instructions acknowledged successfully.",
      progress,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's assigned question (STRICT: Never leaks hidden test cases or other students' assignments).
 * Supports multi-question allocations with ?questionId= or ?index= navigation.
 */
export const getMyAssignedQuestion = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { questionId: queryQuestionId, index: queryIndex } = req.query;

    const exam = await Exam.findOne({
      _id: examId,
      participatingStudents: studentId,
    }).select("status title subject durationMinutes maxConceptualAttempts startedAt questionsPerStudent");

    if (!exam) {
      return res.status(404).json({ message: "Exam not found or you are not enrolled as a participating student." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });

    // Check if examination has already been completed (by student or faculty)
    if (
      exam.status === "completed" ||
      (progress && (progress.status === "completed" || progress.status === "successfully_completed"))
    ) {
      const facultyEnded = exam.status === "completed";
      return res.status(403).json({
        message: facultyEnded
          ? "Examination has been ended by faculty. Access to active question interface is locked."
          : "Examination has already been completed. Access to active question interface is locked.",
        isCompleted: true,
        facultyEndedExam: facultyEnded,
        completionReason: facultyEnded ? "faculty_ended" : (progress?.completionReason || "all_questions_submitted"),
        redirect: `/exams/${examId}/completed`,
      });
    }

    if (exam.status !== "in_progress") {
      return res.status(403).json({ message: "Exam is not active." });
    }

    if (!progress || !progress.instructionsAcknowledged) {
      return res.status(403).json({
        message: "Please read and acknowledge the examination instructions first.",
      });
    }

    if (progress.status === "instructions_acknowledged" || progress.status === "question_assigned") {
      progress.status = "notepad_pending";
      await progress.save();
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .populate("assignedQuestionIds")
      .lean();

    if (!allocation) {
      return res.status(404).json({
        message: "No question allocated for your account. Please contact faculty.",
      });
    }

    const assigned =
      allocation.assignedQuestionIds && allocation.assignedQuestionIds.length > 0
        ? allocation.assignedQuestionIds
        : allocation.questionId
        ? [allocation.questionId]
        : [];

    if (assigned.length === 0) {
      return res.status(404).json({
        message: "No question allocated for your account. Please contact faculty.",
      });
    }

    // Determine active question
    let activeIndex = 0;
    if (queryQuestionId) {
      const foundIdx = assigned.findIndex(
        (item) => item._id && item._id.toString() === queryQuestionId.toString()
      );
      if (foundIdx !== -1) {
        activeIndex = foundIdx;
      }
    } else if (queryIndex !== undefined) {
      const parsedIdx = parseInt(queryIndex, 10);
      if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx < assigned.length) {
        activeIndex = parsedIdx;
      }
    }

    const q = assigned[activeIndex];

    // Filter to only visible sample test cases for the student
    const visibleSamples = (q.testCases || [])
      .filter((tc) => !tc.isHidden)
      .map((tc, idx) => ({
        sampleNumber: idx + 1,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      }));

    const previousAttempts = await ExamAnswerSubmission.find({
      examId,
      studentId,
      questionId: q._id,
    })
      .sort({ attemptNumber: -1 })
      .lean();

    const latestSub = previousAttempts[0] || null;

    // Resolve per-question progress
    const qKey = q._id.toString();
    const qProg = progress.questionProgress?.get
      ? progress.questionProgress.get(qKey)
      : progress.questionProgress?.[qKey];

    // Check if this specific question has been approved for compiler access
    const isQCompilerAllowed = Boolean(
      qProg?.compilerAllowed || (assigned.length === 1 && progress.compilerAllowed)
    );
    const isQCompleted = qProg
      ? Boolean(qProg.isCompleted)
      : isCompletedProgressStatus(progress.status);
    const lastQAnswer =
      qProg?.lastConceptualAnswer !== undefined
        ? qProg.lastConceptualAnswer
        : assigned.length === 1
        ? progress.lastConceptualAnswer || ""
        : "";
    const qAnswerVersion =
      qProg?.answerDraftVersion ?? (assigned.length === 1 ? (progress.answerDraftVersion ?? 0) : 0);
    const qLastAnswerSavedAt =
      qProg?.lastAnswerSavedAt || (assigned.length === 1 ? (progress.lastAnswerSavedAt || null) : null);
    const lastQEvaluation =
      (latestSub && latestSub.aiEvaluation) ||
      qProg?.lastAIEvaluation ||
      (assigned.length === 1 ? progress.lastAIEvaluation : null);
    const qAttemptsCount = qProg ? (qProg.conceptualAttemptsCount || 0) : (assigned.length === 1 ? (progress.conceptualAttemptsCount || 0) : 0);
    const qCode = qProg?.currentCode !== undefined ? qProg.currentCode : (assigned.length === 1 ? (progress.currentCode || "") : "");
    const qCodeVersion = qProg?.codeDraftVersion ?? (assigned.length === 1 ? (progress.codeDraftVersion ?? 0) : 0);
    const qLastCodeSavedAt = qProg?.lastCodeSavedAt || (assigned.length === 1 ? (progress.lastCodeSavedAt || null) : null);
    const qConceptualStatus = qProg?.conceptualStatus || (assigned.length === 1 ? progress.conceptualStatus : (latestSub ? latestSub.status : "pending"));
    const qStatus = qProg?.status || (assigned.length === 1 ? progress.status : "not_started");
    const qFacultyDecision = qProg?.facultyDecision || (assigned.length === 1 ? progress.facultyDecision : (latestSub?.facultyDecision || "pending"));
    const qFacultyFeedback = qProg?.facultyFeedback || (assigned.length === 1 ? progress.facultyFeedback : (latestSub?.facultyFeedback || ""));
    const qSubmittedAt = qProg?.submittedAt || (assigned.length === 1 ? progress.submittedAt : (latestSub?.submittedAt || null));
    const qEvaluatedAt = qProg?.evaluatedAt || (assigned.length === 1 ? progress.evaluatedAt : (latestSub?.evaluatedAt || null));

    const questionList = assigned.map((item, idx) => {
      const itemKey = item._id.toString();
      const itemProg = progress.questionProgress?.get
        ? progress.questionProgress.get(itemKey)
        : progress.questionProgress?.[itemKey];
      return {
        _id: item._id,
        questionNumber: item.questionNumber || `Q${idx + 1}`,
        title: item.title,
        difficulty: item.difficulty,
        marks: item.marks,
        compilerAllowed: Boolean(
          itemProg?.compilerAllowed || (assigned.length === 1 && progress.compilerAllowed)
        ),
        isCompleted: itemProg
          ? Boolean(itemProg.isCompleted)
          : isCompletedProgressStatus(progress.status),
        attemptCount: itemProg ? (itemProg.conceptualAttemptsCount || 0) : 0,
        conceptualStatus: itemProg?.conceptualStatus || "pending",
        status: itemProg?.status || "not_started",
      };
    });

    res.status(200).json({
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        durationMinutes: exam.durationMinutes,
        maxConceptualAttempts: exam.maxConceptualAttempts,
        startedAt: exam.startedAt,
        officialEndTime: exam.officialEndTime || null,
        extendedMinutes: exam.extendedMinutes || 0,
        questionsPerStudent: exam.questionsPerStudent || assigned.length,
      },
      progress: {
        status: qStatus,
        conceptualStatus: qConceptualStatus,
        conceptualAttemptsCount: qAttemptsCount,
        compilerAllowed: isQCompilerAllowed,
        lastConceptualAnswer: lastQAnswer,
        answerDraftVersion: qAnswerVersion,
        lastAnswerSavedAt: qLastAnswerSavedAt,
        lastAIEvaluation: lastQEvaluation,
        facultyDecision: qFacultyDecision,
        facultyFeedback: qFacultyFeedback,
        submittedAt: qSubmittedAt,
        evaluatedAt: qEvaluatedAt,
        currentCode: qCode,
        codeDraftVersion: qCodeVersion,
        lastCodeSavedAt: qLastCodeSavedAt,
        isCompleted: isQCompleted,
      },
      previousAttempts,
      question: {
        _id: q._id,
        questionNumber: q.questionNumber || `Q${activeIndex + 1}`,
        title: q.title,
        problemStatement: q.problemStatement,
        inputFormat: q.inputFormat,
        outputFormat: q.outputFormat,
        constraints: q.constraints,
        explanation: q.explanation,
        difficulty: q.difficulty,
        marks: q.marks,
        evaluationRubric: q.evaluationRubric,
        sampleTestCases: visibleSamples,
      },
      questions: questionList,
      currentIndex: activeIndex,
      totalAssignedQuestions: assigned.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Autosave student's code draft in C code editor.
 * Supports questionId for multi-question assignments and monotonic versioning to prevent out-of-order writes.
 */
export const autosaveCodeDraft = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { code, questionId, version } = req.body;

    if (code === undefined || code === null) {
      return res.status(400).json({ message: "Code content is required for draft autosave." });
    }

    // Verify authenticated student is enrolled, exam is active, and deadline has not expired
    let exam = null;
    if (
      (mongoose.connection && mongoose.connection.readyState === 1) ||
      Exam.findById !== mongoose.Model.findById
    ) {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        exam = await Exam.findOne({
          _id: examId,
          participatingStudents: studentId,
        }).select("status title startedAt durationMinutes completedAt examType participatingStudents");
        if (!exam) {
          return res.status(403).json({ message: "Exam is not active or you are not enrolled." });
        }
      } else {
        const examQuery = Exam.findById(examId);
        exam =
          typeof examQuery?.select === "function"
            ? await examQuery.select(
                "status title startedAt durationMinutes completedAt examType participatingStudents"
              )
            : await examQuery;
        if (!exam) {
          return res.status(404).json({ message: "Exam not found." });
        }
      }
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Progress record not found." });
    }

    if (
      progress.status === "completed" ||
      progress.status === "successfully_completed" ||
      progress.status === "time_expired"
    ) {
      return res.status(403).json({
        message: "Examination has already been completed. Code edits are locked.",
        isCompleted: true,
      });
    }

    const timingCheck = validateExamAccessAndTiming({
      exam,
      progress,
      studentId,
      isViva: false,
    });
    if (!timingCheck.ok) {
      return res.status(timingCheck.status).json(timingCheck.body);
    }

    // Verify question ownership if questionId is provided (when Mongoose is connected)
    if (questionId && mongoose.connection && mongoose.connection.readyState === 1) {
      const allocation = await ExamAllocation.findOne({ examId, studentId }).lean();
      if (allocation) {
        const assignedIds = (allocation.assignedQuestionIds || []).map((id) => id.toString());
        if (allocation.questionId) {
          assignedIds.push(allocation.questionId.toString());
        }
        if (assignedIds.length > 0 && !assignedIds.includes(questionId.toString())) {
          return res.status(403).json({ message: "Question is not assigned to your account." });
        }
      }
    }

    const incomingVersion = typeof version === "number" ? version : null;
    const now = new Date();
    const useAtomicProgressUpdate =
      typeof StudentExamProgress.findOneAndUpdate === "function" &&
      (mongoose.connection?.readyState === 1 ||
        StudentExamProgress.findOneAndUpdate !== mongoose.Model.findOneAndUpdate);

    if (useAtomicProgressUpdate) {
      if (questionId) {
        const qKey = questionId.toString();
        const rawExisting = progress.questionProgress?.get
          ? progress.questionProgress.get(qKey)
          : progress.questionProgress?.[qKey];
        const existing = rawExisting?.toObject ? rawExisting.toObject() : (rawExisting || { questionId });

        if (existing.isCompleted || existing.status === "submission_pending") {
          return res.status(403).json({
            message: "This question has already been submitted. Code edits are locked.",
            alreadySubmitted: Boolean(existing.isCompleted),
          });
        }

        const currentVersion = existing.codeDraftVersion ?? 0;
        if (incomingVersion !== null && incomingVersion < currentVersion) {
          return res.status(200).json({
            success: true,
            message: "Ignored stale code draft version.",
            savedVersion: currentVersion,
            stale: true,
          });
        }

        if (existing.currentCode === code && (incomingVersion === null || incomingVersion === currentVersion)) {
          return res.status(200).json({
            success: true,
            message: "Code draft already up to date.",
            savedAt: existing.lastCodeSavedAt || now,
            version: currentVersion,
            unchanged: true,
          });
        }

        const nextVersion = incomingVersion !== null ? incomingVersion : currentVersion + 1;
        const filter = {
          examId,
          studentId,
          status: { $nin: ["completed", "successfully_completed", "time_expired"] },
          [`questionProgress.${qKey}.isCompleted`]: { $ne: true },
          [`questionProgress.${qKey}.status`]: { $ne: "submission_pending" },
        };
        if (incomingVersion !== null) {
          filter.$or = [
            { [`questionProgress.${qKey}.codeDraftVersion`]: { $exists: false } },
            { [`questionProgress.${qKey}.codeDraftVersion`]: { $lte: incomingVersion } },
          ];
        }

        const updated = await StudentExamProgress.findOneAndUpdate(
          filter,
          {
            $set: {
              [`questionProgress.${qKey}.questionId`]: questionId,
              [`questionProgress.${qKey}.currentCode`]: code,
              [`questionProgress.${qKey}.codeDraftVersion`]: nextVersion,
              [`questionProgress.${qKey}.lastCodeSavedAt`]: now,
              currentCode: code,
              codeDraftVersion: nextVersion,
              lastCodeSavedAt: now,
            },
          },
          { new: true }
        );

        if (!updated) {
          if (incomingVersion !== null) {
            return res.status(200).json({
              success: true,
              message: "Ignored stale or locked code draft version.",
              savedVersion: currentVersion,
              stale: true,
            });
          }
          return res.status(403).json({
            message: "Examination or question is locked. Code edits cannot be saved.",
            isCompleted: true,
          });
        }

        return res.status(200).json({
          success: true,
          message: "Code draft saved successfully.",
          savedAt: now,
          version: nextVersion,
        });
      }

      const currentVersion = progress.codeDraftVersion ?? 0;
      if (incomingVersion !== null && incomingVersion < currentVersion) {
        return res.status(200).json({
          success: true,
          message: "Ignored stale code draft version.",
          savedVersion: currentVersion,
          stale: true,
        });
      }

      const nextVersion = incomingVersion !== null ? incomingVersion : currentVersion + 1;
      const filter = {
        examId,
        studentId,
        status: { $nin: ["completed", "successfully_completed", "time_expired"] },
      };
      if (incomingVersion !== null) {
        filter.$or = [
          { codeDraftVersion: { $exists: false } },
          { codeDraftVersion: { $lte: incomingVersion } },
        ];
      }

      const updated = await StudentExamProgress.findOneAndUpdate(
        filter,
        {
          $set: {
            currentCode: code,
            codeDraftVersion: nextVersion,
            lastCodeSavedAt: now,
          },
        },
        { new: true }
      );

      if (!updated) {
        return res.status(200).json({
          success: true,
          message: "Ignored stale code draft version.",
          savedVersion: currentVersion,
          stale: true,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Code draft saved successfully.",
        savedAt: now,
        version: nextVersion,
      });
    }

    if (questionId) {
      const qKey = questionId.toString();
      if (!progress.questionProgress) {
        progress.questionProgress = new Map();
      }
      const rawExisting = progress.questionProgress.get(qKey);
      const existing = rawExisting?.toObject ? rawExisting.toObject() : (rawExisting || { questionId });
      if (existing.isCompleted || existing.status === "submission_pending") {
        return res.status(403).json({
          message: "This question has already been submitted. Code edits are locked.",
          alreadySubmitted: Boolean(existing.isCompleted),
        });
      }

      const currentVersion = existing.codeDraftVersion ?? 0;

      // Drop stale requests if a newer version was already saved
      if (incomingVersion !== null && incomingVersion < currentVersion) {
        return res.status(200).json({
          success: true,
          message: "Ignored stale code draft version.",
          savedVersion: currentVersion,
          stale: true,
        });
      }

      // Skip unnecessary DB write if code and version are unchanged
      if (existing.currentCode === code && (incomingVersion === null || incomingVersion === currentVersion)) {
        return res.status(200).json({
          success: true,
          message: "Code draft already up to date.",
          savedAt: existing.lastCodeSavedAt || now,
          version: currentVersion,
          unchanged: true,
        });
      }

      const nextVersion = incomingVersion !== null ? incomingVersion : currentVersion + 1;

      progress.questionProgress.set(qKey, {
        ...existing,
        questionId,
        currentCode: code,
        codeDraftVersion: nextVersion,
        lastCodeSavedAt: now,
      });

      if (typeof progress.markModified === "function") {
        progress.markModified("questionProgress");
      }

      // Also update top-level currentCode
      progress.currentCode = code;
      progress.codeDraftVersion = nextVersion;
      progress.lastCodeSavedAt = now;
    } else {
      const currentVersion = progress.codeDraftVersion ?? 0;
      if (incomingVersion !== null && incomingVersion < currentVersion) {
        return res.status(200).json({
          success: true,
          message: "Ignored stale code draft version.",
          savedVersion: currentVersion,
          stale: true,
        });
      }

      const nextVersion = incomingVersion !== null ? incomingVersion : currentVersion + 1;
      progress.currentCode = code;
      progress.codeDraftVersion = nextVersion;
      progress.lastCodeSavedAt = now;
    }

    await progress.save();
    res.status(200).json({
      success: true,
      message: "Code draft saved successfully.",
      savedAt: now,
      version: incomingVersion !== null ? incomingVersion : (progress.codeDraftVersion ?? 0),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log exam security events (e.g., tab switches, window blur, fullscreen exit)
 */
export const logExamSecurityEvent = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { eventType, details, timestamp } = req.body;

    if (!eventType) {
      return res.status(400).json({ message: "eventType is required." });
    }

    // Temporary feature flag: If PHASE3_SECURITY_ENABLED is false, do not log or process security events
    if (!PHASE3_SECURITY_ENABLED) {
      return res.status(200).json({
        success: true,
        message: "Phase 3 security event logging is currently disabled.",
        disabled: true,
      });
    }

    // Save in ExamAuditLog
    await ExamAuditLog.create({
      examId,
      actorId: studentId,
      actorRole: "student",
      action: `SECURITY_EVENT_${String(eventType).toUpperCase()}`,
      details: {
        eventType,
        timestamp: timestamp || new Date(),
        details: details || {},
      },
    });

    res.status(200).json({ success: true, message: "Security event recorded." });
  } catch (error) {
    next(error);
  }
};

/**
 * Student explicitly concludes/ends their examination.
 */
export const endStudentExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    let exam = null;
    if (
      (mongoose.connection && mongoose.connection.readyState === 1) ||
      Exam.findById !== mongoose.Model.findById
    ) {
      exam = await Exam.findById(examId).select(
        "title subject examType status participatingStudents startedAt durationMinutes totalMarks completedAt"
      );

      if (!exam) {
        return res.status(404).json({ message: "Exam not found." });
      }

      // Validate enrollment
      const isEnrolled = (exam.participatingStudents || []).some(
        (id) => id.toString() === studentId.toString()
      );
      if (!isEnrolled) {
        return res.status(403).json({ message: "You are not enrolled in this examination." });
      }
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Progress record not found." });
    }

    // Idempotent completion handling: preserve first terminal completion event
    if (progress.status === "successfully_completed" || progress.status === "completed") {
      return res.status(200).json({
        success: true,
        message: "Examination was already completed.",
        status: progress.status,
        completionReason: progress.completionReason || "all_questions_submitted",
        completedAt: progress.completedAt || new Date(),
        examTitle: exam?.title || "Examination",
        examType: exam?.examType || "internal",
        isCompleted: true,
      });
    }

    // Verify exam has not been ended by faculty or expired
    if (exam && exam.status === "completed") {
      progress.status = "completed";
      progress.completionReason = "faculty_ended";
      progress.completedAt = exam.completedAt || new Date();
      await progress.save();
      return res.status(200).json({
        success: true,
        message: "Examination has already been ended by faculty.",
        status: "completed",
        completionReason: "faculty_ended",
        completedAt: progress.completedAt,
        examTitle: exam.title,
        examType: exam.examType,
        isCompleted: true,
      });
    }

    const examTimeExpired =
      exam?.startedAt && exam?.durationMinutes
        ? Date.now() > new Date(exam.startedAt).getTime() + exam.durationMinutes * 60 * 1000
        : false;
    if (examTimeExpired) {
      return res.status(403).json({
        message: "Examination time has expired.",
        isTimeExpired: true,
      });
    }

    // Verify all assigned questions have successful submissions when allocation exists
    let finalScore = progress.finalScore || 0;
    if (
      (mongoose.connection && mongoose.connection.readyState === 1) ||
      ExamAllocation.findOne !== mongoose.Model.findOne
    ) {
      const alloc = await ExamAllocation.findOne({ examId, studentId })
        .populate("questionId")
        .populate("assignedQuestionIds")
        .lean();
      if (alloc) {
        const assigned =
          alloc.assignedQuestionIds?.length > 0
            ? alloc.assignedQuestionIds
            : alloc.questionId
            ? [alloc.questionId]
            : [];
        if (assigned.length > 0) {
          let submittedCount = 0;
          let totalScore = 0;
          for (const qItem of assigned) {
            const qKey = qItem._id.toString();
            const rawP = progress.questionProgress?.get
              ? progress.questionProgress.get(qKey)
              : progress.questionProgress?.[qKey];
            const p = rawP?.toObject ? rawP.toObject() : rawP;
            if (p && p.isCompleted) {
              submittedCount += 1;
              totalScore += Number(p.score ?? qItem.marks ?? 100);
            }
          }
          if (submittedCount < assigned.length) {
            return res.status(400).json({
              message: `Cannot finish exam: ${assigned.length - submittedCount} assigned question(s) are still pending submission.`,
              submittedQuestionCount: submittedCount,
              assignedQuestionCount: assigned.length,
              pendingQuestionsCount: assigned.length - submittedCount,
            });
          }
          finalScore = totalScore;
        }
      }
    }

    // Mark as completed (Condition 2: all_questions_submitted)
    progress.status = "successfully_completed";
    progress.completionReason = "all_questions_submitted";
    progress.completedAt = new Date();
    progress.finalScore = finalScore;
    await progress.save();

    await ExamAuditLog.create({
      examId,
      actorId: studentId,
      actorRole: "student",
      action: "STUDENT_ENDED_EXAMINATION",
      details: {
        completedAt: progress.completedAt,
        completionReason: "all_questions_submitted",
        examTitle: exam?.title || "Examination",
        examType: exam?.examType || "internal",
      },
    });

    res.status(200).json({
      success: true,
      message: "Examination completed successfully.",
      status: "successfully_completed",
      completionReason: "all_questions_submitted",
      completedAt: progress.completedAt,
      examTitle: exam?.title || "Examination",
      examType: exam?.examType || "internal",
      isCompleted: true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Condition 3: Automatic Exam Time-Expiry Workflow.
 * Idempotently evaluates latest available code for every uncompleted assigned question,
 * saves actual execution results, and finalizes the student's exam with completionReason = "time_expired".
 */
export const expireStudentExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const exam = await Exam.findById(examId).select(
      "title subject examType status participatingStudents startedAt durationMinutes totalMarks completedAt"
    );
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const isEnrolled = (exam.participatingStudents || []).some(
      (id) => id.toString() === studentId.toString()
    );
    if (!isEnrolled) {
      return res.status(403).json({ message: "You are not enrolled in this examination." });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Progress record not found." });
    }

    // Preserve any earlier terminal completion event (idempotent)
    if (progress.status === "successfully_completed" || progress.status === "completed") {
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        status: progress.status,
        completionReason: progress.completionReason || "time_expired",
        completedAt: progress.completedAt || new Date(),
        isCompleted: true,
      });
    }

    // Condition 1 precedence: if faculty already ended the exam
    if (exam.status === "completed") {
      progress.status = "completed";
      progress.completionReason = "faculty_ended";
      progress.completedAt = exam.completedAt || new Date();
      await progress.save();
      return res.status(200).json({
        success: true,
        status: "completed",
        completionReason: "faculty_ended",
        completedAt: progress.completedAt,
        isCompleted: true,
      });
    }

    // Verify exam time has actually expired (2s clock-skew tolerance)
    if (exam.startedAt && exam.durationMinutes) {
      const endMs = new Date(exam.startedAt).getTime() + exam.durationMinutes * 60 * 1000;
      if (Date.now() + 2000 < endMs) {
        return res.status(400).json({
          message: "Examination time has not expired yet.",
          remainingMs: endMs - Date.now(),
        });
      }
    }

    // Acquire atomic lock to prevent duplicate auto-submissions on concurrent timer events
    if (typeof StudentExamProgress.findOneAndUpdate === "function" && mongoose.connection?.readyState === 1) {
      const locked = await StudentExamProgress.findOneAndUpdate(
        {
          examId,
          studentId,
          status: { $nin: ["completed", "successfully_completed"] },
          expiryProcessing: { $ne: true },
        },
        { $set: { expiryProcessing: true } },
        { new: true }
      );
      if (!locked) {
        const latest = await StudentExamProgress.findOne({ examId, studentId }).lean();
        return res.status(200).json({
          success: true,
          alreadyProcessingOrCompleted: true,
          status: latest?.status || "completed",
          completionReason: latest?.completionReason || "time_expired",
          isCompleted: true,
        });
      }
      progress = locked;
    } else {
      if (progress.expiryProcessing) {
        return res.status(200).json({
          success: true,
          alreadyProcessingOrCompleted: true,
          status: progress.status,
          completionReason: progress.completionReason || "time_expired",
          isCompleted: true,
        });
      }
      progress.expiryProcessing = true;
    }

    const alloc = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .populate("assignedQuestionIds")
      .lean();

    const assigned =
      alloc?.assignedQuestionIds?.length > 0
        ? alloc.assignedQuestionIds
        : alloc?.questionId
        ? [alloc.questionId]
        : [];

    if (!progress.questionProgress) {
      progress.questionProgress = new Map();
    }

    let totalScore = 0;
    const autoSubmissionResults = [];

    for (const qItem of assigned) {
      const qKey = qItem._id.toString();
      const rawQp = progress.questionProgress.get(qKey);
      const qp = rawQp?.toObject
        ? rawQp.toObject()
        : rawQp || { questionId: qItem._id };

      if (qp.isCompleted) {
        totalScore += Number(qp.score ?? qItem.marks ?? 100);
        continue;
      }

      const draftCode =
        qp.currentCode !== undefined && qp.currentCode !== ""
          ? qp.currentCode
          : assigned.length === 1
          ? progress.currentCode || ""
          : "";

      if (!draftCode || !String(draftCode).trim()) {
        // Empty or unavailable code: record time_expired without inventing a submission
        qp.status = "time_expired";
        qp.isCompleted = false;
        progress.questionProgress.set(qKey, qp);
        autoSubmissionResults.push({
          questionId: qItem._id,
          status: "no_code_submitted",
          allPassed: false,
        });
        continue;
      }

      try {
        const allTestCases = qItem.testCases || [];
        const judgeResult = await submissionQueue.enqueue(
          () =>
            judgeSubmission({
              code: draftCode,
              testCases: allTestCases,
              problemTitle: qItem.title,
            }),
          {
            userId: studentId,
            examId,
            questionId: qItem._id?.toString(),
            action: "exam_expire",
          }
        );

        const allPassed = judgeResult.status === "accepted";

        await ExamCodeSubmission.create({
          examId,
          studentId,
          questionId: qItem._id,
          code: draftCode,
          language: "c",
          status: judgeResult.status,
          testCasesPassed: judgeResult.testCasesPassed || 0,
          totalTestCases: judgeResult.totalTestCases || allTestCases.length,
          testCaseResults: judgeResult.testCaseResults || [],
          allPassed,
          executionTime: judgeResult.executionTime || 0,
          compilerOutput: judgeResult.compilerOutput || "",
        });

        if (allPassed) {
          qp.isCompleted = true;
          qp.completedAt = new Date();
          qp.score = qItem.marks || 100;
          qp.status = "completed";
          totalScore += qp.score;
        } else {
          qp.isCompleted = false;
          qp.status = "test_cases_failed";
        }
        progress.questionProgress.set(qKey, qp);
        autoSubmissionResults.push({
          questionId: qItem._id,
          status: judgeResult.status,
          allPassed,
          testCasesPassed: judgeResult.testCasesPassed || 0,
          totalTestCases: judgeResult.totalTestCases || allTestCases.length,
        });
      } catch (judgeErr) {
        // Judge/Piston failed: record error/pending status without falsely reporting success
        qp.isCompleted = false;
        qp.status = "evaluation_pending";
        progress.questionProgress.set(qKey, qp);
        autoSubmissionResults.push({
          questionId: qItem._id,
          status: "evaluation_error",
          allPassed: false,
          error: judgeErr.message,
        });
      }
    }

    if (typeof progress.markModified === "function") {
      progress.markModified("questionProgress");
    }

    progress.status = "completed";
    progress.completionReason = "time_expired";
    progress.completedAt = new Date();
    progress.expiryProcessing = false;
    progress.finalScore = totalScore;
    await progress.save();

    await ExamAuditLog.create({
      examId,
      actorId: studentId,
      actorRole: "student",
      action: "STUDENT_EXAM_TIME_EXPIRED",
      details: {
        completedAt: progress.completedAt,
        autoSubmissionResults,
        finalScore: totalScore,
      },
    });

    res.status(200).json({
      success: true,
      message: "Examination time expired. Available code has been evaluated and finalized.",
      status: "completed",
      completionReason: "time_expired",
      completedAt: progress.completedAt,
      finalScore: totalScore,
      autoSubmissionResults,
      isCompleted: true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Autosave student's conceptual answer draft in Notepad.
 * Supports optional questionId for multi-question assignments.
 */
export const autosaveAnswerDraft = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { answerText, questionId, version } = req.body;

    if (answerText === undefined || answerText === null) {
      return res.status(400).json({ message: "Answer content is required for draft autosave." });
    }

    // Verify authenticated student is enrolled and exam is active (when Mongoose is connected)
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const exam = await Exam.findOne({
        _id: examId,
        participatingStudents: studentId,
      }).select("status title");

      if (!exam) {
        return res.status(403).json({ message: "Exam is not active or you are not enrolled." });
      }
      if (exam.status === "completed") {
        return res.status(403).json({
          message: "Examination has been ended by faculty. Code edits are locked.",
          isCompleted: true,
          facultyEndedExam: true,
        });
      }
      if (exam.status !== "in_progress") {
        return res.status(403).json({ message: "Exam is not active or you are not enrolled." });
      }
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Progress record not found." });
    }

    if (
      progress.status === "completed" ||
      progress.status === "successfully_completed" ||
      progress.status === "time_expired"
    ) {
      return res.status(403).json({
        message: "Examination has already been completed. Notepad edits are locked.",
        isCompleted: true,
      });
    }

    // Verify question ownership if questionId is provided (when Mongoose is connected)
    if (questionId && mongoose.connection && mongoose.connection.readyState === 1) {
      const allocation = await ExamAllocation.findOne({ examId, studentId }).lean();
      if (allocation) {
        const assignedIds = (allocation.assignedQuestionIds || []).map((id) => id.toString());
        if (allocation.questionId) {
          assignedIds.push(allocation.questionId.toString());
        }
        if (assignedIds.length > 0 && !assignedIds.includes(questionId.toString())) {
          return res.status(403).json({ message: "Question is not assigned to your account." });
        }
      }
    }

    const incomingVersion = typeof version === "number" ? version : null;
    const now = new Date();
    const textValue = String(answerText);

    const ALLOWED_DRAFT_TRANSITION_STATUSES = new Set([
      "not_started",
      "instructions_acknowledged",
      "question_assigned",
      "notepad_pending",
      "notepad_correction_required",
      "correction_required",
      "answer_in_progress",
    ]);

    const canTransitionToAnswerInProgress = (status, isCompleted = false) => {
      if (isCompleted) return false;
      if (!status) return true;
      return ALLOWED_DRAFT_TRANSITION_STATUSES.has(status);
    };

    let savedVersion = progress.answerDraftVersion ?? 0;
    const useAtomicAnswerUpdate =
      typeof StudentExamProgress.findOneAndUpdate === "function" &&
      (mongoose.connection?.readyState === 1 ||
        StudentExamProgress.findOneAndUpdate !== mongoose.Model.findOneAndUpdate);

    if (useAtomicAnswerUpdate) {
      if (questionId) {
        const qKey = questionId.toString();
        const rawExisting = progress.questionProgress?.get
          ? progress.questionProgress.get(qKey)
          : progress.questionProgress?.[qKey];
        const existing = rawExisting?.toObject ? rawExisting.toObject() : (rawExisting || {});
        const currentVersion = existing.answerDraftVersion ?? 0;

        if (incomingVersion !== null && incomingVersion < currentVersion) {
          return res.status(200).json({
            success: true,
            message: "Ignored stale answer draft version.",
            savedVersion: currentVersion,
            stale: true,
          });
        }

        const nextVersion = incomingVersion !== null ? incomingVersion : currentVersion + 1;
        savedVersion = nextVersion;

        const setFields = {
          [`questionProgress.${qKey}.questionId`]: questionId,
          [`questionProgress.${qKey}.lastConceptualAnswer`]: textValue,
          [`questionProgress.${qKey}.answerDraftVersion`]: nextVersion,
          [`questionProgress.${qKey}.lastAnswerSavedAt`]: now,
          lastConceptualAnswer: textValue,
          answerDraftVersion: nextVersion,
          lastAnswerSavedAt: now,
        };
        if (canTransitionToAnswerInProgress(existing.status, Boolean(existing.isCompleted))) {
          setFields[`questionProgress.${qKey}.status`] = "answer_in_progress";
        }
        if (canTransitionToAnswerInProgress(progress.status)) {
          setFields.status = "answer_in_progress";
        }

        const filter = {
          examId,
          studentId,
          status: { $nin: ["completed", "successfully_completed", "time_expired"] },
          [`questionProgress.${qKey}.isCompleted`]: { $ne: true },
        };
        if (incomingVersion !== null) {
          filter.$or = [
            { [`questionProgress.${qKey}.answerDraftVersion`]: { $exists: false } },
            { [`questionProgress.${qKey}.answerDraftVersion`]: { $lte: incomingVersion } },
          ];
        }

        const updatedProgress = await StudentExamProgress.findOneAndUpdate(
          filter,
          { $set: setFields },
          { new: true }
        );
        if (!updatedProgress) {
          return res.status(200).json({
            success: true,
            message: "Ignored stale answer draft version.",
            savedVersion: currentVersion,
            stale: true,
          });
        }

        return res.status(200).json({
          success: true,
          message: "Draft saved.",
          savedAt: now,
          version: savedVersion,
          questionId: questionId || null,
          progress: updatedProgress,
        });
      }
    }

    if (questionId) {
      const qKey = questionId.toString();
      if (!progress.questionProgress) {
        progress.questionProgress = new Map();
      }
      const rawExisting = progress.questionProgress.get(qKey);
      const existing = rawExisting?.toObject ? rawExisting.toObject() : (rawExisting || {});
      const currentVersion = existing.answerDraftVersion ?? 0;

      // Drop stale requests if a newer version was already saved
      if (incomingVersion !== null && incomingVersion < currentVersion) {
        return res.status(200).json({
          success: true,
          message: "Ignored stale answer draft version.",
          savedVersion: currentVersion,
          stale: true,
        });
      }

      const nextVersion = incomingVersion !== null ? incomingVersion : currentVersion + 1;
      savedVersion = nextVersion;

      const nextQStatus = canTransitionToAnswerInProgress(
        existing.status,
        Boolean(existing.isCompleted)
      )
        ? "answer_in_progress"
        : existing.status;

      progress.questionProgress.set(qKey, {
        ...existing,
        questionId,
        lastConceptualAnswer: textValue,
        answerDraftVersion: nextVersion,
        lastAnswerSavedAt: now,
        status: nextQStatus,
      });

      if (typeof progress.markModified === "function") {
        progress.markModified("questionProgress");
      }

      progress.lastConceptualAnswer = textValue;
      progress.answerDraftVersion = nextVersion;
      progress.lastAnswerSavedAt = now;
      if (canTransitionToAnswerInProgress(progress.status)) {
        progress.status = "answer_in_progress";
      }
    } else {
      const currentVersion = progress.answerDraftVersion ?? 0;
      if (incomingVersion !== null && incomingVersion < currentVersion) {
        return res.status(200).json({
          success: true,
          message: "Ignored stale answer draft version.",
          savedVersion: currentVersion,
          stale: true,
        });
      }

      const nextVersion = incomingVersion !== null ? incomingVersion : currentVersion + 1;
      savedVersion = nextVersion;

      progress.lastConceptualAnswer = textValue;
      progress.answerDraftVersion = nextVersion;
      progress.lastAnswerSavedAt = now;
      if (canTransitionToAnswerInProgress(progress.status)) {
        progress.status = "answer_in_progress";
      }
    }

    await progress.save();
    res.status(200).json({
      success: true,
      message: "Draft saved.",
      savedAt: now,
      version: savedVersion,
      questionId: questionId || null,
      progress,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Student Notepad Conceptual Answer Submission.
 * Saves the answer, updates status to awaiting_faculty_evaluation, and does NOT auto-evaluate.
 * Compiler access remains locked until faculty reviews and explicitly approves.
 */
export const submitStudentPaperAnswer = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { answerText, questionId } = req.body;

    if (!answerText || !answerText.trim() || answerText.trim().length < 20) {
      return res.status(400).json({
        message: "Please write a detailed conceptual solution (at least 20 characters) before submitting.",
      });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (
      progress &&
      (progress.status === "completed" ||
        progress.status === "successfully_completed" ||
        progress.status === "time_expired" ||
        progress.status === "faculty_ended")
    ) {
      return res.status(403).json({
        message: "Examination has already been completed. Notepad submissions are locked.",
        isCompleted: true,
      });
    }

    const exam = await Exam.findById(examId);
    if (!exam || exam.status !== "in_progress") {
      return res.status(403).json({ message: "Exam is not currently active." });
    }

    const endTimeMs = getExamEndTimeMs(exam);
    if (endTimeMs && Date.now() >= endTimeMs) {
      return res.status(403).json({
        message: "Examination time has expired. Notepad submissions are locked.",
        isCompleted: true,
      });
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .populate("assignedQuestionIds")
      .lean();

    if (!allocation) {
      return res.status(404).json({ message: "No question allocated for your account." });
    }

    const assigned =
      allocation.assignedQuestionIds && allocation.assignedQuestionIds.length > 0
        ? allocation.assignedQuestionIds
        : allocation.questionId
        ? [allocation.questionId]
        : [];

    let targetQuestion = null;
    if (questionId) {
      targetQuestion = assigned.find(
        (q) => q._id && q._id.toString() === questionId.toString()
      );
    }
    if (!targetQuestion) {
      targetQuestion = assigned[0];
    }

    if (!targetQuestion) {
      return res.status(404).json({ message: "Allocated question not found." });
    }

    if (!progress) {
      progress = await StudentExamProgress.create({ examId, studentId });
    }

    const qKey = targetQuestion._id.toString();
    if (!progress.questionProgress) {
      progress.questionProgress = new Map();
    }
    const qProg = progress.questionProgress.get(qKey) || {
      questionId: targetQuestion._id,
      conceptualAttemptsCount: 0,
      compilerAllowed: false,
    };

    // Notepad Attempt Limit Removed: Students have unlimited attempts to write, edit, and resubmit
    const currentAttempts = qProg.conceptualAttemptsCount || 0;
    const attemptNumber = currentAttempts + 1;
    const submissionTime = new Date();

    // Check for rapid duplicate submission of identical answer within 5 seconds to prevent network double-submits
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const existingRecent = await ExamAnswerSubmission.findOne({
          examId,
          studentId,
          questionId: targetQuestion._id,
          answerText: answerText.trim(),
        }).sort({ attemptNumber: -1 });

        if (existingRecent && existingRecent.submittedAt) {
          const timeDiffMs = Date.now() - new Date(existingRecent.submittedAt).getTime();
          if (timeDiffMs < 5000) {
            return res.status(200).json({
              message: "Your answer has been submitted and is waiting for faculty evaluation. Please wait until your faculty reviews your answer.",
              submissionStatus: "Submitted",
              evaluationStatus: "Awaiting Faculty Evaluation",
              examStatus: "Waiting for Faculty Approval",
              compilerAllowed: false,
              attemptNumber: existingRecent.attemptNumber,
              submission: existingRecent,
            });
          }
        }
      } catch (_) {}
    }

    // 1. Save new answer version in ExamAnswerSubmission (audit history preserved)
    const newSubmission = await ExamAnswerSubmission.create({
      examId,
      studentId,
      questionId: targetQuestion._id,
      attemptNumber,
      answerText: answerText.trim(),
      status: "submitted",
      facultyDecision: "pending",
      isApproved: false,
      submittedAt: submissionTime,
    });

    // 2. Update StudentExamProgress state (No auto AI evaluation, No auto redirect)
    qProg.conceptualAttemptsCount = attemptNumber;
    qProg.lastConceptualAnswer = answerText.trim();
    qProg.conceptualStatus = "submitted";
    qProg.status = "awaiting_faculty_evaluation";
    qProg.facultyDecision = "pending";
    qProg.compilerAllowed = false;
    qProg.submittedAt = submissionTime;

    progress.conceptualAttemptsCount = attemptNumber;
    progress.lastConceptualAnswer = answerText.trim();
    progress.conceptualStatus = "submitted";
    progress.status = "awaiting_faculty_evaluation";
    progress.facultyDecision = "pending";
    progress.compilerAllowed = false;
    progress.submittedAt = submissionTime;

    progress.questionProgress.set(qKey, qProg);
    await progress.save();

    // 3. Log submission in ExamAuditLog
    await ExamAuditLog.create({
      examId,
      actorId: studentId,
      actorRole: "student",
      action: "CONCEPTUAL_ANSWER_SUBMITTED",
      details: {
        questionId: targetQuestion._id,
        attemptNumber,
        answerLength: answerText.trim().length,
      },
    });

    res.status(200).json({
      message: "Your answer has been submitted and is waiting for faculty evaluation. Please wait until your faculty reviews your answer.",
      submissionStatus: "Submitted",
      evaluationStatus: "Awaiting Faculty Evaluation",
      examStatus: "Waiting for Faculty Approval",
      compilerAllowed: false,
      attemptNumber,
      submission: newSubmission,
    });
  } catch (error) {
    next(error);
  }
};

// Aliased for backward compatibility with existing route endpoints
export const evaluatePaperAnswer = submitStudentPaperAnswer;

/**
 * Faculty-Controlled AI Evaluation.
 * Triggered ONLY when faculty clicks "Evaluate" on Faculty Monitoring Dashboard.
 */
export const facultyEvaluateStudentPaper = async (req, res, next) => {
  try {
    const { examId, studentId } = req.params;
    const { questionId } = req.body;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const student = await User.findById(studentId).select("username rollNo email");
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Student exam progress not found." });
    }

    // Resolve question
    let targetQuestion = null;
    if (questionId) {
      targetQuestion = await ExamQuestion.findById(questionId);
    }
    if (!targetQuestion) {
      const alloc = await ExamAllocation.findOne({ examId, studentId })
        .populate("questionId")
        .populate("assignedQuestionIds")
        .lean();
      const assigned =
        alloc?.assignedQuestionIds?.length > 0
          ? alloc.assignedQuestionIds
          : alloc?.questionId
          ? [alloc.questionId]
          : [];
      targetQuestion = assigned[0];
    }

    if (!targetQuestion) {
      return res.status(404).json({ message: "Target question not found for evaluation." });
    }

    // Fetch latest submitted answer for this question
    const latestSub = await ExamAnswerSubmission.findOne({
      examId,
      studentId,
      questionId: targetQuestion._id,
    }).sort({ attemptNumber: -1 });

    if (!latestSub) {
      return res.status(400).json({
        message: "No submitted conceptual answer found for this student.",
      });
    }

    const qKey = targetQuestion._id.toString();
    const existingQp = progress.questionProgress?.get
      ? progress.questionProgress.get(qKey)
      : progress.questionProgress?.[qKey];

    // Prevent duplicate simultaneous evaluations for THIS specific question
    if (
      latestSub.status === "evaluating" ||
      existingQp?.status === "evaluating" ||
      (!existingQp && progress.status === "evaluating")
    ) {
      return res.status(409).json({
        message: "Evaluation is currently in progress for this question. Please wait.",
      });
    }

    // Mark evaluating on this submission & question
    latestSub.status = "evaluating";
    await latestSub.save();

    progress.status = "evaluating";
    progress.conceptualStatus = "evaluating";
    if (!progress.questionProgress) {
      progress.questionProgress = new Map();
    }
    const qp = existingQp
      ? (existingQp.toObject ? existingQp.toObject() : { ...existingQp })
      : { questionId: targetQuestion._id };
    qp.status = "evaluating";
    qp.conceptualStatus = "evaluating";
    if (progress.questionProgress.set) {
      progress.questionProgress.set(qKey, qp);
    } else {
      progress.questionProgress[qKey] = qp;
    }
    await progress.save();

    const persistEvaluationSuccess = async (evaluation) => {
      const errorPercentage = evaluation.errorPercentage;
      const understandingPercentage =
        evaluation.understandingPercentage ?? Math.max(0, 100 - errorPercentage);
      const maxMarks = evaluation.maximumMarks ?? (targetQuestion.marks || 10);
      const marksObtained =
        evaluation.totalMarks ??
        Math.round((understandingPercentage / 100) * maxMarks * 10) / 10;

      const evaluationReport = {
        ...evaluation,
        status: evaluation.status || "success",
        errorPercentage,
        understandingPercentage,
        rawScore: understandingPercentage,
        totalMarks: marksObtained,
        maximumMarks: maxMarks,
        percentage: understandingPercentage,
        isFallback: Boolean(evaluation.isFallback),
        evaluationSource: evaluation.evaluationSource || (evaluation.isFallback ? "rule_based_fallback" : "gemini"),
        correctConcepts: evaluation.correctConcepts || evaluation.strengths || [],
        missingConcepts: evaluation.missingConcepts || [],
        incorrectConcepts:
          evaluation.incorrectConcepts && evaluation.incorrectConcepts.length > 0
            ? evaluation.incorrectConcepts
            : (evaluation.identifiedIssues || []).map((i) => `${i.criterion}: ${i.description}`),
        improvementSuggestions:
          evaluation.improvementSuggestions ||
          evaluation.suggestions ||
          (evaluation.identifiedIssues || []).map((i) => i.hint).filter(Boolean),
        suggestions:
          evaluation.improvementSuggestions ||
          evaluation.suggestions ||
          (evaluation.identifiedIssues || []).map((i) => i.hint).filter(Boolean),
      };

      latestSub.aiEvaluation = evaluationReport;
      latestSub.status = "evaluated";
      latestSub.evaluatedAt = new Date();
      await latestSub.save();

      // Prevent an older evaluation from overwriting a newer submission's progress/evaluation
      const freshProgress = await StudentExamProgress.findOne({ examId, studentId });
      const activeProgress = freshProgress || progress;
      const existingQp = activeProgress.questionProgress?.get
        ? activeProgress.questionProgress.get(qKey)
        : activeProgress.questionProgress?.[qKey];
      const latestTrackedAttempt =
        existingQp?.conceptualAttemptsCount ?? activeProgress.conceptualAttemptsCount ?? latestSub.attemptNumber;

      let hasNewerSubmission = latestTrackedAttempt > latestSub.attemptNumber;
      if (!hasNewerSubmission && mongoose.connection?.readyState === 1) {
        try {
          const newerSub = await ExamAnswerSubmission.findOne({
            examId,
            studentId,
            questionId: targetQuestion._id,
            attemptNumber: { $gt: latestSub.attemptNumber },
          })
            .select("_id attemptNumber")
            .lean();
          if (newerSub) hasNewerSubmission = true;
        } catch (_) {}
      }

      if (!hasNewerSubmission) {
        activeProgress.lastAIEvaluation = evaluationReport;
        activeProgress.conceptualStatus = "evaluated";
        activeProgress.status = "waiting_faculty_decision";
        activeProgress.compilerAllowed = false;
        activeProgress.evaluatedAt = new Date();

        if (!activeProgress.questionProgress) {
          activeProgress.questionProgress = new Map();
        }
        const updatedQp = {
          ...(existingQp || {}),
          questionId: targetQuestion._id,
          lastAIEvaluation: evaluationReport,
          conceptualStatus: "evaluated",
          status: "waiting_faculty_decision",
          compilerAllowed: false,
          evaluatedAt: new Date(),
        };
        if (activeProgress.questionProgress.set) {
          activeProgress.questionProgress.set(qKey, updatedQp);
        } else {
          activeProgress.questionProgress[qKey] = updatedQp;
        }
        await activeProgress.save();
      }

      await ExamAuditLog.create({
        examId,
        actorId: req.user.userId,
        actorRole: req.user.role || "admin",
        action: "FACULTY_TRIGGERED_AI_EVALUATION",
        details: {
          studentId,
          questionId: targetQuestion._id,
          submissionId: latestSub._id,
          attemptNumber: latestSub.attemptNumber,
          errorPercentage,
          understandingPercentage,
          isFallback: Boolean(evaluation.isFallback),
        },
      });

      return { evaluationReport, errorPercentage, understandingPercentage, maxMarks, marksObtained };
    };

    const persistEvaluationFailure = async () => {
      latestSub.status = "submitted";
      await latestSub.save();

      const freshProgress = await StudentExamProgress.findOne({ examId, studentId });
      const activeProgress = freshProgress || progress;
      const existingQp = activeProgress.questionProgress?.get
        ? activeProgress.questionProgress.get(qKey)
        : activeProgress.questionProgress?.[qKey];
      const latestTrackedAttempt =
        existingQp?.conceptualAttemptsCount ?? activeProgress.conceptualAttemptsCount ?? latestSub.attemptNumber;

      if (latestTrackedAttempt <= latestSub.attemptNumber) {
        activeProgress.status = "awaiting_faculty_evaluation";
        activeProgress.conceptualStatus = "submitted";
        if (activeProgress.questionProgress && activeProgress.questionProgress.get && activeProgress.questionProgress.get(qKey)) {
          const qp = activeProgress.questionProgress.get(qKey);
          qp.status = "awaiting_faculty_evaluation";
          qp.conceptualStatus = "submitted";
          activeProgress.questionProgress.set(qKey, qp);
        }
        await activeProgress.save();
      }
    };

    const isAsyncMode = req.query?.async === "true" || req.body?.async === true;

    const queued = aiEvaluationQueue.enqueue({
      examId,
      studentId,
      questionId: targetQuestion._id,
      submissionId: latestSub._id,
      attemptNumber: latestSub.attemptNumber,
      facultyId: req.user.userId,
      task: ({ retryCount, maxRetries }) =>
        evaluateConceptualAnswer({
          question: targetQuestion,
          studentAnswer: latestSub.answerText,
          attemptNumber: latestSub.attemptNumber,
          allowFallback: retryCount >= maxRetries,
        }),
      onCompleted: isAsyncMode ? (evalRes) => persistEvaluationSuccess(evalRes) : null,
      onFailed: isAsyncMode ? () => persistEvaluationFailure() : null,
    });

    if (isAsyncMode) {
      return res.status(202).json({
        queued: true,
        deduplicated: queued.deduplicated,
        job: queued.job,
        queueStats: aiEvaluationQueue.getStats(),
        message: "AI evaluation queued for background processing.",
      });
    }

    let evaluation = await queued.promise;

    // If Gemini failed with a non-retryable HTTP/config error (not malformed JSON),
    // use the rubric-aware fallback rather than failing with 502.
    if (evaluation.status === "failed" && evaluation.retryable === false) {
      const fallback = generateConceptualFallback({
        question: targetQuestion,
        studentAnswer: latestSub.answerText,
      });
      fallback.isFallback = true;
      fallback.evaluationSource = "rule_based_fallback";
      fallback.rubricWarnings = [
        ...(fallback.rubricWarnings || []),
        `${evaluation.error || "Gemini API unavailable"}; evaluated with rubric-aware fallback.`,
      ];
      evaluation = fallback;
    }

    // Never save fabricated marks if Gemini returned malformed/inconsistent JSON
    if (evaluation.status === "failed") {
      await persistEvaluationFailure();
      return res.status(502).json({
        message: evaluation.error || "AI evaluation failed or returned an invalid response. Please retry.",
        retryable: true,
        rubricWarnings: evaluation.rubricWarnings || [],
      });
    }

    const { evaluationReport, errorPercentage, understandingPercentage, maxMarks, marksObtained } =
      await persistEvaluationSuccess(evaluation);

    res.status(200).json({
      message: "AI evaluation completed successfully.",
      submissionId: latestSub._id,
      studentId: student._id,
      studentName: student.username,
      rollNo: student.rollNo,
      questionNumber: targetQuestion.questionNumber || "Q1",
      questionTitle: targetQuestion.title,
      questionId: targetQuestion._id,
      conceptualAnswer: latestSub.answerText,
      marksObtained,
      totalMarks: maxMarks,
      correctnessPercentage: understandingPercentage,
      understandingPercentage,
      errorPercentage,
      correctConcepts: evaluationReport.correctConcepts,
      missingConcepts: evaluationReport.missingConcepts,
      incorrectConcepts: evaluationReport.incorrectConcepts,
      suggestions: evaluationReport.suggestions,
      feedbackSummary: evaluation.feedbackSummary,
      evaluationStatus: "Evaluated",
      attemptNumber: latestSub.attemptNumber,
      canAllowToCode: errorPercentage < 50,
      requiresRevision: errorPercentage >= 50,
      report: evaluationReport,
    });
  } catch (error) {
    // Reset evaluating state on error (both top-level and per-question progress)
    try {
      const resetFields = {
        status: "awaiting_faculty_evaluation",
        conceptualStatus: "submitted",
      };
      if (req.body?.questionId) {
        const qKey = req.body.questionId.toString();
        resetFields[`questionProgress.${qKey}.status`] = "awaiting_faculty_evaluation";
        resetFields[`questionProgress.${qKey}.conceptualStatus`] = "submitted";
      }
      await StudentExamProgress.updateOne(
        { examId: req.params.examId, studentId: req.params.studentId },
        { $set: resetFields }
      );
      await ExamAnswerSubmission.updateMany(
        { examId: req.params.examId, studentId: req.params.studentId, status: "evaluating" },
        { status: "submitted" }
      );
    } catch (_) {}
    next(error);
  }
};

/**
 * Faculty Action: Allow to Code (Condition A: errorPercentage < 50)
 * Unlocks the code editor environment for the student.
 */
export const facultyAuthorizeCompiler = async (req, res, next) => {
  try {
    const { examId, studentId } = req.params;
    const { questionId } = req.body;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Student progress record not found." });
    }

    const query = { examId, studentId };
    if (questionId) query.questionId = questionId;
    const latestSub = await ExamAnswerSubmission.findOne(query).sort({ attemptNumber: -1 });

    if (!latestSub || !latestSub.aiEvaluation) {
      return res.status(400).json({
        message: "No evaluated answer found. You must evaluate the conceptual answer first.",
      });
    }

    if (latestSub.aiEvaluation.errorPercentage >= 50) {
      return res.status(400).json({
        message: `Cannot allow compiler access: Student error percentage (${latestSub.aiEvaluation.errorPercentage}%) is 50% or above. Return to Notepad for correction instead.`,
      });
    }

    const now = new Date();
    const facultyId = req.user.userId;

    // Update submission
    latestSub.isApproved = true;
    latestSub.status = "approved";
    latestSub.facultyDecision = "allow_to_code";
    latestSub.facultyDecisionAt = now;
    latestSub.facultyId = facultyId;
    await latestSub.save();

    // Update progress atomically when connected/mocked so concurrent student drafts are never clobbered
    if (
      typeof StudentExamProgress.findOneAndUpdate === "function" &&
      (mongoose.connection?.readyState === 1 ||
        StudentExamProgress.findOneAndUpdate !== mongoose.Model.findOneAndUpdate)
    ) {
      const setFields = {
        compilerAllowed: true,
        compilerAllowedAt: now,
        conceptualStatus: "approved",
        status: "coding_in_progress",
        facultyDecision: "allow_to_code",
        facultyDecisionAt: now,
        facultyId,
      };
      if (latestSub.questionId) {
        const qKey = latestSub.questionId.toString();
        setFields[`questionProgress.${qKey}.questionId`] = latestSub.questionId;
        setFields[`questionProgress.${qKey}.compilerAllowed`] = true;
        setFields[`questionProgress.${qKey}.compilerAllowedAt`] = now;
        setFields[`questionProgress.${qKey}.conceptualStatus`] = "approved";
        setFields[`questionProgress.${qKey}.status`] = "compiler_access_granted";
        setFields[`questionProgress.${qKey}.facultyDecision`] = "allow_to_code";
        setFields[`questionProgress.${qKey}.facultyDecisionAt`] = now;
        setFields[`questionProgress.${qKey}.facultyId`] = facultyId;
      }
      await StudentExamProgress.findOneAndUpdate(
        {
          examId,
          studentId,
          status: { $nin: ["completed", "successfully_completed", "time_expired"] },
        },
        { $set: setFields },
        { new: true }
      );
    } else {
      progress.compilerAllowed = true;
      progress.compilerAllowedAt = now;
      progress.conceptualStatus = "approved";
      progress.status = "coding_in_progress";
      progress.facultyDecision = "allow_to_code";
      progress.facultyDecisionAt = now;
      progress.facultyId = facultyId;

      if (latestSub.questionId) {
        const qKey = latestSub.questionId.toString();
        if (!progress.questionProgress) progress.questionProgress = new Map();
        const qp = progress.questionProgress.get(qKey) || { questionId: latestSub.questionId };
        qp.compilerAllowed = true;
        qp.compilerAllowedAt = now;
        qp.conceptualStatus = "approved";
        qp.status = "compiler_access_granted";
        qp.facultyDecision = "allow_to_code";
        qp.facultyDecisionAt = now;
        qp.facultyId = facultyId;
        progress.questionProgress.set(qKey, qp);
      }
      await progress.save();
    }

    // Audit Log
    await ExamAuditLog.create({
      examId,
      actorId: facultyId,
      actorRole: req.user.role || "admin",
      action: "FACULTY_ALLOWED_COMPILER_ACCESS",
      details: {
        studentId,
        questionId: latestSub.questionId,
        errorPercentage: latestSub.aiEvaluation.errorPercentage,
        decisionTimestamp: now,
      },
    });

    res.status(200).json({
      message: "Faculty authorization approved: Code editor unlocked for student.",
      compilerAllowed: true,
      conceptualStatus: "approved",
      status: "coding_in_progress",
      decisionAt: now,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Faculty Action: Return to Notepad (Condition B: errorPercentage >= 50)
 * Returns student to Notepad with feedback and requires correction.
 */
export const facultyReturnToNotepad = async (req, res, next) => {
  try {
    const { examId, studentId } = req.params;
    const { questionId, feedback } = req.body;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Student progress record not found." });
    }

    const query = { examId, studentId };
    if (questionId) query.questionId = questionId;
    const latestSub = await ExamAnswerSubmission.findOne(query).sort({ attemptNumber: -1 });

    if (!latestSub) {
      return res.status(400).json({
        message: "No conceptual submission found for this student.",
      });
    }

    const now = new Date();
    const facultyId = req.user.userId;
    const feedbackNote = feedback || "Your conceptual answer requires improvement. Please review the faculty feedback and correct your answer before resubmitting.";

    // Update submission
    latestSub.isApproved = false;
    latestSub.status = "correction_required";
    latestSub.facultyDecision = "return_to_notepad";
    latestSub.facultyDecisionAt = now;
    latestSub.facultyId = facultyId;
    latestSub.facultyFeedback = feedbackNote;
    await latestSub.save();

    // Update progress (compiler remains disabled until faculty explicitly approves)
    progress.compilerAllowed = false;
    progress.conceptualStatus = "correction_required";
    progress.status = "notepad_correction_required";
    progress.facultyDecision = "return_to_notepad";
    progress.facultyDecisionAt = now;
    progress.facultyId = facultyId;
    progress.facultyFeedback = feedbackNote;
    if (latestSub.aiEvaluation) {
      progress.lastAIEvaluation = latestSub.aiEvaluation;
    }

    if (latestSub.questionId) {
      const qKey = latestSub.questionId.toString();
      if (!progress.questionProgress) progress.questionProgress = new Map();
      const rawQp = progress.questionProgress.get(qKey);
      const qp = rawQp?.toObject ? rawQp.toObject() : (rawQp || { questionId: latestSub.questionId });
      qp.compilerAllowed = false;
      qp.conceptualStatus = "correction_required";
      qp.status = "correction_required";
      qp.facultyDecision = "return_to_notepad";
      qp.facultyDecisionAt = now;
      qp.facultyId = facultyId;
      qp.facultyFeedback = feedbackNote;
      if (latestSub.aiEvaluation) {
        qp.lastAIEvaluation = latestSub.aiEvaluation;
      }
      progress.questionProgress.set(qKey, qp);
      if (typeof progress.markModified === "function") {
        progress.markModified("questionProgress");
      }
    }
    await progress.save();

    // Audit Log
    await ExamAuditLog.create({
      examId,
      actorId: facultyId,
      actorRole: req.user.role || "admin",
      action: "FACULTY_RETURNED_TO_NOTEPAD",
      details: {
        studentId,
        questionId: latestSub.questionId,
        errorPercentage: latestSub.aiEvaluation?.errorPercentage,
        feedback: feedbackNote,
        decisionTimestamp: now,
      },
    });

    res.status(200).json({
      message: "Student returned to Notepad for revision.",
      compilerAllowed: false,
      conceptualStatus: "correction_required",
      status: "notepad_correction_required",
      feedback: feedbackNote,
      decisionAt: now,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch Student's Conceptual Evaluation Report and Revision History (for Faculty Inspection Modal).
 */
export const getStudentConceptualReport = async (req, res, next) => {
  try {
    const { examId, studentId } = req.params;
    const { questionId } = req.query;

    const student = await User.findById(studentId).select("username rollNo email");
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    const query = { examId, studentId };
    if (questionId) query.questionId = questionId;

    const allAttempts = await ExamAnswerSubmission.find(query)
      .populate("questionId", "title difficulty problemStatement evaluationRubric questionNumber marks")
      .sort({ attemptNumber: -1 })
      .lean();

    const latest = allAttempts[0] || null;
    const progress = await StudentExamProgress.findOne({ examId, studentId }).lean();

    const targetQ = latest?.questionId || (questionId ? await ExamQuestion.findById(questionId).select("title difficulty problemStatement evaluationRubric questionNumber marks").lean() : null);
    const maxMarks = latest?.aiEvaluation?.maximumMarks || targetQ?.marks || 10;
    const errPct = latest?.aiEvaluation?.errorPercentage;
    const undPct = errPct !== undefined && errPct !== null ? Math.max(0, 100 - errPct) : null;
    const marksObtained =
      latest?.aiEvaluation?.totalMarks !== undefined && latest?.aiEvaluation?.totalMarks !== null
        ? latest.aiEvaluation.totalMarks
        : undPct !== null
        ? Math.round((undPct / 100) * maxMarks * 10) / 10
        : null;

    res.status(200).json({
      student: {
        _id: student._id,
        username: student.username,
        rollNo: student.rollNo,
        email: student.email,
      },
      question: targetQ || null,
      marksObtained,
      totalMarks: maxMarks,
      correctnessPercentage: undPct,
      latestSubmission: latest,
      allAttempts,
      progress: progress || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Run C Code in Exam Mode (Tests against VISIBLE sample cases only).
 * Supports optional questionId for multi-question assignments.
 */
const activeCodeSubmissionLocks = new Set();
const activeVivaSubmissionLocks = new Set();

/**
 * Authoritative server-side validation for exam enrollment, active status, and deadline expiry.
 * Never trusts client-provided timestamps or completion flags.
 */
export const validateExamAccessAndTiming = ({
  exam,
  progress,
  studentId,
  isViva = false,
  nowMs = Date.now(),
}) => {
  if (
    exam &&
    Array.isArray(exam.participatingStudents) &&
    exam.participatingStudents.length > 0
  ) {
    const isEnrolled = exam.participatingStudents.some(
      (id) => id && id.toString() === studentId.toString()
    );
    if (!isEnrolled) {
      return {
        ok: false,
        status: 403,
        body: { message: "You are not enrolled in this examination." },
      };
    }
  }

  if (progress?.status === "time_expired") {
    return {
      ok: false,
      status: 403,
      body: {
        message: "Examination time has expired.",
        isTimeExpired: true,
        isCompleted: true,
      },
    };
  }

  if (!exam) {
    return { ok: true, deadlineMs: null, remainingMs: null };
  }

  if (exam.status === "completed") {
    return {
      ok: false,
      status: 403,
      body: {
        message: "Examination has been ended by faculty. Submissions are no longer accepted.",
        isCompleted: true,
        facultyEndedExam: true,
      },
    };
  }

  if (exam.status !== "in_progress") {
    return {
      ok: false,
      status: 403,
      body: { message: "Exam is not currently active." },
    };
  }

  const useVivaTiming = isViva || exam.examType === "viva";
  const startSource = useVivaTiming
    ? progress?.vivaStartedAt || exam.startedAt
    : exam.startedAt;
  const startMs = startSource ? new Date(startSource).getTime() : NaN;
  const durationMins = Number(exam.durationMinutes);

  if (!Number.isFinite(startMs) || !Number.isFinite(durationMins) || durationMins <= 0) {
    return {
      ok: false,
      status: 403,
      body: {
        message: "Examination timing configuration is invalid or not initialized.",
      },
    };
  }

  const deadlineMs = startMs + durationMins * 60 * 1000;
  if (nowMs >= deadlineMs) {
    return {
      ok: false,
      status: 403,
      body: {
        message: "Examination time has expired.",
        isTimeExpired: true,
      },
    };
  }

  return {
    ok: true,
    deadlineMs,
    remainingMs: deadlineMs - nowMs,
  };
};

const handleExamQueueError = (res, queueErr, fallbackMessage) => {
  if (
    queueErr?.code === "QUEUE_OVERLOAD" ||
    queueErr?.code === "QUEUE_TIMEOUT" ||
    queueErr instanceof ExecutionServiceError
  ) {
    const retryAfter = queueErr.retryAfterSeconds || 5;
    if (typeof res.set === "function") {
      res.set("Retry-After", String(retryAfter));
    }
    return res.status(queueErr.statusCode || 503).json({
      success: false,
      message: queueErr.message || fallbackMessage,
      code: queueErr.code || "EXECUTION_UNAVAILABLE",
      retryable: true,
      retryAfterSeconds: retryAfter,
    });
  }
  return null;
};

/**
 * Run Code in Exam Mode (Sample/Visible Test Cases ONLY) via shared submissionQueue.
 */
export const runExamCode = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { code, questionId } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ message: "Code cannot be empty." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(403).json({ message: "Progress record not found." });
    }

    if (progress.status === "completed" || progress.status === "successfully_completed") {
      return res.status(403).json({
        message: "Examination has already been completed. Code execution is locked.",
        isCompleted: true,
      });
    }

    let exam = null;
    if (
      (mongoose.connection && mongoose.connection.readyState === 1) ||
      Exam.findById !== mongoose.Model.findById
    ) {
      const examQuery = Exam.findById(examId);
      exam =
        typeof examQuery?.select === "function"
          ? await examQuery.select(
              "status startedAt durationMinutes completedAt examType participatingStudents"
            )
          : await examQuery;
      if (!exam) {
        return res.status(404).json({ message: "Exam not found." });
      }
    }

    const timingCheck = validateExamAccessAndTiming({
      exam,
      progress,
      studentId,
      isViva: false,
    });
    if (!timingCheck.ok) {
      return res.status(timingCheck.status).json(timingCheck.body);
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .populate("assignedQuestionIds")
      .lean();

    if (!allocation) {
      return res.status(404).json({ message: "Question allocation not found." });
    }

    const assigned =
      allocation.assignedQuestionIds && allocation.assignedQuestionIds.length > 0
        ? allocation.assignedQuestionIds
        : allocation.questionId
        ? [allocation.questionId]
        : [];

    let targetQuestion = null;
    if (questionId) {
      targetQuestion = assigned.find(
        (q) => q._id && q._id.toString() === questionId.toString()
      );
      if (!targetQuestion) {
        return res.status(403).json({
          message: "Unauthorized: This question is not assigned to your account.",
        });
      }
    } else {
      targetQuestion = assigned[0];
    }

    if (!targetQuestion) {
      return res.status(404).json({ message: "Question not found." });
    }

    const qKey = targetQuestion._id.toString();
    const qProg = progress.questionProgress?.get
      ? progress.questionProgress.get(qKey)
      : progress.questionProgress?.[qKey];

    const isAllowed = Boolean(
      qProg?.compilerAllowed || (assigned.length === 1 && progress.compilerAllowed)
    );
    if (!isAllowed) {
      return res.status(403).json({
        message: "Compiler access is locked for this question. Your conceptual answer must be evaluated and approved by faculty first.",
      });
    }

    // Run only against VISIBLE sample test cases (never expose or execute hidden/private cases)
    const visibleTestCases = (targetQuestion.testCases || []).filter(
      (tc) => !tc.isHidden && tc.type !== "hidden"
    );

    if (visibleTestCases.length === 0) {
      return res.status(400).json({
        success: false,
        missingSampleCases: true,
        message: "No visible sample test cases are configured for this question.",
        testResults: [],
        testCasesPassed: 0,
        totalTestCases: 0,
      });
    }

    const sampleCases = visibleTestCases.map((tc, idx) => ({
      testCaseNumber: idx + 1,
      input: String(tc.input ?? ""),
      expectedOutput: String(tc.expectedOutput ?? ""),
      isHidden: false,
      timeLimitMs: tc.timeLimitMs || 3000,
    }));

    let runResult;
    try {
      runResult = await submissionQueue.enqueue(
        () =>
          runCCode({
            code,
            mode: "sample",
            problem: targetQuestion,
            sampleCases,
            problemTitle: targetQuestion.title,
          }),
        {
          userId: studentId,
          examId,
          questionId: targetQuestion._id?.toString(),
          action: "exam_run",
        }
      );
    } catch (queueErr) {
      const handled = handleExamQueueError(
        res,
        queueErr,
        "Execution server is currently busy. Please retry in a few seconds."
      );
      if (handled) return handled;
      throw queueErr;
    }

    const diagnostics = runResult.compilerOutput
      ? parseGccDiagnostics(runResult.compilerOutput)
      : [];

    const passedSampleCount = runResult.testCasesPassed ?? 0;
    const totalSampleCount = runResult.totalTestCases ?? sampleCases.length;
    const failedSampleCount = Math.max(0, totalSampleCount - passedSampleCount);
    const summary = {
      passedTests: passedSampleCount,
      failedTests: failedSampleCount,
      totalTests: totalSampleCount,
    };
    const formattedTestCases = (runResult.testCases || []).map((tc) => ({
      ...tc,
      visibility: "visible",
      isHidden: false,
      passed: tc.status === "passed" || Boolean(tc.passed),
    }));

    // Find first runtime or time limit error message if any
    const runtimeErrorCase = formattedTestCases.find(
      (tc) => tc.status === "runtime_error" || tc.status === "time_limit"
    );
    const runtimeErrorMessage = runtimeErrorCase ? runtimeErrorCase.error || "Runtime error occurred during execution." : "";

    res.status(200).json({
      success: true,
      status: runResult.status,
      allPassed:
        runResult.status === "accepted" ||
        (totalSampleCount > 0 && passedSampleCount === totalSampleCount),
      summary,
      testResults: formattedTestCases,
      testCasesPassed: passedSampleCount,
      totalTestCases: totalSampleCount,
      passedTests: passedSampleCount,
      totalTests: totalSampleCount,
      failedTests: failedSampleCount,
      passedSampleCases: passedSampleCount,
      totalSampleCases: totalSampleCount,
      executionTime: runResult.executionTime || 0,
      compilerOutput: runResult.compilerOutput || "",
      compilationError:
        runResult.status === "compile_error" ? runResult.compilerOutput : "",
      runtimeError: runtimeErrorMessage,
      testCases: formattedTestCases,
      results: formattedTestCases,
      runResult: {
        ...runResult,
        summary,
        testResults: formattedTestCases,
        testCasesPassed: passedSampleCount,
        totalTestCases: totalSampleCount,
        passedSampleCases: passedSampleCount,
        totalSampleCases: totalSampleCount,
        testCases: formattedTestCases,
        results: formattedTestCases,
        runtimeError: runtimeErrorMessage,
      },
      diagnostics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Final Code Submission in Exam Mode (Evaluates against ALL visible and hidden test cases).
 * Supports multi-question allocations with per-question progress and completion tracking.
 */
export const submitExamCode = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { code, questionId } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ message: "Code cannot be empty." });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(403).json({ message: "Progress record not found." });
    }

    let exam = null;
    if (
      (mongoose.connection && mongoose.connection.readyState === 1) ||
      Exam.findById !== mongoose.Model.findById
    ) {
      exam = await Exam.findById(examId).select(
        "status completedAt title startedAt durationMinutes examType participatingStudents"
      );
      if (!exam) {
        return res.status(404).json({ message: "Exam not found." });
      }
    }

    const timingCheck = validateExamAccessAndTiming({
      exam,
      progress,
      studentId,
      isViva: false,
    });
    if (!timingCheck.ok) {
      return res.status(timingCheck.status).json(timingCheck.body);
    }

    if (progress.status === "completed" || progress.status === "successfully_completed") {
      return res.status(403).json({
        message: "Examination has already been completed. Code submission is locked.",
        isCompleted: true,
        facultyEndedExam: progress.completionReason === "faculty_ended",
      });
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .populate("assignedQuestionIds")
      .lean();

    if (!allocation) {
      return res.status(404).json({ message: "Question allocation not found." });
    }

    const assigned =
      allocation.assignedQuestionIds && allocation.assignedQuestionIds.length > 0
        ? allocation.assignedQuestionIds
        : allocation.questionId
        ? [allocation.questionId]
        : [];

    let question = null;
    if (questionId) {
      question = assigned.find(
        (q) => q._id && q._id.toString() === questionId.toString()
      );
    }
    if (!question) {
      question = assigned[0];
    }

    if (!question) {
      return res.status(404).json({ message: "Question not found." });
    }

    const qKey = question._id.toString();
    const qProg = progress.questionProgress?.get
      ? progress.questionProgress.get(qKey)
      : progress.questionProgress?.[qKey];

    const isAllowed = Boolean(
      qProg?.compilerAllowed || (assigned.length === 1 && progress.compilerAllowed)
    );
    const approvedAnswer = await ExamAnswerSubmission.findOne({
      examId,
      studentId,
      questionId: question._id,
      isApproved: true,
    }).lean();

    const hasApprovedConceptual = Boolean(
      approvedAnswer ||
      (qProg && qProg.compilerAllowed && qProg.lastAIEvaluation?.errorPercentage < 50) ||
      (assigned.length === 1 && progress.compilerAllowed && progress.lastAIEvaluation?.errorPercentage < 50)
    );

    if (!isAllowed || !hasApprovedConceptual) {
      return res.status(403).json({
        message: "Unauthorized code submission: You must complete and pass the conceptual Notepad evaluation before submitting code for this question.",
      });
    }

    const qProgObj = qProg?.toObject ? qProg.toObject() : qProg;
    if (qProgObj?.isCompleted) {
      return res.status(409).json({
        success: false,
        alreadySubmitted: true,
        isCompleted: true,
        message: "You have already submitted a passing solution for this question.",
      });
    }

    const codeLockKey = `${examId}:${studentId}:${qKey}`;
    if (activeCodeSubmissionLocks.has(codeLockKey) || qProgObj?.status === "submission_pending") {
      return res.status(409).json({
        success: false,
        submissionInProgress: true,
        message: "A submission for this question is already being evaluated. Please wait.",
      });
    }

    activeCodeSubmissionLocks.add(codeLockKey);
    let dbClaimedCodeLock = false;
    let persistedCodeSubmission = false;

    const releaseCodeSubmissionLock = async () => {
      activeCodeSubmissionLocks.delete(codeLockKey);
      if (!persistedCodeSubmission && dbClaimedCodeLock) {
        if (
          typeof StudentExamProgress.updateOne === "function" &&
          (mongoose.connection?.readyState === 1 ||
            StudentExamProgress.updateOne !== mongoose.Model.updateOne)
        ) {
          await StudentExamProgress.updateOne(
            {
              examId,
              studentId,
              [`questionProgress.${qKey}.isCompleted`]: { $ne: true },
              [`questionProgress.${qKey}.status`]: "submission_pending",
            },
            {
              $set: { [`questionProgress.${qKey}.status`]: "coding_in_progress" },
            }
          ).catch(() => {});
        }
      }
    };

    try {
      if (
        typeof StudentExamProgress.findOneAndUpdate === "function" &&
        (mongoose.connection?.readyState === 1 ||
          StudentExamProgress.findOneAndUpdate !== mongoose.Model.findOneAndUpdate)
      ) {
        const claimed = await StudentExamProgress.findOneAndUpdate(
          {
            examId,
            studentId,
            status: { $nin: ["completed", "successfully_completed", "time_expired"] },
            [`questionProgress.${qKey}.isCompleted`]: { $ne: true },
            [`questionProgress.${qKey}.status`]: { $ne: "submission_pending" },
          },
          {
            $set: {
              [`questionProgress.${qKey}.questionId`]: question._id,
              [`questionProgress.${qKey}.compilerAllowed`]: true,
              [`questionProgress.${qKey}.status`]: "submission_pending",
            },
          },
          { new: true }
        );
        if (!claimed) {
          return res.status(409).json({
            success: false,
            alreadySubmittedOrInProgress: true,
            message: "Submission is already in progress or already completed for this question.",
          });
        }
        progress = claimed;
        dbClaimedCodeLock = true;
      }

      const allTestCases = question.testCases || [];

      // Execute against all test cases in deterministic sandbox via shared submission queue
      let judgeResult;
      try {
        judgeResult = await submissionQueue.enqueue(
          () =>
            judgeSubmission({
              code,
              testCases: allTestCases,
              problemTitle: question.title,
            }),
          {
            userId: studentId,
            examId,
            questionId: question._id?.toString(),
            action: "exam_submit",
          }
        );
      } catch (queueErr) {
        const handled = handleExamQueueError(
          res,
          queueErr,
          "Submission queue is currently busy. Please retry in a few seconds."
        );
        if (handled) return handled;
        throw queueErr;
      }

      // Re-check if faculty ended the exam while execution was in flight
      if (
        (mongoose.connection && mongoose.connection.readyState === 1) ||
        Exam.findById !== mongoose.Model.findById
      ) {
        const latestExamQuery = Exam.findById(examId);
        const latestExam =
          typeof latestExamQuery?.select === "function"
            ? await latestExamQuery.select("status completedAt")
            : await latestExamQuery;
        if (latestExam && latestExam.status === "completed") {
          return res.status(403).json({
            message: "Examination has been ended by faculty. Submissions are no longer accepted.",
            isCompleted: true,
            facultyEndedExam: true,
          });
        }
      }

    const allPassed = judgeResult.status === "accepted";

    // Save immutable snapshot
    const submission = await ExamCodeSubmission.create({
      examId,
      studentId,
      questionId: question._id,
      code,
      language: "c",
      status: judgeResult.status,
      testCasesPassed: judgeResult.testCasesPassed || 0,
      totalTestCases: judgeResult.totalTestCases || allTestCases.length,
      testCaseResults: judgeResult.testCaseResults || [],
      allPassed,
      executionTime: judgeResult.executionTime || 0,
      compilerOutput: judgeResult.compilerOutput || "",
    });

    // Update question progress
    progress.currentCode = code;
    if (!progress.questionProgress) {
      progress.questionProgress = new Map();
    }
    const rawQProg = progress.questionProgress.get(qKey);
    const currentQProg = rawQProg?.toObject
      ? rawQProg.toObject()
      : rawQProg || {
          questionId: question._id,
          compilerAllowed: true,
        };
    currentQProg.currentCode = code;

    if (allPassed) {
      currentQProg.isCompleted = true;
      currentQProg.completedAt = currentQProg.completedAt || new Date();
      currentQProg.score = question.marks || 100;
      currentQProg.status = "completed";
      progress.questionProgress.set(qKey, currentQProg);
    } else {
      currentQProg.status = "test_cases_failed";
      progress.questionProgress.set(qKey, currentQProg);
    }

    if (typeof progress.markModified === "function") {
      progress.markModified("questionProgress");
    }

    // Count independently completed questions across all assigned questions
    const assignedQuestionCount = assigned.length || 1;
    let submittedQuestionCount = 0;
    for (const qItem of assigned) {
      const itemKey = qItem._id.toString();
      const rawItemProg = progress.questionProgress.get(itemKey);
      const itemProg = rawItemProg?.toObject ? rawItemProg.toObject() : rawItemProg;
      if (itemProg && itemProg.isCompleted) {
        submittedQuestionCount += 1;
      }
    }
    const remainingQuestionCount = Math.max(0, assignedQuestionCount - submittedQuestionCount);
    const facultyEndedExam = Boolean(exam && exam.status === "completed");

    if (facultyEndedExam) {
      progress.status = "completed";
      progress.completionReason = "faculty_ended";
      progress.completedAt = progress.completedAt || exam.completedAt || new Date();
    } else if (submittedQuestionCount >= assignedQuestionCount) {
      // Condition 2: All assigned questions submitted — await explicit "Finish Exam" click from student
      progress.status = "coding_in_progress";
      progress.finalScore = assigned.reduce(
        (sum, qItem) => sum + (qItem.marks || 100),
        0
      );
    } else {
      progress.status = allPassed ? "coding_in_progress" : "test_cases_failed";
    }

    await progress.save();
    persistedCodeSubmission = true;

    const allQuestionsSubmitted = submittedQuestionCount >= assignedQuestionCount;

    // Find next uncompleted question for "Next Question" navigation
    const currentIdx = assigned.findIndex((qItem) => qItem._id.toString() === qKey);
    let nextQuestion = null;
    if (remainingQuestionCount > 0) {
      for (let offset = 1; offset <= assigned.length; offset++) {
        const candidate = assigned[(Math.max(0, currentIdx) + offset) % assigned.length];
        const candKey = candidate._id.toString();
        const rawCandProg = progress.questionProgress.get(candKey);
        const candProg = rawCandProg?.toObject ? rawCandProg.toObject() : rawCandProg;
        if (!candProg || !candProg.isCompleted) {
          nextQuestion = {
            _id: candidate._id,
            questionNumber: candidate.questionNumber || `Q${((Math.max(0, currentIdx) + offset) % assigned.length) + 1}`,
            title: candidate.title,
            compilerAllowed: Boolean(candProg?.compilerAllowed),
          };
          break;
        }
      }
    }

    // STRICT SANITIZATION: Never leak hidden test cases back to the student
    const sanitized = sanitizeExamCodeSubmissionForStudent(submission);
    const diagnostics = submission.compilerOutput
      ? parseGccDiagnostics(submission.compilerOutput)
      : [];

    const passedCount = submission.testCasesPassed ?? 0;
    const totalCount = submission.totalTestCases ?? allTestCases.length;
    const failedCount = Math.max(0, totalCount - passedCount);
    const testCasesList = sanitized?.testCases || [];
    const summary = {
      passedTests: passedCount,
      failedTests: failedCount,
      totalTests: totalCount,
    };

    const isExamCompleted =
      progress.status === "successfully_completed" || progress.status === "completed";

    res.status(201).json({
      success: true,
      message: allPassed
        ? isExamCompleted
          ? "Congratulations! You have successfully completed all assigned questions."
          : `Successfully Completed ${question.questionNumber || `Question ${Math.max(0, currentIdx) + 1}`}! (${submittedQuestionCount} / ${assignedQuestionCount} Submitted)`
        : "Some test cases failed. Please review your code and try again.",
      status: submission.status,
      allPassed,
      isCompleted: allPassed,
      isExamCompleted,
      allQuestionsSubmitted,
      completionReason: progress.completionReason || null,
      assignedQuestionCount,
      submittedQuestionCount,
      remainingQuestionCount,
      currentQuestionNumber: question.questionNumber || `Question ${Math.max(0, currentIdx) + 1}`,
      nextQuestion,
      summary,
      testResults: testCasesList,
      testCasesPassed: passedCount,
      totalTestCases: totalCount,
      passedTests: passedCount,
      totalTests: totalCount,
      failedTests: failedCount,
      executionTime: submission.executionTime || 0,
      compilerOutput: submission.compilerOutput || "",
      compilationError:
        submission.status === "compile_error" ? submission.compilerOutput : "",
      testCases: testCasesList,
      testCaseResults: testCasesList,
      submission: sanitized,
      diagnostics,
    });
    } finally {
      await releaseCodeSubmissionLock();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get student exam completion summary with mandatory verification across all workflow stages.
 */
export const getStudentExamCompletion = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const isFacultyOrAdmin = req.user.role === "admin" || req.user.role === "faculty";
    const studentId =
      req.params.studentId && isFacultyOrAdmin ? req.params.studentId : req.user.userId;

    const codeSubsQuery =
      ExamCodeSubmission.find !== mongoose.Model.find || mongoose.connection?.readyState === 1
        ? ExamCodeSubmission.find({ examId, studentId }).sort({ submittedAt: -1 }).lean()
        : ExamCodeSubmission.findOne({ examId, studentId })
            .sort({ submittedAt: -1 })
            .lean()
            .then((doc) => (doc ? [doc] : []));

    const [exam, student, progress, allocation, latestApprovedAnswer, latestAnswerSub, allCodeSubs] =
      await Promise.all([
        Exam.findById(examId).lean(),
        User.findById(studentId).select("username rollNo email").lean(),
        StudentExamProgress.findOne({ examId, studentId }).lean(),
        ExamAllocation.findOne({ examId, studentId })
          .populate("questionId")
          .populate("assignedQuestionIds")
          .lean(),
        ExamAnswerSubmission.findOne({ examId, studentId, isApproved: true })
          .sort({ submittedAt: -1 })
          .lean(),
        ExamAnswerSubmission.findOne({ examId, studentId })
          .sort({ submittedAt: -1 })
          .lean(),
        codeSubsQuery,
      ]);

    const latestCodeSub = Array.isArray(allCodeSubs) && allCodeSubs.length > 0 ? allCodeSubs[0] : null;

    if (!exam || !student) {
      return res.status(404).json({ message: "Exam or student record not found." });
    }

    const isViva = exam.examType === "viva";
    let isSuccessfullyCompleted = false;
    let examStatus = "Not Started";
    let pendingStep = "";
    let message = "";
    let conceptualAnswerStatus = "Pending";
    let codeSubmissionStatus = "Pending";
    let testCasesPassed = 0;
    let testCasesFailed = 0;
    let totalTestCases = 0;
    let submissionTime = null;

    // Check if exam duration or overall exam has ended
    const examEnded = exam.status === "completed";
    const examTimeExpired = exam.startedAt && exam.durationMinutes
      ? Date.now() > new Date(exam.startedAt).getTime() + exam.durationMinutes * 60 * 1000
      : false;
    const isTimeExpired =
      (examEnded || examTimeExpired) &&
      progress?.status !== "completed" &&
      progress?.status !== "successfully_completed";

    let assignedQuestionCount = exam.questionsPerStudent || 1;
    let submittedQuestionCount = 0;
    let questionsAttempted = 0;
    let remainingQuestionCount = 0;
    let computedCodingScore = progress?.finalScore ?? null;
    let completionReason = progress?.completionReason || null;
    let nextQuestion = null;
    const facultyEndedExam = exam.status === "completed" || progress?.completionReason === "faculty_ended";

    if (isViva) {
      assignedQuestionCount = exam.questionsPerStudent || (Array.isArray(exam.vivaQuestions) ? exam.vivaQuestions.length : 1);
      questionsAttempted =
        progress?.vivaResult?.attempted ??
        (progress?.vivaAnswers?.size ?? 0);
      const isVivaDone =
        facultyEndedExam ||
        progress?.status === "completed" ||
        progress?.status === "successfully_completed" ||
        Boolean(progress?.vivaResult);

      if (isVivaDone) {
        isSuccessfullyCompleted = true;
        submittedQuestionCount = progress?.vivaResult?.attempted ?? assignedQuestionCount;
        remainingQuestionCount = Math.max(0, assignedQuestionCount - submittedQuestionCount);
        completionReason = facultyEndedExam ? "faculty_ended" : (completionReason || "all_questions_submitted");
        examStatus = facultyEndedExam ? "Examination Ended by Faculty" : "Successfully Completed";
        message = facultyEndedExam
          ? "The faculty has ended the examination. Your submitted responses have been recorded."
          : "You have successfully completed and submitted your Viva examination.";
        conceptualAnswerStatus = "N/A (Viva MCQ Exam)";
        codeSubmissionStatus = "N/A (Viva MCQ Exam)";
        testCasesPassed = progress?.vivaResult?.correct ?? 0;
        testCasesFailed = progress?.vivaResult?.incorrect ?? 0;
        totalTestCases = progress?.vivaResult?.totalQuestions ?? 0;
        submissionTime = progress?.vivaResult?.submittedAt || exam.completedAt || progress?.completedAt || null;
      } else {
        isSuccessfullyCompleted = false;
        if (isTimeExpired) {
          examStatus = "Time Expired";
          pendingStep = "Examination Time Limit Expired";
          message = "The examination time has expired. Your viva answers were not submitted in time.";
        } else if (progress?.status === "in_progress" || progress?.status === "instructions_acknowledged") {
          examStatus = "Coding In Progress";
          pendingStep = "Viva MCQ Response Submission";
          message = "Your Viva examination is currently in progress. Please complete all questions and submit.";
        } else {
          examStatus = "Not Started";
          pendingStep = "Exam Instructions Acknowledgment";
          message = "You have not started the examination yet.";
        }
      }
    } else {
      // Internal & External Coding Examination
      const assigned =
        allocation?.assignedQuestionIds && allocation.assignedQuestionIds.length > 0
          ? allocation.assignedQuestionIds
          : allocation?.questionId
          ? [allocation.questionId]
          : [];

      const instructionsAcknowledged = Boolean(progress?.instructionsAcknowledged);
      const hasSubmittedConceptual = Boolean(
        latestAnswerSub ||
        (progress?.lastConceptualAnswer && progress.lastConceptualAnswer.trim().length > 20)
      );
      const hasApprovedConceptual = Boolean(
        latestApprovedAnswer ||
        (progress?.lastAIEvaluation && progress.lastAIEvaluation.errorPercentage < 50) ||
        progress?.compilerAllowed
      );
      const compilerAccessGranted = Boolean(progress?.compilerAllowed && hasApprovedConceptual);
      const hasSubmittedCode = Boolean(latestCodeSub);
      const allTestsPassed = Boolean(
        latestCodeSub &&
        latestCodeSub.allPassed &&
        latestCodeSub.testCasesPassed > 0 &&
        latestCodeSub.testCasesPassed === latestCodeSub.totalTestCases
      );

      // Count independently submitted/completed questions
      assignedQuestionCount = assigned.length || exam.questionsPerStudent || 1;
      submittedQuestionCount = assigned.length > 0
        ? assigned.filter((q) => {
            const qKey = q._id.toString();
            const p = progress?.questionProgress?.get
              ? progress.questionProgress.get(qKey)
              : progress?.questionProgress?.[qKey];
            return Boolean(p && p.isCompleted);
          }).length
        : allTestsPassed
        ? 1
        : 0;
      remainingQuestionCount = Math.max(0, assignedQuestionCount - submittedQuestionCount);

      const allQuestionsDone = assignedQuestionCount > 0 && submittedQuestionCount >= assignedQuestionCount;
      const isTimerExpiredFinal = progress?.completionReason === "time_expired" || (isTimeExpired && !facultyEndedExam);

      // Condition 1: Faculty ended the examination
      if (facultyEndedExam) {
        isSuccessfullyCompleted = true;
        completionReason = "faculty_ended";
        examStatus = "Examination Ended by Faculty";
        message = `The examination was ended by the faculty. You successfully submitted ${submittedQuestionCount} out of ${assignedQuestionCount} assigned question(s).`;
      } else if (
        // Condition 2: Student submitted all assigned questions AND clicked Finish Exam
        (progress?.status === "successfully_completed" || progress?.completionReason === "all_questions_submitted") &&
        allQuestionsDone
      ) {
        isSuccessfullyCompleted = true;
        completionReason = "all_questions_submitted";
        examStatus = "Successfully Completed";
        message = "Congratulations! You have successfully completed all assigned questions.";
      } else if (isTimerExpiredFinal) {
        // Condition 3: Exam timer expired (with automatic submission & evaluation)
        isSuccessfullyCompleted = true;
        completionReason = "time_expired";
        examStatus = "Time Expired";
        message = `The examination time expired. ${submittedQuestionCount} out of ${assignedQuestionCount} assigned question(s) were successfully submitted.`;
      } else {
        isSuccessfullyCompleted = false;
        if (!instructionsAcknowledged) {
          examStatus = "Not Started";
          pendingStep = "Instructions Acknowledgment";
          message = "You have not acknowledged the examination instructions yet.";
        } else if (!hasSubmittedConceptual) {
          examStatus = "Notepad Pending";
          pendingStep = "Notepad Conceptual Answer Submission";
          message =
            "Your conceptual answer has not been completed. Please complete the required steps to finish your examination.";
        } else if (!hasApprovedConceptual) {
          if (progress?.lastAIEvaluation || latestAnswerSub?.aiEvaluation) {
            examStatus = "Conceptual Evaluation Failed";
            pendingStep = "Conceptual Answer Revision (Error < 50% required)";
            message =
              "Your conceptual answer did not meet the passing criteria (<50% error). Please revise your conceptual answer.";
          } else {
            examStatus = "AI Evaluation Pending";
            pendingStep = "AI Evaluation of Conceptual Answer";
            message =
              "Your conceptual answer has been submitted and is currently being evaluated by the AI grader.";
          }
        } else if (!hasSubmittedCode) {
          examStatus = "Coding In Progress";
          pendingStep = "Programming Solution Code Submission";
          message =
            "Compiler access has been granted. Please implement and submit your programming solution.";
        } else if (!allTestsPassed) {
          examStatus = "Test Cases Failed";
          pendingStep = "Passing All Required Test Cases";
          message =
            "Your submitted solution failed some required test cases. Please correct your code and re-submit.";
        } else {
          examStatus = "In Progress";
          pendingStep = `Remaining Questions (${remainingQuestionCount})`;
          message = `You have completed ${submittedQuestionCount} of ${assignedQuestionCount} questions. Please complete the remaining questions.`;
        }
      }

      // Conceptual status string
      if (hasApprovedConceptual) {
        conceptualAnswerStatus = `Passed (${
          progress?.lastAIEvaluation?.errorPercentage ??
          latestApprovedAnswer?.aiEvaluation?.errorPercentage ??
          0
        }% Error)`;
      } else if (hasSubmittedConceptual) {
        if (progress?.lastAIEvaluation || latestAnswerSub?.aiEvaluation) {
          conceptualAnswerStatus = `Failed (${
            progress?.lastAIEvaluation?.errorPercentage ??
            latestAnswerSub?.aiEvaluation?.errorPercentage ??
            100
          }% Error)`;
        } else {
          conceptualAnswerStatus = "AI Evaluation Pending";
        }
      } else {
        conceptualAnswerStatus = "Not Completed / Pending";
      }

      // Coding status string
      if (allTestsPassed) {
        codeSubmissionStatus = "Submitted & Passed All Test Cases";
      } else if (hasSubmittedCode) {
        codeSubmissionStatus = `Submitted (${latestCodeSub.testCasesPassed}/${latestCodeSub.totalTestCases} Tests Passed)`;
      } else if (compilerAccessGranted) {
        codeSubmissionStatus = "Compiler Unlocked (No Submission)";
      } else {
        codeSubmissionStatus = "Compiler Locked (Notepad Incomplete)";
      }

      if (Array.isArray(allCodeSubs) && allCodeSubs.length > 0 && assigned.length > 0) {
        const latestByQuestion = new Map();
        for (const sub of allCodeSubs) {
          const qIdStr = sub.questionId ? sub.questionId.toString() : "default";
          if (!latestByQuestion.has(qIdStr)) {
            latestByQuestion.set(qIdStr, sub);
          }
        }
        if (latestByQuestion.size > 0 && !latestByQuestion.has("default")) {
          for (const sub of latestByQuestion.values()) {
            testCasesPassed += sub.testCasesPassed || 0;
            totalTestCases += sub.totalTestCases || 0;
          }
          testCasesFailed = Math.max(0, totalTestCases - testCasesPassed);
          submissionTime = latestCodeSub?.submittedAt || progress?.completedAt || null;
        } else if (latestCodeSub) {
          testCasesPassed = latestCodeSub.testCasesPassed || 0;
          totalTestCases = latestCodeSub.totalTestCases || 0;
          testCasesFailed = Math.max(0, totalTestCases - testCasesPassed);
          submissionTime = latestCodeSub.submittedAt || progress?.completedAt || null;
        }
      } else if (latestCodeSub) {
        testCasesPassed = latestCodeSub.testCasesPassed || 0;
        totalTestCases = latestCodeSub.totalTestCases || 0;
        testCasesFailed = Math.max(0, totalTestCases - testCasesPassed);
        submissionTime = latestCodeSub.submittedAt || progress?.completedAt || null;
      } else {
        testCasesPassed = 0;
        totalTestCases = 0;
        testCasesFailed = 0;
        submissionTime = progress?.completedAt || null;
      }

      if (assigned.length > 0) {
        let scoreSum = 0;
        for (const qItem of assigned) {
          const qKey = qItem._id.toString();
          const rawP = progress?.questionProgress?.get
            ? progress.questionProgress.get(qKey)
            : progress?.questionProgress?.[qKey];
          const p = rawP?.toObject ? rawP.toObject() : rawP;
          const hasSubForQ =
            Array.isArray(allCodeSubs) &&
            allCodeSubs.some((s) => s.questionId && s.questionId.toString() === qKey);
          const attemptedQ = Boolean(
            p?.isCompleted ||
              hasSubForQ ||
              (p?.currentCode && String(p.currentCode).trim()) ||
              (p?.lastConceptualAnswer && String(p.lastConceptualAnswer).trim()) ||
              (p?.status && p.status !== "not_started")
          );
          if (attemptedQ) questionsAttempted += 1;
          if (p?.isCompleted) {
            scoreSum += Number(p.score ?? qItem.marks ?? 100);
          }
        }
        if (computedCodingScore === null || computedCodingScore === undefined) {
          computedCodingScore = scoreSum;
        }
      } else {
        questionsAttempted = hasSubmittedCode || hasSubmittedConceptual ? 1 : 0;
      }

      // Identify the next uncompleted assigned question if exam is still in progress
      if (!facultyEndedExam && remainingQuestionCount > 0 && assigned.length > 0) {
        for (let i = 0; i < assigned.length; i++) {
          const qItem = assigned[i];
          const qKey = qItem._id.toString();
          const rawP = progress?.questionProgress?.get
            ? progress.questionProgress.get(qKey)
            : progress?.questionProgress?.[qKey];
          const p = rawP?.toObject ? rawP.toObject() : rawP;
          if (!p || !p.isCompleted) {
            nextQuestion = {
              _id: qItem._id,
              questionNumber: qItem.questionNumber || `Q${i + 1}`,
              title: qItem.title,
              compilerAllowed: Boolean(p?.compilerAllowed),
            };
            break;
          }
        }
      }
    }

    const allQuestionsSubmitted = assignedQuestionCount > 0 && submittedQuestionCount >= assignedQuestionCount;
    const isTimerExpiredFinal = completionReason === "time_expired" || (isTimeExpired && !facultyEndedExam);
    const hasRemainingQuestions = !isSuccessfullyCompleted && !facultyEndedExam && !isTimerExpiredFinal && remainingQuestionCount > 0;
    const readyToFinish = !isSuccessfullyCompleted && !facultyEndedExam && !isTimerExpiredFinal && allQuestionsSubmitted;

    const resolvedMarks = isViva
      ? (progress?.vivaResult?.score ?? null)
      : (computedCodingScore ?? progress?.finalScore ?? null);

    res.status(200).json({
      isSuccessfullyCompleted,
      examStatus,
      finalExamStatus: examStatus,
      pendingStep,
      message,
      completionReason,
      facultyEndedExam,
      timeExpired: isTimerExpiredFinal,
      allQuestionsSubmitted,
      hasRemainingQuestions,
      readyToFinish,
      nextQuestion,
      assignedQuestionCount,
      questionsAttempted,
      submittedQuestionCount,
      remainingQuestionCount,
      completedAt: exam.completedAt || progress?.completedAt || submissionTime,
      marks: resolvedMarks,
      overallScore: resolvedMarks,
      totalMarks: isViva
        ? (progress?.vivaResult?.totalMarks ?? exam.totalMarks)
        : exam.totalMarks,
      studentName: student.username,
      rollNo: student.rollNo || "N/A",
      examTitle: exam.title,
      examType: exam.examType,
      subject: exam.subject,
      submissionTime,
      conceptualAnswerStatus,
      aiEvaluationStatus: conceptualAnswerStatus,
      codeSubmissionStatus,
      testCasesPassed,
      testCasesFailed,
      totalTestCases,
      finalExamStatus: examStatus,
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        examType: exam.examType,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
      },
      progress,
      submission: latestCodeSub
        ? {
            status: latestCodeSub.status,
            testCasesPassed,
            totalTestCases,
            testCasesFailed,
            executionTime: latestCodeSub.executionTime,
            submittedAt: latestCodeSub.submittedAt,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// VIVA MCQ EXAMINATION CONTROLLERS
// =========================================================================

/**
 * Get Viva Exam Details and Instructions for student.
 */
export const getVivaExamDetailsAndInstructions = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const exam = await Exam.findById(examId)
      .populate("createdBy", "username")
      .lean();

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.examType !== "viva") {
      return res.status(400).json({ message: "This examination is not a Viva MCQ exam." });
    }

    const isParticipating = (exam.participatingStudents || []).some(
      (s) => s.toString() === studentId
    );
    if (!isParticipating) {
      return res.status(403).json({
        message: "You are not enrolled as a participating student in this Viva exam.",
      });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId }).lean();
    const questionCount = await ExamQuestion.countDocuments({ examId });

    res.status(200).json({
      exam: {
        _id: exam._id,
        title: exam.title,
        description: exam.description,
        subject: exam.subject,
        academicYear: exam.academicYear,
        semester: exam.semester,
        examType: exam.examType,
        examDate: exam.examDate,
        startTime: exam.startTime,
        endTime: exam.endTime,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        marksPerQuestion: exam.marksPerQuestion || 1,
        negativeMarking: exam.negativeMarking || 0,
        negativeMarkingEnabled: Boolean(exam.negativeMarkingEnabled),
        maxAttempts: exam.maxAttempts || 1,
        status: exam.status,
        startedAt: exam.startedAt,
        instructions: typeof exam.instructions === "string"
          ? exam.instructions.split("\n").map((l) => l.trim()).filter(Boolean)
          : Array.isArray(exam.instructions) && exam.instructions.length > 0
          ? exam.instructions
          : [
              "This is an AI-powered Multiple Choice Viva Examination.",
              "Read each question carefully and select the best option.",
              "You can navigate freely between questions using the question palette.",
              "You can mark questions for review and return to them later.",
              "Your answers are automatically saved as you make your selections.",
              "Do not close or refresh the window while submitting your exam.",
            ],
        totalQuestions: questionCount,
      },
      progress: progress || {
        instructionsAcknowledged: false,
        status: "not_started",
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Acknowledge instructions and start Viva exam.
 */
export const acknowledgeVivaInstructions = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.examType !== "viva") {
      return res.status(400).json({ message: "This examination is not a Viva exam." });
    }

    if (exam.status !== "in_progress" && exam.status !== "completed") {
      return res.status(403).json({
        message: "This examination has not been started by the faculty yet.",
      });
    }

    const isParticipating = (exam.participatingStudents || []).some(
      (s) => s.toString() === studentId
    );
    if (!isParticipating) {
      return res.status(403).json({
        message: "You are not enrolled as a participating student in this examination.",
      });
    }

    if (exam.status !== "in_progress") {
      return res.status(400).json({
        message: "This examination is not currently active.",
      });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      progress = new StudentExamProgress({
        examId,
        studentId,
        instructionsAcknowledged: true,
        instructionsAcknowledgedAt: new Date(),
        vivaStartedAt: new Date(),
        status: "in_progress",
        vivaAnswers: new Map(),
      });
    } else {
      progress.instructionsAcknowledged = true;
      progress.instructionsAcknowledgedAt = progress.instructionsAcknowledgedAt || new Date();
      if (!progress.vivaStartedAt) {
        progress.vivaStartedAt = new Date();
      }
      if (progress.status === "not_started") {
        progress.status = "in_progress";
      }
    }

    await progress.save();

    res.status(200).json({
      message: "Instructions acknowledged. Viva examination started.",
      progress,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Viva exam questions for student.
 * STRICT SECURITY: Never leaks correctAnswer or explanation while exam is in progress.
 */
export const getVivaExamQuestions = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.examType !== "viva") {
      return res.status(400).json({ message: "This examination is not a Viva exam." });
    }

    if (exam.status !== "in_progress" && exam.status !== "completed") {
      return res.status(403).json({
        message: "This examination has not been started by the faculty yet.",
      });
    }

    const isParticipating = (exam.participatingStudents || []).some(
      (s) => s.toString() === studentId
    );
    if (!isParticipating) {
      return res.status(403).json({
        message: "You are not enrolled in this examination.",
      });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      progress = new StudentExamProgress({
        examId,
        studentId,
        instructionsAcknowledged: true,
        instructionsAcknowledgedAt: new Date(),
        vivaStartedAt: new Date(),
        status: "in_progress",
        vivaAnswers: new Map(),
      });
      await progress.save();
    }

    // Check if individual allocation exists
    const allocation = await ExamAllocation.findOne({ examId, studentId });
    let questionDocs = [];
    if (allocation && allocation.assignedQuestionIds?.length > 0) {
      questionDocs = await ExamQuestion.find({
        _id: { $in: allocation.assignedQuestionIds },
      }).sort({ orderIndex: 1, questionNumber: 1 }).lean();
    } else if (allocation && allocation.questionId) {
      questionDocs = await ExamQuestion.find({ _id: allocation.questionId }).lean();
    } else {
      questionDocs = await ExamQuestion.find({ examId })
        .sort({ orderIndex: 1, questionNumber: 1 })
        .lean();
    }

    const isCompleted =
      isCompletedProgressStatus(progress.status) ||
      progress.status === "time_expired" ||
      exam.status === "completed";

    // Strictly redact answers unless exam has completed
    const safeQuestions = questionDocs.map((q, idx) => {
      const base = {
        _id: q._id,
        questionNumber: q.questionNumber || `Q${idx + 1}`,
        orderIndex: q.orderIndex || idx + 1,
        title: q.title || `Question ${idx + 1}`,
        questionText: q.questionText || q.problemStatement || "",
        problemStatement: q.questionText || q.problemStatement || "",
        options: (q.options || []).map((opt) => ({
          optionId: opt.optionId,
          text: opt.text || "",
        })),
        difficulty: q.difficulty || "Medium",
        marks: q.marks || exam.marksPerQuestion || 1,
        negativeMarks: q.negativeMarks ?? (exam.negativeMarkingEnabled ? exam.negativeMarking : 0),
      };

      // Redact correct answer and explanation for student confidentiality
      return base;
    });

    const savedAnswers = {};
    if (progress.vivaAnswers) {
      for (const [qId, ansObj] of progress.vivaAnswers.entries()) {
        savedAnswers[qId] = ansObj;
      }
    }

    res.status(200).json({
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        marksPerQuestion: exam.marksPerQuestion || 1,
        negativeMarking: exam.negativeMarking || 0,
        negativeMarkingEnabled: Boolean(exam.negativeMarkingEnabled),
        status: exam.status,
      },
      questions: safeQuestions,
      vivaAnswers: savedAnswers,
      vivaStartedAt: progress.vivaStartedAt,
      isCompleted,
      vivaResult: progress.vivaResult || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Autosave student's Viva MCQ answer draft.
 */
export const saveVivaAnswerDraft = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const { questionId, selectedOption, isMarkedForReview } = req.body;
    const studentId = req.user.userId;

    if (!questionId) {
      return res.status(400).json({ message: "questionId is required." });
    }

    if (
      (mongoose.connection && mongoose.connection.readyState === 1) ||
      Exam.findById !== mongoose.Model.findById
    ) {
      const examQuery = Exam.findById(examId);
      const exam =
        typeof examQuery?.select === "function"
          ? await examQuery.select("status")
          : await examQuery;
      if (exam && exam.status === "completed") {
        return res.status(403).json({
          message: "Examination has been ended by faculty. Draft edits are locked.",
          isCompleted: true,
          facultyEndedExam: true,
        });
      }
    }

    const now = new Date();
    const qKey = String(questionId);
    const useAtomicVivaUpdate =
      typeof StudentExamProgress.findOneAndUpdate === "function" &&
      (mongoose.connection?.readyState === 1 ||
        StudentExamProgress.findOneAndUpdate !== mongoose.Model.findOneAndUpdate);

    if (useAtomicVivaUpdate) {
      const updated = await StudentExamProgress.findOneAndUpdate(
        {
          examId,
          studentId,
          status: { $nin: ["completed", "successfully_completed", "time_expired", "submission_pending"] },
          $or: [{ vivaResult: null }, { "vivaResult.submittedAt": { $exists: false } }],
        },
        {
          $set: {
            [`vivaAnswers.${qKey}`]: {
              questionId: qKey,
              selectedOption: selectedOption || null,
              isMarkedForReview: Boolean(isMarkedForReview),
              answeredAt: now,
            },
            lastDraftSavedAt: now,
          },
        },
        { new: true }
      );

      if (!updated) {
        const existing = await StudentExamProgress.findOne({ examId, studentId });
        if (!existing) {
          return res.status(404).json({ message: "Exam session not found." });
        }
        return res.status(400).json({
          message: "Exam has already been submitted.",
          isCompleted: true,
        });
      }

      return res.status(200).json({
        success: true,
        questionId,
        savedAt: updated.lastDraftSavedAt || now,
      });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Exam session not found." });
    }

    if (
      progress.status === "completed" ||
      progress.status === "successfully_completed" ||
      progress.status === "time_expired" ||
      Boolean(progress.vivaResult?.submittedAt)
    ) {
      return res.status(400).json({
        message: "Exam has already been submitted.",
        isCompleted: true,
      });
    }

    if (!progress.vivaAnswers) {
      progress.vivaAnswers = new Map();
    }

    progress.vivaAnswers.set(String(questionId), {
      questionId: String(questionId),
      selectedOption: selectedOption || null,
      isMarkedForReview: Boolean(isMarkedForReview),
      answeredAt: new Date(),
    });

    progress.lastDraftSavedAt = new Date();
    await progress.save();

    res.status(200).json({
      success: true,
      questionId,
      savedAt: progress.lastDraftSavedAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit Viva MCQ exam, perform automatic evaluation and calculate score.
 */
export const submitVivaExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { answers } = req.body || {};

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Exam session not found." });
    }

    if (
      progress.status === "completed" ||
      progress.status === "successfully_completed" ||
      Boolean(progress.vivaResult?.submittedAt)
    ) {
      return res.status(409).json({
        success: false,
        alreadySubmitted: true,
        isSubmitted: true,
        isCompleted: true,
        message: "Viva examination has already been submitted.",
        result: progress.vivaResult || null,
      });
    }

    const timingCheck = validateExamAccessAndTiming({
      exam,
      progress,
      studentId,
      isViva: true,
    });
    if (!timingCheck.ok) {
      return res.status(timingCheck.status).json(timingCheck.body);
    }

    const vivaLockKey = `${examId}:${studentId}`;
    if (activeVivaSubmissionLocks.has(vivaLockKey) || progress.status === "submission_pending") {
      return res.status(409).json({
        success: false,
        submissionInProgress: true,
        message: "Viva submission is already being processed. Please wait.",
      });
    }

    activeVivaSubmissionLocks.add(vivaLockKey);
    let dbClaimedVivaLock = false;
    let persistedViva = false;

    const releaseVivaLock = async () => {
      activeVivaSubmissionLocks.delete(vivaLockKey);
      if (!persistedViva && dbClaimedVivaLock) {
        if (
          typeof StudentExamProgress.updateOne === "function" &&
          (mongoose.connection?.readyState === 1 ||
            StudentExamProgress.updateOne !== mongoose.Model.updateOne)
        ) {
          await StudentExamProgress.updateOne(
            {
              examId,
              studentId,
              status: "submission_pending",
            },
            { $set: { status: "in_progress" } }
          ).catch(() => {});
        }
      }
    };

    try {
      if (
        typeof StudentExamProgress.findOneAndUpdate === "function" &&
        (mongoose.connection?.readyState === 1 ||
          StudentExamProgress.findOneAndUpdate !== mongoose.Model.findOneAndUpdate)
      ) {
        const claimed = await StudentExamProgress.findOneAndUpdate(
          {
            examId,
            studentId,
            status: { $nin: ["completed", "successfully_completed", "time_expired", "submission_pending"] },
            $or: [{ vivaResult: null }, { "vivaResult.submittedAt": { $exists: false } }],
          },
          { $set: { status: "submission_pending" } },
          { new: true }
        );
        if (!claimed) {
          return res.status(409).json({
            success: false,
            alreadySubmittedOrInProgress: true,
            isSubmitted: true,
            message: "Viva submission is already in progress or completed.",
          });
        }
        progress = claimed;
        dbClaimedVivaLock = true;
      }

      // Merge answers if provided in payload
      if (answers && typeof answers === "object") {
        if (!progress.vivaAnswers) {
          progress.vivaAnswers = new Map();
        }
        for (const [qId, ans] of Object.entries(answers)) {
          progress.vivaAnswers.set(String(qId), {
            questionId: String(qId),
            selectedOption: ans.selectedOption || null,
            isMarkedForReview: Boolean(ans.isMarkedForReview),
            answeredAt: new Date(),
          });
        }
      }

      // Fetch assigned questions with correct answer
      const allocation = await ExamAllocation.findOne({ examId, studentId });
      let questions = [];
      if (allocation && allocation.assignedQuestionIds?.length > 0) {
        questions = await ExamQuestion.find({ _id: { $in: allocation.assignedQuestionIds } }).lean();
      } else if (allocation && allocation.questionId) {
        questions = await ExamQuestion.find({ _id: allocation.questionId }).lean();
      } else {
        questions = await ExamQuestion.find({ examId }).lean();
      }

      let correctCount = 0;
      let incorrectCount = 0;
      let unansweredCount = 0;
      let earnedMarks = 0;
      let penaltyMarks = 0;
      let totalPossibleMarks = 0;

      const savedAnswers = progress.vivaAnswers || new Map();

      for (const q of questions) {
        const qIdStr = q._id.toString();
        const qMarks = Number(q.marks) || Number(exam.marksPerQuestion) || 1;
        const qNegMarks = exam.negativeMarkingEnabled
          ? (Number(q.negativeMarks) || Number(exam.negativeMarking) || 0)
          : 0;

        totalPossibleMarks += qMarks;

        const userAnsObj = savedAnswers.get(qIdStr);
        const selectedOption = userAnsObj?.selectedOption;

        if (!selectedOption || String(selectedOption).trim() === "") {
          unansweredCount++;
          continue;
        }

        const normSelected = String(selectedOption).trim().toUpperCase();
        const normCorrect = String(q.correctAnswer || "").trim().toUpperCase();

        let isCorrect = false;
        if (normCorrect && normCorrect !== "ANSWER NOT PROVIDED") {
          if (normSelected === normCorrect) {
            isCorrect = true;
          } else {
            // Check matching against option text or ID
            const matchingOption = (q.options || []).find(
              (opt) =>
                opt.optionId?.toUpperCase() === normSelected ||
                opt.text?.trim().toUpperCase() === normSelected
            );
            if (
              matchingOption &&
              (matchingOption.optionId?.toUpperCase() === normCorrect ||
                matchingOption.text?.trim().toUpperCase() === normCorrect)
            ) {
              isCorrect = true;
            }
          }
        }

        if (isCorrect) {
          correctCount++;
          earnedMarks += qMarks;
        } else {
          incorrectCount++;
          if (exam.negativeMarkingEnabled) {
            penaltyMarks += qNegMarks;
          }
        }
      }

      const finalScore = Math.max(0, earnedMarks - penaltyMarks);
      const percentage = totalPossibleMarks > 0
        ? Math.round((finalScore / totalPossibleMarks) * 10000) / 100
        : 0;

      const prevStatus = progress.status;
      const prevCompletedAt = progress.completedAt;
      const prevVivaResult = progress.vivaResult;

      progress.status = "completed";
      progress.completedAt = new Date();
      progress.vivaResult = {
        totalQuestions: questions.length,
        attempted: correctCount + incorrectCount,
        correct: correctCount,
        incorrect: incorrectCount,
        unanswered: unansweredCount,
        score: Math.round(finalScore * 100) / 100,
        totalMarks: totalPossibleMarks,
        percentage,
        passed: percentage >= 40,
        submittedAt: new Date(),
      };

      try {
        await progress.save();
      } catch (saveErr) {
        progress.status = prevStatus === "submission_pending" ? "in_progress" : prevStatus;
        progress.completedAt = prevCompletedAt;
        progress.vivaResult = prevVivaResult;
        throw saveErr;
      }
      persistedViva = true;

      await ExamAuditLog.create({
        examId,
        actorId: studentId,
        action: "viva_submitted",
        details: {
          score: progress.vivaResult.score,
          totalMarks: totalPossibleMarks,
          percentage,
        },
      });

      res.status(200).json({
        success: true,
        message: "Viva Examination submitted successfully.",
        isSubmitted: true,
      });
    } finally {
      await releaseVivaLock();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get Viva student exam result.
 */
/**
 * Faculty Endpoint: Get AI evaluation background queue status for an exam.
 */
export const getAIEvaluationQueueStatus = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const jobs =
      mongoose.connection?.readyState === 1 || AIEvaluationJob.find !== mongoose.Model.find
        ? await AIEvaluationJob.find({ examId })
            .select("idempotencyKey studentId questionId submissionId attemptNumber status retryCount maxRetries startedAt completedAt lastError modelUsed isFallback")
            .sort({ createdAt: -1 })
            .lean()
        : [];

    res.status(200).json({
      stats: aiEvaluationQueue.getStats(),
      jobs,
    });
  } catch (error) {
    next(error);
  }
};

export const getVivaStudentResults = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const [exam, progress] = await Promise.all([
      Exam.findById(examId).select("title subject examType durationMinutes totalMarks marksPerQuestion negativeMarking negativeMarkingEnabled").lean(),
      StudentExamProgress.findOne({ examId, studentId }).lean(),
    ]);

    if (!exam || !progress) {
      return res.status(404).json({ message: "Exam record not found." });
    }

    res.status(200).json({
      exam,
      progress,
      result: progress.vivaResult || null,
      completedAt: progress.completedAt,
    });
  } catch (error) {
    next(error);
  }
};
