import { useEffect, useState } from "react";
import {
  Users,
  Code2,
  Send,
  CheckCircle,
  Plus,
  CalendarDays,
  Eye,
  Pencil,
  FileText,
  Clock3,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { Link } from "react-router-dom";

import StatCard from "../../components/dashboard/StatCard";
import Loader from "../../components/common/Loader";
import api from "../../services/api";

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [todayProblem, setTodayProblem] = useState(null);
  const [recentProblems, setRecentProblems] = useState([]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        // Dashboard statistics
        const statsResponse = await api.get(
          "/admin/dashboard"
        );

        setStats(statsResponse.data);

        // Today's problem
        try {
          const todayResponse = await api.get(
            "/problems/today"
          );

          setTodayProblem(todayResponse.data.problem);
        } catch (error) {
          // No POTD published today
          setTodayProblem(null);
        }

        // Recent problems
        try {
          const problemsResponse = await api.get(
            "/problems"
          );

          setRecentProblems(
            problemsResponse.data.problems || []
          );
        } catch (error) {
          console.error(
            "Failed to load recent problems:",
            error
          );
        }
      } catch (error) {
        console.error(
          "Failed to load admin dashboard:",
          error
        );
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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl p-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              Admin Dashboard
            </h1>

            <p className="mt-1 text-slate-500">
              Manage problems and monitor student activity.
            </p>
          </div>

          <Link
            to="/admin/problems/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700"
          >
            <Plus size={19} />
            Create POTD
          </Link>
        </div>

        {/* Statistics */}
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

          <StatCard
            title="Students"
            value={stats?.totalStudents || 0}
            icon={<Users size={22} />}
          />

          <StatCard
            title="Problems"
            value={stats?.totalProblems || 0}
            icon={<Code2 size={22} />}
          />

          <StatCard
            title="Submissions"
            value={stats?.totalSubmissions || 0}
            icon={<Send size={22} />}
          />

          <StatCard
            title="Accepted"
            value={stats?.acceptedSubmissions || 0}
            icon={<CheckCircle size={22} />}
          />

        </div>

        {/* Main Grid */}
        <div className="mt-7 grid gap-6 lg:grid-cols-3">

          {/* Today's POTD */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <CalendarDays size={20} />
                </div>

                <div>
                  <h2 className="font-semibold text-slate-800">
                    Today's Problem
                  </h2>

                  <p className="text-sm text-slate-500">
                    Problem of the Day
                  </p>
                </div>
              </div>

              <Link
                to="/admin/problems/create"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Create New
              </Link>

            </div>

            <div className="p-6">

              {todayProblem ? (
                <div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                    <div>
                      <h3 className="text-xl font-bold text-slate-800">
                        {todayProblem.title}
                      </h3>

                      <div className="mt-3 flex flex-wrap gap-2">

                        <span className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                          {todayProblem.topic}
                        </span>

                        <span
                          className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                            todayProblem.difficulty === "Easy"
                              ? "bg-green-50 text-green-600"
                              : todayProblem.difficulty === "Medium"
                              ? "bg-yellow-50 text-yellow-700"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {todayProblem.difficulty}
                        </span>

                        <span className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1 text-xs font-semibold text-green-600">
                          <CheckCircle size={13} />
                          Published
                        </span>

                      </div>
                    </div>

                  </div>

                  <p className="mt-5 line-clamp-3 text-sm leading-6 text-slate-600">
                    {todayProblem.description}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">

                    <Link
                      to={`/admin/problems/${todayProblem._id}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Eye size={17} />
                      View Problem
                    </Link>

                    <Link
                      to={`/admin/problems/${todayProblem._id}/edit`}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      <Pencil size={17} />
                      Edit Problem
                    </Link>

                  </div>

                </div>
              ) : (
                <div className="py-8 text-center">

                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <FileText size={25} />
                  </div>

                  <h3 className="mt-4 font-semibold text-slate-800">
                    No POTD published today
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    Create a problem and publish it as today's
                    Problem of the Day.
                  </p>

                  <Link
                    to="/admin/problems/create"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    <Plus size={17} />
                    Create Today's Problem
                  </Link>

                </div>
              )}

            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="font-semibold text-slate-800">
                Quick Actions
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Manage your platform
              </p>
            </div>

            <div className="p-4">

              <Link
                to="/admin/problems/create"
                className="group flex items-center gap-4 rounded-xl p-4 transition hover:bg-indigo-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                  <Plus size={20} />
                </div>

                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    Create Problem
                  </p>

                  <p className="text-xs text-slate-500">
                    Add a new coding problem
                  </p>
                </div>

                <ArrowRight
                  size={17}
                  className="text-slate-400 transition group-hover:translate-x-1"
                />
              </Link>

              <Link
                to="/admin/problems"
                className="group flex items-center gap-4 rounded-xl p-4 transition hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Code2 size={20} />
                </div>

                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    Manage Problems
                  </p>

                  <p className="text-xs text-slate-500">
                    View and manage all problems
                  </p>
                </div>

                <ArrowRight
                  size={17}
                  className="text-slate-400 transition group-hover:translate-x-1"
                />
              </Link>

              <Link
                to="/admin/students"
                className="group flex items-center gap-4 rounded-xl p-4 transition hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Users size={20} />
                </div>

                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    Students
                  </p>

                  <p className="text-xs text-slate-500">
                    View student activity
                  </p>
                </div>

                <ArrowRight
                  size={17}
                  className="text-slate-400 transition group-hover:translate-x-1"
                />
              </Link>

            </div>
          </div>
        </div>

        {/* Recent Problems */}
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">

            <div>
              <h2 className="font-semibold text-slate-800">
                Recent Problems
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Recently created coding problems
              </p>
            </div>

            <Link
              to="/admin/problems"
              className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View All
              <ArrowRight size={16} />
            </Link>

          </div>

          <div className="overflow-x-auto">

            {recentProblems.length === 0 ? (
              <div className="px-6 py-12 text-center">

                <FileText
                  size={30}
                  className="mx-auto text-slate-300"
                />

                <p className="mt-3 text-sm text-slate-500">
                  No problems created yet.
                </p>

                <Link
                  to="/admin/problems/create"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Plus size={16} />
                  Create Problem
                </Link>

              </div>
            ) : (
              <table className="w-full min-w-[700px]">

                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left">

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Problem
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Topic
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Difficulty
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Date
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {recentProblems.slice(0, 5).map((problem) => (

                    <tr
                      key={problem._id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >

                      <td className="px-6 py-4">

                        <div className="flex items-center gap-3">

                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                            <Code2 size={17} />
                          </div>

                          <div>
                            <p className="font-semibold text-slate-800">
                              {problem.title}
                            </p>
                          </div>

                        </div>

                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">
                        {problem.topic}
                      </td>

                      <td className="px-6 py-4">

                        <span
                          className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                            problem.difficulty === "Easy"
                              ? "bg-green-50 text-green-600"
                              : problem.difficulty === "Medium"
                              ? "bg-yellow-50 text-yellow-700"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {problem.difficulty}
                        </span>

                      </td>

                      <td className="px-6 py-4">

                        {problem.status === "published" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1 text-xs font-semibold text-green-600">
                            <CheckCircle size={13} />
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                            <Clock3 size={13} />
                            Draft
                          </span>
                        )}

                      </td>

                      <td className="px-6 py-4 text-sm text-slate-500">
                        {problem.publishDate
                          ? new Date(
                              problem.publishDate
                            ).toLocaleDateString()
                          : "-"}
                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>
            )}

          </div>
        </div>

        {/* Activity Overview */}
        <div className="mt-7 grid gap-6 md:grid-cols-2">

          {/* Participation */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <BarChart3 size={20} />
              </div>

              <div>
                <h2 className="font-semibold text-slate-800">
                  Student Participation
                </h2>

                <p className="text-sm text-slate-500">
                  Current platform activity
                </p>
              </div>

            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">
                  Total Students
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-800">
                  {stats?.totalStudents || 0}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">
                  Submissions
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-800">
                  {stats?.totalSubmissions || 0}
                </p>
              </div>

            </div>

          </div>

          {/* Acceptance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <CheckCircle size={20} />
              </div>

              <div>
                <h2 className="font-semibold text-slate-800">
                  Submission Overview
                </h2>

                <p className="text-sm text-slate-500">
                  Student coding performance
                </p>
              </div>

            </div>

            <div className="mt-6">

              <div className="flex items-center justify-between">

                <span className="text-sm text-slate-500">
                  Accepted submissions
                </span>

                <span className="font-bold text-slate-800">
                  {stats?.acceptedSubmissions || 0}
                </span>

              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">

                <div
                  className="h-full rounded-full bg-indigo-600"
                  style={{
                    width: `${
                      stats?.totalSubmissions
                        ? Math.min(
                            100,
                            (stats.acceptedSubmissions /
                              stats.totalSubmissions) *
                              100
                          )
                        : 0
                    }%`,
                  }}
                />

              </div>

              <p className="mt-2 text-xs text-slate-400">
                Acceptance rate based on all submissions
              </p>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default AdminDashboard;