import { useState, useEffect } from "react";
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit3,
  Check,
  Save,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileCode,
  Layers,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
import {
  getExtractedQuestionsPreview,
  updateExtractedQuestion,
  deleteExtractedQuestion,
  approveAllExtractedQuestions,
  saveExtractedQuestionsToExam,
} from "../../services/examService";
import Loader from "../common/Loader";

/**
 * Safely decodes HTML entities (e.g. &#x20;, &nbsp;, &lt;, &gt;) without unsafe innerHTML.
 */
const decodeHtmlEntities = (str = "") => {
  if (typeof str !== "string") return str;
  let decoded = str
    .replace(/&#x20;/gi, " ")
    .replace(/&#32;/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#xa0;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    const code = parseInt(dec, 10);
    return code >= 32 && code <= 126 ? String.fromCharCode(code) : match;
  });
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
    const code = parseInt(hex, 16);
    return code >= 32 && code <= 126 ? String.fromCharCode(code) : match;
  });

  return decoded;
};

/**
 * Dedents common leading whitespace while preserving internal and relative pattern spaces.
 */
const dedentCommonWhitespace = (text = "") => {
  if (!text) return "";
  const lines = text.split("\n");
  const nonBlank = lines.filter((l) => l.trim().length > 0);
  if (nonBlank.length === 0) return text;
  const minIndent = Math.min(
    ...nonBlank.map((l) => {
      const match = l.match(/^[ \t]*/);
      return match ? match[0].length : 0;
    })
  );
  if (minIndent === 0) return text;
  return lines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l)).join("\n");
};

/**
 * Normalizes sample values for display:
 * - Decodes entities safely
 * - Strips duplicate "Input:", "Sample Input:", "Output:", etc. prefixes
 * - Strips page header/footer leakage
 * - Preserves ALL interior line breaks and indentation spaces
 */
const formatDisplayContent = (raw = "", type = "output") => {
  if (!raw && raw !== 0) return "";
  let text = decodeHtmlEntities(String(raw)).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strip page header / footer lines
  text = text
    .replace(/^[ \t]*(?:ClabToPro\s*[-–—|•].*|page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|--\s*\d+(?:\s+of\s+\d+)?\s*--|\d+\s+of\s+\d+)[ \t]*$/gim, "")
    .replace(/(?:[ \t]+ClabToPro\s*[-–—|•].*Page\s*\d+|[ \t]+--\s*\d+\s+of\s+\d+\s*--|[ \t]+Page\s+\d+\b).*$/gim, "");

  const labelRegex =
    type === "input"
      ? /^[ \t]*(?:sample\s+input|example\s+input|test\s+input|input)[ \t]*[:\-]?[ \t]*(?:\r?\n)?/i
      : /^[ \t]*(?:sample\s+output|example\s+output|test\s+output|expected\s+output|output)[ \t]*[:\-]?[ \t]*(?:\r?\n)?/i;

  while (labelRegex.test(text)) {
    text = text.replace(labelRegex, "");
  }

  text = text.replace(/^\n+/, "").replace(/\s+$/, "");
  return dedentCommonWhitespace(text);
};

