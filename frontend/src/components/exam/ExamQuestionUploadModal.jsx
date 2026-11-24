import { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  AlertTriangle,
} from "lucide-react";
import {
  uploadExamQuestions,
  getExtractionJobStatus,
} from "../../services/examService";

const formatFileSize = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const ExamQuestionUploadModal = ({
  isOpen,
  onClose,
  examId,
  examTitle,
  examType = "internal",
  onExtractionComplete,
}) => {
  const isViva = examType === "viva";
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showGuidelines, setShowGuidelines] = useState(true);
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Clean up polling interval when component unmounts
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateAndSelectFile = (selectedFile) => {
    setErrorMsg("");
    if (!selectedFile) return;

    const ext = selectedFile.name.split(".").pop().toLowerCase();
    if (!["pdf", "xlsx", "xls"].includes(ext)) {
      setErrorMsg("Please upload a PDF (.pdf) or Excel (.xlsx, .xls) document.");
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMsg("File size exceeds 50MB limit. Please upload a smaller document.");
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  const handleStartExtraction = async () => {
    if (!file) {
      setErrorMsg("Please select a file to extract questions.");
      return;
    }

    try {
      setUploading(true);
      setErrorMsg("");

      const formData = new FormData();
      formData.append("file", file);

      const res = await uploadExamQuestions(examId, formData);
      const jobId = res.jobId;
      setActiveJobId(jobId);

      // Fast responsive polling for extraction progress
      const checkStatus = async () => {
        try {
          const statusRes = await getExtractionJobStatus(examId, jobId);
          const currentJob = statusRes.job;
          setJobStatus(currentJob);

          if (currentJob.status === "completed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setUploading(false);
          } else if (currentJob.status === "failed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setUploading(false);
            setErrorMsg(currentJob.error || "Question extraction encountered a failure.");
          }
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
        }
      };

      // Poll immediately after 200ms, then every 800ms
      setTimeout(checkStatus, 200);
      pollIntervalRef.current = setInterval(checkStatus, 800);
    } catch (err) {
      setUploading(false);
      setErrorMsg(
        err.response?.data?.message || "Failed to upload file. Please try again."
      );
    }
  };

  const handleProceedToPreview = () => {
    if (activeJobId && onExtractionComplete) {
      onExtractionComplete(activeJobId);
      onClose();
    }
  };

  const isCompleted = jobStatus?.status === "completed";
  const isFailed = jobStatus?.status === "failed";
  const progressPercent =
    jobStatus?.totalDetected && jobStatus?.totalDetected > 0
      ? Math.min(
          100,
          Math.round((jobStatus.totalExtracted / jobStatus.totalDetected) * 100)
        )
      : jobStatus?.status === "parsing_document"
      ? 20
      : jobStatus?.status === "extracting_batches"
      ? 45
      : 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {isViva ? "Bulk Upload Viva MCQ Questions" : "Bulk Upload Examination Questions"}
            </h3>
            <p className="text-xs text-slate-500">
              {isViva
                ? "Upload Viva Multiple Choice Questions (MCQs) via PDF or Excel document for rapid automated extraction."
                : "Upload up to 200 questions via PDF or Excel document for AI-powered extraction."}
            </p>
          </div>
          {!uploading && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!activeJobId ? (
            /* ================= STATE 1: FILE SELECTION ================= */
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition ${
                  isDragging
                    ? "border-indigo-600 bg-indigo-50/50"
                    : "border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".pdf,.xlsx,.xls"
                  className="hidden"
                />

                <div className="mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-xs">
                  <UploadCloud size={26} />
                </div>

                <p className="text-sm font-semibold text-slate-800">
                  Drag and drop your question document here, or{" "}
                  <span className="text-indigo-600 underline">Browse Files</span>
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Supported formats: <strong>PDF (.pdf)</strong>, <strong>Excel (.xlsx, .xls)</strong> • Max file size: 50MB
                </p>

                <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-medium">
                    <FileSpreadsheet size={14} className="text-emerald-600" /> Excel (.xlsx, .xls)
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium">
                    <FileText size={14} className="text-rose-600" /> Text-based PDF (.pdf)
                  </span>
                </div>
              </div>

              {/* Selected File Card */}
              {file && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      {file.name.endsWith(".pdf") ? (
                        <FileText size={20} className="text-rose-600" />
                      ) : (
                        <FileSpreadsheet size={20} className="text-emerald-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 line-clamp-1">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition"
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* PDF Upload Guidelines Card */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                {/* Header with Info Icon, Title, Sample Download & Collapse Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-4 bg-slate-50/80 border-b border-slate-200/80">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs flex-shrink-0">
                      <Info size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                          {isViva ? "Viva MCQ PDF Upload Guidelines" : "PDF Upload Guidelines"}
                        </h4>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          {isViva ? "MCQ Format Guide" : "Format Guide"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {isViva
                          ? "Follow the recommended Viva MCQ format for rapid automated extraction."
                          : "Follow the recommended question document structure for accurate automated extraction."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={isViva ? "/sample_viva_mcq_template.pdf" : "/sample_question_paper_template.pdf"}
                      download={isViva ? "Sample_Viva_MCQ_Template.pdf" : "Sample_Question_Paper_Template.pdf"}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 shadow-2xs hover:bg-slate-50 hover:border-indigo-300 transition"
                      title={isViva ? "Download reference Viva MCQ PDF template" : "Download reference question paper PDF"}
                    >
                      <Download size={13} />
                      <span>{isViva ? "Sample Viva MCQ Template" : "Sample PDF Template"}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => setShowGuidelines(!showGuidelines)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition shadow-2xs"
                    >
                      <span>{showGuidelines ? "Hide" : "View"} Guidelines</span>
                      {showGuidelines ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Guidelines Body */}
                {showGuidelines && (
                  <div className="p-4 space-y-3.5 text-xs text-slate-700">
                    {isViva ? (
                      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] leading-relaxed">
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            1
                          </span>
                          <span>
                            Upload <strong>text-based PDFs</strong> generated using MS Word, Google Docs or LaTeX.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            2
                          </span>
                          <span>
                            Use <strong>sequential question numbering</strong> such as Q1, Q2, Q3 (or 1., 2., 3.).
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            3
                          </span>
                          <span>
                            Clearly separate <strong>question text and code snippets</strong> from the option choices.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            4
                          </span>
                          <span>
                            Format options with clear labels: <strong>A.</strong>, <strong>B.</strong>, <strong>C.</strong>, <strong>D.</strong> (or <strong>(A)</strong>, <strong>(B)</strong>).
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            5
                          </span>
                          <span>
                            Include an explicit <strong>Answer line</strong>: <code>Answer: B</code> or <code>Ans: C</code> after options.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            6
                          </span>
                          <span>
                            Optionally provide an <strong>Explanation line</strong>: <code>Explanation: ...</code> for student post-exam review.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            7
                          </span>
                          <span>
                            Preserve <strong>code indentation and line breaks</strong> in C syntax or output-prediction snippets.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            8
                          </span>
                          <span>
                            Provide at least <strong>2 to 4 distinct options</strong> per multiple-choice question.
                          </span>
                        </li>

                        <li className="flex items-start gap-2 sm:col-span-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold mt-0.5">
                            9
                          </span>
                          <span>
                            Avoid <strong>scanned PDFs, photographs, blurry text</strong> and complex multi-column layouts.
                          </span>
                        </li>
                      </ol>
                    ) : (
                      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] leading-relaxed">
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            1
                          </span>
                          <span>
                            Upload <strong>text-based PDFs</strong> generated using MS Word, Google Docs or LaTeX.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            2
                          </span>
                          <span>
                            Use <strong>sequential question numbering</strong> such as Q1, Q2, Q3.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            3
                          </span>
                          <span>
                            Keep <strong>question titles and problem descriptions</strong> clearly separated.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            4
                          </span>
                          <span>
                            Use separate <strong>Sample Input</strong> and <strong>Sample Output</strong> headings.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            5
                          </span>
                          <span>
                            Place sample input/output in separate <strong>preformatted blocks</strong>.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            6
                          </span>
                          <span>
                            Preserve <strong>line breaks and indentation</strong> in star, pyramid, diamond, number and alphabet patterns.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            7
                          </span>
                          <span>
                            Arrange <strong>matrices in proper rows and columns</strong>.
                          </span>
                        </li>

                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold mt-0.5">
                            8
                          </span>
                          <span>
                            Keep each <strong>question and its test cases</strong> together (support for both <strong>Sample Test Cases</strong> and <strong>Hidden Test Cases</strong>).
                          </span>
                        </li>

                        <li className="flex items-start gap-2 sm:col-span-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold mt-0.5">
                            9
                          </span>
                          <span>
                            Avoid <strong>scanned PDFs, photographs, blurry text</strong> and complex multi-column layouts.
                          </span>
                        </li>
                      </ol>
                    )}

                    {/* Important Notice */}
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900 leading-relaxed shadow-2xs">
                      <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold text-amber-800">Important Notice: </strong>
                        {isViva
                          ? "Viva examinations are strictly MCQ-based. Provide sequential numbering (Q1..Qn), clearly labeled options (A-D), and explicit Answer keys (e.g., Answer: B) for instant, automated extraction. Questions without explicit answers will be flagged for faculty review."
                          : "For accurate extraction, please follow the recommended PDF question format. Questions that cannot be extracted confidently will be sent for faculty review."}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================= STATE 2: LIVE EXTRACTION PROGRESS ================= */
            <div className="space-y-5 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    {isCompleted ? (
                      <CheckCircle2 size={24} className="text-emerald-600" />
                    ) : (
                      <RefreshCw size={20} className="animate-spin text-indigo-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      {isCompleted
                        ? "Extraction Finished Successfully"
                        : isFailed
                        ? "Extraction Failed"
                        : "Extracting Questions in Progress"}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {jobStatus?.progressMessage || "Processing document..."}
                    </p>
                  </div>
                </div>

                <span className="text-sm font-mono font-bold text-indigo-600">
                  {progressPercent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isCompleted
                      ? "bg-emerald-600"
                      : isFailed
                      ? "bg-rose-600"
                      : "bg-indigo-600"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Detailed Real-Time Extraction Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Identified</p>
                  <p className="text-xl font-bold text-slate-800">
                    {jobStatus?.totalDetected || 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Extracted</p>
                  <p className="text-xl font-bold text-indigo-600">
                    {jobStatus?.totalExtracted || 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Validated</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {jobStatus?.totalValidated || 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Needs Review</p>
                  <p className="text-xl font-bold text-amber-600">
                    {jobStatus?.totalNeedsReview || 0}
                  </p>
                </div>
              </div>

              {/* Progress Terminal Log Display */}
              <div className="rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-300 space-y-1">
                <div className="text-slate-400">--- Live Processing Telemetry ---</div>
                <div>File: {jobStatus?.fileName} ({formatFileSize(jobStatus?.fileSize)})</div>
                <div>Status: <span className="text-indigo-400 uppercase">{jobStatus?.status}</span></div>
                {jobStatus?.totalBatches > 0 && (
                  <div>
                    Batch: {jobStatus?.currentBatch} of {jobStatus?.totalBatches} (approx. 15 questions/batch)
                  </div>
                )}
                <div className="text-emerald-400 pt-1">
                  &gt; {jobStatus?.progressMessage}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {!activeJobId ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartExtraction}
                disabled={!file || uploading}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                <UploadCloud size={15} />
                {uploading ? "Uploading Document..." : "Extract Questions"}
              </button>
            </>
          ) : isCompleted ? (
            <button
              type="button"
              onClick={handleProceedToPreview}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              Review &amp; Preview Questions ({jobStatus?.totalExtracted || 0})
              <ArrowRight size={16} />
            </button>
          ) : isFailed ? (
            <button
              type="button"
              onClick={() => {
                setActiveJobId(null);
                setJobStatus(null);
                setErrorMsg("");
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Try Another File
            </button>
          ) : (
            <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-indigo-600" />
              Processing document batches in background...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamQuestionUploadModal;
