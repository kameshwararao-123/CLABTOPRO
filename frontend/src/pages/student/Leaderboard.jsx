import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Award,
  Flame,
  Minus,
  Target,
  Trophy,
} from "lucide-react";
import { getLeaderboard } from "../../services/leaderboardService";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/common/Loader";

const RankMovementBadge = ({ movement, hasPreviousSnapshot }) => {
  if (!hasPreviousSnapshot || movement === null || movement === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        <Minus size={11} />
        —
      </span>
    );
  }

  if (movement > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
        <ArrowUp size={11} />
        {movement} {movement === 1 ? "position" : "positions"}
      </span>
    );
  }

  if (movement < 0) {
    const abs = Math.abs(movement);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
        <ArrowDown size={11} />
        {abs} {abs === 1 ? "position" : "positions"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <Minus size={11} />
      No change
    </span>
  );
};

const PODIUM_STYLES = [
  {
    ring: "border-amber-300 bg-gradient-to-br from-amber-50 via-white to-yellow-50",
    badge: "bg-amber-500 text-white",
    label: "1st Place",
  },
  {
    ring: "border-slate-300 bg-gradient-to-br from-slate-50 via-white to-slate-100",
    badge: "bg-slate-600 text-white",
    label: "2nd Place",
  },
  {
    ring: "border-orange-300 bg-gradient-to-br from-orange-50 via-white to-amber-50",
    badge: "bg-orange-600 text-white",
    label: "3rd Place",
  },
];