const ExamQuestionPreviewModal = ({
  isOpen,
  onClose,
  examId,
  jobId,
  onSavedSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    totalPages: 1,
    totalItems: 0,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Edit Question Modal State
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const fetchPreviewQuestions = async (
    page = pagination.page,
    query = searchQuery,
    status = statusFilter
  ) => {
    if (!jobId || !examId) return;
    try {
      setLoading(true);
      setErrorMessage("");
      const res = await getExtractedQuestionsPreview(examId, jobId, {
        page,
        limit: pagination.limit,
        q: query,
        status,
      });

      setQuestions(res.questions || []);
      setSummary(res.summary || {});
      setPagination(res.pagination || { page: 1, limit: 15, totalPages: 1, totalItems: 0 });
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || "Failed to load extracted questions preview."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && jobId) {
      fetchPreviewQuestions(1, searchQuery, statusFilter);
    }
  }, [isOpen, jobId, statusFilter]);

  if (!isOpen) return null;

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchPreviewQuestions(1, searchQuery, statusFilter);
  };

  const handleApproveSingle = async (qId) => {
    try {
      setActionLoading(true);
      await updateExtractedQuestion(examId, jobId, qId, { status: "approved" });
      setQuestions((prev) =>
        prev.map((q) => (q._id === qId ? { ...q, status: "approved" } : q))
      );
      if (summary) {
        setSummary((prev) => ({
          ...prev,
          approvedCount: (prev.approvedCount || 0) + 1,
        }));
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || "Failed to approve question.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSingle = async (qId, qNum) => {
    if (!window.confirm(`Delete question ${qNum} from this extraction preview?`)) return;
    try {
      setActionLoading(true);
      await deleteExtractedQuestion(examId, jobId, qId);
      await fetchPreviewQuestions(pagination.page, searchQuery, statusFilter);
      setStatusMessage(`Question ${qNum} removed from preview.`);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || "Failed to delete question.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveAll = async () => {
    try {
      setActionLoading(true);
      setErrorMessage("");
      const res = await approveAllExtractedQuestions(examId, jobId);
      setStatusMessage(`Approved ${res.approvedCount || "all"} questions successfully.`);
      await fetchPreviewQuestions(pagination.page, searchQuery, statusFilter);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || "Failed to approve all questions.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveToExam = async () => {
    if (
      !window.confirm(
        "Save all approved and extracted questions into this examination question bank?"
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");
      const res = await saveExtractedQuestionsToExam(examId, jobId);
      alert(res.message || "Questions saved successfully!");
      if (onSavedSuccess) {
        onSavedSuccess(res.savedCount);
      }
      onClose();
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || "Failed to save questions to examination."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (q) => {
    setEditingQuestion(q);
    setEditForm({
      originalQuestionNumber: q.originalQuestionNumber || "",
      title: decodeHtmlEntities(q.title || ""),
      problemStatement: decodeHtmlEntities(q.problemStatement || ""),
      contentType: q.contentType || (q.hasPatternOrMatrix ? "pattern" : "text"),
      inputFormat: decodeHtmlEntities(q.inputFormat || ""),
      outputFormat: decodeHtmlEntities(q.outputFormat || ""),
      constraints: decodeHtmlEntities(q.constraints || ""),
      difficulty: q.difficulty || "Medium",
      marks: q.marks || 100,
      sampleInput: formatDisplayContent(q.sampleTestCases?.[0]?.input || "", "input"),
      sampleOutput: formatDisplayContent(q.sampleTestCases?.[0]?.expectedOutput || "", "output"),
      status: q.status || "approved",
    });
  };

  const handleSaveEditQuestion = async (e) => {
    e.preventDefault();
    if (!editForm.title.trim() || !editForm.problemStatement.trim()) {
      alert("Title and problem statement are required.");
      return;
    }

    try {
      setActionLoading(true);
      const cleanedInput = formatDisplayContent(editForm.sampleInput, "input");
      const cleanedOutput = formatDisplayContent(editForm.sampleOutput, "output");

      const sampleTestCases = cleanedOutput.trim()
        ? [
            {
              input: cleanedInput,
              expectedOutput: cleanedOutput,
              explanation: "Sample Test Case",
              isHidden: false,
            },
          ]
        : [];

      const payload = {
        originalQuestionNumber: editForm.originalQuestionNumber,
        title: editForm.title.trim(),
        problemStatement: editForm.problemStatement,
        contentType: editForm.contentType || "text",
        hasPatternOrMatrix: editForm.contentType === "pattern" || editForm.contentType === "matrix",
        inputFormat: editForm.inputFormat,
        outputFormat: editForm.outputFormat,
        constraints: editForm.constraints,
        difficulty: editForm.difficulty,
        marks: Number(editForm.marks) || 100,
        sampleTestCases,
        status: "approved",
      };

      await updateExtractedQuestion(examId, jobId, editingQuestion._id, payload);
      setEditingQuestion(null);
      setEditForm(null);
      setStatusMessage(`Question ${payload.originalQuestionNumber} updated and approved.`);
      await fetchPreviewQuestions(pagination.page, searchQuery, statusFilter);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update question.");
    } finally {
      setActionLoading(false);
    }
  };

  const readyToSaveCount = (summary?.approvedCount || 0) + (summary?.successfullyExtractedCount || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-800">
                Extracted Questions Preview &amp; Review
              </h3>
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                {summary?.totalExtracted || 0} Questions
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Review pattern formatting, matrices, and test cases before committing to the examination bank.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-xs disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              Approve All Validated
            </button>

            <button
              type="button"
              onClick={handleSaveToExam}
              disabled={actionLoading || readyToSaveCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              <Save size={15} />
              Save {readyToSaveCount} Questions to Exam
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Status / Error Alert Banners */}
        {statusMessage && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
            <span className="flex items-center gap-2">
              <Check size={14} /> {statusMessage}
            </span>
            <button onClick={() => setStatusMessage("")} className="font-bold">&times;</button>
          </div>
        )}

        {errorMessage && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
            <span className="flex items-center gap-2">
              <AlertCircle size={14} /> {errorMessage}
            </span>
            <button onClick={() => setErrorMessage("")} className="font-bold">&times;</button>
          </div>
        )}

        {/* Metric Summary Counters Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 border-b border-slate-100 bg-white">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-center">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Extracted</span>
            <p className="text-lg font-bold text-slate-800">{summary?.totalExtracted || 0}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 text-center">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase">Approved</span>
            <p className="text-lg font-bold text-emerald-700">{summary?.approvedCount || 0}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-2.5 text-center">
            <span className="text-[11px] font-semibold text-amber-700 uppercase">Needs Review</span>
            <p className="text-lg font-bold text-amber-700">{summary?.needsReviewCount || 0}</p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 text-center">
            <span className="text-[11px] font-semibold text-indigo-700 uppercase">Ready to Save</span>
            <p className="text-lg font-bold text-indigo-700">{readyToSaveCount}</p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3 border-b border-slate-100 bg-slate-50/30">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search size={16} className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by question number (e.g. Q1, Q14) or title/content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white shadow-xs"
            />
          </form>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-indigo-500 shadow-xs"
            >
              <option value="all">All Statuses ({summary?.totalExtracted || 0})</option>
              <option value="approved">Approved ({summary?.approvedCount || 0})</option>
              <option value="needs_review">Needs Review ({summary?.needsReviewCount || 0})</option>
              <option value="incomplete_extraction">
                Incomplete ({summary?.incompleteCount || 0})
              </option>
              <option value="extraction_failed">Failed ({summary?.failedCount || 0})</option>
            </select>
          </div>
        </div>

        {/* Scrollable Questions List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
          {loading ? (
            <div className="py-16 text-center">
              <Loader message="Loading question preview..." />
            </div>
          ) : questions.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-8">
              <HelpCircle size={36} className="text-slate-300 mx-auto mb-2" />
              <h4 className="font-bold text-slate-800">No questions match filter</h4>
              <p className="text-xs text-slate-500 mt-1">
                Try clearing your search query or switching status filters.
              </p>
            </div>
          ) : (
            questions.map((q, idx) => {
              const isNeedsReview = q.status === "needs_review";
              const isIncomplete = q.status === "incomplete_extraction";
              const isApproved = q.status === "approved" || q.status === "successfully_extracted";
              const isFailed = q.status === "extraction_failed";

              const contentType = q.contentType || (q.hasPatternOrMatrix ? "pattern" : "text");

              return (
                <div
                  key={q._id || idx}
                  className={`rounded-2xl border bg-white p-5 shadow-xs transition space-y-3 ${
                    isApproved
                      ? "border-emerald-200/80 bg-emerald-50/10"
                      : isNeedsReview
                      ? "border-amber-200 bg-amber-50/10"
                      : isIncomplete
                      ? "border-orange-200 bg-orange-50/10"
                      : "border-slate-200"
                  }`}
                >
                  {/* Question Header Card */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
                        {q.originalQuestionNumber || `Q${idx + 1}`}
                      </span>

                      <h4 className="text-sm font-bold text-slate-800">
                        {q.title}
                      </h4>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          q.difficulty === "Easy"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : q.difficulty === "Hard"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {q.difficulty}
                      </span>

                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {q.marks || 100} Marks
                      </span>

                      {/* Content Type Badge */}
                      {contentType === "pattern" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 text-[11px] font-semibold">
                          <Sparkles size={12} />
                          Pattern
                        </span>
                      ) : contentType === "matrix" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold">
                          <Layers size={12} />
                          Matrix
                        </span>
                      ) : contentType === "math" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold">
                          Math
                        </span>
                      ) : contentType === "code" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 px-2.5 py-0.5 text-[11px] font-semibold">
                          <FileCode size={12} />
                          Code
                        </span>
                      ) : contentType === "table" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-0.5 text-[11px] font-semibold">
                          Table
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold">
                          Text
                        </span>
                      )}

                      {/* Source Page Number */}
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                        Page {q.sourcePageNumber || 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          isApproved
                            ? "bg-emerald-100 text-emerald-800"
                            : isNeedsReview
                            ? "bg-amber-100 text-amber-800"
                            : isIncomplete
                            ? "bg-orange-100 text-orange-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {q.status?.replace(/_/g, " ")}
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditModal(q)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                        title="Edit question details"
                      >
                        <Edit3 size={15} />
                      </button>

                      {!isApproved && (
                        <button
                          type="button"
                          onClick={() => handleApproveSingle(q._id)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
                        >
                          <Check size={13} /> Approve
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(q._id, q.originalQuestionNumber)}
                        disabled={actionLoading}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        title="Delete question"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Meaningful review / incomplete extraction warning banner */}
                  {(isNeedsReview || isIncomplete) && q.reviewReason && (
                    <div
                      className={`flex items-start gap-2 rounded-xl p-3 text-xs ${
                        isIncomplete
                          ? "bg-orange-50 border border-orange-200 text-orange-800"
                          : "bg-amber-50 border border-amber-200/80 text-amber-800"
                      }`}
                    >
                      <AlertTriangle
                        size={15}
                        className={`flex-shrink-0 mt-0.5 ${
                          isIncomplete ? "text-orange-600" : "text-amber-600"
                        }`}
                      />
                      <div className="space-y-0.5">
                        <strong className="block font-semibold">
                          {isIncomplete ? "Incomplete Question Boundary" : "Faculty Review Required"}:
                        </strong>
                        <span>{q.reviewReason}</span>
                        {q.sourcePageNumber && (
                          <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                            Refer to source document: <strong>Page {q.sourcePageNumber}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Structured Matrix Table if Matrix problem */}
                  {contentType === "matrix" && q.matrixData?.values && Array.isArray(q.matrixData.values) && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                        <Layers size={13} />
                        Structured Matrix Grid ({q.matrixData.rows} × {q.matrixData.columns}):
                      </span>
                      <div className="overflow-x-auto p-2.5 bg-slate-950 rounded-xl border border-indigo-900/40 inline-block shadow-inner">
                        <table className="border-collapse font-mono text-xs text-center">
                          <tbody>
                            {q.matrixData.values.map((row, rIdx) => (
                              <tr key={rIdx} className="border-b border-slate-800 last:border-b-0">
                                {Array.isArray(row) &&
                                  row.map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className="px-3.5 py-1.5 text-indigo-300 font-bold border-r border-slate-800 last:border-r-0"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Problem Statement with exact whitespace, pattern and matrix preservation */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Problem Description &amp; Pattern Layout:
                    </span>
                    <pre className="whitespace-pre-wrap font-mono text-xs bg-slate-900 text-slate-100 p-3.5 rounded-xl border border-slate-800 overflow-x-auto leading-relaxed">
                      {decodeHtmlEntities(q.problemStatement)}
                    </pre>
                  </div>

                  {/* Input / Output Formats & Constraints */}
                  {(q.inputFormat || q.outputFormat || q.constraints) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      {q.inputFormat && (
                        <div>
                          <strong className="text-slate-500 block mb-0.5">Input Format:</strong>
                          <span className="text-slate-700 whitespace-pre-wrap">{decodeHtmlEntities(q.inputFormat)}</span>
                        </div>
                      )}
                      {q.outputFormat && (
                        <div>
                          <strong className="text-slate-500 block mb-0.5">Output Format:</strong>
                          <span className="text-slate-700 whitespace-pre-wrap">{decodeHtmlEntities(q.outputFormat)}</span>
                        </div>
                      )}
                      {q.constraints && (
                        <div>
                          <strong className="text-slate-500 block mb-0.5">Constraints:</strong>
                          <span className="text-slate-700 whitespace-pre-wrap">{decodeHtmlEntities(q.constraints)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sample Test Cases with Preformatted Multiline Preservation */}
                  {Array.isArray(q.sampleTestCases) && q.sampleTestCases.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Sample Test Cases ({q.sampleTestCases.length}):
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                        {q.sampleTestCases.map((tc, tcIdx) => {
                          const cleanInput = formatDisplayContent(tc.input, "input");
                          const cleanOutput = formatDisplayContent(tc.expectedOutput, "output");

                          return (
                            <div
                              key={tcIdx}
                              className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-slate-300"
                            >
                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 border-b border-slate-800/80 pb-1">
                                <span>Sample #{tcIdx + 1}</span>
                                {tc.explanation && (
                                  <span className="text-[10px] text-slate-500 font-sans truncate max-w-[180px]">
                                    {decodeHtmlEntities(tc.explanation)}
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-slate-500 block mb-1 font-semibold text-[11px]">
                                  Sample Input:
                                </span>
                                <pre className="pattern-output whitespace-pre overflow-x-auto font-mono text-xs bg-slate-900/90 text-amber-200/90 p-2.5 rounded-lg border border-slate-800/80">
                                  {cleanInput || "(Empty)"}
                                </pre>
                              </div>
                              <div>
                                <span className="text-slate-500 block mb-1 font-semibold text-[11px]">
                                  Sample Output:
                                </span>
                                <pre className="pattern-output whitespace-pre overflow-x-auto font-mono text-xs bg-slate-900/90 text-emerald-400 p-2.5 rounded-lg border border-slate-800/80">
                                  {cleanOutput || "(Empty)"}
                                </pre>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Pagination & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-3.5">
          <div className="text-xs text-slate-500">
            Showing questions{" "}
            <strong>
              {pagination.totalItems === 0
                ? 0
                : (pagination.page - 1) * pagination.limit + 1}
            </strong>{" "}
            to{" "}
            <strong>
              {Math.min(pagination.page * pagination.limit, pagination.totalItems)}
            </strong>{" "}
            of <strong>{pagination.totalItems}</strong> matching
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchPreviewQuestions(pagination.page - 1, searchQuery, statusFilter)}
              disabled={pagination.page <= 1}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition shadow-xs"
            >
              <ChevronLeft size={14} /> Previous
            </button>

            <span className="text-xs font-semibold text-slate-700 px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button
              type="button"
              onClick={() => fetchPreviewQuestions(pagination.page + 1, searchQuery, statusFilter)}
              disabled={pagination.page >= pagination.totalPages}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition shadow-xs"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ================= INLINE EDIT QUESTION MODAL ================= */}
      {editingQuestion && editForm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="text-base font-bold text-slate-800">
                Edit Extracted Question ({editForm.originalQuestionNumber})
              </h4>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEditQuestion} className="space-y-3 text-xs">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    Question Number
                  </label>
                  <input
                    type="text"
                    value={editForm.originalQuestionNumber}
                    onChange={(e) =>
                      setEditForm({ ...editForm, originalQuestionNumber: e.target.value })
                    }
                    className="w-full border rounded-xl p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    Content Type
                  </label>
                  <select
                    value={editForm.contentType || "text"}
                    onChange={(e) =>
                      setEditForm({ ...editForm, contentType: e.target.value })
                    }
                    className="w-full border rounded-xl p-2 text-xs bg-white"
                  >
                    <option value="text">Text (Normal)</option>
                    <option value="pattern">Pattern (Visual / Stars)</option>
                    <option value="matrix">Matrix (2D Grid)</option>
                    <option value="math">Math Expression</option>
                    <option value="code">Code Snippet</option>
                    <option value="table">Table</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-slate-600 block mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                    className="w-full border rounded-xl p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">
                  Problem Description &amp; Pattern Layout
                </label>
                <textarea
                  rows={6}
                  required
                  value={editForm.problemStatement}
                  onChange={(e) =>
                    setEditForm({ ...editForm, problemStatement: e.target.value })
                  }
                  className="w-full font-mono text-xs border rounded-xl p-2.5 bg-slate-900 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Input Format</label>
                  <input
                    type="text"
                    value={editForm.inputFormat}
                    onChange={(e) =>
                      setEditForm({ ...editForm, inputFormat: e.target.value })
                    }
                    className="w-full border rounded-xl p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Output Format</label>
                  <input
                    type="text"
                    value={editForm.outputFormat}
                    onChange={(e) =>
                      setEditForm({ ...editForm, outputFormat: e.target.value })
                    }
                    className="w-full border rounded-xl p-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Sample Input</label>
                  <textarea
                    rows={2}
                    value={editForm.sampleInput}
                    onChange={(e) =>
                      setEditForm({ ...editForm, sampleInput: e.target.value })
                    }
                    className="w-full font-mono text-xs border rounded-xl p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Sample Output</label>
                  <textarea
                    rows={2}
                    value={editForm.sampleOutput}
                    onChange={(e) =>
                      setEditForm({ ...editForm, sampleOutput: e.target.value })
                    }
                    className="w-full font-mono text-xs border rounded-xl p-2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700"
                >
                  Save &amp; Approve
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamQuestionPreviewModal;
