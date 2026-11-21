/**
 * Universal text normalization and HTML entity decoding utilities for ClabToPro.
 *
 * Ensures:
 * 1. Safe, single-pass HTML entity decoding (e.g. &#x20;, &nbsp; -> ' ').
 * 2. Complete preservation of \n newlines and leading spaces for pattern/pyramid/matrix alignment.
 * 3. Normalization of redundant sample input/output labels (e.g. "Input: Input: 4" -> "4").
 * 4. Exclusion of page headers, footers, and page numbers from question content and sample test cases.
 */

/**
 * Safely decodes standard and hexadecimal HTML entities into their character equivalents.
 * Avoids double-decoding or using unsafe DOM injection.
 */
export const decodeHtmlEntities = (str = "") => {
  if (typeof str !== "string") return str;

  let decoded = str
    // Space and non-breaking space entities
    .replace(/&#x20;/gi, " ")
    .replace(/&#32;/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#xa0;/gi, " ")
    // Common HTML special characters
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

  // Generalized decimal and hex numeric entities (e.g. &#65; -> 'A', &#x41; -> 'A')
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    const code = parseInt(dec, 10);
    return code >= 32 && code <= 126 ? String.fromCharCode(code) : match;
  });
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
    const code = parseInt(hex, 16);
    return code >= 32 && code <= 126 ? String.fromCharCode(code) : match;
  });

  return decoded;
};

/**
 * Strips page headers, page footers, document titles, and standalone page numbers
 * that may have leaked into extracted sample outputs or question statements.
 */
export const stripResidualHeadersAndFooters = (str = "") => {
  if (!str && str !== 0) return "";
  let text = String(str).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 1. Remove whole-line footers and headers (e.g. "ClabToPro – C Programming Extraction Test Paper Page 7", "-- 6 of 7 --", "Page 5")
  text = text.replace(
    /^[ \t]*(?:ClabToPro\s*[-–—|•].*|page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|--\s*\d+(?:\s+of\s+\d+)?\s*--|\d+\s+of\s+\d+)[ \t]*$/gim,
    ""
  );

  // 2. Remove inline trailer footers if attached to the end of a line or paragraph
  text = text.replace(
    /(?:[ \t]+ClabToPro\s*[-–—|•].*Page\s*\d+|[ \t]+--\s*\d+\s+of\s+\d+\s*--|[ \t]+Page\s+\d+\b).*$/gim,
    ""
  );

  return text;
};

/**
 * Dedents common leading whitespace across all non-blank lines in a block
 * while preserving internal spaces (e.g. hollow squares) and centered relative indentation (e.g. pyramids).
 */
export const dedentCommonWhitespace = (text = "") => {
  if (!text) return "";
  const lines = text.split("\n");
  const nonBlank = lines.filter((l) => l.trim().length > 0);
  if (nonBlank.length === 0) return text;

  // Find minimum leading horizontal whitespace count
  const minIndent = Math.min(
    ...nonBlank.map((l) => {
      const match = l.match(/^[ \t]*/);
      return match ? match[0].length : 0;
    })
  );

  if (minIndent === 0) return text;
  return lines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l)).join("\n");
};

/**
 * Normalizes sample test case input or expected output:
 * - Decodes HTML entities safely
 * - Standardizes line breaks (\r\n -> \n)
 * - Strips residual document headers, footers, and page numbers
 * - Strips redundant leading labels (e.g. "Sample Input:", "Input:", "Sample Output:", "Output:") without eating newlines
 * - Preserves ALL internal newlines, indentation, and alignment spaces for patterns and matrices
 */
export const normalizeSampleContent = (raw = "", type = "output") => {
  if (!raw && raw !== 0) return "";
  let text = decodeHtmlEntities(String(raw));

  // Standardize CRLF and CR to LF
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strip any residual header/footer lines or page numbers
  text = stripResidualHeadersAndFooters(text);

  // Regex to detect and strip redundant leading labels on line 1 without eating next line's leading spaces
  const labelRegex =
    type === "input"
      ? /^[ \t]*(?:sample\s+input|example\s+input|test\s+input|input)[ \t]*[:\-]?[ \t]*(?:\r?\n)?/i
      : /^[ \t]*(?:sample\s+output|example\s+output|test\s+output|expected\s+output|output)[ \t]*[:\-]?[ \t]*(?:\r?\n)?/i;

  // Loop to remove repeated/nested labels (e.g. "Input: Input: 4" -> "4")
  while (labelRegex.test(text)) {
    text = text.replace(labelRegex, "");
  }

  // Remove leading empty lines
  text = text.replace(/^\n+/, "");
  // Remove trailing blank lines/whitespace
  text = text.replace(/\s+$/, "");

  // Dedent common margin whitespace without flattening or altering relative spaces
  text = dedentCommonWhitespace(text);

  return text;
};

/**
 * Cleans problem statements while preserving multiline formatting, indentation,
 * and stripping any page header/footer leakage.
 */
export const cleanProblemStatement = (raw = "") => {
  if (!raw && raw !== 0) return "";
  let text = decodeHtmlEntities(String(raw));
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = stripResidualHeadersAndFooters(text);
  return text.trim();
};
