import { CheckCircle, RotateCcw } from "lucide-react";

const CodeEditor = ({
  code,
  setCode,
  hasLoadedSubmission = false,
  isSolved = false,
  onResetCode,
}) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5 sm:py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-300">
            C Editor
          </span>

          {hasLoadedSubmission && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 text-[11px] sm:text-xs text-emerald-400 font-semibold">
              <CheckCircle size={12} />
              {isSolved ? "Solved Code Loaded" : "Submitted Code Loaded"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onResetCode && hasLoadedSubmission && (
            <button
              type="button"
              onClick={onResetCode}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] sm:text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Reset to starter C template"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">Reset Template</span>
            </button>
          )}

          <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400">
            C
          </span>
        </div>
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck="false"
        className="min-h-[280px] sm:min-h-[420px] w-full resize-none bg-slate-950 p-4 sm:p-5 font-mono text-sm leading-6 text-green-300 outline-none"
        placeholder="// Write your C code here..."
      />
    </div>
  );
};

export default CodeEditor;