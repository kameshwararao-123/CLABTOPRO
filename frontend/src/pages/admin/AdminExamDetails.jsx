import { useEffect, useState, useTransition } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  HelpCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Trash2,
  Users,
  XCircle,
  AlertCircle,
  Check,
  FileCode,
  ShieldCheck,
  Calendar,
  Layers,
  Sparkles,
  UploadCloud,
  Download,
  Activity,
  RotateCcw,
  AlertTriangle,
  Eye,
  X,
  Copy,
  KeyRound,
} from "lucide-react";
import {
  getExamById,
  addExamQuestion,
  deleteExamQuestion,
  getCandidateStudents,
  setParticipatingStudents,
  allocateExamQuestions,
  startExam,
  completeExam,
  getExamMonitoring,
  facultyEvaluateStudentPaper,
  facultyAuthorizeCompiler,
  facultyReturnToNotepad,
  getStudentConceptualReport,
} from "../../services/examService";
import Loader from "../../components/common/Loader";
import ExamQuestionUploadModal from "../../components/exam/ExamQuestionUploadModal";
import ExamQuestionPreviewModal from "../../components/exam/ExamQuestionPreviewModal";

const AdminExamDetails = () => {
  const { examId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    ["questions", "students", "allocations", "monitoring"].includes(tabParam)
      ? tabParam
      : "questions"
  );

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [monitoringData, setMonitoringData] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [monitoringSearch, setMonitoringSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [questionsPerStudentInput, setQuestionsPerStudentInput] = useState(1);

  // Faculty Evaluation & Code Authorization State
  const [evaluatingStudentId, setEvaluatingStudentId] = useState(null);
  const [conceptualReportModal, setConceptualReportModal] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [facultyFeedbackInput, setFacultyFeedbackInput] = useState("");

  // Student selection state
  const [candidateStudents, setCandidateStudents] = useState([]);
  const [searchStudent, setSearchStudent] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Add Question Modal State
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [activeExtractionJobId, setActiveExtractionJobId] = useState(null);
  const [newQuestion, setNewQuestion] = useState({
    title: "",
    problemStatement: "",
    inputFormat: "",
    outputFormat: "",
    constraints: "",
    explanation: "",
    difficulty: "Medium",
    marks: 100,
    timeLimit: 2,
    memoryLimit: 128,
    sampleTestCases: [{ input: "", expectedOutput: "", explanation: "" }],
    hiddenTestCases: [{ input: "", expectedOutput: "" }],
    rubric: {
      syntaxStructure: 20,
      logicCorrectness: 30,
      algorithmicApproach: 25,
      codeEfficiency: 15,
      constraintsHandling: 10,
    },
  });

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey });
  };

  const fetchExamDetails = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const data = await getExamById(examId);
      setExam(data.exam);
      setQuestions(data.questions || []);
      setAllocations(data.allocations || []);
      if (data.exam?.questionsPerStudent) {
        setQuestionsPerStudentInput(data.exam.questionsPerStudent);
      }

      if (data.exam?.participatingStudents) {
        const ids = new Set(
          data.exam.participatingStudents.map((s) =>
            typeof s === "object" ? s._id : s
          )
        );
        setSelectedStudentIds(ids);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load examination details.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCandidates = async (query = "") => {
    try {
      setLoadingCandidates(true);
      const data = await getCandidateStudents(query);
      setCandidateStudents(data.students || []);
    } catch (err) {
      console.error("Error fetching students:", err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const fetchMonitoring = async () => {
    try {
      const data = await getExamMonitoring(examId);
      setMonitoringData(data);
    } catch (err) {
      console.error("Error fetching monitoring data:", err);
    }
  };

  const handleExtractionComplete = (jobId) => {
    setActiveExtractionJobId(jobId);
    setIsPreviewModalOpen(true);
  };

  const handleQuestionsSavedSuccess = async (savedCount) => {
    setSuccessMsg(`Successfully imported ${savedCount} questions into the examination bank.`);
    await fetchExamDetails();
  };

  useEffect(() => {
    fetchExamDetails();
  }, [examId]);

  useEffect(() => {
    if (activeTab === "students" && candidateStudents.length === 0) {
      fetchCandidates("");
    } else if (activeTab === "monitoring") {
      fetchMonitoring();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "monitoring" || !autoRefreshEnabled) return;
    const interval = setInterval(() => {
      fetchMonitoring();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab, autoRefreshEnabled, examId]);

  const handleStartExam = async () => {
    const k = parseInt(questionsPerStudentInput, 10);
    if (isNaN(k) || k < 1) {
      setErrorMsg("Please specify a valid number of questions per student (at least 1).");
      return;
    }

    if (k > questions.length) {
      setErrorMsg(
        `Insufficient questions! Bank has ${questions.length} question(s), but ${k} per student were requested.`
      );
      return;
    }

    if (!window.confirm(`Start this examination now? Questions will be automatically allocated (${k} per student) to all enrolled students using server-side Fisher-Yates shuffle.`)) {
      return;
    }
    try {
      setActionLoading(true);
      setErrorMsg("");
      const res = await startExam(examId, k);
      setSuccessMsg(res.message || "Exam has been successfully started with question allocations.");
      await fetchExamDetails();
      handleTabChange("monitoring");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to start exam.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteExam = async () => {
    if (!window.confirm("Complete this examination? This will lock all student answer submissions.")) {
      return;
    }
    try {
      setActionLoading(true);
      setErrorMsg("");
      await completeExam(examId);
      setSuccessMsg("Examination marked as completed.");
      await fetchExamDetails();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to complete exam.");
    } finally {
      setActionLoading(false);
    }
  };

  // Faculty Evaluation & Code Authorization Handlers
  const handleFacultyEvaluate = async (studentRow) => {
    try {
      setEvaluatingStudentId(studentRow.studentId);
      setErrorMsg("");
      setSuccessMsg("");
      const res = await facultyEvaluateStudentPaper(
        examId,
        studentRow.studentId,
        studentRow.targetQuestionId
      );
      setConceptualReportModal({
        studentId: studentRow.studentId,
        studentName: studentRow.username,
        rollNo: studentRow.rollNo,
        questionId: studentRow.targetQuestionId,
        questionTitle: res.questionTitle || studentRow.assignedQuestion,
        conceptualAnswer: res.conceptualAnswer || studentRow.lastConceptualAnswer,
        understandingPercentage: res.understandingPercentage,
        errorPercentage: res.errorPercentage,
        correctConcepts: res.correctConcepts || [],
        missingConcepts: res.missingConcepts || [],
        incorrectConcepts: res.incorrectConcepts || [],
        suggestions: res.suggestions || [],
        feedbackSummary: res.feedbackSummary || "",
        canAllowToCode: res.canAllowToCode,
        requiresRevision: res.requiresRevision,
        attemptNumber: res.attemptNumber,
        report: res.report,
      });
      setFacultyFeedbackInput(
        res.errorPercentage >= 50
          ? "Your conceptual answer requires improvement. Please review the faculty feedback and correct your answer before resubmitting."
          : ""
      );
      setSuccessMsg(`AI evaluation completed for ${studentRow.username} (Error: ${res.errorPercentage}%).`);
      await fetchMonitoring();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to perform AI evaluation.");
    } finally {
      setEvaluatingStudentId(null);
    }
  };

  const handleOpenReportModal = async (studentRow) => {
    try {
      setReportLoading(true);
      setErrorMsg("");
      const res = await getStudentConceptualReport(
        examId,
        studentRow.studentId,
        studentRow.targetQuestionId
      );
      const latestSub = res.latestSubmission;
      const aiEval = latestSub?.aiEvaluation || studentRow.aiEvaluation || {};
      const err = aiEval.errorPercentage ?? studentRow.lastConceptualError ?? 0;
      const und = aiEval.understandingPercentage ?? Math.max(0, 100 - err);

      setConceptualReportModal({
        studentId: studentRow.studentId,
        studentName: studentRow.username,
        rollNo: studentRow.rollNo,
        questionId: studentRow.targetQuestionId,
        questionTitle: latestSub?.questionId?.title || studentRow.assignedQuestion,
        conceptualAnswer: latestSub?.answerText || studentRow.lastConceptualAnswer,
        understandingPercentage: und,
        errorPercentage: err,
        correctConcepts: aiEval.strengths || aiEval.correctConcepts || [],
        missingConcepts: aiEval.missingConcepts || [],
        incorrectConcepts: (aiEval.identifiedIssues || []).map((i) => `${i.criterion}: ${i.description}`),
        suggestions: (aiEval.identifiedIssues || []).map((i) => i.hint).filter(Boolean),
        feedbackSummary: aiEval.feedbackSummary || "",
        canAllowToCode: err < 50,
        requiresRevision: err >= 50,
        attemptNumber: latestSub?.attemptNumber || studentRow.conceptualAttemptsCount || 1,
        allAttempts: res.allAttempts || [],
        progress: res.progress,
        isApproved: Boolean(studentRow.conceptualApproved || res.progress?.compilerAllowed),
      });
      setFacultyFeedbackInput(
        latestSub?.facultyFeedback ||
          (err >= 50
            ? "Your conceptual answer requires improvement. Please review the faculty feedback and correct your answer before resubmitting."
            : "")
      );
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to load conceptual report.");
    } finally {
      setReportLoading(false);
    }
  };

  const handleFacultyAllowToCode = async (studentId, questionId) => {
    try {
      setDecisionLoading(true);
      setErrorMsg("");
      await facultyAuthorizeCompiler(examId, studentId, questionId);
      setSuccessMsg("Compiler access granted. Student authorized to code.");
      setConceptualReportModal(null);
      await fetchMonitoring();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to authorize compiler access.");
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleFacultyReturnToNotepad = async (studentId, questionId, feedback) => {
    try {
      setDecisionLoading(true);
      setErrorMsg("");
      await facultyReturnToNotepad(examId, studentId, questionId, feedback);
      setSuccessMsg("Student returned to Notepad for revision with feedback.");
      setConceptualReportModal(null);
      await fetchMonitoring();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to return student to Notepad.");
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleSaveStudents = async () => {
    try {
      setActionLoading(true);
      setErrorMsg("");
      const studentIds = Array.from(selectedStudentIds);
      await setParticipatingStudents(examId, studentIds);
      setSuccessMsg(`Successfully saved ${studentIds.length} students to this examination.`);
      await fetchExamDetails();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to update enrolled students.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAllocateQuestions = async () => {
    if (
      !window.confirm(
        "Execute Fisher-Yates random question allocation? Each student will receive a unique assigned problem."
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg("");
      const res = await allocateExamQuestions(examId);
      setSuccessMsg(
        `Successfully allocated unique questions to ${res.allocations?.length || 0} students.`
      );
      await fetchExamDetails();
      handleTabChange("allocations");
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to execute question allocation.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddQuestionSubmit = async (e) => {
    e.preventDefault();
    if (!newQuestion.title.trim() || !newQuestion.problemStatement.trim()) {
      setErrorMsg("Please provide a Title and Problem Statement.");
      return;
    }

    const sumWeights =
      Number(newQuestion.rubric.syntaxStructure) +
      Number(newQuestion.rubric.logicCorrectness) +
      Number(newQuestion.rubric.algorithmicApproach) +
      Number(newQuestion.rubric.codeEfficiency) +
      Number(newQuestion.rubric.constraintsHandling);

    if (sumWeights !== 100) {
      setErrorMsg(`Evaluation rubric weights must sum to 100% (currently ${sumWeights}%).`);
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg("");

      const testCases = [
        ...newQuestion.sampleTestCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          explanation: tc.explanation || "",
          isHidden: false,
        })),
        ...newQuestion.hiddenTestCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isHidden: true,
        })),
      ];

      const payload = {
        title: newQuestion.title,
        problemStatement: newQuestion.problemStatement,
        inputFormat: newQuestion.inputFormat,
        outputFormat: newQuestion.outputFormat,
        constraints: newQuestion.constraints,
        explanation: newQuestion.explanation,
        difficulty: newQuestion.difficulty,
        marks: Number(newQuestion.marks) || 100,
        timeLimit: Number(newQuestion.timeLimit) || 2,
        memoryLimit: Number(newQuestion.memoryLimit) || 128,
        testCases,
        evaluationRubric: [
          {
            criterion: "Conceptual Logic",
            weight: Number(newQuestion.rubric.logicCorrectness),
            description: "Correct mathematical/programmatic reasoning and algorithm",
          },
          {
            criterion: "Algorithmic Approach",
            weight: Number(newQuestion.rubric.algorithmicApproach),
            description: "Problem solving strategy, optimality, approach",
          },
          {
            criterion: "Syntax & Structure",
            weight: Number(newQuestion.rubric.syntaxStructure),
            description: "C language syntax, declarations, code formatting",
          },
          {
            criterion: "Time & Space Complexity",
            weight: Number(newQuestion.rubric.codeEfficiency),
            description: "Efficiency and asymptotic bounds",
          },
          {
            criterion: "I/O & Boundary Conditions",
            weight: Number(newQuestion.rubric.constraintsHandling),
            description: "Handling boundary values, zero, negative input",
          },
        ],
      };

      await addExamQuestion(examId, payload);
      setSuccessMsg("Question added to examination bank successfully.");
      setIsAddQuestionModalOpen(false);
      await fetchExamDetails();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to add question.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question from the examination bank?")) return;
    try {
      setActionLoading(true);
      await deleteExamQuestion(qId);
      setSuccessMsg("Question deleted successfully.");
      await fetchExamDetails();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Failed to delete question.");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleStudent = (id) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllStudents = () => {
    if (selectedStudentIds.size === candidateStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(candidateStudents.map((s) => s._id)));
    }
  };

  if (loading) {
    return <Loader message="Loading examination details..." />;
  }

  if (!exam) {
    return (
      <div className="mx-auto max-w-4xl p-12 text-center">
        <AlertCircle size={40} className="mx-auto text-red-500" />
        <h2 className="mt-3 text-xl font-bold text-slate-800">Exam Not Found</h2>
        <p className="mt-1 text-sm text-slate-500">
          {errorMsg || "The requested examination could not be found."}
        </p>
        <Link
          to="/admin/exams"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
        >
          <ArrowLeft size={16} /> Back to Examinations
        </Link>
      </div>
    );
  }

  const enrolledCount = exam.participatingStudents?.length || 0;
  const questionsCount = questions.length;
  const isAllocationPossible = questionsCount >= enrolledCount && enrolledCount > 0;
  const isDraft = exam.status === "draft";
  const isInProgress = exam.status === "in_progress";
  const isCompleted = exam.status === "completed";

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={`/admin/exams?type=${exam.examType}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-2 transition"
          >
            <ArrowLeft size={14} /> Back to {exam.examType === "internal" ? "Internal" : "External"} Examinations
          </Link>

          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
              {exam.title}
            </h1>

            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                exam.examType === "internal"
                  ? "bg-purple-100 text-purple-700 border border-purple-200"
                  : "bg-blue-100 text-blue-700 border border-blue-200"
              }`}
            >
              {exam.examType} Exam
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                exam.status === "in_progress"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : exam.status === "completed"
                  ? "bg-slate-100 text-slate-700"
                  : exam.status === "allocated"
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {exam.status === "in_progress" && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {exam.status.replace("_", " ")}
            </span>
          </div>

          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Subject: <strong className="text-slate-700 font-semibold">{exam.subject}</strong> • Academic Year:{" "}
            {exam.academicYear} • Semester: {exam.semester}
          </p>

          {/* Exam Code Display & Copy */}
          {exam.examCode && (
            <div className="mt-3 inline-flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-1.5 text-xs text-indigo-900 shadow-xs">
              <KeyRound size={15} className="text-indigo-600" />
              <span>Exam Code:</span>
              <span className="font-mono text-sm font-extrabold tracking-wider text-indigo-700">
                {exam.examCode}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(exam.examCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition border border-indigo-200"
                title="Copy Exam Code to share with students"
              >
                {copiedCode ? (
                  <>
                    <Check size={12} className="text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy Exam Code</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchExamDetails}
            title="Refresh examination details"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 shadow-xs"
          >
            <RefreshCw size={15} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {!isInProgress && !isCompleted && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-xs" title="Questions per student allocated on start">
                <span className="font-medium text-slate-500 whitespace-nowrap">Q / Student:</span>
                <input
                  type="number"
                  min="1"
                  max={questions.length || 1}
                  value={questionsPerStudentInput}
                  onChange={(e) => setQuestionsPerStudentInput(e.target.value)}
                  className="w-12 rounded-lg border border-slate-300 px-1.5 py-0.5 text-center font-bold text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={handleStartExam}
                disabled={actionLoading || enrolledCount === 0 || questions.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title={
                  enrolledCount === 0
                    ? "Wait for students to enroll via exam code before starting"
                    : questions.length === 0
                    ? "Add questions to exam bank before starting"
                    : "Start examination and allocate questions"
                }
              >
                <Play size={16} /> Start Exam
              </button>
            </div>
          )}

          {isInProgress && (
            <button
              onClick={handleCompleteExam}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition"
            >
              <CheckCircle2 size={16} /> Complete Exam
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg("")}
            className="text-red-500 hover:text-red-800 text-lg leading-none font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="flex items-center gap-2.5">
            <Check size={18} className="flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg("")}
            className="text-emerald-500 hover:text-emerald-800 text-lg leading-none font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Metric Quick Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-indigo-50 p-2 sm:p-2.5 text-indigo-600">
              <Users size={20} />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Candidates
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">Enrolled Students</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{enrolledCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-indigo-50 p-2 sm:p-2.5 text-indigo-600">
              <FileCode size={20} />
            </div>
            <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">
              Bank
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">Questions in Bank</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{questionsCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-emerald-50 p-2 sm:p-2.5 text-emerald-600">
              <Shuffle size={20} />
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
              Allocation
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">
            {isInProgress || isCompleted ? "Allocated Count" : "Q Per Student"}
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {isInProgress || isCompleted
              ? allocations.length
              : `${exam.questionsPerStudent || questionsPerStudentInput} (on Start)`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-amber-50 p-2 sm:p-2.5 text-amber-600">
              <Clock size={20} />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Limit
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">Duration / Marks</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-slate-800">
            {exam.durationMinutes}m <span className="text-sm font-normal text-slate-400">/ {exam.totalMarks} pts</span>
          </p>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
        <nav className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => handleTabChange("questions")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "questions"
                ? "bg-indigo-50 text-indigo-700 shadow-xs"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <HelpCircle size={16} />
            <span>Questions Bank</span>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700">
              {questions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("students")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "students"
                ? "bg-indigo-50 text-indigo-700 shadow-xs"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Users size={16} />
            <span>Student Roster</span>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700">
              {enrolledCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("allocations")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "allocations"
                ? "bg-indigo-50 text-indigo-700 shadow-xs"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Shuffle size={16} />
            <span>Question Allocation</span>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700">
              {allocations.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("monitoring")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "monitoring"
                ? "bg-indigo-50 text-indigo-700 shadow-xs"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <RefreshCw size={16} />
            <span>Live Monitoring &amp; Results</span>
          </button>
        </nav>
      </div>

      {/* =========================================================================
          TAB 1: QUESTIONS BANK
         ========================================================================= */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Examination Questions Bank</h2>
              <p className="text-xs text-slate-500">
                To guarantee strictly unique 1-to-1 Fisher-Yates allocation, ensure there are at least {enrolledCount || 1} questions.
              </p>
            </div>
            {isDraft && (
              <div className="flex items-center gap-2.5">
                <a
                  href="/sample_question_paper_template.pdf"
                  download="Sample_Question_Paper_Template.pdf"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 hover:text-indigo-600 transition"
                  title="Download sample formatted PDF question paper template"
                >
                  <Download size={14} className="text-slate-400" /> Sample Template
                </a>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
                  title="Upload up to 200 questions via PDF or Excel"
                >
                  <UploadCloud size={16} className="text-indigo-600" /> Upload Questions
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddQuestionModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
                >
                  <Plus size={16} /> Add Question
                </button>
              </div>
            )}
          </div>

          {questions.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <HelpCircle size={36} className="text-slate-300 mx-auto mb-2" />
              <h3 className="font-bold text-slate-800">No questions in examination bank</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Upload a PDF/Excel question document (up to 200 questions) or manually add problem statements.
              </p>
              {isDraft && (
                <div className="mt-4 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
                  >
                    <UploadCloud size={14} className="text-indigo-600" /> Upload Document
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddQuestionModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
                  >
                    <Plus size={14} /> Add First Question
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {questions.map((q, idx) => {
                const sampleCount = (q.testCases || []).filter((tc) => !tc.isHidden).length;
                const hiddenCount = (q.testCases || []).filter((tc) => tc.isHidden).length;

                return (
                  <div
                    key={q._id}
                    className="flex flex-col md:flex-row md:items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-sm transition"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">Q{idx + 1}.</span>
                        <h3 className="text-base font-bold text-slate-800">{q.title}</h3>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            q.difficulty === "Easy"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : q.difficulty === "Hard"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {q.difficulty}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          {q.marks} Marks
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          Limit: {q.timeLimit}s
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-600 line-clamp-2">
                        {q.problemStatement}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
                        <span>
                          <strong className="text-slate-700">{sampleCount}</strong> Sample Cases (Visible)
                        </span>
                        <span>•</span>
                        <span>
                          <strong className="text-slate-700">{hiddenCount}</strong> Hidden Cases (Protected)
                        </span>
                        <span>•</span>
                        <span className="text-slate-500">
                          Rubric:{" "}
                          {Array.isArray(q.evaluationRubric) && q.evaluationRubric.length > 0
                            ? q.evaluationRubric
                                .map((r) => `${r.criterion} (${r.weight}%)`)
                                .slice(0, 3)
                                .join(", ")
                            : "Standard 5-Criteria Rubric"}
                        </span>
                      </div>
                    </div>

                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q._id)}
                        disabled={actionLoading}
                        className="self-end md:self-start rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 transition shadow-xs"
                        title="Delete Question"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: STUDENT ROSTER
         ========================================================================= */}
      {activeTab === "students" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Enrolled Student Roster</h2>
              <p className="text-xs text-slate-500">
                Students can join directly using the Exam Code. You can also manually add/adjust candidates below if needed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveStudents}
                disabled={actionLoading || !isDraft}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                <Check size={16} /> Save Roster ({selectedStudentIds.size})
              </button>
            </div>
          </div>

          {/* Exam Code Quick Share Box */}
          {exam.examCode && (
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-600 p-2 text-white shadow-xs">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Exam Code Enrollment Active</h4>
                  <p className="text-xs text-slate-500">
                    Share this code with students. When students join, questions are assigned automatically!
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-extrabold text-indigo-700 bg-white px-3 py-1.5 rounded-lg border border-indigo-200">
                  {exam.examCode}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(exam.examCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs"
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedCode ? "Copied" : "Copy Code"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Enrolled Students Summary */}
          {exam.enrolledStudents?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                Code-Enrolled Students ({exam.enrolledStudents.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {exam.enrolledStudents.map((enr, idx) => {
                  const studentObj = enr.studentId && typeof enr.studentId === "object" ? enr.studentId : null;
                  return (
                    <span
                      key={enr._id || idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      {studentObj ? `${studentObj.username} (${studentObj.rollNo || "N/A"})` : "Student"}
                      <span className="text-[10px] text-slate-400">
                        {enr.enrolledAt ? new Date(enr.enrolledAt).toLocaleTimeString() : ""}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search & Bulk Selection Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search size={17} className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search students by name, email, or roll number..."
                value={searchStudent}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchStudent(val);
                  startTransition(() => {
                    fetchCandidates(val);
                  });
                }}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white shadow-xs"
              />
            </div>
            <button
              type="button"
              onClick={toggleAllStudents}
              disabled={!isDraft || candidateStudents.length === 0}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
            >
              {selectedStudentIds.size === candidateStudents.length && candidateStudents.length > 0
                ? "Deselect All Filtered"
                : "Select All Filtered"}
            </button>
          </div>

          {loadingCandidates ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading student directory...</div>
          ) : candidateStudents.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <Users size={36} className="text-slate-300 mx-auto mb-2" />
              <h3 className="font-bold text-slate-800">No matching students found</h3>
              <p className="text-xs text-slate-500 mt-1">
                Try searching by a different name, email, or roll number.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3.5 w-12 text-center">Select</th>
                      <th className="px-5 py-3.5">Roll Number</th>
                      <th className="px-5 py-3.5">Student Name</th>
                      <th className="px-5 py-3.5">Email Address</th>
                      <th className="px-5 py-3.5">Year / Section</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {candidateStudents.map((student) => {
                      const isSelected = selectedStudentIds.has(student._id);
                      return (
                        <tr
                          key={student._id}
                          onClick={() => isDraft && toggleStudent(student._id)}
                          className={`transition cursor-pointer ${
                            isSelected ? "bg-indigo-50/40" : "hover:bg-slate-50/60"
                          }`}
                        >
                          <td className="px-5 py-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isDraft}
                              onChange={() => toggleStudent(student._id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {student.rollNo || "N/A"}
                          </td>
                          <td className="px-5 py-3.5 font-medium text-slate-800">
                            {student.username}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 text-xs">
                            {student.email}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 text-xs">
                            {student.academicYear || "-"} / {student.section || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: ALLOCATIONS
         ========================================================================= */}
      {activeTab === "allocations" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Fisher-Yates Question Allocations</h2>
              <p className="text-xs text-slate-500">
                Guaranteed unique 1-to-1 question assignment using unbiased Fisher-Yates random shuffle.
              </p>
            </div>
            {isDraft && (
              <button
                type="button"
                onClick={handleAllocateQuestions}
                disabled={actionLoading || !isAllocationPossible}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Shuffle size={16} /> Run Fisher-Yates Allocation
              </button>
            )}
          </div>

          {!isAllocationPossible && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">Allocation Prerequisite:</strong>
                <p className="text-xs text-amber-800 mt-0.5">
                  Enrolled Students: <strong>{enrolledCount}</strong> | Available Questions:{" "}
                  <strong>{questionsCount}</strong>. You must have at least as many questions in the bank as enrolled students before allocation can be executed.
                </p>
              </div>
            </div>
          )}

          {allocations.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <Shuffle size={36} className="text-slate-300 mx-auto mb-2" />
              <h3 className="font-bold text-slate-800">Questions Allocated Upon Exam Start</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Students enroll using the Exam Code. Once you click &ldquo;Start Exam&rdquo;, server-side Fisher-Yates allocation assigns {questionsPerStudentInput} distinct question(s) to every enrolled student automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3.5 w-12 text-center">#</th>
                      <th className="px-5 py-3.5">Roll No</th>
                      <th className="px-5 py-3.5">Student Name</th>
                      <th className="px-5 py-3.5">Assigned Questions</th>
                      <th className="px-5 py-3.5">Allocated Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {allocations.map((alloc, idx) => {
                      const assigned =
                        alloc.assignedQuestionIds && alloc.assignedQuestionIds.length > 0
                          ? alloc.assignedQuestionIds
                          : alloc.questionId
                          ? [alloc.questionId]
                          : [];
                      return (
                        <tr key={alloc._id} className="transition hover:bg-slate-50/60">
                          <td className="px-5 py-3.5 text-center text-slate-400 font-mono text-xs">
                            {idx + 1}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            {alloc.studentId?.rollNo || "N/A"}
                          </td>
                          <td className="px-5 py-3.5 font-medium text-slate-800">
                            <div>{alloc.studentId?.username}</div>
                            <div className="text-[11px] text-slate-400">{alloc.studentId?.email}</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1.5">
                              {assigned.map((q, qIdx) => (
                                <span
                                  key={q._id || qIdx}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200"
                                >
                                  <span>{q.questionNumber || `Q${qIdx + 1}`}:</span>
                                  <span className="font-normal text-slate-700 truncate max-w-[180px]">
                                    {q.title || "Question"}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500">
                            {alloc.allocatedAt ? new Date(alloc.allocatedAt).toLocaleTimeString() : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: LIVE MONITORING & RESULTS
         ========================================================================= */}
      {activeTab === "monitoring" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Activity size={20} className="text-indigo-600" />
                Live Examination Monitoring
              </h2>
              <p className="text-xs text-slate-500">
                Track student conceptual answer submissions, faculty-controlled AI evaluation, compiler unlocking, and sandbox test case results in real time.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold border transition shadow-xs ${
                  autoRefreshEnabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
                title={autoRefreshEnabled ? "Pause automatic polling" : "Resume 5-second automatic polling"}
              >
                <span className="relative flex h-2 w-2">
                  {autoRefreshEnabled && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      autoRefreshEnabled ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  ></span>
                </span>
                {autoRefreshEnabled ? "Live Polling (5s): ON" : "Auto-Refresh: OFF"}
              </button>
              <button
                type="button"
                onClick={fetchMonitoring}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
              >
                <RefreshCw size={14} className={actionLoading ? "animate-spin" : ""} /> Refresh Live Metrics
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search candidates by name or roll number..."
                value={monitoringSearch}
                onChange={(e) => setMonitoringSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
              />
              {monitoringSearch && (
                <button
                  type="button"
                  onClick={() => setMonitoringSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {!monitoringData ? (
            <div className="py-12 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
              <Loader />
              <p className="mt-2 text-xs text-slate-400">Loading live monitoring data...</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3.5">Roll No</th>
                      <th className="px-5 py-3.5">Student Name</th>
                      <th className="px-5 py-3.5">Assigned Problem</th>
                      <th className="px-5 py-3.5 text-center">Notepad Status</th>
                      <th className="px-5 py-3.5 text-center">AI Evaluation</th>
                      <th className="px-5 py-3.5 text-center">Evaluation Action</th>
                      <th className="px-5 py-3.5 text-center">Compiler</th>
                      <th className="px-5 py-3.5 text-center">Test Cases</th>
                      <th className="px-5 py-3.5 text-center">Exam Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {(monitoringData.students || [])
                      .filter((s) => {
                        if (!monitoringSearch.trim()) return true;
                        const q = monitoringSearch.trim().toLowerCase();
                        return (
                          s.rollNo?.toLowerCase().includes(q) ||
                          s.username?.toLowerCase().includes(q) ||
                          s.email?.toLowerCase().includes(q)
                        );
                      })
                      .map((row) => (
                        <tr key={row.studentId} className="transition hover:bg-slate-50/60">
                          {/* 1. Roll No */}
                          <td className="px-5 py-3.5 font-semibold text-slate-900 font-mono text-xs">
                            {row.rollNo || "—"}
                          </td>

                          {/* 2. Student Name */}
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-slate-900 text-sm">{row.username}</div>
                            <div className="text-xs text-slate-400">{row.email || "No email"}</div>
                          </td>

                          {/* 3. Assigned Problem */}
                          <td className="px-5 py-3.5 text-xs text-slate-600 max-w-[180px] truncate" title={row.assignedQuestion}>
                            {row.assignedQuestion || "Not Assigned"}
                          </td>

                          {/* 4. Notepad Status */}
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold capitalize border ${
                                row.notepadStatus === "Submitted"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : row.notepadStatus === "In Progress"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : row.notepadStatus === "Correction Required"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {row.notepadStatus || "Pending"}
                            </span>
                          </td>

                          {/* 5. AI Evaluation */}
                          <td className="px-5 py-3.5 text-center">
                            {row.lastConceptualError !== null ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                  row.lastConceptualError < 50
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                                }`}
                              >
                                {row.lastConceptualError < 50 ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                {row.lastConceptualError}% Error ({row.lastConceptualError < 50 ? "PASS" : "FAIL"})
                              </span>
                            ) : row.status === "evaluating" || evaluatingStudentId === row.studentId ? (
                              <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold">
                                <Sparkles size={13} className="animate-spin" /> Evaluating...
                              </span>
                            ) : row.notepadStatus === "Submitted" ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Awaiting Faculty Evaluation
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Not Submitted</span>
                            )}
                          </td>

                          {/* 6. Evaluation Action (Faculty-Controlled) */}
                          <td className="px-5 py-3.5 text-center">
                            {row.evaluationAction === "evaluating" || evaluatingStudentId === row.studentId ? (
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold cursor-not-allowed border border-slate-200"
                              >
                                <RefreshCw size={13} className="animate-spin text-indigo-600" />
                                Evaluating...
                              </button>
                            ) : row.evaluationAction === "evaluate" ? (
                              <button
                                type="button"
                                onClick={() => handleFacultyEvaluate(row)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow-sm transition transform active:scale-95"
                              >
                                <Sparkles size={13} className="text-indigo-200" />
                                Evaluate
                              </button>
                            ) : row.evaluationAction === "allow_to_code" ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={decisionLoading}
                                  onClick={() => handleFacultyAllowToCode(row.studentId, row.targetQuestionId)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                                  title="Allow student to access code editor (Error < 50%)"
                                >
                                  <Check size={13} />
                                  Allow to Code
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenReportModal(row)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                                  title="View detailed AI evaluation report"
                                >
                                  <Eye size={12} />
                                </button>
                              </div>
                            ) : row.evaluationAction === "return_to_notepad" ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenReportModal(row)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition"
                                  title="Review evaluation and return to Notepad (Error >= 50%)"
                                >
                                  <RotateCcw size={12} />
                                  Return to Notepad
                                </button>
                              </div>
                            ) : row.evaluationAction === "approved" || row.conceptualApproved ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 size={13} /> Unlocked
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenReportModal(row)}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                                >
                                  Report
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium">Waiting</span>
                            )}
                          </td>

                          {/* 7. Compiler Status */}
                          <td className="px-5 py-3.5 text-center">
                            {row.conceptualApproved ? (
                              <span className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1.5">
                                <CheckCircle2 size={14} /> Unlocked
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 inline-flex items-center gap-1.5">
                                <XCircle size={14} /> Locked
                              </span>
                            )}
                          </td>

                          {/* 8. Test Cases */}
                          <td className="px-5 py-3.5 text-center">
                            {row.totalTestCases > 0 ? (
                              <span
                                className={`text-xs font-bold ${
                                  row.testCasesPassed === row.totalTestCases
                                    ? "text-emerald-600"
                                    : "text-amber-600"
                                }`}
                              >
                                {row.testCasesPassed} / {row.totalTestCases} Passed
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium">—</span>
                            )}
                          </td>

                          {/* 9. Exam Status */}
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs ${
                                row.examStatus === "Successfully Completed"
                                  ? "bg-emerald-100/80 text-emerald-800 border-emerald-300"
                                  : row.examStatus === "Time Expired"
                                  ? "bg-slate-200 text-slate-800 border-slate-300"
                                  : row.examStatus === "Coding In Progress"
                                  ? "bg-indigo-100/80 text-indigo-800 border-indigo-300"
                                  : row.examStatus === "Test Cases Failed" || row.examStatus === "Conceptual Evaluation Failed"
                                  ? "bg-rose-100/80 text-rose-800 border-rose-300"
                                  : row.examStatus === "Waiting for Faculty Evaluation" || row.examStatus === "AI Evaluation in Progress"
                                  ? "bg-amber-100/80 text-amber-800 border-amber-300"
                                  : row.examStatus === "Waiting for Faculty Decision"
                                  ? "bg-purple-100/80 text-purple-800 border-purple-300"
                                  : row.examStatus === "Correction Required"
                                  ? "bg-rose-100/80 text-rose-800 border-rose-300"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {row.examStatus || "Not Started"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          FACULTY AI EVALUATION REPORT & DECISION MODAL
         ========================================================================= */}
      {conceptualReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <Sparkles size={18} />
                  </span>
                  <h3 className="text-lg font-bold text-slate-800">
                    AI Evaluation Report &amp; Faculty Decision
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Student: <strong className="text-slate-700">{conceptualReportModal.studentName}</strong> ({conceptualReportModal.rollNo || "No Roll No"}) •
                  Question: <strong className="text-slate-700">{conceptualReportModal.questionTitle}</strong> •
                  Attempt #{conceptualReportModal.attemptNumber}
                </p>
              </div>
              <button
                onClick={() => setConceptualReportModal(null)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 pr-1 py-4 space-y-5">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Understanding Percentage
                  </span>
                  <span className="text-2xl font-black text-indigo-600 font-mono">
                    {conceptualReportModal.understandingPercentage}%
                  </span>
                </div>

                <div
                  className={`p-3.5 rounded-xl border ${
                    conceptualReportModal.errorPercentage < 50
                      ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                      : "bg-rose-50/70 border-rose-200 text-rose-900"
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider block">
                    Error Percentage (Threshold: &lt;50%)
                  </span>
                  <span className="text-2xl font-black font-mono">
                    {conceptualReportModal.errorPercentage}%
                  </span>
                  <span className="text-[11px] block mt-0.5 font-medium">
                    {conceptualReportModal.errorPercentage < 50
                      ? "✓ Meets conceptual passing threshold"
                      : "✗ Revision required (>= 50% error)"}
                  </span>
                </div>
              </div>

              {/* Conceptual Answer Text */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Submitted Conceptual Answer:
                </span>
                <div className="p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs max-h-44 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                  {conceptualReportModal.conceptualAnswer || "(No answer text submitted)"}
                </div>
              </div>

              {/* Correct Concepts (Strengths) */}
              {conceptualReportModal.correctConcepts?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                  <span className="text-xs font-bold text-emerald-900 uppercase flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    Correct Concepts:
                  </span>
                  <ul className="list-disc pl-5 text-xs text-emerald-800 space-y-1">
                    {conceptualReportModal.correctConcepts.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Missing Concepts */}
              {conceptualReportModal.missingConcepts?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 space-y-1.5">
                  <span className="text-xs font-bold text-amber-900 uppercase flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-600" />
                    Missing Concepts:
                  </span>
                  <ul className="list-disc pl-5 text-xs text-amber-800 space-y-1">
                    {conceptualReportModal.missingConcepts.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Incorrect Concepts / Identified Issues */}
              {conceptualReportModal.incorrectConcepts?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200 space-y-1.5">
                  <span className="text-xs font-bold text-rose-900 uppercase flex items-center gap-1.5">
                    <XCircle size={14} className="text-rose-600" />
                    Incorrect Concepts &amp; Logical Flaws:
                  </span>
                  <ul className="list-disc pl-5 text-xs text-rose-800 space-y-1">
                    {conceptualReportModal.incorrectConcepts.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions for Improvement */}
              {conceptualReportModal.suggestions?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-1.5">
                  <span className="text-xs font-bold text-indigo-900 uppercase flex items-center gap-1.5">
                    <HelpCircle size={14} className="text-indigo-600" />
                    Suggestions for Improvement &amp; Conceptual Hints:
                  </span>
                  <ul className="list-disc pl-5 text-xs text-indigo-800 space-y-1">
                    {conceptualReportModal.suggestions.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Faculty Feedback input if returning to notepad */}
              {conceptualReportModal.requiresRevision && (
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Faculty Revision Note (Visible to Student):
                  </label>
                  <textarea
                    rows={2}
                    value={facultyFeedbackInput}
                    onChange={(e) => setFacultyFeedbackInput(e.target.value)}
                    placeholder="e.g. Please explain loop termination and edge case handling for zero input..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer with Conditional Faculty Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => setConceptualReportModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {/* Condition B: Error >= 50% -> Return to Notepad */}
                {conceptualReportModal.requiresRevision ? (
                  <button
                    type="button"
                    disabled={decisionLoading}
                    onClick={() =>
                      handleFacultyReturnToNotepad(
                        conceptualReportModal.studentId,
                        conceptualReportModal.questionId,
                        facultyFeedbackInput
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    Return to Notepad
                  </button>
                ) : (
                  /* Condition A: Error < 50% -> Allow to Code */
                  <button
                    type="button"
                    disabled={decisionLoading}
                    onClick={() =>
                      handleFacultyAllowToCode(
                        conceptualReportModal.studentId,
                        conceptualReportModal.questionId
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50"
                  >
                    <Check size={14} />
                    Allow to Code
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          ADD QUESTION MODAL
         ========================================================================= */}
      {isAddQuestionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Add Question to Examination Bank</h3>
                <p className="text-xs text-slate-500">Configure problem description, test cases, and evaluation rubrics.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddQuestionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none p-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddQuestionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Question Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reverse a Singly Linked List"
                  value={newQuestion.title}
                  onChange={(e) =>
                    setNewQuestion({ ...newQuestion, title: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Difficulty
                  </label>
                  <select
                    value={newQuestion.difficulty}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, difficulty: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Marks
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newQuestion.marks}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, marks: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Time Limit (sec)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newQuestion.timeLimit}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, timeLimit: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Problem Statement
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide detailed description of the problem, required logic, and specifications..."
                  value={newQuestion.problemStatement}
                  onChange={(e) =>
                    setNewQuestion({ ...newQuestion, problemStatement: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Input Format
                  </label>
                  <input
                    type="text"
                    value={newQuestion.inputFormat}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, inputFormat: e.target.value })
                    }
                    placeholder="e.g. An integer N followed by N integers"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Output Format
                  </label>
                  <input
                    type="text"
                    value={newQuestion.outputFormat}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, outputFormat: e.target.value })
                    }
                    placeholder="e.g. Space-separated integers"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Sample Test Case (Visible) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Sample Test Case (Visible to student)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <textarea
                    rows={2}
                    placeholder="Input"
                    value={newQuestion.sampleTestCases[0].input}
                    onChange={(e) => {
                      const updated = [...newQuestion.sampleTestCases];
                      updated[0].input = e.target.value;
                      setNewQuestion({ ...newQuestion, sampleTestCases: updated });
                    }}
                    className="w-full font-mono text-xs p-2.5 bg-white border border-slate-200 rounded-xl"
                  />
                  <textarea
                    rows={2}
                    placeholder="Expected Output"
                    value={newQuestion.sampleTestCases[0].expectedOutput}
                    onChange={(e) => {
                      const updated = [...newQuestion.sampleTestCases];
                      updated[0].expectedOutput = e.target.value;
                      setNewQuestion({ ...newQuestion, sampleTestCases: updated });
                    }}
                    className="w-full font-mono text-xs p-2.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {/* Hidden Test Case (Protected) */}
              <div className="p-4 bg-rose-50/40 border border-rose-200 rounded-2xl space-y-2">
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                  Hidden Test Case (Protected from student)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <textarea
                    rows={2}
                    placeholder="Input"
                    value={newQuestion.hiddenTestCases[0].input}
                    onChange={(e) => {
                      const updated = [...newQuestion.hiddenTestCases];
                      updated[0].input = e.target.value;
                      setNewQuestion({ ...newQuestion, hiddenTestCases: updated });
                    }}
                    className="w-full font-mono text-xs p-2.5 bg-white border border-rose-200 rounded-xl"
                  />
                  <textarea
                    rows={2}
                    placeholder="Expected Output"
                    value={newQuestion.hiddenTestCases[0].expectedOutput}
                    onChange={(e) => {
                      const updated = [...newQuestion.hiddenTestCases];
                      updated[0].expectedOutput = e.target.value;
                      setNewQuestion({ ...newQuestion, hiddenTestCases: updated });
                    }}
                    className="w-full font-mono text-xs p-2.5 bg-white border border-rose-200 rounded-xl"
                  />
                </div>
              </div>

              {/* Rubric Criteria Weights */}
              <div className="p-4 bg-indigo-50/40 border border-indigo-200 rounded-2xl space-y-2">
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                  AI Evaluation Rubric Weights (Must Sum to 100%)
                </span>
                <div className="grid grid-cols-5 gap-2 text-xs">
                  <div>
                    <label className="text-slate-600 block mb-1">Syntax</label>
                    <input
                      type="number"
                      value={newQuestion.rubric.syntaxStructure}
                      onChange={(e) =>
                        setNewQuestion({
                          ...newQuestion,
                          rubric: { ...newQuestion.rubric, syntaxStructure: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-indigo-200 rounded-xl p-1.5 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1">Logic</label>
                    <input
                      type="number"
                      value={newQuestion.rubric.logicCorrectness}
                      onChange={(e) =>
                        setNewQuestion({
                          ...newQuestion,
                          rubric: { ...newQuestion.rubric, logicCorrectness: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-indigo-200 rounded-xl p-1.5 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1">Algorithm</label>
                    <input
                      type="number"
                      value={newQuestion.rubric.algorithmicApproach}
                      onChange={(e) =>
                        setNewQuestion({
                          ...newQuestion,
                          rubric: { ...newQuestion.rubric, algorithmicApproach: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-indigo-200 rounded-xl p-1.5 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1">Efficiency</label>
                    <input
                      type="number"
                      value={newQuestion.rubric.codeEfficiency}
                      onChange={(e) =>
                        setNewQuestion({
                          ...newQuestion,
                          rubric: { ...newQuestion.rubric, codeEfficiency: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-indigo-200 rounded-xl p-1.5 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1">Constraints</label>
                    <input
                      type="number"
                      value={newQuestion.rubric.constraintsHandling}
                      onChange={(e) =>
                        setNewQuestion({
                          ...newQuestion,
                          rubric: { ...newQuestion.rubric, constraintsHandling: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-indigo-200 rounded-xl p-1.5 text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddQuestionModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  <Plus size={15} /> Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      <ExamQuestionUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        examId={examId}
        examTitle={exam.title}
        onExtractionComplete={handleExtractionComplete}
      />

      {/* Extracted Questions Preview & Review Modal */}
      <ExamQuestionPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        examId={examId}
        jobId={activeExtractionJobId}
        onSavedSuccess={handleQuestionsSavedSuccess}
      />
    </div>
  );
};

export default AdminExamDetails;
