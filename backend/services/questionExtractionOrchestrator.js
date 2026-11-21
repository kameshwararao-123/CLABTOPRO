import QuestionExtractionJob from "../models/QuestionExtractionJob.js";
import { parseDocumentQuestions } from "./questionParserService.js";
import { extractQuestionBatchWithGemini } from "./questionExtractorAIService.js";

const BATCH_SIZE = 15; // 10-20 questions per batch for safe token usage & fast parallelization

/**
 * Executes the complete background extraction pipeline for an uploaded file.
 * Non-blocking: called asynchronously so HTTP upload requests return immediately.
 */
export const runQuestionExtractionJob = async (jobId) => {
  let job;
  try {
    job = await QuestionExtractionJob.findById(jobId);
    if (!job) {
      console.error(`[ExtractionOrchestrator] Job ${jobId} not found.`);
      return;
    }

    // Phase 1: Parse Document Text & Identify Question Boundaries
    job.status = "parsing_document";
    job.progressMessage = `Parsing ${job.fileName} and detecting question boundaries...`;
    await job.save();

    const rawQuestionBlocks = await parseDocumentQuestions(
      job.temporaryFilePath,
      job.fileType
    );

    if (!rawQuestionBlocks || rawQuestionBlocks.length === 0) {
      job.status = "failed";
      job.error = "No programming questions could be identified in the uploaded file.";
      job.progressMessage = "Failed: No questions detected in document.";
      await job.save();
      return;
    }

    job.totalDetected = rawQuestionBlocks.length;
    job.progressMessage = `Questions identified: ${job.totalDetected}. Structuring in batches...`;

    // Phase 2: Divide into manageable batches of 15 questions
    const batches = [];
    for (let i = 0; i < rawQuestionBlocks.length; i += BATCH_SIZE) {
      batches.push(rawQuestionBlocks.slice(i, i + BATCH_SIZE));
    }

    job.totalBatches = batches.length;
    job.status = "extracting_batches";
    job.batches = batches.map((b, idx) => ({
      batchIndex: idx + 1,
      questionCount: b.length,
      startQuestionNum: b[0]?.originalQuestionNumber || "",
      endQuestionNum: b[b.length - 1]?.originalQuestionNumber || "",
      status: "pending",
      error: "",
      retryCount: 0,
    }));
    await job.save();

    // Phase 3: Process batches iteratively with live progress updates
    const allExtractedQuestions = [];
    let validatedCount = 0;
    let needsReviewCount = 0;
    let failedCount = 0;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const currentBatch = batches[bIdx];
      const batchNum = bIdx + 1;

      job.currentBatch = batchNum;
      job.progressMessage = `Questions extracted: ${allExtractedQuestions.length}/${job.totalDetected} (Processing Batch ${batchNum}/${batches.length})...`;
      job.batches[bIdx].status = "processing";
      await job.save();

      try {
        const batchResults = await extractQuestionBatchWithGemini(
          currentBatch,
          batchNum
        );

        for (const q of batchResults) {
          allExtractedQuestions.push(q);
          if (q.status === "needs_review") {
            needsReviewCount++;
          } else if (q.status === "incomplete_extraction" || q.status === "extraction_failed") {
            failedCount++;
          } else {
            validatedCount++;
          }
        }

        job.batches[bIdx].status = "completed";
      } catch (batchErr) {
        console.error(`[ExtractionOrchestrator] Batch ${batchNum} failed:`, batchErr.message);
        job.batches[bIdx].status = "failed";
        job.batches[bIdx].error = batchErr.message;

        // Fallback: don't lose batch! Add raw items as needs_review
        for (const raw of currentBatch) {
          allExtractedQuestions.push({
            originalQuestionNumber: raw.originalQuestionNumber || `Q${raw.orderIndex}`,
            title: raw.title || `Question ${raw.orderIndex}`,
            problemStatement: raw.rawContent || raw.problemStatement || "",
            contentType: raw.contentType || "text",
            matrixData: raw.matrixData || null,
            sourcePageNumber: raw.sourcePageNumber || 1,
            inputFormat: raw.inputFormat || "",
            outputFormat: raw.outputFormat || "",
            constraints: raw.constraints || "",
            difficulty: raw.difficulty || "Medium",
            marks: raw.marks || 100,
            sampleTestCases: raw.sampleTestCases || [],
            hiddenTestCases: [],
            hasPatternOrMatrix: raw.hasPatternOrMatrix || false,
            status: "needs_review",
            reviewReason: `Batch extraction encountered error: ${batchErr.message}. Preserved raw content.`,
            orderIndex: raw.orderIndex,
            batchNumber: batchNum,
            rawExcerpt: (raw.rawContent || "").slice(0, 200),
          });
          needsReviewCount++;
        }
      }

      job.totalExtracted = allExtractedQuestions.length;
      job.totalValidated = validatedCount;
      job.totalNeedsReview = needsReviewCount;
      job.totalFailed = failedCount;
      job.extractedQuestions = allExtractedQuestions;
      await job.save();

      // Brief gentle throttle between batches to maintain healthy API rate limits
      if (bIdx < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    // Phase 4: Final verification and completion
    job.status = "completed";
    job.progressMessage = `Extraction complete! ${job.totalExtracted} questions extracted (${validatedCount} validated, ${needsReviewCount} requiring review).`;
    await job.save();

    console.log(`[ExtractionOrchestrator] Job ${jobId} finished successfully. Total: ${job.totalExtracted}`);
  } catch (err) {
    console.error(`[ExtractionOrchestrator] Job ${jobId} unhandled failure:`, err);
    if (job) {
      job.status = "failed";
      job.error = err.message || "Failed to process question extraction.";
      job.progressMessage = `Failed: ${job.error}`;
      await job.save().catch(() => {});
    }
  }
};
