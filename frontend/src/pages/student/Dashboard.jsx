import { useEffect, useState } from "react";
import {
  Code2,
  CheckCircle,
  Target,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

import StatCard from "../../components/dashboard/StatCard";
import StreakCard from "../../components/dashboard/StreakCard";
import Loader from "../../components/common/Loader";

import { getMyProgress } from "../../services/progressService";
import { getTodayProblem } from "../../services/problemService";

const Dashboard = () => {
  const [progress, setProgress] = useState(null);
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [progressData, problemData] = await Promise.all([
          getMyProgress(),
          getTodayProblem(),
        ]);

        setProgress(progressData.progress);
        setProblem(problemData.problem);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
          Your Learning Dashboard
        </h1>

        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Keep practicing and build your C programming skills.
        </p>
      </div>

      <StreakCard streak={progress?.currentStreak || 0} />

      <div className="grid gap-3.5 sm:gap-5 grid-cols-2 lg:grid-cols-4">

        <StatCard
          title="Problems Solved"
          value={progress?.totalSolved || 0}
          icon={<CheckCircle size={20} />}
        />

        <StatCard
          title="Total Attempts"
          value={progress?.totalAttempted || 0}
          icon={<Code2 size={20} />}
        />

        <StatCard
          title="Accepted"
          value={progress?.totalAccepted || 0}
          icon={<Target size={20} />}
        />

        <StatCard
          title="Longest Streak"
          value={progress?.longestStreak || 0}
          icon={<Trophy size={20} />}
        />

      </div>

      {problem && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">

          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">

            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                  Problem of the Day
                </span>

                {problem.isSolved && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <CheckCircle size={13} />
                    Solved
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-2xl font-bold text-slate-800">
                {problem.title}
              </h2>

              <p className="mt-2 max-w-2xl text-slate-500">
                {problem.description}
              </p>

              <div className="mt-4 flex gap-3">
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-600">
                  {problem.difficulty}
                </span>

                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600">
                  {problem.topic?.name || problem.topic || "Basics"}
                </span>
              </div>
            </div>

            <Link
              to={`/problems/${problem._id}`}
              className={`flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white transition ${
                problem.isSolved
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-200"
                  : "bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200"
              }`}
            >
              {problem.isSolved ? (
                <>
                  <CheckCircle size={18} />
                  Solved
                </>
              ) : (
                <>
                  Solve Problem
                  <ArrowRight size={18} />
                </>
              )}
            </Link>

          </div>

        </div>
      )}

    </div>
  );
};

export default Dashboard;