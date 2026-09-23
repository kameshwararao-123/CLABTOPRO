import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";

import { getAllProblems } from "../../services/problemService";
import Loader from "../../components/common/Loader";

const Problems = () => {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-7xl">

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">
          All Problems
        </h1>

        <p className="mt-1 text-slate-500">
          Practice C programming problems and improve your logic.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        {problems.map((problem) => (
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
                {problem.topic || problem.topic?.name || "Basics"}
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

    </div>
  );
};

export default Problems;