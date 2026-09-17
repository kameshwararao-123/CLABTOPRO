const ProblemDescription = ({ problem }) => {
  return (
    <div className="space-y-7">

      <div>
        <h1 className="text-3xl font-bold text-slate-800">
          {problem.title}
        </h1>

        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-600">
            {problem.difficulty}
          </span>

          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
            {problem.topic?.name}
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

      {problem.testCases?.filter((test) => test.isSample).length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-800">
            Examples
          </h2>

          <div className="space-y-3">
            {problem.testCases
              .filter((test) => test.isSample)
              .map((test, index) => (
                <div
                  key={index}
                  className="rounded-xl bg-slate-900 p-4 font-mono text-sm text-slate-200"
                >
                  <p>
                    Input:
                  </p>

                  <pre className="mb-3 mt-1">
                    {test.input}
                  </pre>

                  <p>
                    Output:
                  </p>

                  <pre className="mt-1">
                    {test.output}
                  </pre>
                </div>
              ))}
          </div>
        </section>
      )}

    </div>
  );
};

export default ProblemDescription;