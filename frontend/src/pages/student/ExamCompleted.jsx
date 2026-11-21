import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  Award,
  Calendar,
  Clock,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  GraduationCap,
} from "lucide-react";
import { getStudentExamCompletion } from "../../services/examService";
import Loader from "../../components/common/Loader";

const ExamCompleted = () => {
  const { examId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompletion = async () => {
      try {
        setLoading(true);
        const res = await getStudentExamCompletion(examId);
        setData(res);
      } catch (err) {
        console.error("Failed to load completion details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompletion();
  }, [examId]);

  if (loading) {
    return <Loader message="Generating examination completion summary..." />;
  }

  const exam = data?.exam;
  const progress = data?.progress;
  const submission = data?.submission;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl text-center space-y-8 animate-fade-in">
        {/* Success Icon */}
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        {/* Headings */}
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            Examination Complete
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Congratulations!
          </h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You have successfully completed and submitted your examination. All responses have been logged in the audit registry.
          </p>
        </div>

        {/* Exam Information Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-left space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h2 className="text-base font-bold text-white">
                {exam?.title || "Examination"}
              </h2>
              <p className="text-xs text-slate-400">Subject: {exam?.subject}</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-400/20 capitalize">
              {exam?.examType} Exam
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-slate-400">Conceptual Evaluation:</span>
              <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                <ShieldCheck className="w-4 h-4" /> Passed (&lt;50% Error)
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Test Cases Evaluated:</span>
              <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                <FileCheck2 className="w-4 h-4" />
                {submission
                  ? `${submission.testCasesPassed} / ${submission.totalTestCases} Passed`
                  : "All Required Cases Passed"}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Submission Timestamp:</span>
              <div className="text-slate-300 font-mono">
                {progress?.completedAt
                  ? new Date(progress.completedAt).toLocaleString()
                  : new Date().toLocaleString()}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-400">Examination Status:</span>
              <div className="font-bold text-indigo-300 uppercase tracking-wider">
                Submitted &amp; Finalized
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            to="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold transition"
          >
            Go to Student Dashboard
          </Link>

          <Link
            to="/exams"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition transform active:scale-95"
          >
            <span>Back to Examinations</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ExamCompleted;
