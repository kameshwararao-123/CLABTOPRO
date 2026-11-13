import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { getAllProblems } from "../../services/problemService";
import Loader from "../../components/common/Loader";

const PAGE_SIZE = 9;

const Problems = () => {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const loadProblems = async () => {
      try {
        const data = await getAllProblems();
        setProblems(data.problems || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadProblems();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
      setCurrentPage(1);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredProblems = useMemo(() => {
    if (!debouncedSearch) return problems;
    return problems.filter((problem) => {
      const title = problem.title?.toLowerCase() || "";
      const topic = (typeof problem.topic === "string"
        ? problem.topic
        : problem.topic?.name || ""
      ).toLowerCase();
      const difficulty = problem.difficulty?.toLowerCase() || "";
      return (
        title.includes(debouncedSearch) ||
        topic.includes(debouncedSearch) ||
        difficulty.includes(debouncedSearch)
      );
    });
  }, [problems, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredProblems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedProblems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredProblems.slice(start, start + PAGE_SIZE);
  }, [filteredProblems, safePage]);

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">All Problems</h1>
          <p className="mt-1 text-slate-500">
            Practice C programming problems and improve your logic.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title, topic, difficulty..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-xs outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {paginatedProblems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
          No matching problems found.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {paginatedProblems.map((problem) => (
            <div
              key={problem._id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md ${
                problem.isSolved
                  ? "border-emerald-200 bg-emerald-50/20"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
                  {problem.topic?.name || problem.topic || "Basics"}
                </span>

                <div className="flex items-center gap-2">
                  {problem.isSolved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                      <CheckCircle size={12} />
                      Solved
                    </span>
                  )}

                  <span className="text-xs capitalize text-slate-400">
                    {problem.difficulty}
                  </span>
                </div>
              </div>

              <h2 className="mt-4 text-xl font-bold text-slate-800">
                {problem.title}
              </h2>

              <p className="mt-2 line-clamp-3 text-sm text-slate-500">
                {problem.description}
              </p>

              <Link
                to={`/problems/${problem._id}`}
                className={`mt-5 inline-flex items-center gap-1.5 font-semibold text-sm transition ${
                  problem.isSolved
                    ? "text-emerald-600 hover:text-emerald-700 font-bold"
                    : "text-indigo-600 hover:text-indigo-700"
                }`}
              >
                {problem.isSolved ? (
                  <>
                    <CheckCircle size={15} />
                    Solved
                  </>
                ) : (
                  "Solve →"
                )}
              </Link>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
          <span>
            Page <strong>{safePage}</strong> of <strong>{totalPages}</strong> ({filteredProblems.length} problems)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Problems;
