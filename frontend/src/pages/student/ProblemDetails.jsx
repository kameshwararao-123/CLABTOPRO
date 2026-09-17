import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import Loader from "../../components/common/Loader";
import Button from "../../components/common/Button";
import ProblemDescription from "../../components/problem/ProblemDescription";
import CodeEditor from "../../components/problem/CodeEditor";

import { getProblemById } from "../../services/problemService";
import { submitCode } from "../../services/submissionService";

const ProblemDetails = () => {
  const { id } = useParams();

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState(`#include <stdio.h>

int main() {

    return 0;
}`);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadProblem = async () => {
      try {
        const data = await getProblemById(id);
        setProblem(data.problem);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadProblem();
  }, [id]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setMessage("");

      const data = await submitCode({
        problemId: id,
        code,
        language: "c",
      });

      setMessage(
        data.message || "Code submitted successfully"
      );
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Submission failed"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  if (!problem) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-600">
        Problem not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">

      <div className="grid gap-6 xl:grid-cols-2">

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <ProblemDescription problem={problem} />
        </div>

        <div className="space-y-4">

          <CodeEditor
            code={code}
            setCode={setCode}
          />

          {message && (
            <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
              {message}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="w-full"
          >
            {submitting
              ? "Submitting..."
              : "Submit Code"}
          </Button>

        </div>

      </div>

    </div>
  );
};

export default ProblemDetails;