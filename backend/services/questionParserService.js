import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { createRequire } from "module";
import {
  decodeHtmlEntities,
  normalizeSampleContent,
  cleanProblemStatement,
  stripResidualHeadersAndFooters,
  dedentCommonWhitespace,
} from "../utils/textNormalization.js";

const require = createRequire(import.meta.url);
const xlsx = require("xlsx");
const { PDFParse } = require("pdf-parse");

const execAsync = promisify(exec);

/**
 * Validates whether a text block represents a uniform 2D numeric grid/matrix:
 * at least 2 rows, at least 2 columns, all elements are numbers, and all rows have equal column count.
 */
export const isUniformNumericGrid = (text = "") => {
  if (!text) return false;
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^(?:sample|output|input|test|expected|result|dimensions?)/i.test(l));

  if (lines.length < 2) return false;

  const rows = [];
  for (const line of lines) {
    const cleaned = line.replace(/[\[\]]/g, "").trim();
    // Must be space or comma separated numbers
    const parts = cleaned.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) return false;
    const isAllNums = parts.every((p) => !isNaN(Number(p)));
    if (!isAllNums) return false;
    rows.push(parts);
  }

  const colCount = rows[0].length;
  return rows.every((r) => r.length === colCount);
};

/**
 * Parses a 2D matrix text into a structured JSON representation:
 * { type: "matrix", rows: R, columns: C, values: [[...], [...]] }
 */
export const parseStructuredMatrix = (text = "") => {
  if (!text) return null;
  let lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !/^(?:sample|output|input|test|expected|result|dimensions?|primary|secondary)/i.test(l)
    );

  // If first line is a single integer dimension (e.g. "3" for 3x3 matrix in input),
  // skip it to reach the actual matrix rows
  if (lines.length >= 3 && lines[0].split(/[\s,]+/).length === 1 && !isNaN(Number(lines[0]))) {
    lines = lines.slice(1);
  } else if (lines.length >= 3 && lines[0].split(/[\s,]+/).length === 2 && lines.length - 1 >= 2) {
    // Check if lines[0] was "r c" dimensions
    const dimParts = lines[0].split(/[\s,]+/).map(Number);
    if (!dimParts.some(isNaN) && lines.slice(1).every((l) => l.split(/[\s,]+/).length === dimParts[1])) {
      lines = lines.slice(1);
    }
  }

  if (lines.length < 2) return null;

  const rows = [];
  for (const line of lines) {
    const cleaned = line.replace(/[\[\]]/g, "").trim();
    const parts = cleaned.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) return null;
    const numRow = parts.map(Number);
    if (numRow.some((n) => isNaN(n))) return null;
    rows.push(numRow);
  }

  const colCount = rows[0].length;
  if (!rows.every((r) => r.length === colCount)) return null;

  return {
    type: "matrix",
    rows: rows.length,
    columns: colCount,
    values: rows,
  };
};

/**
 * Multi-factor content classifier for ClabToPro programming questions.
 * Returns one of: "text" | "pattern" | "matrix" | "math" | "image" | "code" | "table"
 *
 * Rules:
 * - Ordinary questions (arrays, sorting, elements, frequency, counts) -> "text"
 * - Questions with matrix operations or 2D numeric grids -> "matrix"
 * - Questions producing visual geometric shapes (stars, pyramids, diamonds, hollow square, triangles) -> "pattern"
 */
