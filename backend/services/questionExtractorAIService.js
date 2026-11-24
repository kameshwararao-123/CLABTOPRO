/**
 * AI-Powered Question Extraction & Structuring Service for ClabToPro
 *
 * Uses Gemini API with batch processing (10-20 questions per batch) to extract,
 * normalize, and structure programming questions from raw document blocks.
 *
 * CRITICAL RULES:
 * 1. Do NOT invent or hallucinate missing questions or imaginary test cases.
 * 2. Strictly preserve spaces, line breaks, pyramid alignments, and matrix rows/columns.
 * 3. Never silently drop questions.
 * 4. Resilient to rate limits with exponential backoff and rule-based fallback.
 */

import {
  decodeHtmlEntities,
  normalizeSampleContent,
  cleanProblemStatement,
  stripResidualHeadersAndFooters,
  dedentCommonWhitespace,
} from "../utils/textNormalization.js";
import {
  classifyQuestionContent,
  parseStructuredMatrix,
  parseBlockSampleTestCases,
  parseBlockAllTestCases,
} from "./questionParserService.js";

/**
 * Aligns pattern visuals (e.g. Centered Pyramids, Hollow Squares, Diamonds)
 * to strictly preserve leading spaces and hollow interiors as requested.
 */
export const alignPatternVisuals = (output = "", title = "", problemStatement = "") => {
  if (!output || typeof output !== "string") return output;
  const combined = `${title} ${problemStatement}`.toLowerCase();
  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return output;

  const isPyramid = /centered\s*(?:star\s*)?pyramid/i.test(combined);
  const isDiamond = /diamond/i.test(combined);
  const isHollow = /hollow\s*square/i.test(combined);

  // Hollow square alignment: expand interior spaces to match top row width
  if (isHollow && lines.length >= 3) {
    const topRow = lines[0].trim();
    if (topRow.length > 2) {
      const innerSpaces = " ".repeat(topRow.length - 2);
      return lines
        .map((l, idx) => {
          if (idx === 0 || idx === lines.length - 1) return topRow;
          return "*" + innerSpaces + "*";
        })
        .join("\n");
    }
  }

  // Centered pyramid & centered diamond: ensure symmetric leading indentation
  if ((isPyramid || isDiamond) && lines.length >= 3) {
    const widths = lines.map((l) => l.trim().length);
    const maxWidth = Math.max(...widths);
    // If lines are already centered (leading spaces exist), keep them!
    const alreadyPadded = lines.some((l) => /^\s{2,}\S/.test(l));
    if (!alreadyPadded) {
      return lines
        .map((l) => {
          const trimmed = l.trim();
          const pad = Math.max(0, Math.floor((maxWidth - trimmed.length) / 2));
          return " ".repeat(pad) + trimmed;
        })
        .join("\n");
    }
  }

  return output;
};

/**
 * Validates question extraction completeness and assigns confidence-based status:
 * "approved" | "needs_review" | "incomplete_extraction" | "extraction_failed"
 *
 * Rules:
 * - A normal text question with description and sample test cases is "approved".
 * - A clearly extracted matrix or pattern is "approved".
 * - Only flag questions with genuine uncertainty, missing descriptions, or footer contamination.
 */
