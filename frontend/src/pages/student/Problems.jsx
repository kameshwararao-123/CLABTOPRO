import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
                {problem.topic?.name}
              </span>

              <span className="text-xs capitalize text-slate-400">
                {problem.difficulty}
              </span>
            </div>

            <h2 className="mt-4 text-xl font-bold text-slate-800">
              {problem.title}
            </h2>

            <p className="mt-2 line-clamp-3 text-sm text-slate-500">
              {problem.description}
            </p>

            <Link
              to={`/problems/${problem._id}`}
              className="mt-5 inline-block font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Solve →
            </Link>
          </div>
        ))}

      </div>

    </div>
  );
};

export default Problems;