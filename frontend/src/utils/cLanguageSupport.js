import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { formatCCode } from "./cFormatter";

let initialized = false;

const C_KEYWORDS = [
  { label: "int", detail: "Integer data type", insertText: "int " },
  { label: "float", detail: "Single-precision floating point", insertText: "float " },
  { label: "double", detail: "Double-precision floating point", insertText: "double " },
  { label: "char", detail: "Character data type", insertText: "char " },
  { label: "void", detail: "Empty/no return type", insertText: "void " },
  { label: "long", detail: "Long integer modifier", insertText: "long " },
  { label: "short", detail: "Short integer modifier", insertText: "short " },
  { label: "unsigned", detail: "Unsigned integer modifier", insertText: "unsigned " },
  { label: "signed", detail: "Signed integer modifier", insertText: "signed " },
  { label: "const", detail: "Constant qualifier", insertText: "const " },
  { label: "struct", detail: "Structure type definition", insertText: "struct " },
  { label: "typedef", detail: "Type alias declaration", insertText: "typedef " },
  { label: "sizeof", detail: "Size of type/expression in bytes", insertText: "sizeof($1)" },
  { label: "else", detail: "Conditional else branch", insertText: "else {\n\t$0\n}" },
  { label: "case", detail: "Switch case label", insertText: "case ${1:value}:\n\t$0\n\tbreak;" },
  { label: "default", detail: "Switch default branch", insertText: "default:\n\t$0\n\tbreak;" },
  { label: "break", detail: "Exit loop or switch", insertText: "break;" },
  { label: "continue", detail: "Skip to next loop iteration", insertText: "continue;" },
  { label: "return", detail: "Return from function", insertText: "return ${1:0};" },
];

const C_STD_FUNCTIONS = [
  // Standard I/O (stdio.h)
  {
    label: "printf",
    detail: "<stdio.h> Print formatted output",
    doc: 'Prints formatted output to stdout. Example: printf("%d\\n", x);',
    insertText: 'printf("$0");',
  },
  {
    label: "scanf",
    detail: "<stdio.h> Read formatted input",
    doc: 'Reads formatted input from stdin. Example: scanf("%d", &n);',
    insertText: 'scanf("${1:%d}", &${2:var});',
  },
  {
    label: "getchar",
    detail: "<stdio.h> Read a single character",
    doc: "Reads the next character from stdin and returns it as an int.",
    insertText: "getchar()",
  },
  {
    label: "putchar",
    detail: "<stdio.h> Write a single character",
    doc: "Writes a character to stdout.",
    insertText: "putchar(${1:ch});",
  },
  {
    label: "fgets",
    detail: "<stdio.h> Read a line safely",
    doc: "Reads at most n-1 characters into str from stream (e.g., stdin).",
    insertText: "fgets(${1:str}, sizeof(${1:str}), stdin);",
  },
  {
    label: "puts",
    detail: "<stdio.h> Print string with newline",
    doc: "Writes a string followed by a newline to stdout.",
    insertText: "puts(${1:str});",
  },

  // String functions (string.h)
  {
    label: "strlen",
    detail: "<string.h> Length of string",
    doc: "Returns the length of a null-terminated string (excluding '\\0').",
    insertText: "strlen(${1:str})",
  },
  {
    label: "strcpy",
    detail: "<string.h> Copy string",
    doc: "Copies source string into destination buffer.",
    insertText: "strcpy(${1:dest}, ${2:src});",
  },
  {
    label: "strcmp",
    detail: "<string.h> Compare two strings",
    doc: "Returns 0 if s1 and s2 are equal, <0 if s1 < s2, >0 if s1 > s2.",
    insertText: "strcmp(${1:s1}, ${2:s2})",
  },
  {
    label: "strcat",
    detail: "<string.h> Concatenate strings",
    doc: "Appends src string to the end of dest string.",
    insertText: "strcat(${1:dest}, ${2:src});",
  },

  // Math functions (math.h)
  {
    label: "sqrt",
    detail: "<math.h> Square root",
    doc: "Returns the non-negative square root of x as a double.",
    insertText: "sqrt(${1:x})",
  },
  {
    label: "pow",
    detail: "<math.h> Power (base^exp)",
    doc: "Returns base raised to the power of exponent as a double.",
    insertText: "pow(${1:base}, ${2:exp})",
  },
  {
    label: "abs",
    detail: "<stdlib.h> Absolute integer value",
    doc: "Returns the absolute value of integer x.",
    insertText: "abs(${1:x})",
  },
  {
    label: "fabs",
    detail: "<math.h> Absolute floating-point value",
    doc: "Returns the absolute value of double x.",
    insertText: "fabs(${1:x})",
  },
  {
    label: "ceil",
    detail: "<math.h> Round up",
    doc: "Returns the smallest integer value greater than or equal to x.",
    insertText: "ceil(${1:x})",
  },
  {
    label: "floor",
    detail: "<math.h> Round down",
    doc: "Returns the largest integer value less than or equal to x.",
    insertText: "floor(${1:x})",
  },

  // Standard library (stdlib.h)
  {
    label: "malloc",
    detail: "<stdlib.h> Allocate dynamic memory",
    doc: "Allocates size bytes of uninitialized storage.",
    insertText: "malloc(${1:n} * sizeof(${2:int}))",
  },
  {
    label: "calloc",
    detail: "<stdlib.h> Allocate zeroed memory",
    doc: "Allocates memory for an array of n elements and initializes to zero.",
    insertText: "calloc(${1:n}, sizeof(${2:int}))",
  },
  {
    label: "free",
    detail: "<stdlib.h> Free allocated memory",
    doc: "Deallocates a block previously allocated by malloc/calloc/realloc.",
    insertText: "free(${1:ptr});",
  },
];

