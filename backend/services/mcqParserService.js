import { decodeHtmlEntities, stripResidualHeadersAndFooters } from "../utils/textNormalization.js";

/**
 * Extracts and parses multiple choice questions (MCQs) from raw document text.
 * Supports:
 *  - Various numbering (Q1., Q1), Question 1:, 1., etc.)
 *  - 2, 3, 4 or more options (A, B, C, D... or (a), (b), (c)...)
 *  - Options on separate lines or on the same line
 *  - Inline or separate answer keys (Answer: B, Ans: C, Correct Option: A)
 *  - Explanations
 *  - C code snippets within questions or options
 */

const OPTION_LINE_REGEX =
  /^[ \t]*(?:\(([A-Za-z0-9])\)|([A-Za-z0-9])[\.\)])[ \t]+(.*)$/;

const INLINE_OPTION_SPLIT_REGEX =
  /(?:^|\s{2,}|\t+)(?:\(([A-Za-z0-9])\)|([A-Za-z0-9])[\.\)])[ \t]+(.*?)(?=(?:\s{2,}|\t+)(?:\([A-Za-z0-9]\)|[A-Za-z0-9][\.\)])[ \t]+|$)/g;

const ANSWER_REGEX =
  /(?:correct\s*(?:answer|option)?|answer|ans|key)[:.\-\s]+(?:option\s*([A-Za-z0-9])|\(?([A-Za-z0-9])\)?|\b([A-Za-z0-9])\b)/i;

const EXPLANATION_REGEX =
  /(?:explanation|rationale|solution|reason)[:.\-\s]+(.*)/is;

export const normalizeOptionLetter = (str = "") => {
  if (!str) return "";
  const cleaned = String(str)
    .replace(/[\[\]\(\)\.\:\-]/g, "")
    .replace(/^option\s*/i, "")
    .trim();
  return cleaned.toUpperCase();
};

export const normalizeOptionText = (str = "") => {
  if (!str) return "";
  let text = decodeHtmlEntities(String(str)).trim();
  text = text.replace(/^[ \t]*(?:\([A-Za-z0-9]\)|[A-Za-z0-9][\.\)])[ \t]*/, "");
  return text.trim();
};

/**
 * Parses individual MCQ block into structured fields.
 */
