import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Editor from "@monaco-editor/react";
import {
  CheckCircle,
  Cloud,
  CloudOff,
  History,
  Keyboard,
  Loader2,
  Moon,
  Play,
  RotateCcw,
  Save,
  Send,
  Sun,
  Wand2,
  AlertTriangle,
  X,
} from "lucide-react";

import { initMonacoC } from "../../utils/cLanguageSupport";
import { formatCCode } from "../../utils/cFormatter";
import {
  applyDiagnosticsToEditor,
  clearEditorDiagnostics,
} from "../../utils/compilerDiagnostics";

// Ensure Monaco local loader & C language intelligence initialize once
initMonacoC();

const THEME_STORAGE_KEY = "clab_editor_theme";

const KEYBOARD_SHORTCUTS = [
  { keys: "Ctrl + Enter", action: "Run code (Sample / Custom)" },
  { keys: "Ctrl + Shift + Enter", action: "Submit code for grading" },
  { keys: "Ctrl + S", action: "Save draft" },
  { keys: "Shift + Alt + F", action: "Format C code" },
  { keys: "Ctrl + /", action: "Toggle line comment" },
  { keys: "Ctrl + F", action: "Find in editor" },
  { keys: "Ctrl + H", action: "Find and replace" },
  { keys: "Alt + Click", action: "Add multiple cursors" },
];

