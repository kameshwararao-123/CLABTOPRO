import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, AlertCircle, FileText, Calendar, Clock, Award, ShieldAlert } from "lucide-react";
import { createExam } from "../../services/examService";
import Input from "../../components/common/Input";

const CreateExam = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get("type") === "external" ? "external" : "internal";

  const [form, setForm] = useState({
    title: "",
    description: "",
    subject: "",
    academicYear: "2026-2027",
    semester: "Semester 1",
    examType: initialType,
    examDate: new Date().toISOString().split("T")[0],
    startTime: "10:00",
    endTime: "11:30",
    durationMinutes: 90,
    totalMarks: 100,
    instructions:
      "1. Do not switch tabs or minimize the examination window during the test.\n2. Write your conceptual solution, algorithm, and logic in the Paper Writing Notepad.\n3. You must score an error percentage below 50% on AI conceptual evaluation to unlock the code execution environment.\n4. Complete and test all visible test cases before submitting your final code.",
    maxConceptualAttempts: 3,
    status: "draft",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.subject.trim()) {
      setError("Please provide an Exam Title and Subject name.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await createExam(form);
      const createdId = res.exam?._id;
      navigate(`/admin/exams/${createdId}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create examination.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/admin/exams?type=${form.examType}`}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 transition shadow-xs"
            title="Back to Examinations"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Create {form.examType === "internal" ? "Internal" : "External"} Examination
            </h1>
            <p className="text-xs text-slate-500">
              Configure schedule, duration, conceptual evaluation rules, and student guidelines.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Exam Type Selector Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Examination Category
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, examType: "internal" }))}
              className={`flex flex-col items-start p-4 rounded-xl border text-left transition ${
                form.examType === "internal"
                  ? "border-indigo-600 bg-indigo-50/40 text-indigo-900"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-sm">Internal Examination</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    form.examType === "internal" ? "bg-indigo-600" : "bg-slate-300"
                  }`}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Mid-term assessments, internal lab exams, and continuous evaluations.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, examType: "external" }))}
              className={`flex flex-col items-start p-4 rounded-xl border text-left transition ${
                form.examType === "external"
                  ? "border-indigo-600 bg-indigo-50/40 text-indigo-900"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-sm">External Examination</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    form.examType === "external" ? "bg-indigo-600" : "bg-slate-300"
                  }`}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                University end-semester practical exams and official assessments.
              </p>
            </button>
          </div>
        </div>

        {/* General Information Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              General Information
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Exam Title"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Data Structures & C Programming Lab Final Exam"
                required
              />
            </div>

            <div>
              <Input
                label="Subject Name / Code"
                name="subject"
                value={form.subject}
                onChange={handleChange}
                placeholder="e.g. CS201 - Advanced C Programming"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Academic Year
              </label>
              <input
                type="text"
                name="academicYear"
                value={form.academicYear}
                onChange={handleChange}
                placeholder="e.g. 2026-2027"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Semester
              </label>
              <select
                name="semester"
                value={form.semester}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
              >
                <option value="Semester 1">Semester 1</option>
                <option value="Semester 2">Semester 2</option>
                <option value="Semester 3">Semester 3</option>
                <option value="Semester 4">Semester 4</option>
                <option value="Semester 5">Semester 5</option>
                <option value="Semester 6">Semester 6</option>
                <option value="Semester 7">Semester 7</option>
                <option value="Semester 8">Semester 8</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Description (Optional)
              </label>
              <textarea
                name="description"
                rows={2}
                value={form.description}
                onChange={handleChange}
                placeholder="Brief summary or scope of this examination..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Schedule & Timing Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Calendar size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Schedule &amp; Duration
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Exam Date
              </label>
              <input
                type="date"
                name="examDate"
                value={form.examDate}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Start Time
              </label>
              <input
                type="time"
                name="startTime"
                value={form.startTime}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                End Time
              </label>
              <input
                type="time"
                name="endTime"
                value={form.endTime}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Duration (Minutes)
              </label>
              <input
                type="number"
                min="10"
                max="360"
                name="durationMinutes"
                value={form.durationMinutes}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Grading & AI Conceptual Evaluation Rules */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Award size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Scoring &amp; AI Conceptual Evaluation Rules
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Total Marks
              </label>
              <input
                type="number"
                min="10"
                max="500"
                name="totalMarks"
                value={form.totalMarks}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Max Conceptual Attempts Allowed
              </label>
              <input
                type="number"
                min="1"
                max="10"
                name="maxConceptualAttempts"
                value={form.maxConceptualAttempts}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white font-mono"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Number of AI paper evaluation submissions permitted per student before requiring faculty override.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-xs text-slate-600">
            <ShieldAlert size={16} className="text-indigo-600 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Automatic Code Unlock Rule:</strong> Students must score an AI conceptual error percentage strictly below 50% on their Paper Writing Notepad to unlock the Monaco C Code Editor.
            </span>
          </div>
        </div>

        {/* Student Instructions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Candidate Examination Instructions
            </h2>
          </div>

          <div>
            <textarea
              name="instructions"
              rows={4}
              value={form.instructions}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:text-sm text-slate-800 font-mono outline-none transition focus:border-indigo-500 focus:bg-white"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              These guidelines are displayed to students on their pre-exam verification screen.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to={`/admin/exams?type=${form.examType}`}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus size={16} />
            {loading ? "Creating Examination..." : "Create Examination"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateExam;