export const validateQuestionConfidence = (q) => {
  const statement = (q.problemStatement || "").trim();
  const title = (q.title || "").trim();
  const qNum = (q.originalQuestionNumber || "").trim();

  // 1. Incomplete extraction: missing question number, missing statement, or isolated number
  if (!qNum) {
    return {
      status: "incomplete_extraction",
      reviewReason: "Question number is missing from source document",
    };
  }

  if (!statement || statement.length < 15 || /^\d+$/.test(statement)) {
    return {
      status: "incomplete_extraction",
      reviewReason: "Incomplete question extraction — missing problem statement or isolated number",
    };
  }

  if (!title || title.length < 3) {
    return {
      status: "incomplete_extraction",
      reviewReason: "Question title is missing from source document",
    };
  }

  // Check if statement ends with dangling preposition or incomplete sentence
  if (/\b(?:if|when|where|and|or|with|to|for|is|are|not|the|a|an)\s*$/i.test(statement)) {
    return {
      status: "needs_review",
      reviewReason: "Question description may be incomplete — appears truncated at sentence end",
    };
  }

  const sampleCases = Array.isArray(q.sampleTestCases) ? q.sampleTestCases : [];
  const hiddenCases = Array.isArray(q.hiddenTestCases) ? q.hiddenTestCases : [];
  const allCases = [...sampleCases, ...hiddenCases];

  // 2. Suspected header/footer contamination in output or statement
  const headerFooterRegex =
    /(?:ClabToPro\s*[-–—|•].*|Page\s*\d+\s*(?:of|\/)\s*\d+|--\s*\d+\s+of\s+\d+\s*--|\bPage\s+\d+\b)/i;

  for (const tc of allCases) {
    if (headerFooterRegex.test(tc.expectedOutput || "") || headerFooterRegex.test(tc.input || "")) {
      return {
        status: "needs_review",
        reviewReason: `${tc.isHidden ? "Hidden" : "Sample"} test case contains suspected page footer or header text`,
      };
    }
  }

  if (headerFooterRegex.test(statement)) {
    return {
      status: "needs_review",
      reviewReason: "Problem description contains suspected page header/footer text",
    };
  }

  // 3. Output has accidentally absorbed next question
  const nextQuestionRegex = /(?:^|\n)\s*(?:Question|Problem|Task)\s*\d+[:.\-]?/i;
  for (const tc of allCases) {
    if (nextQuestionRegex.test(tc.expectedOutput || "")) {
      return {
        status: "needs_review",
        reviewReason: `${tc.isHidden ? "Hidden" : "Sample"} test output appears to have absorbed content from a subsequent question`,
      };
    }
  }

  // 4. Incomplete test cases detection
  for (const tc of allCases) {
    if (tc.input && !tc.expectedOutput) {
      return {
        status: "needs_review",
        reviewReason: `Incomplete ${tc.isHidden ? "hidden" : "sample"} test case detected — missing expected output`,
      };
    }
  }

  // 5. Content-type specific validation
  const firstOutput = sampleCases[0]?.expectedOutput || hiddenCases[0]?.expectedOutput || "";
  if (q.contentType === "pattern") {
    if (!firstOutput) {
      return {
        status: "needs_review",
        reviewReason: "Sample output appears incomplete — no pattern output detected",
      };
    }
    if (!firstOutput.includes("\n") && firstOutput.length > 5) {
      return {
        status: "needs_review",
        reviewReason: "Pattern indentation may have been lost — output appears flattened to a single line",
      };
    }
  }

  if (q.contentType === "matrix") {
    if (q.matrixData) {
      if (!q.matrixData.rows || !q.matrixData.columns || !q.matrixData.values?.length) {
        return {
          status: "needs_review",
          reviewReason: "Matrix dimensions could not be verified — invalid grid dimensions",
        };
      }
    }
  }

  // Standard verified complete question
  return {
    status: "approved",
    reviewReason: "",
  };
};

