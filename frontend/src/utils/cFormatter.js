/**
 * Lightweight, deterministic token-aware C11 Code Formatter.
 * Preserves strings, character literals, comments, preprocessor directives,
 * and program semantics while fixing indentation, braces, and spacing.
 */

const TYPE_KEYWORDS = new Set([
  "void",
  "char",
  "short",
  "int",
  "long",
  "float",
  "double",
  "signed",
  "unsigned",
  "const",
  "volatile",
  "static",
  "extern",
  "register",
  "auto",
  "struct",
  "union",
  "enum",
  "typedef",
  "bool",
  "_Bool",
  "size_t",
  "ssize_t",
  "FILE",
  "int8_t",
  "int16_t",
  "int32_t",
  "int64_t",
  "uint8_t",
  "uint16_t",
  "uint32_t",
  "uint64_t",
]);

const CONTROL_KEYWORDS_WITH_PAREN = new Set(["if", "for", "while", "switch"]);

const MULTI_CHAR_OPS = [
  "<<=",
  ">>=",
  "...",
  "->",
  "++",
  "--",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "<<",
  ">>",
];

const BINARY_OPS = new Set([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "<<=",
  ">>=",
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "&&",
  "||",
  "<<",
  ">>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "^",
  "?",
]);

/**
 * Tokenizes C source losslessly into structured tokens.
 */
export const tokenizeC = (source) => {
  const tokens = [];
  const len = source.length;
  let i = 0;

  while (i < len) {
    const ch = source[i];

    // Newlines
    if (ch === "\r" || ch === "\n") {
      let count = 0;
      while (i < len && (source[i] === "\r" || source[i] === "\n" || source[i] === " " || source[i] === "\t")) {
        if (source[i] === "\n") count++;
        else if (source[i] === "\r" && source[i + 1] !== "\n") count++;
        i++;
      }
      if (count > 0) {
        tokens.push({ type: "NEWLINE", value: "\n".repeat(count), count });
      }
      continue;
    }

    // Horizontal whitespace
    if (ch === " " || ch === "\t") {
      while (i < len && (source[i] === " " || source[i] === "\t")) i++;
      tokens.push({ type: "SPACE", value: " " });
      continue;
    }

    // Preprocessor directive (# at line start or first non-space on line)
    if (ch === "#") {
      const prev = tokens[tokens.length - 1];
      const atLineStart = !prev || prev.type === "NEWLINE" || (prev.type === "SPACE" && (!tokens[tokens.length - 2] || tokens[tokens.length - 2].type === "NEWLINE"));
      if (atLineStart) {
        let j = i;
        while (j < len) {
          if (source[j] === "\\" && source[j + 1] === "\n") {
            j += 2;
            continue;
          }
          if (source[j] === "\\" && source[j + 1] === "\r" && source[j + 2] === "\n") {
            j += 3;
            continue;
          }
          if (source[j] === "\n" || source[j] === "\r") break;
          j++;
        }
        tokens.push({ type: "PREPROC", value: source.slice(i, j).trim() });
        i = j;
        continue;
      }
    }

    // Single-line comment
    if (ch === "/" && source[i + 1] === "/") {
      let j = i + 2;
      while (j < len && source[j] !== "\n" && source[j] !== "\r") j++;
      tokens.push({ type: "LINE_COMMENT", value: source.slice(i, j).trimEnd() });
      i = j;
      continue;
    }

    // Multi-line block comment
    if (ch === "/" && source[i + 1] === "*") {
      let j = i + 2;
      while (j < len && !(source[j] === "*" && source[j + 1] === "/")) j++;
      j = Math.min(len, j + 2);
      tokens.push({ type: "BLOCK_COMMENT", value: source.slice(i, j) });
      i = j;
      continue;
    }

    // String literal
    if (ch === '"') {
      let j = i + 1;
      while (j < len) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: "STRING", value: source.slice(i, j) });
      i = j;
      continue;
    }

    // Character literal
    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: "CHAR", value: source.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers (int, hex, float, scientific)
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
      let j = i;
      while (j < len && /[0-9a-zA-Z_.]/.test(source[j])) {
        if ((source[j] === "e" || source[j] === "E") && (source[j + 1] === "+" || source[j + 1] === "-")) {
          j += 2;
          continue;
        }
        j++;
      }
      tokens.push({ type: "NUMBER", value: source.slice(i, j) });
      i = j;
      continue;
    }

    // Identifiers / Keywords
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(source[j])) j++;
      tokens.push({ type: "WORD", value: source.slice(i, j) });
      i = j;
      continue;
    }

    // Multi-char operators
    let matchedOp = null;
    for (const op of MULTI_CHAR_OPS) {
      if (source.startsWith(op, i)) {
        matchedOp = op;
        break;
      }
    }
    if (matchedOp) {
      tokens.push({ type: "OP", value: matchedOp });
      i += matchedOp.length;
      continue;
    }

    // Single-char punctuation / operators
    tokens.push({ type: "OP", value: ch });
    i++;
  }

  return tokens;
};