export const parseRawMCQBlock = (rawText = "", orderIndex = 1) => {
  if (!rawText) return null;

  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalized.split("\n");

  let qNum = `Q${orderIndex}`;
  let questionTextLines = [];
  let options = [];
  let correctAnswer = "";
  let explanation = "";
  let currentOption = null;
  let inExplanation = false;

  // Extract Question Number from the first line
  const headerMatch = lines[0].match(
    /^[ \t]*(?:(?:Question|Problem|Task|Q)\s*(\d+[a-zA-Z]?)|Q(?:uestion)?\.?\s*(\d+[a-zA-Z]?)|(\d{1,3})[\.\)])[ \t]*[:.\-]?[ \t]*(.*)/i
  );

  let startLineIdx = 0;
  if (headerMatch) {
    qNum = headerMatch[1] || headerMatch[2] || headerMatch[3] || `Q${orderIndex}`;
    if (!qNum.startsWith("Q")) qNum = `Q${qNum}`;
    const remainder = headerMatch[4]?.trim();
    if (remainder) {
      questionTextLines.push(remainder);
    }
    startLineIdx = 1;
  }

  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentOption) {
        // preserve blank line in multi-line code option if applicable
        currentOption.text += "\n";
      } else if (questionTextLines.length > 0 && !inExplanation) {
        questionTextLines.push("");
      }
      continue;
    }

    // Header/footer skip
    if (
      /^(?:ClabToPro\s*[-–—|•].*|page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|--\s*\d+(?:\s+of\s+\d+)?\s*--|\d+\s+of\s+\d+)$/i.test(
        trimmed
      )
    ) {
      continue;
    }

    // Check for Explanation
    const explMatch = trimmed.match(EXPLANATION_REGEX);
    if (explMatch) {
      if (currentOption) {
        options.push(currentOption);
        currentOption = null;
      }
      inExplanation = true;
      explanation += (explMatch[1] || "").trim() + "\n";
      continue;
    }

    if (inExplanation) {
      explanation += line + "\n";
      continue;
    }

    // Check for Answer key
    const ansMatch = trimmed.match(ANSWER_REGEX);
    if (ansMatch && !trimmed.toLowerCase().includes("which of the following") && !trimmed.toLowerCase().includes("select")) {
      const detectedAns = ansMatch[1] || ansMatch[2] || ansMatch[3];
      if (detectedAns && detectedAns.length === 1 && /[A-Za-z0-9]/.test(detectedAns)) {
        if (currentOption) {
          options.push(currentOption);
          currentOption = null;
        }
        correctAnswer = detectedAns.toUpperCase();
        continue;
      }
    }

    // Check for Option on its own line: e.g. "A. float" or "(b) int"
    const singleOptMatch = line.match(OPTION_LINE_REGEX);
    if (singleOptMatch && !trimmed.startsWith("Q.") && !trimmed.startsWith("Question")) {
      // Check if it's actually an inline multi-option line: e.g. "A. int   B. float   C. char"
      const inlineMatches = [...line.matchAll(INLINE_OPTION_SPLIT_REGEX)];
      if (inlineMatches.length >= 2) {
        if (currentOption) {
          options.push(currentOption);
          currentOption = null;
        }
        for (const m of inlineMatches) {
          const optLetter = (m[1] || m[2] || "").toUpperCase();
          const optText = (m[3] || "").trim();
          if (optLetter && optText) {
            options.push({
              optionId: optLetter,
              text: decodeHtmlEntities(optText),
            });
          }
        }
        continue;
      }

      if (currentOption) {
        options.push(currentOption);
      }
      const optLetter = (singleOptMatch[1] || singleOptMatch[2] || "").toUpperCase();
      const optText = (singleOptMatch[3] || "").trim();
      currentOption = {
        optionId: optLetter,
        text: decodeHtmlEntities(optText),
      };
      continue;
    }

    // If we are currently collecting text for an option
    if (currentOption) {
      currentOption.text += (currentOption.text ? "\n" : "") + line;
      continue;
    }

    // Otherwise, this line belongs to the question statement
    questionTextLines.push(line);
  }

  if (currentOption) {
    options.push(currentOption);
  }

  // Normalize option identifiers to A, B, C, D if numeric 1, 2, 3, 4 were used
  if (options.length > 0 && options.every((o) => /^[1-9]$/.test(o.optionId))) {
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
    options = options.map((opt, idx) => ({
      ...opt,
      optionId: letters[idx] || opt.optionId,
    }));
    if (/^[1-9]$/.test(correctAnswer)) {
      const idx = parseInt(correctAnswer, 10) - 1;
      correctAnswer = letters[idx] || correctAnswer;
    }
  }

  const questionText = stripResidualHeadersAndFooters(
    questionTextLines.join("\n").trim()
  );

  const cleanExplanation = explanation.trim();

  // Validate status
  let status = "approved";
  let reviewReason = "";

  if (!questionText || questionText.length < 5) {
    status = "needs_review";
    reviewReason = "Question text could not be extracted or is too short.";
  } else if (options.length < 2) {
    status = "needs_review";
    reviewReason = `Insufficient options extracted (${options.length} options found). MCQs require at least 2 options.`;
  } else if (!correctAnswer) {
    correctAnswer = "Answer Not Provided";
    status = "needs_review";
    reviewReason = "Answer key not detected in document. Faculty verification required.";
  }

  return {
    originalQuestionNumber: qNum,
    questionNumber: qNum,
    title: questionText.slice(0, 90).replace(/\n+/g, " ").trim() || `Question ${orderIndex}`,
    questionText,
    problemStatement: questionText,
    questionType: "mcq",
    options,
    correctAnswer: correctAnswer || "Answer Not Provided",
    explanation: cleanExplanation,
    status,
    extractionStatus: !correctAnswer || correctAnswer === "Answer Not Provided" ? "Needs Review" : "Auto-Detected",
    reviewReason,
    orderIndex,
    contentType: "text",
    marks: 1,
  };
};

/**
 * Splits document text into individual MCQ question blocks.
 */