const Leaderboard = () => {
  const { user } = useAuth();
  const currentUserId = (user?.id || user?._id || "").toString();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const res = await getLeaderboard(50);
        setData(res);
      } catch (err) {
        setError(
          err.response?.data?.message || "Failed to load leaderboard."
        );
      } finally {
        setLoading(false);
      }
    };

    loadLeaderboard();
  }, []);

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const topStudents = data?.topStudents || [];
  const entries = data?.entries || [];
  const currentUser = data?.currentUser || null;
  const hasPreviousSnapshot = Boolean(data?.hasPreviousSnapshot);

  const isCurrentUserInList = entries.some(
    (e) => e.userId?.toString() === currentUserId
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200 mb-2">
            <Trophy size={13} />
            Unified Performance Leaderboard
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Leaderboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ranked by 70% historical performance (consistency, accuracy, problem solving) and 30% today&apos;s performance (IST).
          </p>
        </div>

        {data?.dateKey && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 shadow-xs">
            Updated for <strong className="text-slate-700">{data.dateKey}</strong> ({data.timezone || "Asia/Kolkata"})
          </div>
        )}
      </div>

      {/* Logged-in Student Summary Card */}
      {currentUser && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 text-white shadow-md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
                <span className="text-[10px] uppercase tracking-wider text-indigo-100">
                  Rank
                </span>
                <span className="text-xl font-extrabold leading-tight">
                  #{currentUser.rank}
                </span>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{currentUser.username}</h2>
                  {currentUser.rollNo && (
                    <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-medium text-indigo-100">
                      {currentUser.rollNo}
                    </span>
                  )}
                  <span className="rounded-full bg-white text-indigo-700 px-2.5 py-0.5 text-[11px] font-bold">
                    Your Standing
                  </span>
                </div>
                <p className="mt-1 text-xs text-indigo-100">
                  Historical: <strong>{currentUser.historicalScore.toFixed(1)}</strong> (70%) • Today: <strong>{currentUser.todayScore.toFixed(1)}</strong> (30% → +{currentUser.todayContribution.toFixed(1)} pts)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <span className="block text-[10px] uppercase text-indigo-100">
                  Overall Score
                </span>
                <span className="text-lg font-bold">
                  {currentUser.overallScore.toFixed(1)}
                </span>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <span className="block text-[10px] uppercase text-indigo-100">
                  Solved
                </span>
                <span className="text-lg font-bold">
                  {currentUser.totalSolved}
                </span>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <span className="block text-[10px] uppercase text-indigo-100">
                  Accuracy
                </span>
                <span className="text-lg font-bold">
                  {currentUser.accuracyPercent.toFixed(1)}%
                </span>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <span className="block text-[10px] uppercase text-indigo-100">
                  Streak
                </span>
                <span className="text-lg font-bold">
                  {currentUser.currentStreak}d
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top 3 Podium Cards */}
      {topStudents.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {topStudents.map((student, idx) => {
            const style = PODIUM_STYLES[idx] || PODIUM_STYLES[2];
            const isMe = student.userId?.toString() === currentUserId;

            return (
              <div
                key={student.userId}
                className={`rounded-2xl border p-5 shadow-sm transition ${style.ring} ${
                  isMe ? "ring-2 ring-indigo-500" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${style.badge}`}
                  >
                    <Award size={13} />
                    {style.label}
                  </span>

                  <RankMovementBadge
                    movement={student.rankMovement}
                    hasPreviousSnapshot={hasPreviousSnapshot}
                  />
                </div>

                <div className="mt-4 flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-slate-800">
                      {student.username}
                      {isMe && (
                        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          You
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {student.rollNo || "Student"}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-2xl font-extrabold text-indigo-700">
                      {student.overallScore.toFixed(1)}
                    </span>
                    <span className="block text-[10px] font-medium text-slate-400">
                      / 100 pts
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-3 text-center text-xs">
                  <div>
                    <span className="block text-[10px] text-slate-400">
                      Solved
                    </span>
                    <span className="font-bold text-slate-800">
                      {student.totalSolved}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">
                      Accuracy
                    </span>
                    <span className="font-bold text-slate-800">
                      {student.accuracyPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">
                      Streak
                    </span>
                    <span className="font-bold text-slate-800">
                      {student.currentStreak}d
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unified Leaderboard Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {entries.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              No student performance records yet. Submit a solution to appear on the leaderboard.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">Rank</th>
                  <th className="px-5 py-4">Movement</th>
                  <th className="px-5 py-4">Student</th>
                  <th className="px-5 py-4">Overall Score</th>
                  <th className="px-5 py-4">Historical</th>
                  <th className="px-5 py-4">Today</th>
                  <th className="px-5 py-4">Solved</th>
                  <th className="px-5 py-4">Accuracy</th>
                  <th className="px-5 py-4">Streak</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const isMe = entry.userId?.toString() === currentUserId;
                  return (
                    <tr
                      key={entry.userId}
                      className={`transition ${
                        isMe
                          ? "bg-indigo-50/70 font-medium"
                          : "hover:bg-slate-50/70"
                      }`}
                    >
                      <td className="px-5 py-4 font-bold text-slate-800">
                        #{entry.rank}
                      </td>

                      <td className="px-5 py-4">
                        <RankMovementBadge
                          movement={entry.rankMovement}
                          hasPreviousSnapshot={hasPreviousSnapshot}
                        />
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-semibold text-slate-800">
                              {entry.username}
                              {isMe && (
                                <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  You
                                </span>
                              )}
                            </p>
                            {entry.rollNo && (
                              <span className="text-xs text-slate-400">
                                {entry.rollNo}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                          {entry.overallScore.toFixed(1)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600">
                        {entry.historicalScore.toFixed(1)}
                      </td>

                      <td className="px-5 py-4 text-xs">
                        {entry.todayScore > 0 ? (
                          <span className="font-semibold text-emerald-700">
                            +{entry.todayContribution.toFixed(1)} pts
                          </span>
                        ) : (
                          <span className="text-slate-400">0.0</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                        {entry.totalSolved}
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Target size={12} className="text-indigo-500" />
                          {entry.accuracyPercent.toFixed(1)}%
                        </span>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Flame size={12} className="text-amber-500" />
                          {entry.currentStreak}d
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* Pinned row if logged-in student is outside the top N entries */}
                {currentUser && !isCurrentUserInList && (
                  <tr className="border-t-2 border-indigo-200 bg-indigo-50/80 font-medium">
                    <td className="px-5 py-4 font-bold text-indigo-800">
                      #{currentUser.rank}
                    </td>
                    <td className="px-5 py-4">
                      <RankMovementBadge
                        movement={currentUser.rankMovement}
                        hasPreviousSnapshot={hasPreviousSnapshot}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">
                        {currentUser.username}
                        <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          You
                        </span>
                      </p>
                      {currentUser.rollNo && (
                        <span className="text-xs text-slate-400">
                          {currentUser.rollNo}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800">
                        {currentUser.overallScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      {currentUser.historicalScore.toFixed(1)}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {currentUser.todayScore > 0 ? (
                        <span className="font-semibold text-emerald-700">
                          +{currentUser.todayContribution.toFixed(1)} pts
                        </span>
                      ) : (
                        <span className="text-slate-400">0.0</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                      {currentUser.totalSolved}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      {currentUser.accuracyPercent.toFixed(1)}%
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      {currentUser.currentStreak}d
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