const isValueToken = (tok) =>
  tok &&
  (tok.type === "WORD" ||
    tok.type === "NUMBER" ||
    tok.type === "STRING" ||
    tok.type === "CHAR" ||
    (tok.type === "OP" && (tok.value === ")" || tok.value === "]")));

/**
 * Formats C source code consistently with 4-space indentation, clean K&R braces,
 * operator spacing, and preserved comments/strings/preprocessor directives.
 *
 * @param {string} source
 * @param {Object} [options]
 * @param {number} [options.indentSize=4]
 * @returns {string}
 */
export const formatCCode = (source, { indentSize = 4 } = {}) => {
  if (typeof source !== "string") return "";
  if (!source.trim()) return source;

  const rawTokens = tokenizeC(source);
  // Strip whitespace/newline tokens into structured array keeping blank-line hints
  const tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (t.type === "SPACE") continue;
    if (t.type === "NEWLINE") {
      if (t.count >= 2 && tokens.length > 0) {
        tokens[tokens.length - 1].hadBlankLineAfter = true;
      }
      if (tokens.length > 0) {
        tokens[tokens.length - 1].hadNewlineAfter = true;
      }
      continue;
    }
    tokens.push({ ...t });
  }

  if (tokens.length === 0) return "";

  const indentUnit = " ".repeat(indentSize);
  const lines = [];
  let currentLine = "";
  let indentLevel = 0;
  let parenDepth = 0;
  let inSwitchCaseBody = false;

  // Stack tracking whether each `{` is a code block or an inline array/struct initializer
  const braceStack = [];

  const getIndentStr = (level = indentLevel) => indentUnit.repeat(Math.max(0, level));

  const pushLine = (extraBlank = false) => {
    const trimmedRight = currentLine.replace(/\s+$/, "");
    if (trimmedRight.length > 0) {
      lines.push(trimmedRight);
      if (extraBlank && lines[lines.length - 1] !== "") {
        lines.push("");
      }
    } else if (extraBlank && lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    currentLine = "";
  };

  const ensureIndent = (overrideLevel = null) => {
    if (currentLine.length === 0) {
      const lvl = overrideLevel !== null ? overrideLevel : indentLevel;
      currentLine = getIndentStr(lvl);
    }
  };

  const appendText = (text, overrideLevel = null) => {
    ensureIndent(overrideLevel);
    currentLine += text;
  };

  const ensureSpace = () => {
    if (currentLine.length > 0 && !currentLine.endsWith(" ") && !currentLine.endsWith("\t")) {
      currentLine += " ";
    }
  };

  const findPrevSignificant = (idx) => {
    for (let k = idx - 1; k >= 0; k--) {
      if (tokens[k].type !== "LINE_COMMENT" && tokens[k].type !== "BLOCK_COMMENT") {
        return tokens[k];
      }
    }
    return null;
  };

  const findNextSignificant = (idx) => {
    for (let k = idx + 1; k < tokens.length; k++) {
      if (tokens[k].type !== "LINE_COMMENT" && tokens[k].type !== "BLOCK_COMMENT") {
        return tokens[k];
      }
    }
    return null;
  };

  // Detect whether a `{` starts an initializer list (e.g. `int arr[] = {1, 2};`)
  const isInitializerOpenBrace = (idx) => {
    const prev = findPrevSignificant(idx);
    if (!prev) return false;
    if (prev.type === "OP" && (prev.value === "=" || prev.value === "," || prev.value === "[" || prev.value === "{")) {
      return true;
    }
    // Check if inside an existing initializer
    if (braceStack.length > 0 && braceStack[braceStack.length - 1] === "initializer") {
      return true;
    }
    return false;
  };

  let prevSig = null;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const nextTok = tokens[i + 1] || null;
    const nextSig = findNextSignificant(i);

    // 1. Preprocessor directives (#include, #define, etc.)
    if (tok.type === "PREPROC") {
      if (currentLine.trim().length > 0) pushLine();
      // Keep preprocessor at column 0
      lines.push(tok.value);
      // Add blank line after preprocessor block when transitioning to C code
      if (nextTok && nextTok.type !== "PREPROC") {
        lines.push("");
      }
      prevSig = tok;
      continue;
    }

    // 2. Comments
    if (tok.type === "LINE_COMMENT") {
      if (currentLine.trim().length > 0) {
        ensureSpace();
        appendText(tok.value);
        pushLine(Boolean(tok.hadBlankLineAfter));
      } else {
        appendText(tok.value);
        pushLine(Boolean(tok.hadBlankLineAfter));
      }
      continue;
    }

    if (tok.type === "BLOCK_COMMENT") {
      if (currentLine.trim().length > 0) {
        ensureSpace();
        appendText(tok.value);
        if (tok.hadNewlineAfter) {
          pushLine(Boolean(tok.hadBlankLineAfter));
        }
      } else {
        appendText(tok.value);
        if (tok.hadNewlineAfter || tok.value.includes("\n")) {
          pushLine(Boolean(tok.hadBlankLineAfter));
        }
      }
      continue;
    }

    // Track parentheses depth
    if (tok.type === "OP" && tok.value === "(") {
      parenDepth++;
    } else if (tok.type === "OP" && tok.value === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }

    // 3. Open Brace `{`
    if (tok.type === "OP" && tok.value === "{") {
      const isInit = isInitializerOpenBrace(i);
      if (isInit) {
        braceStack.push("initializer");
        if (currentLine.trim().length > 0) ensureSpace();
        appendText("{");
        // Check if multiline initializer or single-line
        if (tok.hadNewlineAfter) {
          pushLine();
          indentLevel++;
        }
      } else {
        braceStack.push("block");
        if (currentLine.trim().length > 0) {
          ensureSpace();
          appendText("{");
        } else {
          // If user had `{` on new line, attach K&R style if previous line exists and wasn't a brace/comment
          const lastIdx = lines.length - 1;
          if (
            lastIdx >= 0 &&
            lines[lastIdx] !== "" &&
            !lines[lastIdx].trimStart().startsWith("#") &&
            !lines[lastIdx].trimStart().startsWith("//") &&
            !lines[lastIdx].endsWith("*/") &&
            !lines[lastIdx].endsWith(";") &&
            !lines[lastIdx].endsWith("{") &&
            !lines[lastIdx].endsWith("}")
          ) {
            lines[lastIdx] = `${lines[lastIdx]} {`;
          } else {
            appendText("{");
          }
        }
        // Only emit newline if next token isn't an inline comment on same line
        if (nextTok && nextTok.type === "LINE_COMMENT" && !tok.hadNewlineAfter) {
          // wait for comment
        } else {
          pushLine();
        }
        indentLevel++;
      }
      prevSig = tok;
      continue;
    }

    // 4. Close Brace `}`
    if (tok.type === "OP" && tok.value === "}") {
      const braceKind = braceStack.pop() || "block";

      if (braceKind === "initializer") {
        if (currentLine.trim().length === 0) {
          indentLevel = Math.max(0, indentLevel - 1);
          appendText("}");
        } else {
          // Stay inline if it started inline
          if (tok.hadNewlineAfter && lines[lines.length - 1]?.includes("{") && !currentLine.includes("{")) {
            pushLine();
            indentLevel = Math.max(0, indentLevel - 1);
            appendText("}");
          } else {
            if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
            appendText("}");
          }
        }
        prevSig = tok;
        continue;
      }

      if (inSwitchCaseBody) {
        indentLevel = Math.max(0, indentLevel - 1);
        inSwitchCaseBody = false;
      }

      if (currentLine.trim().length > 0) pushLine();
      indentLevel = Math.max(0, indentLevel - 1);
      appendText("}");

      const isFollowedByElseOrWhile =
        nextSig &&
        ((nextSig.type === "WORD" && (nextSig.value === "else" || nextSig.value === "while")) ||
          (nextSig.type === "OP" && (nextSig.value === ";" || nextSig.value === ",")));

      if (isFollowedByElseOrWhile) {
        if (nextSig.value === "else" || nextSig.value === "while") {
          ensureSpace();
        }
      } else if (nextTok && nextTok.type === "LINE_COMMENT" && !tok.hadNewlineAfter) {
        // Let inline comment append
      } else {
        const shouldBlank =
          Boolean(tok.hadBlankLineAfter) ||
          (nextSig && nextSig.value !== "}" && (indentLevel === 0 || nextSig.value === "return"));
        pushLine(shouldBlank);
      }

      prevSig = tok;
      continue;
    }

    // 5. Semicolon `;`
    if (tok.type === "OP" && tok.value === ";") {
      if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
      appendText(";");

      if (parenDepth === 0) {
        if (nextTok && nextTok.type === "LINE_COMMENT" && !tok.hadNewlineAfter) {
          // inline comment will pushLine
        } else {
          const isBeforeControlBlockOrReturn =
            nextSig &&
            nextSig.type === "WORD" &&
            (CONTROL_KEYWORDS_WITH_PAREN.has(nextSig.value) || nextSig.value === "do" || nextSig.value === "return");
          const shouldBlank =
            Boolean(tok.hadBlankLineAfter) ||
            (isBeforeControlBlockOrReturn && indentLevel > 0);
          pushLine(shouldBlank);
        }
      } else {
        ensureSpace();
      }
      prevSig = tok;
      continue;
    }

    // 6. Comma `,`
    if (tok.type === "OP" && tok.value === ",") {
      if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
      appendText(",");
      if (braceStack[braceStack.length - 1] === "initializer" && tok.hadNewlineAfter) {
        pushLine();
      } else {
        ensureSpace();
      }
      prevSig = tok;
      continue;
    }

    // 7. Colon `:` (case / default / goto labels vs ternary `?:`)
    if (tok.type === "OP" && tok.value === ":") {
      // Check if ternary (rough heuristic: inside parens or after assignment/expression without case/default)
      const trimmedLine = currentLine.trim();
      const isCaseOrDefault = /^(case\b|default\b)/.test(trimmedLine);

      if (isCaseOrDefault) {
        if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
        appendText(":");
        pushLine();
        if (!inSwitchCaseBody) {
          indentLevel++;
          inSwitchCaseBody = true;
        }
      } else {
        ensureSpace();
        appendText(": ");
      }
      prevSig = tok;
      continue;
    }

    // 8. `case` / `default` outdent if already inside previous case body
    if (tok.type === "WORD" && (tok.value === "case" || tok.value === "default")) {
      if (currentLine.trim().length > 0) pushLine();
      if (inSwitchCaseBody) {
        indentLevel = Math.max(0, indentLevel - 1);
        inSwitchCaseBody = false;
      }
      appendText(tok.value);
      if (tok.value === "case") ensureSpace();
      prevSig = tok;
      continue;
    }

    // 9. Opening/closing parentheses and brackets
    if (tok.type === "OP" && tok.value === "(") {
      if (
        prevSig &&
        prevSig.type === "WORD" &&
        (CONTROL_KEYWORDS_WITH_PAREN.has(prevSig.value) || prevSig.value === "return" || prevSig.value === "else")
      ) {
        ensureSpace();
      } else if (prevSig && prevSig.type === "OP" && BINARY_OPS.has(prevSig.value)) {
        ensureSpace();
      } else if (prevSig && prevSig.type === "WORD" && !CONTROL_KEYWORDS_WITH_PAREN.has(prevSig.value)) {
        // Function call / declaration: no space before `(`
        if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
      }
      appendText("(");
      prevSig = tok;
      continue;
    }

    if (tok.type === "OP" && tok.value === ")") {
      if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
      appendText(")");
      prevSig = tok;
      continue;
    }

    if (tok.type === "OP" && (tok.value === "[" || tok.value === "]")) {
      if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
      appendText(tok.value);
      prevSig = tok;
      continue;
    }

    // 10. Member access `.` and `->`
    if (tok.type === "OP" && (tok.value === "." || tok.value === "->")) {
      if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
      appendText(tok.value);
      prevSig = tok;
      continue;
    }

    // 11. Increment / Decrement `++`, `--`, unary `!`, `~`
    if (tok.type === "OP" && (tok.value === "++" || tok.value === "--")) {
      if (isValueToken(prevSig)) {
        if (currentLine.endsWith(" ")) currentLine = currentLine.slice(0, -1);
      }
      appendText(tok.value);
      prevSig = tok;
      continue;
    }

    if (tok.type === "OP" && (tok.value === "!" || tok.value === "~")) {
      if (prevSig && (prevSig.type === "WORD" || (prevSig.type === "OP" && BINARY_OPS.has(prevSig.value)))) {
        ensureSpace();
      }
      appendText(tok.value);
      prevSig = tok;
      continue;
    }

    // 12. Pointer/Multiplication `*`, Address-of/Bitwise `&`, Unary/Binary `+`, `-`
    if (tok.type === "OP" && (tok.value === "*" || tok.value === "&" || tok.value === "+" || tok.value === "-")) {
      const val = tok.value;

      if (val === "*") {
        const isAfterType =
          prevSig &&
          ((prevSig.type === "WORD" && TYPE_KEYWORDS.has(prevSig.value)) ||
            (prevSig.type === "OP" && prevSig.value === "*"));
        const isBinaryMul =
          isValueToken(prevSig) &&
          !(prevSig.type === "WORD" && TYPE_KEYWORDS.has(prevSig.value));

        if (isAfterType) {
          ensureSpace();
          appendText("*");
          // If followed by `)` (e.g., `(int *)`), keep tight; if identifier `int *p`, no space after `*`
        } else if (isBinaryMul) {
          ensureSpace();
          appendText("* ");
        } else {
          // Unary dereference `*ptr`
          if (prevSig && prevSig.type === "WORD") ensureSpace();
          appendText("*");
        }
        prevSig = tok;
        continue;
      }

      if (val === "&") {
        const isBinaryAnd =
          isValueToken(prevSig) &&
          !(prevSig.type === "WORD" && TYPE_KEYWORDS.has(prevSig.value));
        if (isBinaryAnd) {
          ensureSpace();
          appendText("& ");
        } else {
          if (prevSig && prevSig.type === "WORD") ensureSpace();
          appendText("&");
        }
        prevSig = tok;
        continue;
      }

      // `+` or `-`
      const isBinaryAddSub = isValueToken(prevSig) && !(prevSig.type === "WORD" && prevSig.value === "return");
      if (isBinaryAddSub) {
        ensureSpace();
        appendText(`${val} `);
      } else {
        if (prevSig && prevSig.type === "WORD") ensureSpace();
        appendText(val);
      }
      prevSig = tok;
      continue;
    }

    // 13. Other Binary Operators
    if (tok.type === "OP" && BINARY_OPS.has(tok.value)) {
      ensureSpace();
      appendText(`${tok.value} `);
      prevSig = tok;
      continue;
    }

    // 14. Words, Numbers, Strings, Chars
    if (
      prevSig &&
      ((prevSig.type === "WORD") ||
        (prevSig.type === "NUMBER") ||
        (prevSig.type === "STRING") ||
        (prevSig.type === "CHAR") ||
        (prevSig.type === "OP" && prevSig.value === ")"))
    ) {
      // Avoid space right after unary `*`, `&`, `!`, `~`, `++`, `--`
      const noSpaceAfter = new Set(["(", "[", ".", "->", "!", "~", "++", "--"]);
      if (!noSpaceAfter.has(prevSig.value)) {
        ensureSpace();
      }
    }

    appendText(tok.value);
    prevSig = tok;
  }

  pushLine();

  // Remove any trailing blank lines and normalize trailing newline
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
};
