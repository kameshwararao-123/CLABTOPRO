const CodeEditor = ({ code, setCode }) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">

      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <span className="text-sm font-medium text-slate-300">
          C Editor
        </span>

        <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400">
          C
        </span>
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck="false"
        className="min-h-[450px] w-full resize-none bg-slate-950 p-5 font-mono text-sm leading-6 text-green-300 outline-none"
        placeholder="// Write your C code here..."
      />

    </div>
  );
};

export default CodeEditor;