const SYSTEM_PROMPT = `You are the ClabToPro Academic Question Extraction Engine.
Your task is to convert raw extracted text blocks from an examination document into cleanly structured C programming questions.

CRITICAL INSTRUCTIONS & PRESERVATION RULES:
1. PRESERVE THE ORIGINAL QUESTION NUMBER: Extract the exact question numbering (e.g. "Q1", "Q.1", "1.", "Question 10(a)", etc.) into "originalQuestionNumber".
2. CONTENT TYPE CLASSIFICATION:
   Classify each question strictly into one of:
   - "text": Normal programming questions (e.g. arrays, sorting, frequency, arithmetic, loops, pointers).
   - "pattern": Visual geometric patterns (stars, pyramids, diamonds, hollow squares, floyd's triangles, alphabet triangles).
   - "matrix": Matrix operations or 2D array grids (addition, transpose, multiplication, diagonal sums).
   - "math": Mathematical expressions, polynomials, series equations.
   - "code": Questions containing code snippets in description.
   - "table": Tabular data.
   IMPORTANT: A question mentioning an array, numbers, sorting, or frequency is NOT a pattern!
3. PRESERVE PATTERNS AND MATRICES:
   - For Star patterns, Number patterns, Pyramid patterns, Inverted Pyramids, Hollow squares, and Floyd's triangles (e.g. 1\\n2 3\\n4 5 6\\n7 8 9 10):
     STRICTLY PRESERVE all line breaks (\\n), leading spaces, indentation, and alignment!
     NEVER flatten multiline outputs or matrices into a single line.
   - For matrices, include structured matrixData: { "type": "matrix", "rows": R, "columns": C, "values": [[...], [...]] }.
4. ALL TEST CASES (SAMPLE & HIDDEN TEST CASES):
   - Extract ALL test cases provided in the document:
     a) "sampleTestCases": Visible test cases labeled "Sample Test Cases", "Sample Test Case 1", "Sample Input / Output", "Example 1", "Test Case 1 (Sample)", etc.
     b) "hiddenTestCases": Hidden or private test cases labeled "Hidden Test Cases", "Hidden Test Case 1", "Private Test Cases", "Hidden Input / Output", "Test Case X (Hidden)", etc.
   - Support multiple sample test cases and multiple hidden test cases per question.
   - NEVER confuse sample test cases with hidden test cases. If test cases are under a "Hidden Test Cases" or "Private Test Cases" header, classify them into "hiddenTestCases".
   - Strictly stop outputs when constraints, explanations, page headers/footers, or next sections begin.
   - DO NOT include page footers (e.g. "ClabToPro ... Page 7") in outputs or descriptions.
   - DO NOT prefix values with "Input:" or "Output:".
   - Decode any HTML entities like &#x20;, &nbsp; into normal spaces.
5. ZERO HALLUCINATION POLICY:
   - Do NOT invent or generate missing questions or fake test cases. If a question has no hidden test cases in the document, return "hiddenTestCases": [].
6. STATUS & VALIDATION:
   - "approved": Question structure, description, and required content are successfully validated.
   - "needs_review": Only if there is genuine ambiguity, truncation, missing output for an input, or suspected footer contamination.
   - "incomplete_extraction": If description is missing or cut off.

Return ONLY a valid JSON object matching this schema:
{
  "questions": [
    {
      "originalQuestionNumber": "Q1",
      "title": "Concise Question Title",
      "problemStatement": "Exact description with preserved newlines and pattern spaces",
      "contentType": "text" | "pattern" | "matrix" | "math" | "image" | "code" | "table",
      "matrixData": null | { "type": "matrix", "rows": 2, "columns": 3, "values": [...] },
      "inputFormat": "Input format description or empty",
      "outputFormat": "Output format description or empty",
      "constraints": "Constraints description or empty",
      "difficulty": "Easy" | "Medium" | "Hard",
      "marks": 100,
      "sampleTestCases": [
        {
          "input": "...",
          "expectedOutput": "...",
          "explanation": "..."
        }
      ],
      "hiddenTestCases": [
        {
          "input": "...",
          "expectedOutput": "...",
          "explanation": "..."
        }
      ],
      "hasPatternOrMatrix": true | false,
      "status": "approved" | "needs_review" | "incomplete_extraction",
      "reviewReason": "Reason if marked for review, or empty"
    }
  ]
}`;

/**
 * Fallback parser using regex and structural analysis if Gemini is unavailable
 * or rate-limited. Ensures 100% reliability for faculty.
 */
