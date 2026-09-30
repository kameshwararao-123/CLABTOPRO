import { useState } from "react";
import { CheckCircle, RotateCcw, ShieldAlert, AlertCircle } from "lucide-react";

const CodeEditor = ({
  code,
  setCode,
  hasLoadedSubmission = false,
  isSolved = false,
  onResetCode,
}) => {
  const [warning, setWarning] = useState("");

  const triggerWarning = (actionText) => {
    setWarning(`${actionText} is disabled. Please type your code manually.`);
    setTimeout(() => {
      setWarning("Copy-pasting is not allowed. Please type your code manually.");
    }, 3000);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    triggerWarning("Pasting");
  };

  const handleCopy = (e) => {
    e.preventDefault();
    triggerWarning("Copying");
  };

  const handleCut = (e) => {
    e.preventDefault();
    triggerWarning("Cutting");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    triggerWarning("Drag-and-drop");
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      triggerWarning("Pasting (Ctrl+V)");
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      triggerWarning("Copying (Ctrl+C)");
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      triggerWarning("Cutting (Ctrl+X)");
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
      {/* Editor Top Bar */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5 sm:py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-300">
            C Editor
          </span>

          {hasLoadedSubmission ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 text-[11px] sm:text-xs text-emerald-400 font-semibold">
              <CheckCircle size={12} />
              {isSolved ? "Solved Code Loaded" : "Submitted Code Loaded"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] sm:text-xs text-slate-400 font-medium">
              <ShieldAlert size={12} className="text-amber-400" />
              Copy/Paste Disabled
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

          <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 font-semibold">
            C
          </span>
        </div>
      </div>

      {/* Warning banner when user tries to copy/paste */}
      {warning && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300 transition animate-in fade-in">
          <AlertCircle size={14} className="shrink-0 text-amber-400" />
          <span>{warning}</span>
        </div>
      )}

      {/* Code Textarea with copy-paste restrictions */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onCut={handleCut}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        spellCheck="false"
        className="min-h-[280px] sm:min-h-[420px] w-full resize-none bg-slate-950 p-4 sm:p-5 font-mono text-sm leading-6 text-green-300 outline-none"
        placeholder="// Write your C code here (typing required)..."
      />
    </div>
  );
};

export default CodeEditor;