const C_SNIPPETS = [
  {
    label: "main",
    detail: "Basic C main() function",
    doc: "Standard C entry point returning 0.",
    insertText: "int main() {\n\t$0\n\treturn 0;\n}",
  },
  {
    label: "for",
    detail: "For loop snippet",
    doc: "Standard indexed for loop from 0 to n-1.",
    insertText: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}",
  },
  {
    label: "if",
    detail: "If conditional block",
    doc: "Conditional if statement.",
    insertText: "if (${1:condition}) {\n\t$0\n}",
  },
  {
    label: "ifelse",
    detail: "If / Else conditional block",
    doc: "Conditional if-else statement.",
    insertText: "if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}",
  },
  {
    label: "while",
    detail: "While loop snippet",
    doc: "Pre-condition while loop.",
    insertText: "while (${1:condition}) {\n\t$0\n}",
  },
  {
    label: "do",
    detail: "Do-While loop snippet",
    doc: "Post-condition do-while loop.",
    insertText: "do {\n\t$0\n} while (${1:condition});",
  },
  {
    label: "switch",
    detail: "Switch-case block",
    doc: "Multi-branch switch statement.",
    insertText:
      "switch (${1:variable}) {\n\tcase ${2:1}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}",
  },
  {
    label: "include",
    detail: "#include <header.h>",
    doc: "Include a standard C header file.",
    insertText: "#include <${1|stdio.h,stdlib.h,string.h,math.h|}>",
  },
];

const C_HEADERS = [
  { label: "stdio.h", detail: "Standard Input / Output (printf, scanf)" },
  { label: "stdlib.h", detail: "Standard Library (malloc, abs, exit)" },
  { label: "string.h", detail: "String utilities (strlen, strcpy, strcmp)" },
  { label: "math.h", detail: "Math functions (sqrt, pow, fabs)" },
  { label: "ctype.h", detail: "Character classification (isalpha, isdigit)" },
  { label: "stdbool.h", detail: "Boolean type (bool, true, false)" },
  { label: "limits.h", detail: "Integer limits (INT_MAX, INT_MIN)" },
];

const RESERVED_SET = new Set([
  ...C_KEYWORDS.map((k) => k.label),
  ...C_STD_FUNCTIONS.map((f) => f.label),
  ...C_SNIPPETS.map((s) => s.label),
  ...C_HEADERS.map((h) => h.label),
]);

/**
 * Configures Monaco Editor locally (zero CDN dependency) with enhanced C11
 * indentation rules, intelligent autocomplete, and deterministic formatting.
 */
