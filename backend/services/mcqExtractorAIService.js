import { decodeHtmlEntities, stripResidualHeadersAndFooters } from "../utils/textNormalization.js";
import { parseRawMCQBlock } from "./mcqParserService.js";

const MCQ_SYSTEM_PROMPT = `You are the ClabToPro Academic Multiple Choice Question (MCQ) Extraction Engine.
Your task is to convert raw extracted text blocks from an examination document into cleanly structured Viva Multiple Choice Questions (MCQs).

CRITICAL EXTRACTION RULES:
1. QUESTION TEXT: Extract the exact question description. If the question contains C code snippets, mathematical notation, or variable declarations, STRICTLY PRESERVE formatting and line breaks verbatim.
2. OPTIONS EXTRACTION:
   - Extract ALL options present (e.g. Option A, Option B, Option C, Option D...).
   - Support questions with 2, 3, 4, 5, or more options.
   - Return options as an array of objects: [ { "optionId": "A", "text": "..." }, { "optionId": "B", "text": "..." } ].
   - Do NOT mix options belonging to different questions.
3. CORRECT ANSWER POLICY:
   - Extract the correct answer ONLY if it is explicitly provided in the document (e.g. "Answer: B", "Ans: C", "Correct: A").
   - If the correct answer is NOT explicitly stated in the document text, you MUST set "correctAnswer": "Answer Not Provided".
   - ABSOLUTELY NEVER GUESS, INVENT, OR PREDICT ANSWERS. Faculty must verify the answer key.
4. EXPLANATION:
   - Extract the explanation or rationale only if present in the document. Otherwise set to empty string "".
5. ZERO HALLUCINATION POLICY:
   - Do NOT invent questions, options, or fake test items.

Return ONLY a valid JSON object matching this schema:
{
  "questions": [
    {
      "originalQuestionNumber": "Q1",
      "questionText": "Question text with code snippets preserved",
      "options": [
        { "optionId": "A", "text": "Option A text" },
        { "optionId": "B", "text": "Option B text" },
        { "optionId": "C", "text": "Option C text" },
        { "optionId": "D", "text": "Option D text" }
      ],
      "correctAnswer": "A" | "B" | "C" | "D" | "Answer Not Provided",
      "explanation": "Explanation from text or empty",
      "status": "approved" | "needs_review",
      "reviewReason": "Reason if marked for review, or empty"
    }
  ]
}`;

/**
 * Extracts a batch of MCQs using Gemini API with automatic fallback.
 */
export const extractMCQBatchWithGemini = async (batchQuestions, batchNumber = 1) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.warn(`[MCQExtractorAI] GEMINI_API_KEY not configured. Using rule-based parser for batch ${batchNumber}.`);
    return batchQuestions.map((q, idx) => ({
      ...parseRawMCQBlock(q.rawContent || q.questionText || q.problemStatement, q.orderIndex || idx + 1),
      batchNumber,
    }));
  }

  const batchPromptContent = batchQuestions
    .map((q, idx) => {
      return `--- MCQ ITEM ${idx + 1} (Detected: ${q.originalQuestionNumber || `Q${idx + 1}`}) ---
${q.rawContent || q.questionText || q.problemStatement || ""}
`;
    })
    .join("\n\n");

  const userPrompt = `Extract and structure the following ${batchQuestions.length} MCQs from Batch #${batchNumber}:

${batchPromptContent}

Extract all question texts, options, and explicit answer keys verbatim. Return valid JSON only.`;

  const candidateModels = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ];
  const models = [...new Set(candidateModels.filter(Boolean))];

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: MCQ_SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              response_mime_type: "application/json",
            },
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            await new Promise((r) => setTimeout(r, attempt * 2000));
            continue;
          }
          break;
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            return parsed.questions.map((extracted, idx) => {
              const original = batchQuestions[idx] || {};
              const qNum =
                extracted.originalQuestionNumber ||
                original.originalQuestionNumber ||
                `Q${original.orderIndex || idx + 1}`;

              const questionText = decodeHtmlEntities(
                extracted.questionText || original.questionText || original.rawContent || ""
              ).trim();

              const options = Array.isArray(extracted.options) && extracted.options.length > 0
                ? extracted.options.map((opt, oIdx) => ({
                    optionId: (opt.optionId || String.fromCharCode(65 + oIdx)).toUpperCase(),
                    text: decodeHtmlEntities(opt.text || "").trim(),
                  }))
                : original.options || [];

              let correctAnswer = (extracted.correctAnswer || original.correctAnswer || "Answer Not Provided").trim();
              if (correctAnswer !== "Answer Not Provided") {
                correctAnswer = correctAnswer.toUpperCase().replace(/[^A-Z0-9]/g, "");
              }

              const explanation = decodeHtmlEntities(extracted.explanation || original.explanation || "").trim();

              let status = extracted.status || "approved";
              let reviewReason = extracted.reviewReason || "";

              if (!questionText || questionText.length < 5) {
                status = "needs_review";
                reviewReason = "Question statement is too short or missing.";
              } else if (options.length < 2) {
                status = "needs_review";
                reviewReason = `Insufficient options extracted (${options.length} options found).`;
              } else if (correctAnswer === "Answer Not Provided" || !correctAnswer) {
                correctAnswer = "Answer Not Provided";
                status = "needs_review";
                reviewReason = "Answer key not detected in document. Faculty verification required.";
              }

              return {
                originalQuestionNumber: qNum.startsWith("Q") ? qNum : `Q${qNum}`,
                title: questionText.slice(0, 90).replace(/\n+/g, " ").trim() || `MCQ ${qNum}`,
                questionText,
                problemStatement: questionText,
                questionType: "mcq",
                options,
                correctAnswer,
                explanation,
                status,
                reviewReason,
                contentType: "text",
                marks: 1,
                orderIndex: original.orderIndex || idx + 1,
                batchNumber,
              };
            });
          }
        }
      } catch (err) {
        console.warn(`[MCQExtractorAI] Batch ${batchNumber} attempt ${attempt} on model ${model} failed:`, err.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // Graceful rule-based fallback if Gemini API call fails
  console.warn(`[MCQExtractorAI] Gemini unavailable for batch ${batchNumber}. Using rule-based MCQ parser.`);
  return batchQuestions.map((q, idx) => ({
    ...parseRawMCQBlock(q.rawContent || q.questionText || q.problemStatement, q.orderIndex || idx + 1),
    batchNumber,
  }));
};