export const ruleBasedFallbackStructuring = (rawBlock) => {
  const text = rawBlock.rawContent || rawBlock.problemStatement || "";
  const lines = text.split("\n");

  const qNum =
    rawBlock.originalQuestionNumber ||
    (text.match(/(?:(?:Question|Problem|Task)\s*(\d+[a-zA-Z]?)|Q(?:uestion)?\.?\s*(\d+[a-zA-Z]?)|(\d{1,3})[\.\)])/i)
      ? text.match(/(?:(?:Question|Problem|Task)\s*(\d+[a-zA-Z]?)|Q(?:uestion)?\.?\s*(\d+[a-zA-Z]?)|(\d{1,3})[\.\)])/i)[0].trim()
      : `Q${rawBlock.orderIndex || 1}`);

  let inputFormat = rawBlock.inputFormat || "";
  let outputFormat = rawBlock.outputFormat || "";
  let constraints = rawBlock.constraints || "";
  let statementLines = [];
  let currentSection = "statement";

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop collecting if section header reached (e.g. "E. STAR, NUMBER AND ALPHABET PATTERNS")
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

    if (/^input\s*format[:\-]?/i.test(trimmed)) {
      currentSection = "inputFormat";
      inputFormat += line.replace(/^input\s*format[:\-]?/i, "") + "\n";
    } else if (/^output\s*format[:\-]?/i.test(trimmed)) {
      currentSection = "outputFormat";
      outputFormat += line.replace(/^output\s*format[:\-]?/i, "") + "\n";
    } else if (/^constraints?[:\-]?/i.test(trimmed)) {
      currentSection = "constraints";
      constraints += line.replace(/^constraints?[:\-]?/i, "") + "\n";
    } else if (
      /^[ \t]*(?:(?:sample|example|test(?:\s*case)?)\s*(?:#?\d+)?\s*)?(?:input|output)(?:\s*#?\d+)?[:\-]?/i.test(
        trimmed
      )
    ) {
      currentSection = "testCase";
    } else {
      if (currentSection === "inputFormat") inputFormat += line + "\n";
      else if (currentSection === "outputFormat") outputFormat += line + "\n";
      else if (currentSection === "constraints") constraints += line + "\n";
      else if (currentSection === "statement") statementLines.push(line);
    }
  }

  let problemStatement = statementLines.join("\n").trim() || text;
  // Clean question number and header title line from start of problem statement
  problemStatement = problemStatement
    .replace(
      /^(?:(?:Question|Problem|Task)\s*\d+[a-zA-Z]?|Q(?:uestion)?\.?\s*\d+[a-zA-Z]?|\d{1,3}[\.\)])[ \t]*[:.\-]?[^\n]*\n?/i,
      ""
    )
    .trim();

  let title = rawBlock.title || "";
  if (!title || /^Question \d+$/i.test(title)) {
    const firstLine = text.split("\n")[0] || "";
    const headerTitleMatch = firstLine.match(/(?:Question|Problem|Task|Q)\s*\d+[a-zA-Z]?[:.\-]?\s*([^\n]+)/i);
    if (headerTitleMatch && headerTitleMatch[1]?.trim()) {
      title = headerTitleMatch[1].trim();
    } else {
      const firstSentence = problemStatement.split(/[\.\n]/)[0].trim();
      title =
        firstSentence.length > 5 && firstSentence.length < 60
          ? firstSentence
          : `Programming Task ${qNum}`;
    }
  }

  // Parse sample & hidden test cases using strict boundary parser
  const allParsedCases =
    rawBlock.sampleTestCases?.length > 0 || rawBlock.hiddenTestCases?.length > 0
      ? {
          sampleTestCases: rawBlock.sampleTestCases || [],
          hiddenTestCases: rawBlock.hiddenTestCases || [],
        }
      : parseBlockAllTestCases(text, title);

  const parsedSampleCases = allParsedCases.sampleTestCases || [];
  const parsedHiddenCases = allParsedCases.hiddenTestCases || [];

  // Determine content type accurately
  const draftContentType =
    rawBlock.contentType ||
    classifyQuestionContent({
      title,
      problemStatement,
      sampleTestCases: parsedSampleCases,
      rawContent: text,
    });

  // Align pattern visuals for centered pyramids, hollow squares, and diamonds
  const sampleTestCases = parsedSampleCases.map((tc) => {
    let out = normalizeSampleContent(tc.expectedOutput, "output");
    if (draftContentType === "pattern") {
      out = alignPatternVisuals(out, title, problemStatement);
    }
    return {
      type: "sample",
      input: normalizeSampleContent(tc.input, "input"),
      expectedOutput: out,
      explanation: tc.explanation || "Sample Test Case",
      isHidden: false,
    };
  });

  const hiddenTestCases = parsedHiddenCases.map((tc) => {
    let out = normalizeSampleContent(tc.expectedOutput, "output");
    if (draftContentType === "pattern") {
      out = alignPatternVisuals(out, title, problemStatement);
    }
    return {
      type: "hidden",
      input: normalizeSampleContent(tc.input, "input"),
      expectedOutput: out,
      explanation: tc.explanation || "Hidden Test Case",
      isHidden: true,
    };
  });

  const matrixData =
    draftContentType === "matrix" && sampleTestCases.length > 0
      ? parseStructuredMatrix(sampleTestCases[0].expectedOutput) ||
        parseStructuredMatrix(sampleTestCases[0].input) ||
        null
      : null;

  const hasPattern = draftContentType === "pattern" || draftContentType === "matrix";
  const sourcePageNumber = rawBlock.sourcePageNumber || 1;

  const candidateQuestion = {
    originalQuestionNumber: qNum.startsWith("Q") ? qNum : `Q${qNum}`,
    title: decodeHtmlEntities(title.trim()),
    problemStatement: cleanProblemStatement(problemStatement || text),
    contentType: draftContentType,
    hasPatternOrMatrix: hasPattern,
    matrixData,
    sourcePageNumber,
    inputFormat: decodeHtmlEntities(inputFormat.trim()),
    outputFormat: decodeHtmlEntities(outputFormat.trim()),
    constraints: decodeHtmlEntities(constraints.trim()),
    difficulty: rawBlock.difficulty || "Medium",
    marks: rawBlock.marks || 100,
    sampleTestCases,
    hiddenTestCases,
    orderIndex: rawBlock.orderIndex || 1,
    rawExcerpt: text.slice(0, 300),
  };

  const validation = validateQuestionConfidence(candidateQuestion);

  return {
    ...candidateQuestion,
    status: validation.status,
    reviewReason: validation.reviewReason,
  };
};