export const initMonacoC = () => {
  if (initialized) return;
  initialized = true;

  // Configure local Monaco workers for Vite
  if (typeof self !== "undefined") {
    self.MonacoEnvironment = {
      getWorker() {
        return new editorWorker();
      },
    };
  }

  loader.config({ monaco });

  // 1. Enhance C language configuration (auto-indent, brackets, folding, enter rules)
  monaco.languages.setLanguageConfiguration("c", {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: "(", close: ")" },
      { open: "'", close: "'", notIn: ["string", "comment"] },
      { open: '"', close: '"', notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern:
        /^((?!\/\/).)*(\{[^}"'`]*|\b(if|else|for|while|switch)\b\s*\([^)]*\)\s*|:\s*)$/,
      decreaseIndentPattern: /^\s*(\}|else\b|\bcase\b.*:|\bdefault\b\s*:)/,
    },
    onEnterRules: [
      // Pressing Enter between { and } indents cursor and places } on next line
      {
        beforeText: /^\s*.*\{\s*$/,
        afterText: /^\s*\}/,
        action: { indentAction: monaco.languages.IndentAction.IndentOutdent },
      },
      // Pressing Enter after opening { indents next line
      {
        beforeText: /^\s*.*\{\s*$/,
        action: { indentAction: monaco.languages.IndentAction.Indent },
      },
      // Pressing Enter inside block comment keeps leading *
      {
        beforeText: /^\s*\/\*\*(?!\/)([^*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: {
          indentAction: monaco.languages.IndentAction.IndentOutdent,
          appendText: " * ",
        },
      },
      {
        beforeText: /^\s*\*[^/]/,
        action: {
          indentAction: monaco.languages.IndentAction.None,
          appendText: "* ",
        },
      },
    ],
    folding: {
      markers: {
        start: /^\s*#pragma\s+region\b/,
        end: /^\s*#pragma\s+endregion\b/,
      },
    },
  });

  // 2. Register Beginner-Friendly C Completion Provider
  monaco.languages.registerCompletionItemProvider("c", {
    triggerCharacters: ["<", '"', ".", "#"],
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.slice(0, position.column - 1);

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Case A: Inside #include <...> or #include "..."
      const includeMatch = textBeforeCursor.match(/^\s*#\s*include\s*([<"])([A-Za-z0-9_.]*)$/);
      if (includeMatch) {
        const quote = includeMatch[1];
        const closeQuote = quote === "<" ? ">" : '"';
        const hasClosing = lineContent.slice(position.column - 1).startsWith(closeQuote);

        return {
          suggestions: C_HEADERS.map((hdr) => ({
            label: hdr.label,
            kind: monaco.languages.CompletionItemKind.File,
            detail: hdr.detail,
            insertText: hasClosing ? hdr.label : `${hdr.label}${closeQuote}`,
            range,
          })),
        };
      }

      // Case B: Typing #inc -> suggest #include <...>
      if (/^\s*#\s*[a-z]*$/i.test(textBeforeCursor)) {
        const hashIdx = textBeforeCursor.indexOf("#");
        const hashRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: hashIdx + 1,
          endColumn: position.column,
        };
        return {
          suggestions: C_HEADERS.slice(0, 4).map((hdr) => ({
            label: `#include <${hdr.label}>`,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: hdr.detail,
            insertText: `#include <${hdr.label}>`,
            range: hashRange,
          })),
        };
      }

      const suggestions = [];

      // Snippets (high priority when typing for, if, main, while, switch)
      for (const snip of C_SNIPPETS) {
        suggestions.push({
          label: snip.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snip.detail,
          documentation: snip.doc,
          insertText: snip.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `1_${snip.label}`,
          range,
        });
      }

      // Standard C Library functions
      for (const fn of C_STD_FUNCTIONS) {
        suggestions.push({
          label: fn.label,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: fn.detail,
          documentation: fn.doc,
          insertText: fn.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `2_${fn.label}`,
          range,
        });
      }

      // C Keywords
      for (const kw of C_KEYWORDS) {
        suggestions.push({
          label: kw.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: kw.detail,
          insertText: kw.insertText,
          insertTextRules: kw.insertText.includes("$")
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          sortText: `3_${kw.label}`,
          range,
        });
      }

      // Header names (for quick search even before <)
      for (const hdr of C_HEADERS) {
        suggestions.push({
          label: hdr.label,
          kind: monaco.languages.CompletionItemKind.Module,
          detail: hdr.detail,
          insertText: hdr.label,
          sortText: `4_${hdr.label}`,
          range,
        });
      }

      // Lightweight identifier scan from current document (variables/functions)
      const fullText = model.getValue();
      const identifiers = fullText.match(/\b[A-Za-z_][A-Za-z0-9_]{1,31}\b/g) || [];
      const seenVars = new Set();
      for (const id of identifiers) {
        if (id === word.word || RESERVED_SET.has(id) || seenVars.has(id)) continue;
        seenVars.add(id);
        suggestions.push({
          label: id,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: "Identifier in file",
          insertText: id,
          sortText: `5_${id}`,
          range,
        });
      }

      return { suggestions };
    },
  });

  // 3. Register Deterministic C Formatter (supports Shift+Alt+F and Format Document)
  monaco.languages.registerDocumentFormattingEditProvider("c", {
    provideDocumentFormattingEdits: (model, options) => {
      const formatted = formatCCode(model.getValue(), {
        indentSize: options?.tabSize || 4,
      });
      return [
        {
          range: model.getFullModelRange(),
          text: formatted,
        },
      ];
    },
  });
};
