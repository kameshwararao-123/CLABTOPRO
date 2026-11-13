/**
 * Frontend Compiler Diagnostic Parser & Monaco Marker Integration
 * Mirrors backend structured GCC diagnostic parsing so both live runs
 * and historical submission outputs produce accurate editor line markers.
 */

export const sanitizeCompilerOutput = (rawOutput) => {
  if (!rawOutput || typeof rawOutput !== "string") return "";

  return rawOutput
    .replace(/\/tmp\/clabto-exec-[^/\s:]+\//g, "")
    .replace(/[A-Za-z]:\\[^:\n]*\\clabto-exec-[^\\\s:]+\\/g, "")
    .trim();
};

const SEVERITY_MAP = {
  "fatal error": "error",
  error: "error",
  warning: "warning",
  note: "info",
};

const parseDiagnosticLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // <file>:<line>:<col>: <severity>: <message>
  const withColMatch = trimmed.match(
    /^(.+?):(\d+):(\d+):\s*(fatal error|error|warning|note):\s*(.+)$/i
  );
  if (withColMatch) {
    const [, file, lineNum, colNum, rawSeverity, message] = withColMatch;
    const parsedLine = Number.parseInt(lineNum, 10);
    const parsedCol = Number.parseInt(colNum, 10);
    const sevKey = rawSeverity.toLowerCase();

    return {
      file: file.split(/[\\/]/).pop() || "solution.c",
      line: Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null,
      column: Number.isFinite(parsedCol) && parsedCol > 0 ? parsedCol : 1,
      type: sevKey,
      severity: SEVERITY_MAP[sevKey] || "error",
      message: message.trim(),
      raw: trimmed,
    };
  }

  // <file>:<line>: <severity>: <message>
  const withoutColMatch = trimmed.match(
    /^(.+?):(\d+):\s*(fatal error|error|warning|note):\s*(.+)$/i
  );
  if (withoutColMatch) {
    const [, file, lineNum, rawSeverity, message] = withoutColMatch;
    const parsedLine = Number.parseInt(lineNum, 10);
    const sevKey = rawSeverity.toLowerCase();

    return {
      file: file.split(/[\\/]/).pop() || "solution.c",
      line: Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null,
      column: 1,
      type: sevKey,
      severity: SEVERITY_MAP[sevKey] || "error",
      message: message.trim(),
      raw: trimmed,
    };
  }

  // Linker undefined reference (no source line)
  const linkerUndefined = trimmed.match(/undefined reference to [`']([^'`]+)[`']/i);
  if (linkerUndefined) {
    return {
      file: "linker",
      line: null,
      column: null,
      type: "linker error",
      severity: "error",
      message: `Undefined reference to '${linkerUndefined[1]}'`,
      raw: trimmed,
    };
  }

  // Generic compiler/linker diagnostic without line number
  const genericErrorMatch = trimmed.match(
    /^(?:gcc|cc|ld|collect2(?:\.exe)?):\s*(fatal error|error):\s*(.+)$/i
  );
  if (genericErrorMatch) {
    return {
      file: "compiler",
      line: null,
      column: null,
      type: genericErrorMatch[1].toLowerCase(),
      severity: "error",
      message: genericErrorMatch[2].trim(),
      raw: trimmed,
    };
  }

  return null;
};

/**
 * Parses raw GCC compiler output into structured diagnostics.
 * Never fabricates line numbers when unavailable.
 */
export const parseCompilerDiagnostics = (rawCompilerOutput) => {
  const cleaned = sanitizeCompilerOutput(rawCompilerOutput);
  if (!cleaned) return [];

  const lines = cleaned.split(/\r?\n/);
  const diagnostics = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const parsed = parseDiagnosticLine(rawLine);
    if (!parsed) continue;

    if (
      parsed.raw.includes("ld returned") &&
      diagnostics.some((d) => d.type === "linker error")
    ) {
      continue;
    }

    const dedupeKey = `${parsed.file}|${parsed.line}|${parsed.column}|${parsed.type}|${parsed.message}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    diagnostics.push(parsed);
  }

  if (diagnostics.length === 0 && cleaned.length > 0) {
    const firstNonEmpty = lines.find((l) => l.trim().length > 0) || cleaned;
    diagnostics.push({
      file: "compiler",
      line: null,
      column: null,
      type: "error",
      severity: "error",
      message: firstNonEmpty.trim(),
      raw: cleaned,
    });
  }

  return diagnostics;
};

/**
 * Applies Monaco model markers and line highlight decorations for diagnostics
 * that have valid source line numbers.
 *
 * @param {Object} monaco
 * @param {Object} editor
 * @param {Array} diagnostics
 * @param {Array<string>} previousDecorations
 * @returns {Array<string>} New decoration IDs
 */
export const applyDiagnosticsToEditor = (
  monaco,
  editor,
  diagnostics = [],
  previousDecorations = []
) => {
  if (!monaco || !editor) return [];

  const model = editor.getModel();
  if (!model) return [];

  const lineCount = model.getLineCount();

  // Filter strictly to diagnostics with real line numbers inside the document bounds
  const locatedDiagnostics = (diagnostics || []).filter(
    (d) => Number.isInteger(d.line) && d.line >= 1 && d.line <= lineCount
  );

  // 1. Set Monaco problem markers (squiggles + hover tooltips)
  const markers = locatedDiagnostics.map((d) => {
    const lineLen = model.getLineMaxColumn(d.line);
    const startCol =
      Number.isInteger(d.column) && d.column >= 1 && d.column <= lineLen
        ? d.column
        : model.getLineFirstNonWhitespaceColumn(d.line) || 1;

    const severity =
      d.severity === "error"
        ? monaco.MarkerSeverity.Error
        : d.severity === "warning"
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Info;

    return {
      startLineNumber: d.line,
      startColumn: startCol,
      endLineNumber: d.line,
      endColumn: Math.max(startCol + 1, lineLen),
      message: `[GCC ${d.type || d.severity}] ${d.message}`,
      severity,
      source: "gcc",
    };
  });

  monaco.editor.setModelMarkers(model, "clabtopro-gcc", markers);

  // 2. Apply full-line highlight + gutter marker decorations
  // Group diagnostics per line so gutter hover tooltip lists all errors on that line
  const byLine = new Map();
  for (const d of locatedDiagnostics) {
    if (!byLine.has(d.line)) {
      byLine.set(d.line, []);
    }
    byLine.get(d.line).push(d);
  }

  const decorations = [];
  for (const [lineNum, items] of byLine.entries()) {
    const hasError = items.some((i) => i.severity === "error");
    const hoverLines = items.map(
      (i) => `**${(i.type || i.severity).toUpperCase()}** (Line ${i.line}${i.column ? `:${i.column}` : ""}): ${i.message}`
    );

    decorations.push({
      range: new monaco.Range(lineNum, 1, lineNum, 1),
      options: {
        isWholeLine: true,
        className: hasError ? "clab-error-line-highlight" : "clab-warning-line-highlight",
        glyphMarginClassName: hasError ? "clab-error-glyph" : "clab-warning-glyph",
        glyphMarginHoverMessage: hoverLines.map((value) => ({ value })),
        hoverMessage: hoverLines.map((value) => ({ value })),
        overviewRuler: {
          color: hasError ? "#ef4444" : "#f59e0b",
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    });
  }

  return editor.deltaDecorations(previousDecorations || [], decorations);
};

export const clearEditorDiagnostics = (monaco, editor, previousDecorations = []) => {
  if (!monaco || !editor) return [];
  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelMarkers(model, "clabtopro-gcc", []);
  }
  return editor.deltaDecorations(previousDecorations || [], []);
};
