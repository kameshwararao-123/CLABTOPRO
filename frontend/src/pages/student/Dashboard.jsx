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
        <h1 className="text-3xl font-bold text-slate-800">
          Your Learning Dashboard
        </h1>

        <p className="mt-1 text-slate-500">
          Keep practicing and build your C programming skills.
        </p>
      </div>

      <StreakCard streak={progress?.currentStreak || 0} />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

        <StatCard
          title="Problems Solved"
          value={progress?.totalSolved || 0}
          icon={<CheckCircle size={22} />}
        />

        <StatCard
          title="Total Attempts"
          value={progress?.totalAttempted || 0}
          icon={<Code2 size={22} />}
        />

        <StatCard
          title="Accepted"
          value={progress?.totalAccepted || 0}
          icon={<Target size={22} />}
        />

        <StatCard
          title="Longest Streak"
          value={progress?.longestStreak || 0}
          icon={<Trophy size={22} />}
        />

      </div>

      {problem && (
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">

            <div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                Problem of the Day
              </span>

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
                  {problem.topic?.name}
                </span>
              </div>
            </div>

            <Link
              to={`/problems/${problem._id}`}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
            >
              Solve Problem
              <ArrowRight size={18} />
            </Link>

          </div>

        </div>
      )}

    </div>
  );
};

export default Dashboard;