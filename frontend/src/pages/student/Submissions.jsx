import { useEffect, useState } from "react";
import { getMySubmissions } from "../../services/submissionService";
import Loader from "../../components/common/Loader";

const Submissions = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSubmissions = async () => {
      try {
        const data = await getMySubmissions();
        setSubmissions(data.submissions || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadSubmissions();
  }, []);

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-7xl">

      <h1 className="text-3xl font-bold text-slate-800">
        My Submissions
      </h1>

      <p className="mt-1 text-slate-500">
        Review your previous code submissions.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">

            <thead className="border-b bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4">Problem</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Tests</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>

            <tbody>
              {submissions.map((submission) => (
                <tr
                  key={submission._id}
                  className="border-b last:border-0"
                >
                  <td className="px-6 py-4 font-medium text-slate-800">
                    {submission.problem?.title || "Problem"}
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        submission.status === "accepted"
                          ? "bg-green-50 text-green-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {submission.status}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-slate-500">
                    {submission.testCasesPassed}/
                    {submission.totalTestCases}
                  </td>

                  <td className="px-6 py-4 text-slate-500">
                    {new Date(
                      submission.createdAt
                    ).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>

      </div>

    </div>
  );
};

export default Submissions;