const CodeEditor = forwardRef(
  (
    {
      code,
      setCode,
      onBlur,
      diagnostics = [],
      saveStatus = "idle",
      hasPendingOfflineSync = false,
      onManualSave,
      onRun,
      onSubmit,
      running = false,
      submitting = false,
      hasLoadedSubmission = false,
      isSolved = false,
      onResetCode,
      canRestorePrevious = false,
      onRestorePreviousCode,
      height = "460px",
    },
    ref
  ) => {
    const editorInstanceRef = useRef(null);
    const monacoRef = useRef(null);
    const decorationsRef = useRef([]);

    // Refs to keep Monaco keyboard commands bound to latest callbacks without re-registering
    const callbacksRef = useRef({
      onRun,
      onSubmit,
      onManualSave,
      onBlur,
      setCode,
    });

    useEffect(() => {
      callbacksRef.current = { onRun, onSubmit, onManualSave, onBlur, setCode };
    }, [onRun, onSubmit, onManualSave, onBlur, setCode]);

    const [theme, setTheme] = useState(() => {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        return saved === "vs" ? "vs" : "vs-dark";
      } catch {
        return "vs-dark";
      }
    });

    const [showShortcuts, setShowShortcuts] = useState(false);
    const [confirmResetOpen, setConfirmResetOpen] = useState(false);

    const toggleTheme = () => {
      setTheme((prev) => {
        const next = prev === "vs-dark" ? "vs" : "vs-dark";
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // Ignore storage error
        }
        return next;
      });
    };

    const handleFormat = () => {
      const editor = editorInstanceRef.current;
      if (editor) {
        const action = editor.getAction("editor.action.formatDocument");
        if (action) {
          action.run();
          editor.focus();
          return;
        }
      }
      const formatted = formatCCode(code || "", { indentSize: 4 });
      if (formatted && formatted !== code) {
        setCode(formatted);
      }
    };

    useImperativeHandle(ref, () => ({
      jumpToLine: (line, column = 1) => {
        const editor = editorInstanceRef.current;
        if (!editor || !line) return;
        const model = editor.getModel();
        const safeLine = model ? Math.min(Math.max(1, line), model.getLineCount()) : line;
        const safeCol = Math.max(1, column || 1);
        editor.revealLineInCenter(safeLine);
        editor.setPosition({ lineNumber: safeLine, column: safeCol });
        editor.focus();
      },
      formatCode: handleFormat,
      getCurrentCode: () => {
        return editorInstanceRef.current?.getValue() ?? code;
      },
      clearDiagnostics: () => {
        decorationsRef.current = clearEditorDiagnostics(
          monacoRef.current,
          editorInstanceRef.current,
          decorationsRef.current
        );
      },
      focus: () => editorInstanceRef.current?.focus(),
    }));

    const handleEditorMount = (editor, monaco) => {
      editorInstanceRef.current = editor;
      monacoRef.current = monaco;

      // Register problem-solving keyboard shortcuts cleanly inside Monaco
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        callbacksRef.current.onRun?.();
      });

      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => {
          callbacksRef.current.onSubmit?.();
        }
      );

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        callbacksRef.current.onManualSave?.();
      });

      editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
        () => {
          const action = editor.getAction("editor.action.formatDocument");
          action?.run();
        }
      );

      // Disable copy, cut, and paste keyboard shortcuts inside Monaco
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {});
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {});
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {});
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Insert, () => {});
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Insert, () => {});

      editor.onDidBlurEditorText(() => {
        callbacksRef.current.onBlur?.();
      });

      // Apply any initial diagnostics if loaded
      if (Array.isArray(diagnostics) && diagnostics.length > 0) {
        decorationsRef.current = applyDiagnosticsToEditor(
          monaco,
          editor,
          diagnostics,
          decorationsRef.current
        );
      }
    };

    // Sync compiler diagnostics -> Monaco markers & gutter decorations
    useEffect(() => {
      const monaco = monacoRef.current;
      const editor = editorInstanceRef.current;
      if (!monaco || !editor) return;

      if (Array.isArray(diagnostics) && diagnostics.length > 0) {
        decorationsRef.current = applyDiagnosticsToEditor(
          monaco,
          editor,
          diagnostics,
          decorationsRef.current
        );
      } else {
        decorationsRef.current = clearEditorDiagnostics(
          monaco,
          editor,
          decorationsRef.current
        );
      }
    }, [diagnostics]);

    // Global Ctrl+S capture & copy/cut/paste blocking inside editor wrapper
    const handleContainerKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "s") {
        e.preventDefault();
        onManualSave?.();
        return;
      }
      if (
        ((e.ctrlKey || e.metaKey) && (key === "c" || key === "x" || key === "v")) ||
        ((e.shiftKey || e.ctrlKey) && e.key === "Insert")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const blockClipboardEvent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const isDark = theme === "vs-dark";

    const renderDraftBadge = () => {
      if (saveStatus === "saving") {
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
              isDark
                ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                : "bg-indigo-50 text-indigo-700 border-indigo-200"
            }`}
          >
            <Loader2 size={11} className="animate-spin" />
            Saving...
          </span>
        );
      }
      if (saveStatus === "saved") {
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
              isDark
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            <Cloud size={11} />
            Saved
          </span>
        );
      }
      if (saveStatus === "failed") {
        return (
          <button
            type="button"
            onClick={() => onManualSave?.()}
            title="Offline backup preserved in browser. Click to retry sync."
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border transition ${
              isDark
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25"
                : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
            }`}
          >
            <CloudOff size={11} />
            {hasPendingOfflineSync ? "Save failed (Local backup)" : "Save failed"}
          </button>
        );
      }
      return null;
    };

    return (
      <div
        onKeyDown={handleContainerKeyDown}
        className={`relative flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-colors ${
          isDark
            ? "border-slate-800 bg-[#1e1e1e] text-slate-200"
            : "border-slate-200 bg-white text-slate-800"
        }`}
      >
        {/* Top Toolbar */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5 ${
            isDark
              ? "border-slate-800 bg-slate-900/95"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          {/* Left: Language + Status */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Programming Language"
              value="c"
              disabled
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold outline-none ${
                isDark
                  ? "border-slate-700 bg-slate-800 text-slate-100"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              <option value="c">C (GCC C11)</option>
            </select>

            {hasLoadedSubmission && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                  isDark
                    ? "bg-emerald-950/70 border-emerald-700/60 text-emerald-400"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }`}
              >
                <CheckCircle size={11} />
                {isSolved ? "Solved" : "Last Attempt"}
              </span>
            )}

            {renderDraftBadge()}
          </div>

          {/* Right: Editor Actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleFormat}
              title="Format Code (Shift + Alt + F)"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
              }`}
            >
              <Wand2 size={13} />
              <span className="hidden sm:inline">Format</span>
            </button>

            <button
              type="button"
              onClick={() => onManualSave?.()}
              title="Save Draft (Ctrl + S)"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
              }`}
            >
              <Save size={13} />
              <span className="hidden md:inline">Save</span>
            </button>

            {onRestorePreviousCode && (
              <button
                type="button"
                disabled={!canRestorePrevious}
                onClick={() => onRestorePreviousCode?.()}
                title={
                  canRestorePrevious
                    ? "Restore previous code"
                    : "No previous code available to restore"
                }
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  canRestorePrevious
                    ? isDark
                      ? "text-amber-300 hover:bg-amber-950/60 hover:text-amber-200"
                      : "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                    : isDark
                    ? "cursor-not-allowed text-slate-600"
                    : "cursor-not-allowed text-slate-300"
                }`}
              >
                <History size={13} />
                <span className="hidden sm:inline">Restore</span>
              </button>
            )}

            {onResetCode && (
              <button
                type="button"
                onClick={() => setConfirmResetOpen(true)}
                title="Reset Code to Starter Template"
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  isDark
                    ? "text-slate-300 hover:bg-rose-950/60 hover:text-rose-300"
                    : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                }`}
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
              className={`inline-flex items-center justify-center rounded-lg p-1.5 transition ${
                isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-amber-300"
                  : "text-slate-600 hover:bg-slate-200/70 hover:text-indigo-700"
              }`}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowShortcuts((prev) => !prev)}
                title="Keyboard Shortcuts"
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                  showShortcuts
                    ? "bg-indigo-600 text-white"
                    : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                }`}
              >
                <Keyboard size={14} />
              </button>

              {showShortcuts && (
                <div
                  className={`absolute right-0 top-9 z-30 w-72 rounded-xl border p-3 shadow-xl ${
                    isDark
                      ? "border-slate-700 bg-slate-900 text-slate-200"
                      : "border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between border-b border-slate-700/30 pb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Keyboard Shortcuts
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowShortcuts(false)}
                      className="rounded p-0.5 opacity-70 hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {KEYBOARD_SHORTCUTS.map((sc) => (
                      <div
                        key={sc.keys}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="opacity-80">{sc.action}</span>
                        <kbd
                          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            isDark
                              ? "bg-slate-800 text-indigo-300 border border-slate-700"
                              : "bg-slate-100 text-slate-700 border border-slate-300"
                          }`}
                        >
                          {sc.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reset Confirmation Bar (never wipes without explicit confirmation) */}
        {confirmResetOpen && (
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b px-4 py-2.5 text-xs ${
              isDark
                ? "border-rose-500/40 bg-rose-950/60 text-rose-200"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle size={15} className="shrink-0 text-rose-500" />
              <span>
                Reset code to starter template? Your current editor code and saved draft will be cleared.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  isDark
                    ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmResetOpen(false);
                  onResetCode?.();
                }}
                className="rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 transition"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        )}

        {/* Monaco Code Editor Surface */}
        <div
          style={{ height }}
          className="w-full min-h-[260px]"
          onCopyCapture={blockClipboardEvent}
          onCutCapture={blockClipboardEvent}
          onPasteCapture={blockClipboardEvent}
          onDropCapture={blockClipboardEvent}
          onContextMenuCapture={blockClipboardEvent}
        >
          <Editor
            height="100%"
            language="c"
            theme={theme}
            value={code}
            onChange={(value) => setCode(value ?? "")}
            onMount={handleEditorMount}
            loading={
              <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 size={16} className="animate-spin text-indigo-500" />
                <span>Loading C Editor...</span>
              </div>
            }
            options={{
              fontSize: 14,
              lineHeight: 22,
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
              lineNumbers: "on",
              glyphMargin: true,
              folding: true,
              showFoldingControls: "mouseover",
              autoIndent: "full",
              formatOnPaste: false,
              formatOnType: false,
              contextmenu: false,
              tabSize: 4,
              insertSpaces: true,
              detectIndentation: false,
              matchBrackets: "always",
              bracketPairColorization: { enabled: true },
              autoClosingBrackets: "always",
              autoClosingQuotes: "always",
              autoSurround: "languageDefined",
              multiCursorModifier: "alt",
              quickSuggestions: false,
              suggestOnTriggerCharacters: false,
              acceptSuggestionOnEnter: "off",
              tabCompletion: "off",
              snippetSuggestions: "none",
              wordBasedSuggestions: "off",
              parameterHints: { enabled: false },
              inlineSuggest: { enabled: false },
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              padding: { top: 12, bottom: 12 },
              fixedOverflowWidgets: true,
            }}
          />
        </div>

        {/* Bottom Action Bar (Run & Submit + Quick Shortcut Hint) */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-t px-3.5 py-2.5 ${
            isDark
              ? "border-slate-800 bg-slate-900/95"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="hidden sm:flex items-center gap-3 text-[11px] opacity-75">
            <span>
              <kbd className="font-mono font-semibold">Ctrl+Enter</kbd> Run
            </span>
            <span>
              <kbd className="font-mono font-semibold">Ctrl+Shift+Enter</kbd> Submit
            </span>
            <span>
              <kbd className="font-mono font-semibold">Shift+Alt+F</kbd> Format
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end">
            {onRun && (
              <button
                type="button"
                onClick={onRun}
                disabled={running || submitting || !code?.trim()}
                className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDark
                    ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
              >
                {running ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play size={14} className="text-emerald-500" />
                    Run Code
                  </>
                )}
              </button>
            )}

            {onSubmit && (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting || running || !code?.trim()}
                className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Judging...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    {hasLoadedSubmission ? "Re-submit" : "Submit Code"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

CodeEditor.displayName = "CodeEditor";

export default CodeEditor;
