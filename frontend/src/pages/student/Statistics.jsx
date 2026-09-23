import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Flame,
  Trophy,
  Target,
  BarChart3,
  CalendarCheck,
  Code2,
  Clock,
} from "lucide-react";
import { getMyProgress } from "../../services/progressService";
import { getMySubmissions } from "../../services/submissionService";
import Loader from "../../components/common/Loader";

const Statistics = () => {
  const [progress, setProgress] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        const [progressData, submissionData] = await Promise.all([
          getMyProgress(),
          getMySubmissions(),
        ]);
        setProgress(progressData.progress);
        setSubmissions(submissionData.submissions || []);
      } catch (error) {
        console.error("Failed to load statistics:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStatistics();
  }, []);

  if (loading) {
    return <Loader />;
  }

  const attempted = progress?.totalAttempted || submissions.length || 0;
  const accepted =
    progress?.totalAccepted ||
    submissions.filter((s) => s.status === "accepted").length ||
    0;
  const totalSolved = progress?.totalSolved || 0;

  const successRate =
    attempted > 0 ? Math.round((accepted / attempted) * 100) : 0;

  // Calculate difficulty breakdown from accepted submissions
  const acceptedSubmissions = submissions.filter((s) => s.status === "accepted");
  const uniqueSolvedMap = new Map();
  acceptedSubmissions.forEach((sub) => {
    if (sub.problem?._id && !uniqueSolvedMap.has(sub.problem._id)) {
      uniqueSolvedMap.set(sub.problem._id, sub.problem.difficulty || "Easy");
    }
  });

  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;

  uniqueSolvedMap.forEach((diff) => {
    if (diff === "Hard") hardCount++;
    else if (diff === "Medium") mediumCount++;
    else easyCount++;
  });

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIndex = new Date().getDay();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Learning Statistics</h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Track your coding consistency, problem-solving accuracy, and milestones.
        </p>
      </div>

      {/* 1. Core Key Metrics Grid */}
      <div className="grid gap-3.5 sm:gap-5 grid-cols-2 lg:grid-cols-4">
        {/* Solved Problems */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase text-slate-400">
              Solved
            </span>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={17} />
            </div>
          </div>
          <h2 className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-800">
            {totalSolved}
          </h2>
          <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-400">Unique C problems</p>
        </div>

        {/* Current Streak */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase text-slate-400">
              Current Streak
            </span>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Flame size={17} />
            </div>
          </div>
          <h2 className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-800">
            {progress?.currentStreak || 0}
            <span className="text-sm sm:text-base font-normal text-slate-400 ml-1">
              Day{(progress?.currentStreak || 0) !== 1 ? "s" : ""}
            </span>
          </h2>
          <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {(progress?.currentStreak || 0) > 0
              ? "Active coding habit 🔥"
              : "Solve a problem today!"}
          </p>
        </div>

        {/* Accuracy */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase text-slate-400">
              Accuracy Rate
            </span>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Target size={17} />
            </div>
          </div>
          <h2 className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-indigo-600">
            {successRate}%
          </h2>
          <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            {accepted} of {attempted} tries
          </p>
        </div>

        {/* Best Streak */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase text-slate-400">
              Best Streak
            </span>
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Trophy size={17} />
            </div>
          </div>
          <h2 className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-800">
            {progress?.longestStreak || 0}
            <span className="text-sm sm:text-base font-normal text-slate-400 ml-1">
              Day{(progress?.longestStreak || 0) !== 1 ? "s" : ""}
            </span>
          </h2>
          <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-slate-400">All-time record</p>
        </div>
      </div>

      {/* 2. Visual Performance & Difficulty Overview */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Accuracy & Submissions Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <BarChart3 size={18} className="text-indigo-600" />
            <h3 className="font-bold text-slate-800">Submission Performance</h3>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                <span>Success Rate</span>
                <span className="font-bold text-indigo-600">{successRate}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Accepted
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-600">
                  {accepted}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">
                  Total Attempts
                </p>
                <p className="mt-1 text-xl font-bold text-slate-700">
                  {attempted}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Difficulty Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Code2 size={18} className="text-indigo-600" />
            <h3 className="font-bold text-slate-800">Solved by Difficulty</h3>
          </div>

          <div className="mt-5 space-y-3.5">
            {/* Easy */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-1">
                <span className="font-semibold text-emerald-700">Easy</span>
                <span className="font-bold">{easyCount} solved</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${
                      totalSolved > 0
                        ? Math.min(100, (easyCount / totalSolved) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Medium */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-1">
                <span className="font-semibold text-amber-700">Medium</span>
                <span className="font-bold">{mediumCount} solved</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{
                    width: `${
                      totalSolved > 0
                        ? Math.min(100, (mediumCount / totalSolved) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Hard */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-1">
                <span className="font-semibold text-rose-700">Hard</span>
                <span className="font-bold">{hardCount} solved</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-500"
                  style={{
                    width: `${
                      totalSolved > 0
                        ? Math.min(100, (hardCount / totalSolved) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Weekly Activity Schedule */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 sm:pb-4">
          <div className="flex items-center gap-2">
            <CalendarCheck size={18} className="text-orange-500" />
            <h3 className="font-bold text-slate-800 text-sm sm:text-base">Weekly Activity</h3>
          </div>
          <span className="text-[11px] sm:text-xs text-slate-400">Sun &ndash; Sat</span>
        </div>

        <div className="mt-4 sm:mt-5 grid grid-cols-7 gap-1 sm:gap-2 text-center">
          {daysOfWeek.map((day, idx) => {
            const isToday = idx === todayIndex;

            return (
              <div
                key={day}
                className={`flex flex-col items-center rounded-xl p-2 sm:p-3 text-xs transition ${
                  isToday
                    ? "bg-gradient-to-b from-orange-500 to-amber-500 text-white font-bold shadow-sm"
                    : "bg-slate-50 text-slate-600 border border-slate-100"
                }`}
              >
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">
                  {day}
                </span>
                <span className="mt-1.5 sm:mt-2 text-xs sm:text-sm">
                  {isToday ? "🔥" : idx < todayIndex ? "✓" : "•"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Statistics;