export const classifyQuestionContent = (qData = {}) => {
  const title = (typeof qData === "string" ? qData : qData.title || "").toLowerCase();
  const problemStatement = (typeof qData === "object" ? qData.problemStatement || qData.rawContent || "" : "").toLowerCase();
  const rawBody = typeof qData === "object" ? qData.problemStatement || qData.rawContent || "" : String(qData || "");
  const combined = `${title}\n${problemStatement}`;

  const sampleOutputs = Array.isArray(qData.sampleTestCases)
    ? qData.sampleTestCases.map((tc) => tc.expectedOutput || "").join("\n")
    : typeof qData.sampleOutput === "string"
    ? qData.sampleOutput
    : "";

  const sampleInputs = Array.isArray(qData.sampleTestCases)
    ? qData.sampleTestCases.map((tc) => tc.input || "").join("\n")
    : typeof qData.sampleInput === "string"
    ? qData.sampleInput
    : "";

  // 1. PATTERN: Must involve explicit visual shapes or multiline star/character geometries
  const patternKeywords =
    /\b(pyramid|star pattern|inverted pyramid|diamond pattern|triangle pattern|floyd'?s triangle|number triangle|hollow square|alphabet pyramid|right\s*angle(?:d)?\s*triangle)\b/i;

  const hasExplicitPatternKeyword = patternKeywords.test(title) || patternKeywords.test(problemStatement);

  // Check for multiline star / symbol blocks across sample output and raw content
  const visualCandidateText = [sampleOutputs, rawBody].filter(Boolean).join("\n");
  const starLines = visualCandidateText
    .split("\n")
    .filter((l) => /^\s*[\*\#\@\$\%\&]{1,40}(?:\s+[\*\#\@\$\%\&]+)*\s*$/.test(l));
  const hasStarVisual = starLines.length >= 2;

  // Check for triangular/pyramidal increasing/decreasing line lengths
  const nonBlankLines = (sampleOutputs || rawBody).split("\n").filter((l) => l.trim().length > 0);
  let isGeometricTriangle = false;
  if (nonBlankLines.length >= 3) {
    const lengths = nonBlankLines.map((l) => l.trim().split(/\s+/).length);
    const isIncreasing = lengths.every((len, idx) => idx === 0 || len >= lengths[idx - 1]);
    const isDecreasing = lengths.every((len, idx) => idx === 0 || len <= lengths[idx - 1]);
    if ((isIncreasing || isDecreasing) && lengths[0] !== lengths[lengths.length - 1]) {
      isGeometricTriangle = true;
    }
  }

  // Centered spaces or hollow pattern boundary
  const hasCenteringLeadingSpaces = nonBlankLines.length >= 3 && nonBlankLines.some((l) => /^\s{2,}\S/.test(l));
  const isHollowSquare = nonBlankLines.length >= 3 && nonBlankLines.some((l) => /^\s*[\*\#]\s+[\*\#\s]*[\*\#]\s*$/.test(l));

  if (
    hasExplicitPatternKeyword ||
    hasStarVisual ||
    (isGeometricTriangle && (hasCenteringLeadingSpaces || hasExplicitPatternKeyword)) ||
    isHollowSquare
  ) {
    return "pattern";
  }

  // 2. MATRIX: Check for matrix operations or uniform 2D numeric grids
  const matrixKeywords =
    /\b(matrix addition|matrix multiplication|transpose of a matrix|diagonal sums? of (?:a )?square matrix|matrix transpose|2d array matrix|inverse of a matrix)\b/i;

  const hasMatrixKeyword = matrixKeywords.test(title) || matrixKeywords.test(problemStatement);
  const is2DGrid =
    isUniformNumericGrid(sampleOutputs) ||
    isUniformNumericGrid(sampleInputs) ||
    (hasMatrixKeyword && isUniformNumericGrid(rawBody));

  if (hasMatrixKeyword || is2DGrid) {
    return "matrix";
  }

  // 3. TABLE: Markdown or ASCII table layout
  if (/\|[\s\-:]+\|/.test(problemStatement) || /\|.*\|.*\|/.test(problemStatement)) {
    return "table";
  }

  // 4. MATH: Mathematical expressions / LaTeX
  if (
    /\b(quadratic equation|taylor series|polynomial roots|determinant of matrix|differential equation)\b/i.test(combined) ||
    /(\$\$|\\frac|\\sqrt|\\sum|\\int)/.test(problemStatement)
  ) {
    return "math";
  }

  // 5. CODE: Code snippets in problem statement
  if (
    /```(?:c|cpp)?[\s\S]*```/.test(problemStatement) ||
    /(?:#include\s*<stdio\.h>|int\s+main\s*\()/i.test(problemStatement)
  ) {
    return "code";
  }

  // 6. DEFAULT: Normal text programming question (e.g. Q12, Q13, Q15)
  return "text";
};

/**
 * Detects whether a block of text contains a visual pattern or matrix (backward compatibility).
 */
export const detectPatternOrMatrix = (text = "") => {
  if (!text) return false;
  const classification = classifyQuestionContent({ problemStatement: text, rawContent: text });
  return classification === "pattern" || classification === "matrix";
};

/**
 * Parses sample test cases with strict boundary detection from a raw question block.
 * Identifies:
 *  - Sample and Hidden Test Case boundaries
 *  - Multiple sample cases and hidden test cases
 *  - Formats: "Sample Test Cases", "Sample Test Case 1", "Sample Input / Output"
 *            "Hidden Test Cases", "Hidden Test Case 1", "Private Test Cases", "Hidden Input / Output"
 *            "Test Case 1", "Test Case 2", etc.
 *  - Explanation / Note / Constraints boundary stops
 *  - Header/footer exclusion
 */
export const parseBlockAllTestCases = (rawContent = "", title = "") => {
  if (!rawContent) return { sampleTestCases: [], hiddenTestCases: [] };
  const lines = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const sampleCases = [];
  const hiddenCases = [];
  let currentSection = "sample"; // default section
  let currentCase = null;
  let activeField = null; // "input" | "output" | "explanation"

  const commitCurrentCase = () => {
    if (!currentCase) return;
    if (currentCase.outputLines.length > 0 || currentCase.inputLines.length > 0) {
      if (currentCase.category === "hidden") {
        hiddenCases.push(currentCase);
      } else {
        sampleCases.push(currentCase);
      }
    }
    currentCase = null;
    activeField = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop if document section heading reached (e.g. "E. STAR, NUMBER AND ALPHABET PATTERNS")
    if (/^[A-Z]\.\s+[A-Z\s,\-–—]+$/i.test(trimmed)) {
      break;
    }

    // Stop if header/footer line reached
    if (
      /^(?:ClabToPro\s*[-–—|•].*|page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|--\s*\d+(?:\s+of\s+\d+)?\s*--|\d+\s+of\s+\d+)$/i.test(
        trimmed
      )
    ) {
      continue;
    }

    // Check for new general section boundary that terminates test cases
    if (/^(?:input\s*format|output\s*format|constraints?|notes?|complexity)[:\-]?/i.test(trimmed)) {
      commitCurrentCase();
      continue;
    }

    // Check for Section Header: "Hidden Test Cases" or "Private Test Cases"
    if (/^[ \t]*(?:hidden|private)\s+test(?:\s*cases?)?[:\-]?$/i.test(trimmed)) {
      commitCurrentCase();
      currentSection = "hidden";
      continue;
    }

    // Check for Section Header: "Sample Test Cases" or "Public Test Cases"
    if (/^[ \t]*(?:sample|example|public)\s+test(?:\s*cases?)?[:\-]?$/i.test(trimmed)) {
      commitCurrentCase();
      currentSection = "sample";
      continue;
    }

    // Check for explanation boundary
    if (/^explanations?[:\-]?/i.test(trimmed)) {
      if (currentCase) {
        activeField = "explanation";
        const val = line.replace(/^explanations?[:\-]?\s*/i, "").trim();
        if (val) currentCase.explanationLines.push(val);
      }
      continue;
    }

    // Check for explicit standalone Test Case header
    // e.g. "Hidden Test Case 1:", "Hidden Test Case #2", "Private Test Case 1"
    const isHiddenCaseHeader =
      /^[ \t]*(?:hidden|private)\s+test(?:\s*case)?\s*(?:#?\d+)?[:\-]?$/i.test(trimmed) ||
      /^[ \t]*test(?:\s*case)?\s*(?:#?\d+)?\s*\((?:hidden|private)\)[:\-]?$/i.test(trimmed);

    // e.g. "Sample Test Case 1:", "Sample Test Case #2", "Example 1:"
    const isSampleCaseHeader =
      /^[ \t]*(?:sample|example)\s+test(?:\s*case)?\s*(?:#?\d+)?[:\-]?$/i.test(trimmed) ||
      /^[ \t]*test(?:\s*case)?\s*(?:#?\d+)?\s*\((?:sample|public|example)\)[:\-]?$/i.test(trimmed) ||
      /^[ \t]*example\s+#?\d+[:\-]?$/i.test(trimmed);

    // e.g. "Test Case 1:", "Test Case #1:"
    const isGenericCaseHeader =
      /^[ \t]*test(?:\s*case)?\s*#?\d+[:\-]?$/i.test(trimmed) &&
      !/(?:input|output)/i.test(trimmed);

    if (isHiddenCaseHeader) {
      commitCurrentCase();
      currentCase = { category: "hidden", inputLines: [], outputLines: [], explanationLines: [] };
      continue;
    }

    if (isSampleCaseHeader) {
      commitCurrentCase();
      currentCase = { category: "sample", inputLines: [], outputLines: [], explanationLines: [] };
      continue;
    }

    if (isGenericCaseHeader) {
      commitCurrentCase();
      currentCase = { category: currentSection, inputLines: [], outputLines: [], explanationLines: [] };
      continue;
    }

    // Check for Input headers
    const isExplicitHiddenInput =
      /^[ \t]*(?:hidden|private)(?:\s+test(?:\s*case)?)?\s*(?:#?\d+)?\s*input(?:\s*#?\d+)?[:\-]?/i.test(trimmed);

    const isExplicitSampleInput =
      /^[ \t]*(?:sample|example)(?:\s+test(?:\s*case)?)?\s*(?:#?\d+)?\s*input(?:\s*#?\d+)?[:\-]?/i.test(trimmed);

    const isGenericInput =
      /^[ \t]*(?:(?:sample|example|test(?:\s*case)?)\s*(?:#?\d+)?\s*)?input(?:\s*#?\d+)?[:\-]?/i.test(trimmed);

    if (isExplicitHiddenInput || isExplicitSampleInput || isGenericInput) {
      if (currentCase && currentCase.outputLines.length > 0) {
        commitCurrentCase();
      }
      const category = isExplicitHiddenInput
        ? "hidden"
        : isExplicitSampleInput
        ? "sample"
        : currentCase?.category || currentSection;

      if (!currentCase) {
        currentCase = { category, inputLines: [], outputLines: [], explanationLines: [] };
      } else {
        currentCase.category = category;
      }
      activeField = "input";

      // Strip the header part
      const val = line.replace(
        /^[ \t]*(?:(?:hidden|private|sample|example|test(?:\s*case)?)\s*(?:#?\d+)?\s*)?input(?:\s*#?\d+)?[:\-]?[ \t]*/i,
        ""
      );
      if (val.trim()) {
        currentCase.inputLines.push(val);
      }
      continue;
    }

    // Check for Output headers
    const isExplicitHiddenOutput =
      /^[ \t]*(?:hidden|private)(?:\s+test(?:\s*case)?)?\s*(?:#?\d+)?\s*(?:output|expected)(?:\s*#?\d+)?[:\-]?/i.test(trimmed);

    const isExplicitSampleOutput =
      /^[ \t]*(?:sample|example)(?:\s+test(?:\s*case)?)?\s*(?:#?\d+)?\s*(?:output|expected)(?:\s*#?\d+)?[:\-]?/i.test(trimmed);

    const isGenericOutput =
      /^[ \t]*(?:(?:sample|example|test(?:\s*case)?)\s*(?:#?\d+)?\s*)?(?:expected\s+output|output)(?:\s*#?\d+)?[:\-]?/i.test(trimmed);

    if (isExplicitHiddenOutput || isExplicitSampleOutput || isGenericOutput) {
      const category = isExplicitHiddenOutput
        ? "hidden"
        : isExplicitSampleOutput
        ? "sample"
        : currentCase?.category || currentSection;

      if (!currentCase) {
        currentCase = { category, inputLines: [], outputLines: [], explanationLines: [] };
      } else {
        currentCase.category = category;
      }
      activeField = "output";

      // Strip the header part
      const val = line.replace(
        /^[ \t]*(?:(?:hidden|private|sample|example|test(?:\s*case)?)\s*(?:#?\d+)?\s*)?(?:expected\s+output|output)(?:\s*#?\d+)?[:\-]?[ \t]*/i,
        ""
      );
      if (val.trim()) {
        currentCase.outputLines.push(val);
      }
      continue;
    }

    if (activeField === "input" && currentCase) {
      currentCase.inputLines.push(line);
    } else if (activeField === "output" && currentCase) {
      currentCase.outputLines.push(line);
    } else if (activeField === "explanation" && currentCase) {
      currentCase.explanationLines.push(line);
    }
  }

  commitCurrentCase();

  const formatCases = (list, isHidden) =>
    list
      .map((tc, idx) => {
        const inputStr = normalizeSampleContent(tc.inputLines.join("\n"), "input");
        const outputStr = normalizeSampleContent(tc.outputLines.join("\n"), "output");
        const prefix = isHidden ? "Hidden" : "Sample";
        return {
          type: isHidden ? "hidden" : "sample",
          input: inputStr,
          expectedOutput: outputStr,
          explanation: tc.explanationLines.join("\n").trim() || `${prefix} Test Case #${idx + 1}`,
          isHidden,
        };
      })
      .filter((tc) => tc.expectedOutput || tc.input);

  return {
    sampleTestCases: formatCases(sampleCases, false),
    hiddenTestCases: formatCases(hiddenCases, true),
  };
};

/**
 * Backwards-compatible helper returning extracted sample test cases.
 */
export const parseBlockSampleTestCases = (rawContent = "", title = "") => {
  return parseBlockAllTestCases(rawContent, title).sampleTestCases;
};

/**
 * Extracts and cleans raw text from a PDF file.
 * Returns { fullText, pages: [{ pageNum, text }] } for digital text PDFs,
 * with page-aware header/footer exclusion using block coordinates and repeating pattern detection.
 */
export const extractTextFromPdf = async (filePath) => {
  // Strategy 1: Standard PDFParse with page-level header/footer isolation
  // This preserves font glyph separation (e.g. "1 2 3" matrix rows) with high precision
  const fileBuffer = await fs.promises.readFile(filePath);
  if (!fileBuffer || fileBuffer.length < 5 || fileBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("PDF is unreadable or corrupted (missing valid %PDF header).");
  }
  let digitalText = "";
  let pages = [];

  try {
    const parser = new PDFParse({ data: fileBuffer });
    const parsed = await parser.getText();
    await parser.destroy();
    digitalText = (parsed?.text || "").trim();
    if (Array.isArray(parsed?.pages) && parsed.pages.length > 0) {
      pages = parsed.pages.map((p, idx) => {
        let text = (p.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        text = stripResidualHeadersAndFooters(text);
        return {
          pageNum: p.num || idx + 1,
          text,
        };
      });
    }
  } catch (err) {
    console.warn("[QuestionParser] Standard PDFParse failed, attempting pdftotext fallback:", err.message);
  }

  // If digital text is rich (> 80 characters), return clean structured pages
  if (digitalText && digitalText.length > 80 && pages.length > 0) {
    const fullText = pages.map((p) => p.text).join("\n\n");
    return { fullText, pages };
  }

  // Strategy 2: Poppler pdftotext with -bbox-layout and -layout fallback
  try {
    const { stdout: bboxOut } = await execAsync(`pdftotext -bbox-layout "${filePath}" -`);
    const { stdout: layoutOut } = await execAsync(`pdftotext -layout "${filePath}" -`);

    if (layoutOut && layoutOut.length > 50) {
      const pageRegex = /<page\s+width="([\d\.]+)"\s+height="([\d\.]+)">(.*?)<\/page>/gs;
      let match;
      const headerSignatures = new Set();
      const footerSignatures = new Set();

      while ((match = pageRegex.exec(bboxOut)) !== null) {
        const height = parseFloat(match[2]);
        const content = match[3];
        const lineRegex =
          /<line\s+xMin="([\d\.]+)"\s+yMin="([\d\.]+)"\s+xMax="([\d\.]+)"\s+yMax="([\d\.]+)">(.*?)<\/line>/gs;
        let lineMatch;
        while ((lineMatch = lineRegex.exec(content)) !== null) {
          const yMin = parseFloat(lineMatch[2]);
          const yMax = parseFloat(lineMatch[4]);
          const rawWords = [...lineMatch[5].matchAll(/<word[^>]*>(.*?)<\/word>/g)]
            .map((w) => decodeHtmlEntities(w[1]))
            .join(" ")
            .trim();
          if (!rawWords) continue;

          if (yMax <= height * 0.08) {
            if (/ClabToPro|Page\s*\d+|--\s*\d+\s+of\s+\d+\s*--|\bPage\b/i.test(rawWords)) {
              headerSignatures.add(rawWords.replace(/\d+/g, "").trim().toLowerCase());
            }
          }
          if (yMin >= height * 0.92) {
            if (/ClabToPro|Page\s*\d+|--\s*\d+\s+of\s+\d+\s*--|\bPage\b/i.test(rawWords)) {
              footerSignatures.add(rawWords.replace(/\d+/g, "").trim().toLowerCase());
            }
          }
        }
      }

      const rawPages = layoutOut.split("\f");
      if (rawPages.length > 0 && !rawPages[rawPages.length - 1].trim()) {
        rawPages.pop();
      }

      const layoutPages = rawPages.map((p, idx) => {
        const lines = p.split("\n");
        let endIdx = lines.length;
        while (endIdx > 0) {
          const trimmed = lines[endIdx - 1].trim();
          if (!trimmed) {
            endIdx--;
            continue;
          }
          const normalized = trimmed.replace(/\d+/g, "").trim().toLowerCase();
          const isKnownFooter = [...footerSignatures].some((sig) => sig && normalized.includes(sig));
          const isGenericFooter =
            /^(?:ClabToPro\s*[-–—|•].*|page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|--\s*\d+(?:\s+of\s+\d+)?\s*--|\d+\s+of\s+\d+)$/i.test(
              trimmed
            );
          if (isKnownFooter || isGenericFooter) {
            endIdx--;
            continue;
          }
          break;
        }

        let startIdx = 0;
        while (startIdx < endIdx) {
          const trimmed = lines[startIdx].trim();
          if (!trimmed) {
            startIdx++;
            continue;
          }
          const normalized = trimmed.replace(/\d+/g, "").trim().toLowerCase();
          const isKnownHeader = [...headerSignatures].some((sig) => sig && normalized.includes(sig));
          const isGenericHeader =
            /^(?:ClabToPro\s*[-–—|•].*(?:page\s*\d+)?|page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|--\s*\d+(?:\s+of\s+\d+)?\s*--)$/i.test(
              trimmed
            );
          if (isKnownHeader || isGenericHeader) {
            startIdx++;
            continue;
          }
          break;
        }

        return {
          pageNum: idx + 1,
          text: lines.slice(startIdx, endIdx).join("\n"),
        };
      });

      const fullText = layoutPages.map((p) => p.text).join("\n\n");
      return { fullText, pages: layoutPages };
    }
  } catch (popplerErr) {
    console.warn("[QuestionParser] pdftotext fallback unavailable:", popplerErr.message);
  }

  // If digital text is rich (> 80 characters), return it with structured pages
  if (digitalText && digitalText.length > 80) {
    return { fullText: pages.map((p) => p.text).join("\n\n") || digitalText, pages };
  }

  // Strategy 3: OCR fallback for scanned or image-based PDFs
  console.log("[QuestionParser] PDF contains minimal digital text. Running OCR extraction via pdftoppm and tesseract...");
  const tempDir = path.join(path.dirname(filePath), `ocr_${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });

  try {
    const prefix = path.join(tempDir, "page");
    await execAsync(`pdftoppm -png -r 200 "${filePath}" "${prefix}"`);

    const imageFiles = (await fs.promises.readdir(tempDir))
      .filter((f) => f.endsWith(".png"))
      .sort();

    let fullOcrText = "";
    pages = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const img = imageFiles[i];
      const imgPath = path.join(tempDir, img);
      try {
        const { stdout } = await execAsync(`tesseract "${imgPath}" stdout --psm 6`);
        let pageText = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        pageText = stripResidualHeadersAndFooters(pageText);
        fullOcrText += `\n--- PAGE BREAK ---\n${pageText}\n`;
        pages.push({ pageNum: i + 1, text: pageText });
      } catch (ocrErr) {
        console.warn(`[QuestionParser] OCR failed on page ${img}:`, ocrErr.message);
      }
    }

    return { fullText: fullOcrText.trim() || digitalText, pages };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const SUPPORTED_PROGRAMMING_LANGUAGES = new Set([
  "c",
  "cpp",
  "c++",
  "python",
  "java",
  "javascript",
  "js",
]);

/**
 * Extracts standard CLABTOPRO paper-level metadata from the header section before Q1.
 */
export const extractStandardPdfMetadata = (rawInput = "") => {
  const combinedDoc =
    typeof rawInput === "object" && rawInput !== null
      ? rawInput.fullText || (rawInput.pages || []).map((p) => p.text || "").join("\n")
      : String(rawInput || "");

  const normalized = combinedDoc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstQMatch = normalized.match(
    /(?:^|\n)[ \t]*(?:Question\s*1\b|Q\.?\s*1\b|1[\.\)]\s+[A-Za-z])/i
  );
  const headerText = firstQMatch ? normalized.slice(0, firstQMatch.index) : normalized.slice(0, 2000);

  const pickField = (regex) => {
    const m = headerText.match(regex);
    return m ? m[1].trim() : "";
  };

  const paperTitle =
    pickField(/(?:^|\n)\s*(?:Question\s+Paper\s+Title|Paper\s+Title|Title)\s*[:\-]\s*([^\n]+)/i) ||
    (headerText
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length >= 4 && !/^(?:Difficulty|Programming|Total|Marks|Page\s+\d)/i.test(l)) ||
      "");

  const difficultyRaw = pickField(/(?:^|\n)\s*Difficulty(?:\s+Level)?\s*[:\-]\s*([^\n]+)/i);
  const difficultyLevel = difficultyRaw
    ? /easy/i.test(difficultyRaw)
      ? "Easy"
      : /hard/i.test(difficultyRaw)
      ? "Hard"
      : /medium/i.test(difficultyRaw)
      ? "Medium"
      : difficultyRaw
    : "";

  const programmingLanguage = pickField(
    /(?:^|\n)\s*(?:Programming\s+Language|Language)\s*[:\-]\s*([^\n]+)/i
  );
  const totalQRaw = pickField(
    /(?:^|\n)\s*Total\s+(?:Number\s+of\s+)?Questions\s*[:\-]\s*(\d+)/i
  );
  const marksPerQRaw = pickField(
    /(?:^|\n)\s*Marks\s+Per\s+Question\s*[:\-]\s*(\d+)/i
  );
  const totalHiddenRaw = pickField(
    /(?:^|\n)\s*Total\s+Hidden\s+Test\s+Cases\s*[:\-]\s*(\d+)/i
  );

  return {
    paperTitle,
    difficultyLevel,
    programmingLanguage,
    totalQuestionsDeclared: totalQRaw ? Number(totalQRaw) : null,
    marksPerQuestion: marksPerQRaw ? Number(marksPerQRaw) : null,
    totalHiddenTestCasesDeclared: totalHiddenRaw ? Number(totalHiddenRaw) : null,
  };
};

/**
 * Validates extracted standard CLABTOPRO coding PDF structure and returns detailed per-question errors.
 */
export const validateStandardCodingPdf = ({ rawInput = "", blocks = [], metadata = null } = {}) => {
  const meta = metadata || extractStandardPdfMetadata(rawInput);
  const errors = [];

  if (meta.programmingLanguage) {
    const langNorm = meta.programmingLanguage.toLowerCase().trim();
    if (!SUPPORTED_PROGRAMMING_LANGUAGES.has(langNorm)) {
      errors.push(
        `Unsupported programming language "${meta.programmingLanguage}". Supported languages: C, C++, Python, Java, JavaScript.`
      );
    }
  }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    errors.push("No valid programming questions could be extracted from the PDF.");
    return { valid: false, errors, metadata: meta };
  }

  if (meta.totalQuestionsDeclared !== null && blocks.length !== meta.totalQuestionsDeclared) {
    errors.push(
      `Question count mismatch: metadata declares ${meta.totalQuestionsDeclared} questions, but ${blocks.length} were extracted.`
    );
  }

  const seenNumbers = new Set();
  const numericIndices = [];
  let totalHiddenCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const qLabel = b.originalQuestionNumber || `Question #${i + 1}`;
    const qTitle = (b.title || "").trim();

    if (!b.originalQuestionNumber || !b.originalQuestionNumber.trim()) {
      errors.push(`Question #${i + 1} ("${qTitle || "Untitled"}"): Question number is missing.`);
    } else {
      const normNum = b.originalQuestionNumber.trim().toUpperCase();
      if (seenNumbers.has(normNum)) {
        errors.push(`Duplicate question number detected: ${normNum}.`);
      }
      seenNumbers.add(normNum);

      const numMatch = normNum.match(/^Q?(\d+)$/i);
      if (numMatch) {
        numericIndices.push({ index: i, num: Number(numMatch[1]), label: normNum });
      }
    }

    if (!qTitle) {
      errors.push(`${qLabel}: Question title is missing.`);
    }

    const descText = String(b.rawContent || b.problemStatement || "").trim();
    if (descText.length < 10) {
      errors.push(`${qLabel} ("${qTitle || "Untitled"}"): Problem description is missing or unreadable.`);
    }

    const sampleCases = Array.isArray(b.sampleTestCases) ? b.sampleTestCases : [];
    const hiddenCases = Array.isArray(b.hiddenTestCases) ? b.hiddenTestCases : [];

    if (sampleCases.length === 0) {
      errors.push(`${qLabel} ("${qTitle || "Untitled"}"): Missing Sample Test Cases (at least 1 sample test case is required).`);
    } else {
      sampleCases.forEach((tc, tcIdx) => {
        if (tc.expectedOutput === undefined || tc.expectedOutput === null || String(tc.expectedOutput).trim() === "") {
          errors.push(`${qLabel} ("${qTitle || "Untitled"}"): Sample Test Case ${tcIdx + 1} is missing expected output.`);
        }
        if (tc.input === undefined || tc.input === null) {
          errors.push(`${qLabel} ("${qTitle || "Untitled"}"): Sample Test Case ${tcIdx + 1} is missing input.`);
        }
      });
    }

    if (hiddenCases.length === 0) {
      errors.push(`${qLabel} ("${qTitle || "Untitled"}"): Missing Hidden Test Cases (at least 1 hidden test case is required).`);
    } else {
      hiddenCases.forEach((tc, tcIdx) => {
        if (tc.expectedOutput === undefined || tc.expectedOutput === null || String(tc.expectedOutput).trim() === "") {
          errors.push(`${qLabel} ("${qTitle || "Untitled"}"): Hidden Test Case ${tcIdx + 1} is missing expected output.`);
        }
        if (tc.input === undefined || tc.input === null) {
          errors.push(`${qLabel} ("${qTitle || "Untitled"}"): Hidden Test Case ${tcIdx + 1} is missing input.`);
        }
      });
    }

    totalHiddenCount += hiddenCases.length;
  }

  // Verify continuous numbering (1, 2, 3, ...) when numeric question numbers are used
  if (numericIndices.length > 0 && numericIndices.length === blocks.length) {
    for (let i = 0; i < numericIndices.length; i++) {
      const expected = i + 1;
      if (numericIndices[i].num !== expected) {
        errors.push(
          `Question numbering is not continuous: expected Q${expected}, found ${numericIndices[i].label}.`
        );
        break;
      }
    }
  }

  if (
    meta.totalHiddenTestCasesDeclared !== null &&
    totalHiddenCount < meta.totalHiddenTestCasesDeclared
  ) {
    errors.push(
      `Hidden test case count mismatch: metadata declares ${meta.totalHiddenTestCasesDeclared} hidden test cases, but only ${totalHiddenCount} were extracted.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    metadata: meta,
    summary: {
      totalQuestions: blocks.length,
      totalHiddenTestCases: totalHiddenCount,
    },
  };
};

/**
 * Strict regex to identify genuine question boundaries.
 * Matches:
 *  - "Question 1:", "Question 1.", "Question 1 -", "Question 1"
 *  - "Q1:", "Q1.", "Q1 -", "Q.1", "Q 1"
 *  - "1. <word>", "1) <word>" (must be followed by letter to prevent matching numbers like 2: 3)
 */
export const QUESTION_HEADER_REGEX =
  /(?:^|\n)\s*(?:(?:(?:Question|Problem|Task)\s*(\d+\([a-zA-Z]\)|\d+[a-zA-Z]?)[:\.\-]?)|(?:Q(?:uestion)?\.?\s*(\d+\([a-zA-Z]\)|\d+[a-zA-Z]?)[:\.\-]?)|(?:(\d{1,3}\([a-zA-Z]\)|\d{1,3})[\.\)][ \t]+(?=[A-Za-z])))(?:\s*[:.\-]?\s*([^\n]*))/gi;

/**
 * Segments raw document text or structured pages into distinct question blocks.
 * Filters out false boundaries (e.g. sample outputs like "2: 3" or page numbers).
 */
export const splitRawTextIntoQuestionBlocks = (rawInput = "", metadata = null) => {
  if (!rawInput) return [];

  let pages = [];
  let combinedDoc = "";

  if (typeof rawInput === "object" && rawInput !== null) {
    pages = rawInput.pages || [];
    combinedDoc = rawInput.fullText || "";
  } else {
    combinedDoc = String(rawInput);
  }

  // If pages are provided, clean header/footers and interleave with <<<PAGE_X>>> markers
  if (pages.length > 0) {
    const cleanedPages = pages.map((p) => {
      const cleaned = stripResidualHeadersAndFooters(p.text || "")
        .replace(/^ClabToPro\s*[-–—|•][^\n]*\n+/gim, "")
        .replace(/--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "")
        .replace(/--\s*\d+\s+of\s+\d+\s*--/gim, "");
      return `\n<<<PAGE_${p.pageNum}>>>\n` + cleaned;
    });
    combinedDoc = cleanedPages.join("\n");
  }

  const normalized = combinedDoc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawMatches = [];

  const regex = new RegExp(
    /(?:^|\n)[ \t]*(?:(?:(?:Question|Problem|Task)\s*(\d+\([a-zA-Z]\)|\d+[a-zA-Z]?)[:\.\-]?)|(?:Q(?:uestion)?\.?[ \t]*(\d+\([a-zA-Z]\)|\d+[a-zA-Z]?)[:\.\-]?)|(?:(\d{1,3}\([a-zA-Z]\)|\d{1,3})[\.\)][ \t]+(?=[A-Za-z])))(?:[ \t]*[:.\-]?[ \t]*([^\n]*))/gi
  );

  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const qNum = match[1] || match[2] || match[3] || "";
    const rawTitle = (match[4] || "").trim();
    rawMatches.push({
      qNum: qNum.trim(),
      title: rawTitle,
      index: match.index,
      headerLength: match[0].length,
    });
  }

  // Filter out invalid/isolated matches (e.g. body < 15 chars or no descriptive words)
  const validMatches = [];
  for (let i = 0; i < rawMatches.length; i++) {
    const current = rawMatches[i];
    const next = rawMatches[i + 1];
    const sliceEnd = next ? next.index : normalized.length;
    const bodySlice = normalized
      .slice(current.index, sliceEnd)
      .replace(/<<<PAGE_\d+>>>/g, "")
      .trim();

    // Must have substantive question content (> 15 chars and not just isolated numbers)
    if (bodySlice.length >= 15 && /[A-Za-z]{3,}/.test(bodySlice)) {
      validMatches.push(current);
    }
  }

  // If no clear question numbers matched, fallback to paragraphs
  if (validMatches.length === 0) {
    const paragraphs = normalized
      .replace(/<<<PAGE_\d+>>>\n?/g, "")
      .split(/\n\s*\n\s*\n/)
      .map((p) => stripResidualHeadersAndFooters(p).trim())
      .filter((p) => p.length > 25);

    return paragraphs.map((p, idx) => {
      const { sampleTestCases, hiddenTestCases } = parseBlockAllTestCases(p, `Question ${idx + 1}`);
      const contentType = classifyQuestionContent({ problemStatement: p, rawContent: p, sampleTestCases });
      const matrixData =
        contentType === "matrix" && sampleTestCases.length > 0
          ? parseStructuredMatrix(sampleTestCases[0].expectedOutput) ||
            parseStructuredMatrix(sampleTestCases[0].input)
          : null;

      return {
        originalQuestionNumber: `Q${idx + 1}`,
        title: `Question ${idx + 1}`,
        rawContent: p,
        contentType,
        hasPatternOrMatrix: contentType === "pattern" || contentType === "matrix",
        matrixData,
        sourcePageNumber: 1,
        sampleTestCases,
        hiddenTestCases,
        orderIndex: idx + 1,
      };
    });
  }

  const blocks = [];
  for (let i = 0; i < validMatches.length; i++) {
    const current = validMatches[i];
    const startIndex = current.index;
    const endIndex = i + 1 < validMatches.length ? validMatches[i + 1].index : normalized.length;
    const rawBlockSlice = normalized.slice(startIndex, endIndex);

    // Determine source page number by looking at previous <<<PAGE_X>>> marker
    const priorText = normalized.slice(0, startIndex);
    const pageMatches = [...priorText.matchAll(/<<<PAGE_(\d+)>>>/g)];
    const sourcePageNumber = pageMatches.length > 0 ? Number(pageMatches[pageMatches.length - 1][1]) : 1;

    // Clean <<<PAGE_X>>>, residual footers, and section headers from block text
    let cleanedText = rawBlockSlice
      .replace(/<<<PAGE_\d+>>>\n?/g, "")
      .replace(/^[A-Z]\.\s+[A-Z\s,\-–—]+\n+/gm, "")
      .trim();
    cleanedText = stripResidualHeadersAndFooters(cleanedText).trim();

    const title = current.title || `Question ${current.qNum}`;
    const { sampleTestCases, hiddenTestCases } = parseBlockAllTestCases(cleanedText, title);

    const diffMatch = cleanedText.match(/(?:^|\n)\s*Difficulty(?:\s+Level)?\s*[:\-]\s*(Easy|Medium|Hard)\b/i);
    const marksMatch = cleanedText.match(/(?:^|\n)\s*Marks\s*[:\-]\s*(\d+)\b/i);
    const blockDifficulty = diffMatch
      ? diffMatch[1].charAt(0).toUpperCase() + diffMatch[1].slice(1).toLowerCase()
      : metadata?.difficultyLevel || "Medium";
    const blockMarks = marksMatch
      ? Number(marksMatch[1])
      : metadata?.marksPerQuestion || 100;

    const contentType = classifyQuestionContent({
      title,
      problemStatement: cleanedText,
      rawContent: cleanedText,
      sampleTestCases,
    });

    const matrixData =
      contentType === "matrix" && sampleTestCases.length > 0
        ? parseStructuredMatrix(sampleTestCases[0].expectedOutput) ||
          parseStructuredMatrix(sampleTestCases[0].input)
        : null;

    blocks.push({
      originalQuestionNumber: current.qNum.startsWith("Q") ? current.qNum : `Q${current.qNum}`,
      title,
      difficulty: blockDifficulty,
      marks: blockMarks,
      rawContent: cleanedText,
      contentType,
      hasPatternOrMatrix: contentType === "pattern" || contentType === "matrix",
      matrixData,
      sourcePageNumber,
      sampleTestCases,
      hiddenTestCases,
      orderIndex: i + 1,
    });
  }

  return blocks;
};

/**
 * Extracts questions from Excel files (.xlsx, .xls).
 * Handles:
 *  1. Columnar/tabular spreadsheets (e.g. columns for Q.No, Title, Problem, Input, Output, Constraints, Sample Cases)
 *  2. Unstructured / single-column rows containing complete questions
 *  3. Multiline cell content with preserved indentation and pattern layouts
 *  4. Multiple worksheets
 */
export const extractQuestionsFromExcel = async (filePath) => {
  const workbook = xlsx.readFile(filePath, {
    cellFormula: false,
    cellHTML: false,
    raw: false, // Ensures multiline formatting & strings are preserved as text
  });

  const extractedBlocks = [];
  let globalOrderIndex = 1;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    // Convert sheet to array of rows (each row is an array of cell values)
    const rawRows = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (!rawRows || rawRows.length === 0) continue;

    // Detect if row 0 or row 1 contains headers
    let headerRowIndex = -1;
    let colMap = {};

    for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
      const row = rawRows[r].map((c) => String(c || "").trim().toLowerCase());
      const hasQCol = row.some((c) => /^(q\.?\s*no|question|qno|sl\.?\s*no|#)/i.test(c));
      const hasTitleOrDesc = row.some((c) =>
        /^(title|name|problem|statement|description|question\s*text)/i.test(c)
      );

      if (hasQCol || hasTitleOrDesc) {
        headerRowIndex = r;
        row.forEach((cellVal, colIdx) => {
          if (!cellVal) return;
          if (/^(q\.?\s*no|qno|sl\.?\s*no|#)/i.test(cellVal)) colMap.qNum = colIdx;
          else if (/^(title|question\s*title|name)/i.test(cellVal)) colMap.title = colIdx;
          else if (/^(problem|statement|description|question\s*text|details)/i.test(cellVal))
            colMap.statement = colIdx;
          else if (/^(input|input\s*format)/i.test(cellVal)) colMap.inputFormat = colIdx;
          else if (/^(output|output\s*format)/i.test(cellVal)) colMap.outputFormat = colIdx;
          else if (/^(constraints?|limits?)/i.test(cellVal)) colMap.constraints = colIdx;
          else if (/^(sample\s*input|test\s*input)/i.test(cellVal)) colMap.sampleInput = colIdx;
          else if (/^(sample\s*output|test\s*output|expected(?:\s*output)?)/i.test(cellVal)) colMap.sampleOutput = colIdx;
          else if (/^(hidden\s*input|private\s*input)/i.test(cellVal)) colMap.hiddenInput = colIdx;
          else if (/^(hidden\s*output|private\s*output)/i.test(cellVal)) colMap.hiddenOutput = colIdx;
          else if (/^(difficulty|level)/i.test(cellVal)) colMap.difficulty = colIdx;
          else if (/^(marks?|points?|score)/i.test(cellVal)) colMap.marks = colIdx;
        });
        break;
      }
    }

    // PATH A: Tabular structure identified with recognized columns
    if (headerRowIndex !== -1 && (colMap.statement !== undefined || colMap.title !== undefined)) {
      for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.every((c) => !String(c || "").trim())) continue;

        const rawQNum = colMap.qNum !== undefined ? String(row[colMap.qNum] || "").trim() : "";
        const title = colMap.title !== undefined ? String(row[colMap.title] || "").trim() : "";
        const statement = colMap.statement !== undefined ? String(row[colMap.statement] || "") : "";
        const inputFormat = colMap.inputFormat !== undefined ? String(row[colMap.inputFormat] || "") : "";
        const outputFormat = colMap.outputFormat !== undefined ? String(row[colMap.outputFormat] || "") : "";
        const constraints = colMap.constraints !== undefined ? String(row[colMap.constraints] || "") : "";
        const rawSampleInput = colMap.sampleInput !== undefined ? String(row[colMap.sampleInput] || "") : "";
        const rawSampleOutput = colMap.sampleOutput !== undefined ? String(row[colMap.sampleOutput] || "") : "";
        const rawHiddenInput = colMap.hiddenInput !== undefined ? String(row[colMap.hiddenInput] || "") : "";
        const rawHiddenOutput = colMap.hiddenOutput !== undefined ? String(row[colMap.hiddenOutput] || "") : "";
        const difficulty = colMap.difficulty !== undefined ? String(row[colMap.difficulty] || "Medium") : "Medium";
        const marks = colMap.marks !== undefined ? Number(row[colMap.marks]) || 100 : 100;

        // Clean & normalize sample input/output while preserving exact multiline formatting and whitespace
        const cleanedInput = normalizeSampleContent(rawSampleInput, "input");
        const cleanedOutput = normalizeSampleContent(rawSampleOutput, "output");
        const cleanedHiddenInput = normalizeSampleContent(rawHiddenInput, "input");
        const cleanedHiddenOutput = normalizeSampleContent(rawHiddenOutput, "output");
        const cleanedStatement = cleanProblemStatement(statement || title);

        const fullText = [
          cleanedStatement,
          inputFormat ? `Input Format:\n${inputFormat}` : "",
          outputFormat ? `Output Format:\n${outputFormat}` : "",
          cleanedInput ? `Sample Input:\n${cleanedInput}` : "",
          cleanedOutput ? `Sample Output:\n${cleanedOutput}` : "",
          cleanedHiddenInput ? `Hidden Input:\n${cleanedHiddenInput}` : "",
          cleanedHiddenOutput ? `Hidden Output:\n${cleanedHiddenOutput}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        if (!fullText.trim()) continue;

        const originalQuestionNumber =
          rawQNum || (title.match(/^Q?\d+/i) ? title.match(/^Q?\d+/i)[0] : `Q${globalOrderIndex}`);

        const contentType = classifyQuestionContent({
          title,
          problemStatement: cleanedStatement,
          sampleOutput: cleanedOutput,
          sampleInput: cleanedInput,
        });

        const matrixData =
          contentType === "matrix"
            ? parseStructuredMatrix(cleanedOutput) || parseStructuredMatrix(cleanedInput)
            : null;

        const hiddenTestCases = cleanedHiddenOutput
          ? [
              {
                type: "hidden",
                input: cleanedHiddenInput,
                expectedOutput: cleanedHiddenOutput,
                explanation: "Hidden test from Excel sheet",
                isHidden: true,
              },
            ]
          : [];

        extractedBlocks.push({
          originalQuestionNumber: originalQuestionNumber.startsWith("Q")
            ? originalQuestionNumber
            : `Q${originalQuestionNumber}`,
          title: decodeHtmlEntities(title) || `Question ${globalOrderIndex}`,
          problemStatement: cleanedStatement,
          inputFormat: decodeHtmlEntities(inputFormat),
          outputFormat: decodeHtmlEntities(outputFormat),
          constraints: decodeHtmlEntities(constraints),
          difficulty: ["Easy", "Medium", "Hard"].includes(difficulty) ? difficulty : "Medium",
          marks,
          contentType,
          hasPatternOrMatrix: contentType === "pattern" || contentType === "matrix",
          matrixData,
          sourcePageNumber: 1,
          sampleTestCases:
            cleanedOutput
              ? [
                  {
                    type: "sample",
                    input: cleanedInput,
                    expectedOutput: cleanedOutput,
                    explanation: "Sample from Excel sheet",
                    isHidden: false,
                  },
                ]
              : [],
          hiddenTestCases,
          rawContent: fullText,
          orderIndex: globalOrderIndex++,
          isStructured: true,
        });
      }
    } else {
      // PATH B: Non-tabular or text-dump Excel sheets (cells containing full questions)
      let combinedText = "";
      for (const row of rawRows) {
        if (!row || !Array.isArray(row)) continue;
        const line = row
          .filter((c) => c !== undefined && c !== null && String(c).trim() !== "")
          .map((c) => decodeHtmlEntities(String(c).replace(/\r\n/g, "\n").replace(/\r/g, "\n")))
          .join("\n");
        if (line.trim()) {
          combinedText += line + "\n";
        }
      }

      const blocks = splitRawTextIntoQuestionBlocks(combinedText);
      for (const b of blocks) {
        extractedBlocks.push({
          ...b,
          orderIndex: globalOrderIndex++,
          isStructured: false,
        });
      }
    }
  }

  return extractedBlocks;
};

/**
 * Unified entry point to parse any uploaded question document (.pdf, .xlsx, .xls).
 */
export const parseDocumentQuestions = async (filePath, fileType) => {
  const ext = (fileType || path.extname(filePath).replace(".", "")).toLowerCase();

  if (ext === "xlsx" || ext === "xls") {
    return await extractQuestionsFromExcel(filePath);
  }

  if (ext === "pdf") {
    const rawPdfText = await extractTextFromPdf(filePath);
    return splitRawTextIntoQuestionBlocks(rawPdfText);
  }

  throw new Error(`Unsupported document format .${ext}. Please upload a PDF, XLSX, or XLS file.`);
};
