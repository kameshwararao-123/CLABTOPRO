import { useEffect, useState } from "react";
import {
  getMyProgress,
} from "../../services/progressService";
import Loader from "../../components/common/Loader";

const Statistics = () => {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getMyProgress();
        setProgress(data.progress);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return <Loader />;
  }

  const attempted = progress?.totalAttempted || 0;
  const accepted = progress?.totalAccepted || 0;

  const successRate =
    attempted > 0
      ? Math.round((accepted / attempted) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl">

      <h1 className="text-3xl font-bold text-slate-800">
        Statistics
      </h1>

      <p className="mt-1 text-slate-500">
        Track your C programming progress.
      </p>

      <div className="mt-7 grid gap-5 md:grid-cols-2">

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">
            Success Rate
          </p>

          <h2 className="mt-2 text-4xl font-bold text-indigo-600">
            {successRate}%
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">
            Longest Streak
          </p>

          <h2 className="mt-2 text-4xl font-bold text-purple-600">
            {progress?.longestStreak || 0}
          </h2>
        </div>

      </div>

    </div>
  );
};

export default Statistics;