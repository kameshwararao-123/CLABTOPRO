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
const fisherYatesShuffle = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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
      status,
    } = req.body;

    if (!title || !subject || !academicYear || !semester || !examType || !examDate) {
      return res.status(400).json({
        message: "Title, subject, academic year, semester, exam type, and exam date are required.",
      });
    }

    if (!["internal", "external"].includes(examType)) {
      return res.status(400).json({
        message: "Invalid exam type. Must be 'internal' or 'external'.",
      });
    }

    const exam = await Exam.create({
      title,
      description: description || "",
      subject,
      academicYear,
      semester,
      examType,
      examDate: new Date(examDate),
      startTime: startTime || "",
      endTime: endTime || "",
      durationMinutes: durationMinutes ? Number(durationMinutes) : 90,
      totalMarks: totalMarks ? Number(totalMarks) : 100,
      instructions: instructions || undefined,
      maxConceptualAttempts: maxConceptualAttempts ? Number(maxConceptualAttempts) : 3,
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
      message: `${examType === "internal" ? "Internal" : "External"} Exam created successfully.`,
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
    if (examType && ["internal", "external"].includes(examType)) {
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
    const exam = await Exam.findById(examId)
      .populate("createdBy", "username email")
      .populate("participatingStudents", "username rollNo email")
      .lean();

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    const [questions, allocations] = await Promise.all([
      ExamQuestion.find({ examId }).sort({ createdAt: 1 }).lean(),
      ExamAllocation.find({ examId })
        .populate("studentId", "username rollNo email")
        .populate("questionId", "title difficulty")
        .lean(),
    ]);

    res.status(200).json({
      exam,
      questions,
      allocations,
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
      inputFormat,
      outputFormat,
      constraints,
      explanation,
      difficulty,
      marks,
      evaluationRubric,
      testCases,
    } = req.body;

    if (!title || !problemStatement) {
      return res.status(400).json({
        message: "Question title and problem statement are required.",
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
      title: title.trim(),
      problemStatement,
      inputFormat: inputFormat || "",
      outputFormat: outputFormat || "",
      constraints: constraints || "",
      explanation: explanation || "",
      difficulty: difficulty || "Medium",
      marks: marks ? Number(marks) : 100,
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
 * Randomly allocate exactly one unique question to each participating student
 * using Fisher-Yates shuffle with database-level uniqueness enforcement.
 */
export const allocateExamQuestions = async (req, res, next) => {
  try {
    const { examId } = req.params;
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

    const questions = await ExamQuestion.find({ examId }).select("_id title").lean();

    if (questions.length < studentIds.length) {
      return res.status(400).json({
        message: `Insufficient questions for unique allocation! Exam has ${studentIds.length} students but only ${questions.length} questions. You need at least ${studentIds.length} questions so each student receives a unique question.`,
      });
    }

    // Randomize questions using Fisher-Yates
    const shuffledQuestions = fisherYatesShuffle(questions);

    // Clear any previous draft allocations for this exam
    await ExamAllocation.deleteMany({ examId });

    // Prepare unique 1-to-1 pairs: each student gets exactly 1 unique question
    const allocationsToInsert = studentIds.map((studentId, idx) => ({
      examId,
      studentId,
      questionId: shuffledQuestions[idx]._id,
      allocatedAt: new Date(),
    }));

    // Atomically insert all allocations (enforced by DB unique indexes)
    await ExamAllocation.insertMany(allocationsToInsert, { ordered: true });

    // Initialize or update StudentExamProgress records for all participating students
    const progressOps = studentIds.map((studentId) => ({
      updateOne: {
        filter: { examId, studentId },
        update: {
          $setOnInsert: {
            examId,
            studentId,
            status: "not_started",
            instructionsAcknowledged: false,
            compilerAllowed: false,
          },
        },
        upsert: true,
      },
    }));
    await StudentExamProgress.bulkWrite(progressOps, { ordered: false });

    exam.status = "allocated";
    await exam.save();

    await ExamAuditLog.create({
      examId,
      actorId: req.user.userId,
      action: "questions_allocated",
      details: { studentCount: studentIds.length, questionCount: questions.length },
    });

    const report = await ExamAllocation.find({ examId })
      .populate("studentId", "username rollNo email")
      .populate("questionId", "title difficulty")
      .lean();

    res.status(200).json({
      message: `Successfully allocated unique questions to all ${studentIds.length} participating students.`,
      allocationsCount: allocationsToInsert.length,
      allocations: report,
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
      .populate("questionId", "title difficulty marks")
      .sort({ "studentId.rollNo": 1, allocatedAt: 1 })
      .lean();

    res.status(200).json({ allocations });
  } catch (error) {
    next(error);
  }
};

/**
 * Start Examination.
 * Validates question availability, student assignments, and changes status to in_progress.
 */
export const startExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found." });
    }

    if (exam.status === "in_progress") {
      return res.status(400).json({ message: "Exam is already in progress." });
    }

    if (exam.status === "completed" || exam.status === "cancelled") {
      return res.status(400).json({
        message: `Cannot start an exam with status: ${exam.status}.`,
      });
    }

    const [questionCount, studentCount, allocationCount] = await Promise.all([
      ExamQuestion.countDocuments({ examId }),
      exam.participatingStudents?.length || 0,
      ExamAllocation.countDocuments({ examId }),
    ]);

    if (studentCount === 0) {
      return res.status(400).json({
        message: "Cannot start exam: No participating students selected.",
      });
    }

    if (allocationCount < studentCount) {
      return res.status(400).json({
        message: `Cannot start exam: Questions have not been allocated to all students. (${allocationCount}/${studentCount} allocated). Please click 'Assign Questions' first.`,
      });
    }

    exam.status = "in_progress";
    exam.startedAt = new Date();
    exam.startedBy = req.user.userId;
    await exam.save();

    await ExamAuditLog.create({
      examId,
      actorId: req.user.userId,
      action: "exam_started",
      details: { startedAt: exam.startedAt, studentCount },
    });

    res.status(200).json({
      message: "Examination has been started successfully and is now active for students.",
      exam,
    });
  } catch (error) {
    next(error);
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

    const [allocations, progresses, answerSubs, codeSubs] = await Promise.all([
      ExamAllocation.find({ examId })
        .populate("studentId", "username rollNo email")
        .populate("questionId", "title difficulty")
        .lean(),
      StudentExamProgress.find({ examId }).lean(),
      ExamAnswerSubmission.find({ examId })
        .sort({ submittedAt: -1 })
        .lean(),
      ExamCodeSubmission.find({ examId })
        .sort({ submittedAt: -1 })
        .lean(),
    ]);

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

      return {
        studentId: sId,
        username: student?.username || "Unknown",
        rollNo: student?.rollNo || "",
        email: student?.email || "",
        assignedQuestion: alloc.questionId?.title || "Not Assigned",
        difficulty: alloc.questionId?.difficulty || "Medium",
        status: prog?.status || "not_started",
        instructionsAcknowledged: Boolean(prog?.instructionsAcknowledged),
        conceptualAttemptsCount: prog?.conceptualAttemptsCount || 0,
        conceptualApproved: Boolean(prog?.compilerAllowed),
        lastConceptualError: ans?.aiEvaluation?.errorPercentage ?? null,
        codeStatus: code?.status || "not_submitted",
        testCasesPassed: code?.testCasesPassed || 0,
        totalTestCases: code?.totalTestCases || 0,
        completedAt: prog?.completedAt || null,
      };
    });

    res.status(200).json({
      examTitle: exam.title,
      examType: exam.examType,
      status: exam.status,
      startedAt: exam.startedAt,
      durationMinutes: exam.durationMinutes,
      totalStudents: allocations.length,
      students: rows,
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
      status: { $in: ["in_progress", "completed"] },
    };

    if (examType && ["internal", "external"].includes(examType)) {
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
        status: exam.status,
        startedAt: exam.startedAt,
        studentStatus: prog?.status || "not_started",
        compilerAllowed: Boolean(prog?.compilerAllowed),
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
          status: "question_assigned",
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
 */
export const getMyAssignedQuestion = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const exam = await Exam.findOne({
      _id: examId,
      participatingStudents: studentId,
    }).select("status title subject durationMinutes maxConceptualAttempts startedAt");

    if (!exam || (exam.status !== "in_progress" && exam.status !== "completed")) {
      return res.status(403).json({ message: "Exam is not active." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId }).lean();
    if (!progress || !progress.instructionsAcknowledged) {
      return res.status(403).json({
        message: "Please read and acknowledge the examination instructions first.",
      });
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .lean();

    if (!allocation || !allocation.questionId) {
      return res.status(404).json({
        message: "No question allocated for your account. Please contact faculty.",
      });
    }

    const q = allocation.questionId;

    // Filter to only visible sample test cases for the student
    const visibleSamples = (q.testCases || [])
      .filter((tc) => !tc.isHidden)
      .map((tc, idx) => ({
        sampleNumber: idx + 1,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      }));

    res.status(200).json({
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        durationMinutes: exam.durationMinutes,
        maxConceptualAttempts: exam.maxConceptualAttempts,
        startedAt: exam.startedAt,
      },
      progress: {
        status: progress.status,
        conceptualAttemptsCount: progress.conceptualAttemptsCount,
        compilerAllowed: progress.compilerAllowed,
        lastConceptualAnswer: progress.lastConceptualAnswer,
        lastAIEvaluation: progress.lastAIEvaluation,
      },
      question: {
        _id: q._id,
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
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Autosave student's conceptual answer draft in Notepad.
 */
export const autosaveAnswerDraft = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { answerText } = req.body;

    const progress = await StudentExamProgress.findOneAndUpdate(
      { examId, studentId },
      {
        $set: {
          lastConceptualAnswer: answerText || "",
          status: "answer_in_progress",
        },
      },
      { new: true }
    );

    res.status(200).json({ message: "Draft saved.", progress });
  } catch (error) {
    next(error);
  }
};

/**
 * Evaluate Paper Answer using Gemini AI with 50% Threshold Gate.
 */
export const evaluatePaperAnswer = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { answerText } = req.body;

    if (!answerText || !answerText.trim()) {
      return res.status(400).json({
        message: "Please write your conceptual solution before submitting for evaluation.",
      });
    }

    const exam = await Exam.findById(examId);
    if (!exam || exam.status !== "in_progress") {
      return res.status(403).json({ message: "Exam is not currently active." });
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .lean();

    if (!allocation || !allocation.questionId) {
      return res.status(404).json({ message: "Allocated question not found." });
    }

    let progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress) {
      progress = await StudentExamProgress.create({ examId, studentId });
    }

    const maxAttempts = exam.maxConceptualAttempts || 3;
    if (progress.conceptualAttemptsCount >= maxAttempts && !progress.compilerAllowed) {
      return res.status(403).json({
        message: `Maximum conceptual evaluation attempts (${maxAttempts}) reached. Your submission has been flagged for faculty review.`,
      });
    }

    const attemptNumber = (progress.conceptualAttemptsCount || 0) + 1;

    // AI Evaluation
    const evaluation = await evaluateConceptualAnswer({
      question: allocation.questionId,
      studentAnswer: answerText,
      attemptNumber,
    });

    const isApproved = evaluation.errorPercentage < 50;

    // Record this attempt in ExamAnswerSubmission
    await ExamAnswerSubmission.create({
      examId,
      studentId,
      questionId: allocation.questionId._id,
      attemptNumber,
      answerText,
      aiEvaluation: evaluation,
      isApproved,
    });

    // Update progress state
    progress.conceptualAttemptsCount = attemptNumber;
    progress.lastConceptualAnswer = answerText;
    progress.lastAIEvaluation = evaluation;

    if (isApproved) {
      progress.status = "execution_allowed";
      progress.compilerAllowed = true;
      progress.compilerAllowedAt = new Date();
    } else {
      if (attemptNumber >= maxAttempts) {
        progress.status = "review_required";
      } else {
        progress.status = "correction_required";
      }
    }

    await progress.save();

    res.status(200).json({
      isApproved,
      errorPercentage: evaluation.errorPercentage,
      compilerAllowed: progress.compilerAllowed,
      attemptNumber,
      maxAttempts,
      evaluation,
      message: isApproved
        ? "Congratulations! Your conceptual answer has been evaluated successfully. You are allowed to proceed to the code execution environment."
        : "Significant issues detected (error >= 50%). Please review the feedback and revise your answer.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Run C Code in Exam Mode (Tests against VISIBLE sample cases only).
 */
export const runExamCode = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { code } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ message: "Code cannot be empty." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId }).lean();
    if (!progress || !progress.compilerAllowed) {
      return res.status(403).json({
        message: "Compiler access is locked. You must first achieve an error percentage below 50% on conceptual evaluation.",
      });
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .lean();

    if (!allocation || !allocation.questionId) {
      return res.status(404).json({ message: "Question not found." });
    }

    // Run only against VISIBLE test cases
    const visibleTestCases = (allocation.questionId.testCases || []).filter(
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
      problemTitle: allocation.questionId.title,
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
 */
export const submitExamCode = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;
    const { code } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ message: "Code cannot be empty." });
    }

    const progress = await StudentExamProgress.findOne({ examId, studentId });
    if (!progress || !progress.compilerAllowed) {
      return res.status(403).json({
        message: "Unauthorized code submission: Compiler access has not been granted.",
      });
    }

    if (progress.status === "completed") {
      return res.status(400).json({
        message: "You have already completed this examination. Submissions are locked.",
      });
    }

    const allocation = await ExamAllocation.findOne({ examId, studentId })
      .populate("questionId")
      .lean();

    if (!allocation || !allocation.questionId) {
      return res.status(404).json({ message: "Question not found." });
    }

    const question = allocation.questionId;
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

    progress.currentCode = code;

    if (allPassed) {
      progress.status = "completed";
      progress.completedAt = new Date();
      progress.finalScore = question.marks || 100;
      await progress.save();
    } else {
      await progress.save();
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

    res.status(201).json({
      success: true,
      message: allPassed
        ? "All test cases passed! Examination completed successfully."
        : "Some test cases failed. Please review your code and try again.",
      status: submission.status,
      allPassed,
      isCompleted: allPassed,
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
 * Get student exam completion summary.
 */
export const getStudentExamCompletion = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.userId;

    const [exam, progress, latestSubmission] = await Promise.all([
      Exam.findById(examId).select("title subject examType durationMinutes totalMarks").lean(),
      StudentExamProgress.findOne({ examId, studentId }).lean(),
      ExamCodeSubmission.findOne({ examId, studentId, allPassed: true })
        .sort({ submittedAt: -1 })
        .lean(),
    ]);

    if (!exam || !progress) {
      return res.status(404).json({ message: "Exam record not found." });
    }

    res.status(200).json({
      exam,
      progress,
      submission: latestSubmission
        ? {
            status: latestSubmission.status,
            testCasesPassed: latestSubmission.testCasesPassed,
            totalTestCases: latestSubmission.totalTestCases,
            executionTime: latestSubmission.executionTime,
            submittedAt: latestSubmission.submittedAt,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};
