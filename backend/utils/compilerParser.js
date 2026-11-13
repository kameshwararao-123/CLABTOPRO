/**
 * Structured GCC / Clang Compiler Diagnostic Parser
 * Extracts file name, line number, column number, severity, and message
 * without fabricating line numbers when none are emitted (e.g., linker errors).
 */

/**
 * Removes temporary execution directory prefixes (e.g., /tmp/clabto-exec-abc123/)
 * from compiler output so paths are clean and server internals are not leaked.
 *
 * @param {string} rawOutput
 * @returns {string}
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

/**
 * Parses a single GCC diagnostic header line.
 * Supports:
 * - file.c:8:5: error: message
 * - file.c:8: error: message
 * - file.c:8:5: fatal error: message
 * - file.c:8:5: warning: message
 * - file.c:8:5: note: message
 * - ld / collect2 linker errors (returns line: null)
 *
 * @param {string} line
 * @returns {Object|null}
 */
const parseDiagnosticLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Pattern 1: <file>:<line>:<col>: <severity>: <message>
  // Uses careful non-greedy file match that stops before :<digits>
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

  // Pattern 2: <file>:<line>: <severity>: <message> (no column number)
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

  // Pattern 3: General or linker error without source line (e.g. "ld: ... undefined reference to `foo'")
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

  // Pattern 4: Generic GCC / collect2 fatal message without line numbers
  const genericErrorMatch = trimmed.match(/^(?:gcc|cc|ld|collect2(?:\.exe)?):\s*(fatal error|error):\s*(.+)$/i);
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
 * Parses full GCC compiler output into structured diagnostic objects.
 * Attaches source context lines / caret notes cleanly without fabricating line numbers.
 *
 * @param {string} rawCompilerOutput
 * @returns {Array<Object>}
 */
export const parseGccDiagnostics = (rawCompilerOutput) => {
  const cleaned = sanitizeCompilerOutput(rawCompilerOutput);
  if (!cleaned) return [];

  const lines = cleaned.split(/\r?\n/);
  const diagnostics = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const parsed = parseDiagnosticLine(rawLine);
    if (!parsed) continue;

    // Skip noisy "collect2: error: ld returned 1 exit status" if we already captured a concrete linker error
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

  // If compiler output is non-empty but no structured line matched at all,
  // emit a single diagnostic with line: null (never fabricate a line number).
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
