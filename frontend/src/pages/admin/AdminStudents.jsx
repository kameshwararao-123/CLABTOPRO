import { useEffect, useState } from "react";
import {
  Users,
  Search,
  Flame,
  Award,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Mail,
  GraduationCap,
} from "lucide-react";
import { getAllStudents } from "../../services/adminService";
import Loader from "../../components/common/Loader";

const AdminStudents = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getAllStudents();
      setStudents(data.students || []);
    } catch (err) {
      console.error("Failed to fetch students:", err);
      setError("Failed to load students. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const filteredStudents = students.filter((student) => {
    const q = searchQuery.toLowerCase();
    return (
      student.username?.toLowerCase().includes(q) ||
      student.email?.toLowerCase().includes(q) ||
      student.rollNo?.toLowerCase().includes(q)
    );
  });

  const activeStreaksCount = students.filter(
    (s) => (s.currentStreak || 0) > 0
  ).length;

  const totalSolvedSum = students.reduce(
    (acc, s) => acc + (s.totalSolved || 0),
    0
  );

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-slate-800">
              Student Directory
            </h1>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
              {students.length} Students
            </span>
          </div>
          <p className="mt-1 text-slate-500">
            Monitor registered students, streaks, and problem-solving progress.
          </p>
        </div>

        <button
          onClick={fetchStudents}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Registered
            </p>
            <p className="text-2xl font-bold text-slate-800">
              {students.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Flame size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Streaks
            </p>
            <p className="text-2xl font-bold text-amber-600">
              {activeStreaksCount}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Solved by Students
            </p>
            <p className="text-2xl font-bold text-emerald-600">
              {totalSolvedSum}
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search student by name, roll number, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {filteredStudents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Users size={36} className="mx-auto text-slate-300" />
              <h3 className="mt-3 font-semibold text-slate-800">
                No students found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {searchQuery
                  ? "No students match your search query."
                  : "No students have registered on the platform yet."}
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Roll Number</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Streak</th>
                  <th className="px-6 py-4">Problems Solved</th>
                  <th className="px-6 py-4">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStudents.map((student) => (
                  <tr
                    key={student._id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-sm font-bold text-white shadow-sm">
                          {student.username?.charAt(0)?.toUpperCase() || "S"}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">
                            {student.username}
                          </p>
                          <p className="text-xs text-slate-400">Student</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-mono font-semibold text-slate-700">
                        <GraduationCap size={13} />
                        {student.rollNo || "-"}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Mail size={13} className="text-slate-400" />
                        {student.email}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <Flame
                          size={16}
                          className={
                            (student.currentStreak || 0) > 0
                              ? "text-amber-500 fill-amber-500"
                              : "text-slate-300"
                          }
                        />
                        <span className="font-bold text-slate-800">
                          {student.currentStreak || 0}
                        </span>
                        <span className="text-xs text-slate-400">
                          (max {student.longestStreak || 0})
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-600">
                          {student.totalSolved || 0} solved
                        </span>
                        <span className="text-xs text-slate-400">
                          / {student.totalAttempted || 0} tried
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500">
                      {student.createdAt
                        ? new Date(student.createdAt).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminStudents;

