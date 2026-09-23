import { CheckCircle } from "lucide-react";

const ProblemDescription = ({ problem }) => {
  return (
    <div className="space-y-7">

      <div>
        <h1 className="text-3xl font-bold text-slate-800">
          {problem.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {problem.isSolved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <CheckCircle size={13} />
              Solved
            </span>
          )}

          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-600">
            {problem.difficulty}
          </span>

          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
            {problem.topic?.name || problem.topic || "Basics"}
          </span>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-bold text-slate-800">
          Problem
        </h2>

        <p className="whitespace-pre-line leading-7 text-slate-600">
          {problem.description}
        </p>
      </section>

      {problem.inputFormat && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-slate-800">
            Input Format
          </h2>

          <p className="whitespace-pre-line text-slate-600">
            {problem.inputFormat}
          </p>
        </section>
      )}

      {problem.outputFormat && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-slate-800">
            Output Format
          </h2>

          <p className="whitespace-pre-line text-slate-600">
            {problem.outputFormat}
          </p>
        </section>
      )}

      {problem.constraints && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-slate-800">
            Constraints
          </h2>

          <p className="whitespace-pre-line text-slate-600">
            {problem.constraints}
          </p>
        </section>
      )}

      {problem.sampleInput && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-slate-800">
            Sample Input
          </h2>

          <pre className="rounded-xl bg-slate-900 p-4 font-mono text-sm text-green-400 overflow-x-auto">
            {problem.sampleInput}
          </pre>
        </section>
      )}

      {problem.sampleOutput && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-slate-800">
            Sample Output
          </h2>

          <pre className="rounded-xl bg-slate-900 p-4 font-mono text-sm text-green-400 overflow-x-auto">
            {problem.sampleOutput}
          </pre>
        </section>
      )}

    </div>
  );
};

export default ProblemDescription;