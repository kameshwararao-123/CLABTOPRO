import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  GraduationCap,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Award,
  CheckCircle2,
  ArrowRight,
  FileText,
  Lock,
  ArrowLeft,
} from "lucide-react";
import {
  getStudentExamInstructions,
  acknowledgeInstructions,
} from "../../services/examService";
import Loader from "../../components/common/Loader";
import { isExamProgressCompleted } from "../../utils/examStatus";

const ExamInstructions = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const fetchInstructions = async () => {
      try {
        setLoading(true);
        setErrorMsg("");
        const data = await getStudentExamInstructions(examId);
        setExam(data.exam);
        setProgress(data.progress);

        if (isExamProgressCompleted(data.progress, data)) {
          navigate(`/exams/${examId}/completed`, { replace: true });
          return;
        }

        if (data.progress?.instructionsAcknowledged) {
          navigate(`/exams/${examId}/question`, { replace: true });
        }
      } catch (err) {
        if (err.response?.data?.isCompleted) {
          navigate(`/exams/${examId}/completed`, { replace: true });
          return;
        }
        setErrorMsg(
          err.response?.data?.message || "Failed to load examination instructions."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchInstructions();
  }, [examId, navigate]);

  const handleProceed = async () => {
    if (!agreed) return;

    try {
      setSubmitting(true);
      setErrorMsg("");
      await acknowledgeInstructions(examId);
      navigate(`/exams/${examId}/question`);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Failed to acknowledge instructions. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loader message="Verifying examination authorization..." />;
  }

  if (errorMsg && !exam) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-2xl border border-rose-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-sm text-slate-600">{errorMsg}</p>
        <Link
          to="/exams"
          className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Return to My Exams
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-10 px-4 sm:px-6 flex items-center justify-center">
      <div className="max-w-3xl w-full bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8">
        {/* Header */}
        <div className="border-b border-slate-700/80 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Examination Gateway
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              {exam?.title}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Subject: <strong className="text-slate-200">{exam?.subject}</strong> | Category:{" "}
              <span className="capitalize text-slate-200 font-semibold">{exam?.examType} Examination</span>
            </p>
          </div>

          <div className="flex sm:flex-col items-end gap-2 text-right">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> {exam?.durationMinutes} Minutes
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-emerald-400" /> {exam?.totalMarks} Total Marks
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Examination Rules List */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" /> Strict Examination Rules & Protocol
          </h2>

          <div className="space-y-3 text-sm text-slate-300 bg-slate-900/60 p-5 rounded-2xl border border-slate-700/60">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                1
              </span>
              <p>
                <strong>Individual Question Allocation:</strong> Every student receives a unique, randomized question allocated by the system. Sharing or discussing questions is strictly prohibited.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                2
              </span>
              <p>
                <strong>Mandatory Conceptual Paper Writing:</strong> You must first document your conceptual approach (algorithm outline, data structures, logic flow, and edge cases) in the Paper Writing Notepad.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                3
              </span>
              <p>
                <strong>50% Error Threshold Compiler Gate:</strong> The AI system evaluates your conceptual answer for algorithmic and code correctness. The C Code Compiler will remain <span className="text-rose-400 font-bold">LOCKED</span> until your conceptual error score is strictly below 50%. You can revise and resubmit your conceptual answer whenever returned by faculty.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                4
              </span>
              <p>
                <strong>Sandboxed Code Execution:</strong> When compiler access is granted, you can test your C code against sample test cases. Final submission will evaluate against comprehensive hidden test cases.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                5
              </span>
              <p>
                <strong>Timer & Anti-Cheating:</strong> The examination countdown timer runs continuously once started. All activity and submissions are timestamped and audited.
              </p>
            </div>
          </div>
        </div>

        {/* Agreement Checkbox */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/80">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-800 cursor-pointer"
            />
            <span className="text-xs sm:text-sm text-slate-300">
              I have read, understood, and agree to strictly abide by all examination rules and integrity guidelines. I understand that unauthorized collaboration, tab switching, or academic dishonesty will lead to immediate disqualification.
            </span>
          </label>
        </div>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <Link
            to="/exams"
            className="text-xs text-slate-400 hover:text-slate-200 transition"
          >
            ← Cancel and return to exams
          </Link>

          <button
            onClick={handleProceed}
            disabled={!agreed || submitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition transform active:scale-95"
          >
            <span>{submitting ? "Acknowledging..." : "Acknowledge & Proceed to Question"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamInstructions;