export const splitRawTextIntoMCQBlocks = (rawInput = "", options = {}) => {
  if (!rawInput) return [];
  const { strictNumberedOnly = false } = options;

  let combinedDoc = "";
  if (typeof rawInput === "object" && rawInput !== null) {
    if (rawInput.pages && Array.isArray(rawInput.pages)) {
      combinedDoc = rawInput.pages.map((p) => p.text || "").join("\n\n");
    } else {
      combinedDoc = rawInput.fullText || "";
    }
  } else {
    combinedDoc = String(rawInput);
  }

  const normalized = combinedDoc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Regex matching question beginnings
  const regex = new RegExp(
    /(?:^|\n)[ \t]*(?:(?:(?:Question|Problem|Task|Q)\s*(\d+[a-zA-Z]?)|Q(?:uestion)?\.?[ \t]*(\d+[a-zA-Z]?)|(\d{1,3})[\.\)])[ \t]*[:.\-]?[ \t]*(?=[A-Za-z0-9`"'_#(]))/gi
  );

  const rawMatches = [];
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const lineStart = match[0].startsWith("\n") ? match.index + 1 : match.index;
    const lineEndIdx = normalized.indexOf("\n", lineStart);
    const fullLine = normalized
      .slice(lineStart, lineEndIdx === -1 ? normalized.length : lineEndIdx)
      .trim();

    // Do not treat guideline/sample preamble lines as actual questions
    if (/^(?:e\.g\.|example|sample|note|guideline)/i.test(fullLine)) {
      continue;
    }

    const qNum = match[1] || match[2] || match[3] || "";
    rawMatches.push({
      qNum: qNum.trim(),
      index: match.index,
    });
  }

  if (rawMatches.length === 0) {
    if (strictNumberedOnly) {
      return [];
    }

    // Fallback: split by double line breaks if numbered headers weren't found
    const paragraphs = normalized
      .split(/\n\s*\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    return paragraphs
      .map((p, idx) => parseRawMCQBlock(p, idx + 1))
      .filter(Boolean);
  }

  const blocks = [];
  for (let i = 0; i < rawMatches.length; i++) {
    const current = rawMatches[i];
    const next = rawMatches[i + 1];
    const sliceEnd = next ? next.index : normalized.length;
    const bodySlice = normalized.slice(current.index, sliceEnd).trim();

    if (bodySlice.length >= 15) {
      const parsed = parseRawMCQBlock(bodySlice, i + 1);
      if (parsed) {
        blocks.push(parsed);
      }
    }
  }

  return blocks;
};

/**
 * Validates an extracted Viva MCQ PDF against the Sample_Viva_MCQ_Template.pdf rules:
 *  - Readable text
 *  - Properly numbered sequential questions starting from Q1 (Q1, Q2, ...)
 *  - Readable question text and >= 2 non-empty options (2 for True/False, 4 for regular MCQs)
 *  - Reliable Answer key matching one of the extracted options
 *  - Optional explanations (never required, never counted as extra questions)
 */
export const validateVivaMcqPdf = ({ rawInput = "", blocks = [] } = {}) => {
  const errors = [];

  let rawText = "";
  if (typeof rawInput === "object" && rawInput !== null) {
    rawText =
      Array.isArray(rawInput.pages)
        ? rawInput.pages.map((p) => p.text || "").join("\n")
        : rawInput.fullText || "";
  } else {
    rawText = String(rawInput || "");
  }

  if (rawText.trim().length < 20) {
    errors.push(
      "Uploaded PDF does not contain readable text. Upload a text-based PDF matching Sample_Viva_MCQ_Template.pdf."
    );
    return { valid: false, errors };
  }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    errors.push(
      "No properly numbered Viva MCQ questions (e.g., Q1., Q2., Q3.) were found. Number questions sequentially starting from Q1."
    );
    return { valid: false, errors };
  }

  const seenNumbers = new Set();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const qLabel = b.questionNumber || `Question ${i + 1}`;
    const numMatch = String(qLabel).match(/(\d+)/);
    const parsedNum = numMatch ? parseInt(numMatch[1], 10) : NaN;
    const expectedNum = i + 1;

    if (Number.isNaN(parsedNum)) {
      errors.push(`${qLabel}: Invalid question numbering. Use sequential numbering starting from Q1.`);
    } else {
      if (seenNumbers.has(parsedNum)) {
        errors.push(`Duplicate question number Q${parsedNum} detected. Ensure every question has a unique sequential number.`);
      }
      seenNumbers.add(parsedNum);
      if (parsedNum !== expectedNum) {
        errors.push(
          `Expected Q${expectedNum} in sequence, but found ${qLabel}. Number questions sequentially starting from Q1 without skipping.`
        );
      }
    }

    if (!b.questionText || b.questionText.trim().length < 5) {
      errors.push(`${qLabel}: Question text is missing or unreadable.`);
    }

    const opts = Array.isArray(b.options) ? b.options : [];
    if (opts.length < 2) {
      errors.push(
        `${qLabel}: Insufficient answer options (${opts.length} found). Provide 4 options (A-D) for MCQs or 2 options (A-B) for True/False.`
      );
    } else if (opts.some((o) => !o.text || !String(o.text).trim())) {
      errors.push(`${qLabel}: One or more answer options have empty or unreadable text.`);
    }

    const ans = String(b.correctAnswer || "").trim();
    if (!ans || ans === "Answer Not Provided") {
      errors.push(
        `${qLabel}: Correct answer key is missing. Include an explicit answer line (e.g., "Answer: A").`
      );
    } else if (opts.length >= 2 && !opts.some((o) => o.optionId === ans)) {
      errors.push(
        `${qLabel}: Answer key "${ans}" does not match the extracted options (${opts.map((o) => o.optionId).join(", ")}).`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const parseRawMCQQuestion = parseRawMCQBlock;
