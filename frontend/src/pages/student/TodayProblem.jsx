import React, { useEffect, useState } from "react";
import {useNavigate} from "react-router-dom";
import {
  getTodayProblem,
} from "../../services/problemService";

const TodayProblem = () => {
  const navigate = useNavigate();
  const [problem, setProblem] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  useEffect(() => {

    const loadProblem = async () => {

      try {

        const data =
          await getTodayProblem();

        setProblem(
          data.problem
        );

      } catch (error) {

        setError(
          error.response?.data?.message ||
            "Unable to load today's problem"
        );

      } finally {

        setLoading(false);

      }
    };


    loadProblem();

  }, []);


  if (loading) {

    return (
      <div className="p-8 text-center">
        Loading today's problem...
      </div>
    );

  }


  if (error) {

    return (
      <div className="m-8 rounded-xl bg-yellow-50 p-5 text-yellow-700">
        {error}
      </div>
    );

  }


  return (
    <div className="min-h-screen bg-[#f6f8ff] p-6">

      <div className="mx-auto max-w-5xl">

        {/* Header */}

        <div className="flex items-center justify-between">

          <div>

            <p className="text-sm font-semibold text-blue-600">
              Problem of the Day
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              {problem.title}
            </h1>

          </div>


          <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-600">
            {problem.difficulty}
          </span>

        </div>


        {/* Problem */}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-7">

          <div className="flex gap-3">

            <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
              {problem.topic}
            </span>

          </div>


          <div className="mt-6">

            <h2 className="font-bold">
              Problem
            </h2>

            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
              {problem.description}
            </p>

          </div>


          {/* Input */}

          {problem.inputFormat && (
            <div className="mt-7">

              <h2 className="font-bold">
                Input Format
              </h2>

              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {problem.inputFormat}
              </p>

            </div>
          )}


          {/* Output */}

          {problem.outputFormat && (
            <div className="mt-7">

              <h2 className="font-bold">
                Output Format
              </h2>

              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {problem.outputFormat}
              </p>

            </div>
          )}


          {/* Constraints */}

          {problem.constraints && (
            <div className="mt-7">

              <h2 className="font-bold">
                Constraints
              </h2>

              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {problem.constraints}
              </p>

            </div>
          )}


          {/* Sample */}

          <div className="mt-7 grid gap-5 md:grid-cols-2">

            <div>

              <h2 className="font-bold">
                Sample Input
              </h2>

              <pre className="mt-2 rounded-xl bg-slate-900 p-4 font-mono text-sm text-green-400">
                {problem.sampleInput}
              </pre>

            </div>


            <div>

              <h2 className="font-bold">
                Sample Output
              </h2>

              <pre className="mt-2 rounded-xl bg-slate-900 p-4 font-mono text-sm text-green-400">
                {problem.sampleOutput}
              </pre>

            </div>

          </div>


          {/* Solve */}

          <button onClick={() => navigate(`/problems/${problem._id}`)}
            className="mt-8 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Solve Problem
          </button>

        </div>

      </div>

    </div>
  );
};

export default TodayProblem;