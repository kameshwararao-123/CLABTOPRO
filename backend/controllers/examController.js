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
import { evaluateConceptualAnswer } from "../services/examAIService.js";
import { judgeSubmission, runCCode } from "../services/judgeService.js";
import { parseGccDiagnostics } from "../utils/compilerParser.js";

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
      durationMinutes: durationMinutes ? Number(durationMinutes) : 90,
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
    const logic = rawRubric.logicCorrectnessWeight ?? rawRubric.logicCorrectness ?? rawRubric.logic;
    const algo = rawRubric.algorithmicApproachWeight ?? rawRubric.algorithmicApproach ?? rawRubric.algorithm;
    const syntax = rawRubric.syntaxStructureWeight ?? rawRubric.syntaxStructure ?? rawRubric.syntax;
    const eff = rawRubric.codeEfficiencyWeight ?? rawRubric.codeEfficiency ?? rawRubric.efficiency;
    const constr = rawRubric.constraintsHandlingWeight ?? rawRubric.constraintsHandling ?? rawRubric.constraints;

    if (logic !== undefined) {
      list.push({ criterion: "Logic & Correctness", weight: Number(logic) || 30, description: "Flow of steps, edge case handling, correctness" });
    }
    if (algo !== undefined) {
      list.push({ criterion: "Algorithmic Approach", weight: Number(algo) || 25, description: "Problem solving strategy, optimality, approach" });
    }
    if (syntax !== undefined) {
      list.push({ criterion: "Syntax & Structure", weight: Number(syntax) || 20, description: "C language syntax, declarations, code formatting" });
    }
    if (eff !== undefined) {
      list.push({ criterion: "Code Efficiency", weight: Number(eff) || 15, description: "Efficiency and asymptotic bounds" });
    }
    if (constr !== undefined) {
      list.push({ criterion: "Constraints Handling", weight: Number(constr) || 10, description: "Handling boundary values, zero, negative input" });
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

    if (exam.enrollmentClosed || exam.status === "completed" || exam.status === "cancelled") {
      return res.status(400).json({
        message: "Enrollment for this examination is closed.",
      });
    }

    if (exam.status === "in_progress") {
      return res.status(400).json({
        message: "Enrollment is closed because the examination has already started.",
      });
    }

    // Check if already enrolled
    const alreadyParticipating = (exam.participatingStudents || []).some(
      (s) => s.toString() === studentId.toString()
    );

    if (alreadyParticipating) {
      return res.status(400).json({
        message: "You are already enrolled in this examination.",
      });
    }

    // Atomically register student in exam roster to prevent race conditions
    const updatedExam = await Exam.findOneAndUpdate(
      {
        _id: exam._id,
        participatingStudents: { $ne: studentId },
        status: { $in: ["draft", "allocated", "scheduled"] },
      },
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
      return res.status(400).json({
        message: "Enrollment failed. You may already be enrolled or enrollment has closed.",
      });
    }

    // Initialize StudentExamProgress record in waiting state without questions
    await StudentExamProgress.findOneAndUpdate(
      { examId: exam._id, studentId },
      {
        $setOnInsert: {
          examId: exam._id,
          studentId,
          status: "not_started",
          instructionsAcknowledged: false,
          questionProgress: {},
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
        },
      });
    }

    // Return enrolled status and waiting message. Zero questions leaked or allocated!
    res.status(200).json({
      message: "You have successfully joined the exam. Please wait for your faculty to start the exam.",
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
 * End/Complete examination by faculty.
 */
export const completeExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    exam.status = "completed";
    exam.completedAt = new Date();
    await exam.save();

    await ExamAuditLog.create({
      examId,
      actorId: req.user.userId,
      action: "exam_completed_by_faculty",
      details: { completedAt: exam.completedAt },
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
    const exam = await Exam.findById(examId).lean();

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    let [allocations, progresses, answerSubs, codeSubs] = await Promise.all([
      ExamAllocation.find({ examId })
        .populate("studentId", "username rollNo email")
        .populate("questionId", "title difficulty questionNumber marks")
        .populate("assignedQuestionIds", "title difficulty questionNumber marks")
        .lean(),
      StudentExamProgress.find({ examId }).lean(),
      ExamAnswerSubmission.find({ examId })
        .sort({ submittedAt: -1 })
        .lean(),
      ExamCodeSubmission.find({ examId })
        .sort({ submittedAt: -1 })
        .lean(),
    ]);

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
    const latestAnswerMap = new Map();
    for (const a of answerSubs) {
      const sId = a.studentId.toString();
      if (!latestAnswerMap.has(sId)) {
        latestAnswerMap.set(sId, a);
      }
    }

    const latestCodeMap = new Map();
    for (const c of codeSubs) {
      const sId = c.studentId.toString();
      if (!latestCodeMap.has(sId)) {
        latestCodeMap.set(sId, c);
      }
    }

    const rows = allocations.map((alloc) => {
      const student = alloc.studentId;
      const sId = student?._id?.toString() || "";
      const prog = progressMap.get(sId);
      const ans = latestAnswerMap.get(sId);
      const code = latestCodeMap.get(sId);

      const assigned =
        alloc.assignedQuestionIds && alloc.assignedQuestionIds.length > 0
          ? alloc.assignedQuestionIds
          : alloc.questionId
          ? [alloc.questionId]
          : [];
      const assignedTitles = assigned.map((q) => q.title).join(", ");

      const vivaAnswersObj = prog?.vivaAnswers
        ? (prog.vivaAnswers instanceof Map ? Object.fromEntries(prog.vivaAnswers) : prog.vivaAnswers)
        : {};

      const liveAttemptedCount = Object.values(vivaAnswersObj).filter(
        (a) => a && a.selectedOption && String(a.selectedOption).trim() !== ""
      ).length;

      const vivaAttempted = prog?.vivaResult?.attempted ?? liveAttemptedCount;

      // Check time expiration
      const examEnded = exam.status === "completed";
      const examTimeExpired = exam.startedAt && exam.durationMinutes
        ? Date.now() > new Date(exam.startedAt).getTime() + exam.durationMinutes * 60 * 1000
        : false;
      const isTimeExpired =
        (examEnded || examTimeExpired) &&
        prog?.status !== "completed" &&
        prog?.status !== "successfully_completed";

      const hasSubmittedConceptual = Boolean(
        ans || (prog?.lastConceptualAnswer && prog.lastConceptualAnswer.trim().length > 20)
      );
      const hasApprovedConceptual = Boolean(
        (ans && ans.isApproved) ||
        prog?.compilerAllowed ||
        prog?.status === "coding_in_progress" ||
        prog?.status === "compiler_access_granted"
      );
      const hasSubmittedCode = Boolean(code);
      const allTestsPassed = Boolean(
        code && code.allPassed && code.testCasesPassed > 0 && code.testCasesPassed === code.totalTestCases
      );

      const isSuccessfullyCompleted =
        (prog?.status === "completed" || prog?.status === "successfully_completed") &&
        (exam.examType === "viva" || (hasApprovedConceptual && hasSubmittedCode && allTestsPassed));

      let notepadStatus = "Pending";
      if (prog?.status === "notepad_correction_required" || prog?.conceptualStatus === "correction_required") {
        notepadStatus = "Correction Required";
      } else if (hasSubmittedConceptual) {
        notepadStatus = "Submitted";
      } else if (
        prog?.status === "answer_in_progress" ||
        (prog?.lastConceptualAnswer && prog.lastConceptualAnswer.trim().length > 0)
      ) {
        notepadStatus = "In Progress";
      }

      // Evaluation Action & Status determination for Faculty Control
      let aiEvaluationStatus = "Pending";
      let evaluationAction = "not_submitted"; // not_submitted | evaluate | evaluating | allow_to_code | return_to_notepad | approved | returned
      let canAllowToCode = false;
      let canReturnToNotepad = false;

      const latestError = ans?.aiEvaluation?.errorPercentage ?? prog?.lastAIEvaluation?.errorPercentage ?? null;

      if (prog?.status === "evaluating" || prog?.conceptualStatus === "evaluating") {
        aiEvaluationStatus = "Evaluating...";
        evaluationAction = "evaluating";
      } else if (prog?.compilerAllowed || prog?.status === "coding_in_progress" || prog?.status === "compiler_access_granted" || (ans && ans.facultyDecision === "allow_to_code")) {
        aiEvaluationStatus = "Approved (Compiler Unlocked)";
        evaluationAction = "approved";
      } else if (prog?.status === "notepad_correction_required" || prog?.conceptualStatus === "correction_required" || (ans && ans.facultyDecision === "return_to_notepad")) {
        aiEvaluationStatus = latestError !== null ? `Returned (Error: ${latestError}%)` : "Correction Required";
        evaluationAction = "return_to_notepad";
        canReturnToNotepad = true;
      } else if (latestError !== null && (ans?.status === "evaluated" || prog?.conceptualStatus === "evaluated" || prog?.status === "waiting_faculty_decision")) {
        if (latestError < 50) {
          aiEvaluationStatus = `Evaluated (${latestError}% Error)`;
          evaluationAction = "allow_to_code";
          canAllowToCode = true;
        } else {
          aiEvaluationStatus = `Evaluated (${latestError}% Error)`;
          evaluationAction = "return_to_notepad";
          canReturnToNotepad = true;
        }
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
      } else if (hasApprovedConceptual || prog?.compilerAllowed) {
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
      } else if (prog?.status === "waiting_faculty_decision") {
        studentExamStatus = "Waiting for Faculty Decision";
      } else if (prog?.status === "notepad_correction_required" || prog?.conceptualStatus === "correction_required") {
        studentExamStatus = "Correction Required";
      } else if (prog?.status === "evaluating") {
        studentExamStatus = "AI Evaluation in Progress";
      } else if (prog?.status === "awaiting_faculty_evaluation" || (hasSubmittedConceptual && !ans?.aiEvaluation)) {
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

      const assignedQId = (assigned[0] && assigned[0]._id) || alloc.questionId?._id || null;
      const assignedQTitle = (assigned[0] && assigned[0].title) || alloc.questionId?.title || "";

      return {
        studentId: sId,
        username: student?.username || "Unknown",
        rollNo: student?.rollNo || "",
        email: student?.email || "",
        assignedQuestion:
          assignedTitles ||
          alloc.questionId?.title ||
          (exam.examType === "viva" ? "Viva MCQ Bank" : "Not Assigned"),
        assignedQuestions: assigned,
        totalAssignedQuestions: assigned.length,
        difficulty: alloc.questionId?.difficulty || "Medium",
        status: prog?.status || "not_started",
        instructionsAcknowledged: Boolean(prog?.instructionsAcknowledged),
        conceptualAttemptsCount: prog?.conceptualAttemptsCount || 0,
        conceptualApproved: Boolean(prog?.compilerAllowed),
        lastConceptualError: latestError,
        lastUnderstandingPercentage: latestError !== null ? Math.max(0, 100 - latestError) : null,
        lastConceptualAnswer: ans?.answerText || prog?.lastConceptualAnswer || "",
        aiEvaluation: ans?.aiEvaluation || prog?.lastAIEvaluation || null,
        targetQuestionId: assignedQId,
        questionTitle: assignedQTitle,
        facultyDecision: ans?.facultyDecision || prog?.facultyDecision || "pending",
        facultyFeedback: ans?.facultyFeedback || prog?.facultyFeedback || "",
        evaluationAction,
        canAllowToCode,
        canReturnToNotepad,
        codeStatus: code?.status || "not_submitted",
        testCasesPassed: code?.testCasesPassed || 0,
        totalTestCases: code?.totalTestCases || 0,
        completedAt: prog?.completedAt || null,
        notepadStatus,
        aiEvaluationStatus,
        codingStatus,
        testCasesStatus,
        examStatus: studentExamStatus,
        isSuccessfullyCompleted,
        vivaResult: prog?.vivaResult || null,
        vivaAnswers: vivaAnswersObj,
        vivaScore: prog?.vivaResult?.score ?? null,
        vivaPercentage: prog?.vivaResult?.percentage ?? null,
        vivaAttempted,
        vivaCorrect: prog?.vivaResult?.correct ?? 0,
        vivaIncorrect: prog?.vivaResult?.incorrect ?? 0,
        vivaUnanswered: prog?.vivaResult?.unanswered ?? 0,
      };
    });

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

    res.status(200).json({
      examTitle: exam.title,
      examType: exam.examType,
      status: exam.status,
      startedAt: exam.startedAt,
      durationMinutes: exam.durationMinutes,
      totalStudents: allocations.length,
      vivaSummary,
      codingSummary,
      students: rows,
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

    const progMap = new Map(progresses.map((p) => [p.examId.toString(), p]));

    const enriched = exams.map((exam) => {
      const prog = progMap.get(exam._id.toString());
      const isExamCompleted = prog?.status === "completed" || prog?.status === "successfully_completed";
      const examEnded = exam.status === "completed";
      const examTimeExpired = exam.startedAt && exam.durationMinutes
        ? Date.now() > new Date(exam.startedAt).getTime() + exam.durationMinutes * 60 * 1000
        : false;
      const isTimeExpired = (examEnded || examTimeExpired) && !isExamCompleted;

      let effectiveStatus = prog?.status || "not_started";
      if (isExamCompleted) {
        effectiveStatus = "successfully_completed";
      } else if (isTimeExpired) {
        effectiveStatus = "time_expired";
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

    if (exam.status !== "in_progress" && exam.status !== "completed") {
      return res.status(403).json({
        message: "This examination has not been started by the faculty yet.",
      });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId }).lean();
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
          status: "instructions_acknowledged",
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

    if (!exam || (exam.status !== "in_progress" && exam.status !== "completed")) {
      return res.status(403).json({ message: "Exam is not active." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
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

    // Resolve per-question progress
    const qKey = q._id.toString();
    const qProg = progress.questionProgress?.get
      ? progress.questionProgress.get(qKey)
      : progress.questionProgress?.[qKey];

    const isQCompilerAllowed = qProg ? qProg.compilerAllowed : progress.compilerAllowed;
    const isQCompleted = qProg ? qProg.isCompleted : progress.status === "completed";
    const lastQAnswer = qProg ? qProg.lastConceptualAnswer : progress.lastConceptualAnswer;
    const lastQEvaluation = qProg ? qProg.lastAIEvaluation : progress.lastAIEvaluation;
    const qAttemptsCount = qProg ? qProg.conceptualAttemptsCount : progress.conceptualAttemptsCount;
    const qCode = qProg?.currentCode || progress.currentCode || "";

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
        compilerAllowed: itemProg ? itemProg.compilerAllowed : progress.compilerAllowed,
        isCompleted: itemProg ? itemProg.isCompleted : progress.status === "completed",
        attemptCount: itemProg ? itemProg.conceptualAttemptsCount : 0,
      };
    });

    const previousAttempts = await ExamAnswerSubmission.find({
      examId,
      studentId,
      questionId: q._id,
    })
      .sort({ attemptNumber: -1 })
      .lean();

    const latestSub = previousAttempts[0] || null;

    res.status(200).json({
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        durationMinutes: exam.durationMinutes,
        maxConceptualAttempts: exam.maxConceptualAttempts,
        startedAt: exam.startedAt,
        questionsPerStudent: exam.questionsPerStudent || assigned.length,
      },
      progress: {
        status: progress.status,
        conceptualStatus: qProg?.conceptualStatus || progress.conceptualStatus || (latestSub ? latestSub.status : "pending"),
        conceptualAttemptsCount: qAttemptsCount,
        compilerAllowed: isQCompilerAllowed,
        lastConceptualAnswer: lastQAnswer,
        lastAIEvaluation: lastQEvaluation,
        facultyDecision: qProg?.facultyDecision || progress.facultyDecision || latestSub?.facultyDecision || "pending",
        facultyFeedback: qProg?.facultyFeedback || progress.facultyFeedback || latestSub?.facultyFeedback || "",
        submittedAt: qProg?.submittedAt || progress.submittedAt || latestSub?.submittedAt || null,
        evaluatedAt: qProg?.evaluatedAt || progress.evaluatedAt || latestSub?.evaluatedAt || null,
        currentCode: qCode,
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
 * Autosave student's conceptual answer draft in Notepad.
 * Supports optional questionId for multi-question assignments.
 */
export const autosaveAnswerDraft = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { answerText, questionId } = req.body;

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Progress record not found." });
    }

    progress.lastConceptualAnswer = answerText || "";
    progress.status = "answer_in_progress";

    if (questionId) {
      const qKey = questionId.toString();
      if (!progress.questionProgress) {
        progress.questionProgress = new Map();
      }
      const existing = progress.questionProgress.get(qKey) || {};
      progress.questionProgress.set(qKey, {
        ...existing,
        questionId,
        lastConceptualAnswer: answerText || "",
        status: "answer_in_progress",
      });
    }

    await progress.save();
    res.status(200).json({ message: "Draft saved.", progress });
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

    const exam = await Exam.findById(examId);
    if (!exam || exam.status !== "in_progress") {
      return res.status(403).json({ message: "Exam is not currently active." });
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

    let progress = await StudentExamProgress.findOne({ examId, studentId });
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

    const maxAttempts = exam.maxConceptualAttempts || 3;
    const currentAttempts = qProg.conceptualAttemptsCount || 0;
    if (currentAttempts >= maxAttempts && !qProg.compilerAllowed && !progress.compilerAllowed) {
      return res.status(403).json({
        message: `Maximum conceptual attempts (${maxAttempts}) reached for this question. Your submission has been flagged for faculty review.`,
      });
    }

    const attemptNumber = currentAttempts + 1;
    const submissionTime = new Date();

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
      maxAttempts,
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

    // Prevent duplicate simultaneous evaluations
    if (latestSub.status === "evaluating" || progress.status === "evaluating") {
      return res.status(409).json({
        message: "Evaluation is currently in progress for this student. Please wait.",
      });
    }

    // Mark evaluating
    latestSub.status = "evaluating";
    await latestSub.save();

    progress.status = "evaluating";
    progress.conceptualStatus = "evaluating";
    const qKey = targetQuestion._id.toString();
    if (progress.questionProgress && progress.questionProgress.get(qKey)) {
      const qp = progress.questionProgress.get(qKey);
      qp.status = "evaluating";
      qp.conceptualStatus = "evaluating";
      progress.questionProgress.set(qKey, qp);
    }
    await progress.save();

    // Call Gemini AI evaluation service
    const evaluation = await evaluateConceptualAnswer({
      question: targetQuestion,
      studentAnswer: latestSub.answerText,
      attemptNumber: latestSub.attemptNumber,
    });

    const errorPercentage = evaluation.errorPercentage;
    const understandingPercentage = Math.max(0, 100 - errorPercentage);

    const evaluationReport = {
      ...evaluation,
      errorPercentage,
      understandingPercentage,
      rawScore: understandingPercentage,
      correctConcepts: evaluation.strengths || [],
      missingConcepts: evaluation.missingConcepts || [],
      incorrectConcepts: (evaluation.identifiedIssues || []).map(
        (i) => `${i.criterion}: ${i.description}`
      ),
      suggestions: (evaluation.identifiedIssues || []).map((i) => i.hint).filter(Boolean),
    };

    // Save evaluation result in MongoDB
    latestSub.aiEvaluation = evaluationReport;
    latestSub.status = "evaluated";
    latestSub.evaluatedAt = new Date();
    await latestSub.save();

    // Update progress
    progress.lastAIEvaluation = evaluationReport;
    progress.conceptualStatus = "evaluated";
    progress.status = "waiting_faculty_decision";
    progress.compilerAllowed = false; // Still NOT allowed until faculty clicks "Allow to Code"
    progress.evaluatedAt = new Date();

    if (progress.questionProgress && progress.questionProgress.get(qKey)) {
      const qp = progress.questionProgress.get(qKey);
      qp.lastAIEvaluation = evaluationReport;
      qp.conceptualStatus = "evaluated";
      qp.status = "waiting_faculty_decision";
      qp.compilerAllowed = false;
      qp.evaluatedAt = new Date();
      progress.questionProgress.set(qKey, qp);
    }
    await progress.save();

    // Audit log
    await ExamAuditLog.create({
      examId,
      actorId: req.user.userId,
      actorRole: req.user.role || "admin",
      action: "FACULTY_TRIGGERED_AI_EVALUATION",
      details: {
        studentId,
        questionId: targetQuestion._id,
        attemptNumber: latestSub.attemptNumber,
        errorPercentage,
        understandingPercentage,
      },
    });

    res.status(200).json({
      message: "AI evaluation completed successfully.",
      studentId: student._id,
      studentName: student.username,
      rollNo: student.rollNo,
      questionTitle: targetQuestion.title,
      questionId: targetQuestion._id,
      conceptualAnswer: latestSub.answerText,
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
    // Reset evaluating state on error
    try {
      await StudentExamProgress.updateOne(
        { examId: req.params.examId, studentId: req.params.studentId },
        { status: "awaiting_faculty_evaluation", conceptualStatus: "submitted" }
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

    // Update progress
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

    // Update progress
    progress.compilerAllowed = false;
    progress.conceptualStatus = "correction_required";
    progress.status = "notepad_correction_required";
    progress.facultyDecision = "return_to_notepad";
    progress.facultyDecisionAt = now;
    progress.facultyId = facultyId;
    progress.facultyFeedback = feedbackNote;

    if (latestSub.questionId) {
      const qKey = latestSub.questionId.toString();
      if (!progress.questionProgress) progress.questionProgress = new Map();
      const qp = progress.questionProgress.get(qKey) || { questionId: latestSub.questionId };
      qp.compilerAllowed = false;
      qp.conceptualStatus = "correction_required";
      qp.status = "correction_required";
      qp.facultyDecision = "return_to_notepad";
      qp.facultyDecisionAt = now;
      qp.facultyId = facultyId;
      qp.facultyFeedback = feedbackNote;
      progress.questionProgress.set(qKey, qp);
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
      .populate("questionId", "title difficulty problemStatement evaluationRubric")
      .sort({ attemptNumber: -1 })
      .lean();

    const latest = allAttempts[0] || null;
    const progress = await StudentExamProgress.findOne({ examId, studentId }).lean();

    res.status(200).json({
      student: {
        _id: student._id,
        username: student.username,
        rollNo: student.rollNo,
        email: student.email,
      },
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
    }
    if (!targetQuestion) {
      targetQuestion = assigned[0];
    }

    if (!targetQuestion) {
      return res.status(404).json({ message: "Question not found." });
    }

    const qKey = targetQuestion._id.toString();
    const qProg = progress.questionProgress?.get
      ? progress.questionProgress.get(qKey)
      : progress.questionProgress?.[qKey];

    const isAllowed = progress.compilerAllowed || (qProg && qProg.compilerAllowed);
    if (!isAllowed) {
      return res.status(403).json({
        message: "Compiler access is locked. You must first achieve an error percentage below 50% on conceptual evaluation.",
      });
    }

    // Run only against VISIBLE test cases
    const visibleTestCases = (targetQuestion.testCases || []).filter(
      (tc) => !tc.isHidden
    );

    const sampleCases = visibleTestCases.map((tc, idx) => ({
      testCaseNumber: idx + 1,
      input: tc.input || "",
      expectedOutput: tc.expectedOutput || "",
      timeLimitMs: tc.timeLimitMs || 3000,
    }));

    const runResult = await runCCode({
      code,
      sampleCases,
      problemTitle: targetQuestion.title,
      language: "c",
    });

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

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(403).json({ message: "Progress record not found." });
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

    const isAllowed = progress.compilerAllowed || (qProg && qProg.compilerAllowed);
    const approvedAnswer = await ExamAnswerSubmission.findOne({
      examId,
      studentId,
      questionId: question._id,
      isApproved: true,
    }).lean();

    const hasApprovedConceptual = Boolean(
      approvedAnswer ||
      (qProg && qProg.compilerAllowed && qProg.lastAIEvaluation?.errorPercentage < 50) ||
      (progress.compilerAllowed && progress.lastAIEvaluation?.errorPercentage < 50)
    );

    if (!isAllowed || !hasApprovedConceptual) {
      return res.status(403).json({
        message: "Unauthorized code submission: You must complete and pass the conceptual Notepad evaluation before submitting code.",
      });
    }

    if (progress.status === "completed" || progress.status === "successfully_completed") {
      return res.status(400).json({
        message: "You have already completed this examination. Submissions are locked.",
      });
    }

    const allTestCases = question.testCases || [];

    // Execute against all test cases in deterministic sandbox
    const judgeResult = await judgeSubmission({
      code,
      testCases: allTestCases,
      problemTitle: question.title,
    });

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
    const currentQProg = progress.questionProgress.get(qKey) || {
      questionId: question._id,
      compilerAllowed: true,
    };
    currentQProg.currentCode = code;

    if (allPassed) {
      currentQProg.isCompleted = true;
      currentQProg.completedAt = new Date();
      currentQProg.score = question.marks || 100;
      currentQProg.status = "completed";
      progress.questionProgress.set(qKey, currentQProg);

      // Check if ALL assigned questions have approved conceptual evaluation AND completed code
      const allApprovedAnswers = await ExamAnswerSubmission.find({
        examId,
        studentId,
        isApproved: true,
      }).select("questionId").lean();

      const approvedQIds = new Set(allApprovedAnswers.map((a) => a.questionId?.toString()));

      const allQuestionsCompleted = assigned.every((qItem) => {
        const itemKey = qItem._id.toString();
        const p = progress.questionProgress.get(itemKey);
        const hasPassedConceptual =
          approvedQIds.has(itemKey) ||
          (p && p.compilerAllowed && p.lastAIEvaluation?.errorPercentage < 50) ||
          (progress.compilerAllowed && progress.lastAIEvaluation?.errorPercentage < 50);
        const hasPassedCode = itemKey === qKey ? true : Boolean(p && p.isCompleted);
        return hasPassedConceptual && hasPassedCode;
      });

      if (allQuestionsCompleted) {
        progress.status = "successfully_completed";
        progress.completedAt = new Date();
        const totalMarks = assigned.reduce(
          (sum, qItem) => sum + (qItem.marks || 100),
          0
        );
        progress.finalScore = totalMarks;
      }
    } else {
      currentQProg.status = "test_cases_failed";
      progress.status = "test_cases_failed";
      progress.questionProgress.set(qKey, currentQProg);
    }

    await progress.save();

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

    const isExamCompleted = progress.status === "completed";

    res.status(201).json({
      success: true,
      message: allPassed
        ? isExamCompleted
          ? "All assigned questions passed! Examination completed successfully."
          : "All test cases passed for this question! Please complete any remaining questions."
        : "Some test cases failed. Please review your code and try again.",
      status: submission.status,
      allPassed,
      isCompleted: allPassed,
      isExamCompleted,
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
    const studentId = req.user.userId;

    const [exam, student, progress, allocation, latestApprovedAnswer, latestAnswerSub, latestCodeSub] =
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
        ExamCodeSubmission.findOne({ examId, studentId })
          .sort({ submittedAt: -1 })
          .lean(),
      ]);

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

    if (isViva) {
      const isVivaDone =
        progress?.status === "completed" ||
        progress?.status === "successfully_completed" ||
        Boolean(progress?.vivaResult);

      if (isVivaDone) {
        isSuccessfullyCompleted = true;
        examStatus = "Successfully Completed";
        message = "You have successfully completed and submitted your Viva examination.";
        conceptualAnswerStatus = "N/A (Viva MCQ Exam)";
        codeSubmissionStatus = "N/A (Viva MCQ Exam)";
        testCasesPassed = progress?.vivaResult?.correct ?? 0;
        testCasesFailed = progress?.vivaResult?.incorrect ?? 0;
        totalTestCases = progress?.vivaResult?.totalQuestions ?? 0;
        submissionTime = progress?.vivaResult?.submittedAt || progress?.completedAt || null;
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

      // Check all questions for multi-question allocations
      const allQuestionsDone = assigned.length > 0
        ? assigned.every((q) => {
            const qKey = q._id.toString();
            const p = progress?.questionProgress?.get
              ? progress.questionProgress.get(qKey)
              : progress?.questionProgress?.[qKey];
            return p && p.isCompleted;
          })
        : allTestsPassed;

      // Mandatory validation check
      if (
        instructionsAcknowledged &&
        hasSubmittedConceptual &&
        hasApprovedConceptual &&
        compilerAccessGranted &&
        hasSubmittedCode &&
        allTestsPassed &&
        allQuestionsDone &&
        (progress?.status === "successfully_completed" || progress?.status === "completed")
      ) {
        isSuccessfullyCompleted = true;
        examStatus = "Successfully Completed";
        message =
          "You have successfully completed and submitted your examination. All responses have been logged in the audit registry.";
      } else {
        isSuccessfullyCompleted = false;
        if (isTimeExpired) {
          examStatus = "Time Expired";
          pendingStep = "Examination Time Limit Expired";
          message = "The examination time has expired before all required steps were completed.";
        } else if (!instructionsAcknowledged) {
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
          examStatus = "Submission Pending";
          pendingStep = "Final Submission Finalization";
          message = "Your submission is pending finalization. Please complete the remaining steps.";
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

      if (latestCodeSub) {
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
    }

    res.status(200).json({
      isSuccessfullyCompleted,
      examStatus,
      pendingStep,
      message,
      studentName: student.username,
      rollNo: student.rollNo || "N/A",
      examTitle: exam.title,
      examType: exam.examType,
      subject: exam.subject,
      submissionTime,
      conceptualAnswerStatus,
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

    const isCompleted = progress.status === "completed" || exam.status === "completed";

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

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      return res.status(404).json({ message: "Exam session not found." });
    }

    if (progress.status === "completed") {
      return res.status(400).json({ message: "Exam has already been submitted." });
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

    await progress.save();

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
  } catch (error) {
    next(error);
  }
};

/**
 * Get Viva student exam result.
 */
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