/**
 * Calls Gemini API to process a single batch of 10-20 raw question blocks.
 */
export const extractQuestionBatchWithGemini = async (batchQuestions, batchNumber = 1) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.warn(`[QuestionExtractorAI] GEMINI_API_KEY not configured. Using rule-based extraction for batch ${batchNumber}.`);
    return batchQuestions.map((q) => ({
      ...ruleBasedFallbackStructuring(q),
      batchNumber,
    }));
  }

  const batchPromptContent = batchQuestions
    .map((q, idx) => {
      return `--- QUESTION ITEM ${idx + 1} (Detected Number: ${q.originalQuestionNumber}) ---
${q.rawContent || q.problemStatement || ""}
`;
    })
    .join("\n\n");

  const userPrompt = `Extract and structure the following ${batchQuestions.length} programming questions from Batch #${batchNumber}:

${batchPromptContent}

Extract each question verbatim while preserving all matrix and pattern alignment spaces and line breaks. Return valid JSON only.`;

  const candidateModels = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ];
  const models = [...new Set(candidateModels.filter(Boolean))];

  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout per batch

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.1, // High deterministic fidelity to source text
              response_mime_type: "application/json",
            },
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[QuestionExtractorAI] Gemini API HTTP ${response.status} on model ${model}:`, errText.slice(0, 150));
          if (response.status === 429) {
            // Rate limit - wait with backoff
            await new Promise((r) => setTimeout(r, attempt * 2000));
            continue;
          }
          break; // Try next model on 4xx/5xx errors
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            // Map extracted questions to ensure full alignment with original batch
            return parsed.questions.map((extracted, idx) => {
              const original = batchQuestions[idx] || {};
              const qNum =
                extracted.originalQuestionNumber ||
                original.originalQuestionNumber ||
                `Q${original.orderIndex || idx + 1}`;

              const title = decodeHtmlEntities(extracted.title || original.title || `Programming Task ${qNum}`);
              const problemStatement = cleanProblemStatement(extracted.problemStatement || original.rawContent || "");

              let finalSampleTestCases =
                Array.isArray(extracted.sampleTestCases) && extracted.sampleTestCases.length > 0
                  ? extracted.sampleTestCases.map((tc) => ({
                      type: "sample",
                      input: normalizeSampleContent(tc.input || "", "input"),
                      expectedOutput: normalizeSampleContent(tc.expectedOutput || "", "output"),
                      explanation: tc.explanation || "",
                      isHidden: false,
                    }))
                  : Array.isArray(original.sampleTestCases)
                  ? original.sampleTestCases.map((tc) => ({ ...tc, type: "sample", isHidden: false }))
                  : [];

              let finalHiddenTestCases =
                Array.isArray(extracted.hiddenTestCases) && extracted.hiddenTestCases.length > 0
                  ? extracted.hiddenTestCases.map((tc) => ({
                      type: "hidden",
                      input: normalizeSampleContent(tc.input || "", "input"),
                      expectedOutput: normalizeSampleContent(tc.expectedOutput || "", "output"),
                      explanation: tc.explanation || "",
                      isHidden: true,
                    }))
                  : Array.isArray(original.hiddenTestCases)
                  ? original.hiddenTestCases.map((tc) => ({ ...tc, type: "hidden", isHidden: true }))
                  : [];

              // Multiline preservation safeguard:
              // If Gemini flattened a multiline output into a single line (no \n),
              // but the original block had multiline sample or hidden output, recover it!
              if (
                original.sampleTestCases?.[0]?.expectedOutput?.includes("\n") &&
                finalSampleTestCases.length > 0 &&
                !finalSampleTestCases[0].expectedOutput.includes("\n")
              ) {
                finalSampleTestCases[0].expectedOutput = original.sampleTestCases[0].expectedOutput;
              }

              if (
                original.hiddenTestCases?.[0]?.expectedOutput?.includes("\n") &&
                finalHiddenTestCases.length > 0 &&
                !finalHiddenTestCases[0].expectedOutput.includes("\n")
              ) {
                finalHiddenTestCases[0].expectedOutput = original.hiddenTestCases[0].expectedOutput;
              }

              // Strip any lingering header/footer contamination from test cases
              finalSampleTestCases = finalSampleTestCases.map((tc) => ({
                ...tc,
                expectedOutput: stripResidualHeadersAndFooters(tc.expectedOutput).trimEnd(),
                input: stripResidualHeadersAndFooters(tc.input).trimEnd(),
              }));

              finalHiddenTestCases = finalHiddenTestCases.map((tc) => ({
                ...tc,
                expectedOutput: stripResidualHeadersAndFooters(tc.expectedOutput).trimEnd(),
                input: stripResidualHeadersAndFooters(tc.input).trimEnd(),
              }));

              // Run rigorous content classification
              const contentType =
                original.contentType ||
                classifyQuestionContent({
                  title,
                  problemStatement,
                  sampleTestCases: finalSampleTestCases,
                  rawContent: original.rawContent,
                });

              // Align pattern visual spaces
              if (contentType === "pattern") {
                if (finalSampleTestCases.length > 0) {
                  finalSampleTestCases[0].expectedOutput = alignPatternVisuals(
                    finalSampleTestCases[0].expectedOutput,
                    title,
                    problemStatement
                  );
                }
                if (finalHiddenTestCases.length > 0) {
                  finalHiddenTestCases[0].expectedOutput = alignPatternVisuals(
                    finalHiddenTestCases[0].expectedOutput,
                    title,
                    problemStatement
                  );
                }
              }

              // Extract structured matrix if matrix problem
              const matrixData =
                contentType === "matrix" && finalSampleTestCases.length > 0
                  ? parseStructuredMatrix(finalSampleTestCases[0].expectedOutput) ||
                    parseStructuredMatrix(finalSampleTestCases[0].input) ||
                    null
                  : null;

              const hasPattern = contentType === "pattern" || contentType === "matrix";
              const sourcePageNumber = original.sourcePageNumber || 1;

              const candidate = {
                originalQuestionNumber: qNum.startsWith("Q") ? qNum : `Q${qNum}`,
                title,
                problemStatement,
                contentType,
                hasPatternOrMatrix: hasPattern,
                matrixData,
                sourcePageNumber,
                inputFormat: decodeHtmlEntities((extracted.inputFormat || "").trim()),
                outputFormat: decodeHtmlEntities((extracted.outputFormat || "").trim()),
                constraints: decodeHtmlEntities((extracted.constraints || "").trim()),
                difficulty: ["Easy", "Medium", "Hard"].includes(extracted.difficulty)
                  ? extracted.difficulty
                  : original.difficulty || "Medium",
                marks: Number(extracted.marks) || original.marks || 100,
                sampleTestCases: finalSampleTestCases,
                hiddenTestCases: finalHiddenTestCases,
                orderIndex: original.orderIndex || idx + 1,
                batchNumber,
                rawExcerpt: (original.rawContent || "").slice(0, 200),
              };

              const validation = validateQuestionConfidence(candidate);

              return {
                ...candidate,
                status: validation.status,
                reviewReason: validation.reviewReason,
              };
            });
          }
        }
      } catch (err) {
        lastError = err;
        console.warn(`[QuestionExtractorAI] Batch ${batchNumber} attempt ${attempt} on model ${model} failed:`, err.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // Graceful rule-based fallback if all Gemini attempts failed
  console.warn(`[QuestionExtractorAI] Gemini failed for batch ${batchNumber}. Falling back to rule-based parser.`, lastError?.message);
  return batchQuestions.map((q) => ({
    ...ruleBasedFallbackStructuring(q),
    batchNumber,
  }));
};
