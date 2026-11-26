import mongoose from "mongoose";
import AIEvaluationJob from "../models/AIEvaluationJob.js";

/**
 * Background Queue for Gemini AI Conceptual Evaluations.
 * - Controls concurrency (default 2) to prevent 429/503 bursts under 90-student load.
 * - Deduplicates by idempotencyKey (${examId}:${studentId}:${questionId}:v${attemptNumber}).
 * - Retries transient failures (429/503/timeout) with exponential backoff + jitter + Retry-After.
 * - Persists job state to MongoDB when connected so jobs survive restarts.
 */
export class AIEvaluationQueue {
  constructor({
    concurrency = parseInt(process.env.AI_EVALUATION_CONCURRENCY || "2", 10),
    maxQueueSize = 300,
    maxRetries = 3,
    baseRetryDelayMs = 1500,
  } = {}) {
    this.concurrency = Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 2;
    this.maxQueueSize = maxQueueSize;
    this.maxRetries = maxRetries;
    this.baseRetryDelayMs = baseRetryDelayMs;

    this.activeWorkers = 0;
    this.queue = [];
    this.jobsByKey = new Map(); // idempotencyKey -> jobState
    this.totalProcessed = 0;
    this.totalFailed = 0;
    this.totalRetried = 0;
  }

  _isDbReady() {
    return (
      mongoose.connection?.readyState === 1 ||
      AIEvaluationJob.findOneAndUpdate !== mongoose.Model.findOneAndUpdate
    );
  }

  async _persistJob(jobState) {
    if (!this._isDbReady()) return;
    try {
      await AIEvaluationJob.findOneAndUpdate(
        { idempotencyKey: jobState.idempotencyKey },
        {
          $set: {
            examId: jobState.examId,
            studentId: jobState.studentId,
            questionId: jobState.questionId,
            submissionId: jobState.submissionId,
            attemptNumber: jobState.attemptNumber,
            facultyId: jobState.facultyId || null,
            status: jobState.status,
            retryCount: jobState.retryCount,
            maxRetries: jobState.maxRetries,
            nextRunAt: jobState.nextRunAt,
            startedAt: jobState.startedAt,
            completedAt: jobState.completedAt,
            lastError: jobState.lastError || "",
            modelUsed: jobState.modelUsed || "",
            isFallback: Boolean(jobState.isFallback),
          },
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.warn("[AIEvaluationQueue] Job persistence warning:", err.message);
    }
  }

  /**
   * Enqueues an AI evaluation task with idempotency and retry handling.
   * Returns `{ promise, job, deduplicated }` so callers can either await `promise`
   * or return `202 Accepted` immediately for background execution.
   */
  enqueue({
    examId,
    studentId,
    questionId,
    submissionId,
    attemptNumber = 1,
    facultyId = null,
    maxRetries = this.maxRetries,
    task,
    onCompleted = null,
    onFailed = null,
  }) {
    const idempotencyKey = `${examId}:${studentId}:${questionId}:v${attemptNumber}`;

    const existing = this.jobsByKey.get(idempotencyKey);
    if (
      existing &&
      (existing.status === "queued" ||
        existing.status === "processing" ||
        existing.status === "retry_scheduled")
    ) {
      return {
        deduplicated: true,
        job: this._formatPublicJob(existing),
        promise: existing.promise,
      };
    }

    if (this.queue.length >= this.maxQueueSize) {
      const err = new Error("AI evaluation queue is at maximum capacity. Please retry shortly.");
      err.statusCode = 503;
      err.code = "AI_QUEUE_OVERLOAD";
      return {
        deduplicated: false,
        job: null,
        promise: Promise.reject(err),
      };
    }

    let resolveOuter;
    let rejectOuter;
    const promise = new Promise((res, rej) => {
      resolveOuter = res;
      rejectOuter = rej;
    });

    const jobState = {
      idempotencyKey,
      examId,
      studentId,
      questionId,
      submissionId,
      attemptNumber,
      facultyId,
      status: "queued",
      retryCount: 0,
      maxRetries,
      nextRunAt: new Date(),
      startedAt: null,
      completedAt: null,
      lastError: "",
      modelUsed: "",
      isFallback: false,
      task,
      onCompleted,
      onFailed,
      promise,
      resolveOuter,
      rejectOuter,
      retryTimer: null,
    };

    this.jobsByKey.set(idempotencyKey, jobState);
    this.queue.push(jobState);
    this._persistJob(jobState);
    this._processNext();

    return {
      deduplicated: false,
      job: this._formatPublicJob(jobState),
      promise,
    };
  }

  _formatPublicJob(jobState) {
    const idx = this.queue.indexOf(jobState);
    return {
      idempotencyKey: jobState.idempotencyKey,
      examId: jobState.examId,
      studentId: jobState.studentId,
      questionId: jobState.questionId,
      submissionId: jobState.submissionId,
      attemptNumber: jobState.attemptNumber,
      status: jobState.status,
      retryCount: jobState.retryCount,
      maxRetries: jobState.maxRetries,
      queuePosition: idx >= 0 ? idx + 1 : 0,
      startedAt: jobState.startedAt,
      completedAt: jobState.completedAt,
      lastError: jobState.lastError,
      modelUsed: jobState.modelUsed,
      isFallback: jobState.isFallback,
    };
  }

  _computeBackoffMs(retryCount, retryAfterMs = null) {
    const expDelay = this.baseRetryDelayMs * Math.pow(2, Math.max(0, retryCount - 1));
    const jitter = Math.floor(Math.random() * 250);
    const computed = expDelay + jitter;
    return retryAfterMs && retryAfterMs > computed ? retryAfterMs : computed;
  }

  _processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const jobState = this.queue.shift();
    if (!jobState) return;

    this.activeWorkers++;
    let workerReleased = false;
    const releaseWorker = () => {
      if (workerReleased) return;
      workerReleased = true;
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      this._processNext();
    };

    jobState.status = "processing";
    jobState.startedAt = jobState.startedAt || new Date();
    this._persistJob(jobState);

    Promise.resolve()
      .then(() => jobState.task({ retryCount: jobState.retryCount, maxRetries: jobState.maxRetries }))
      .then(async (result) => {
        // Check if task returned a transient retryable error (429/503/network/timeout)
        const isTransientResult =
          result && result.status === "transient_error";

        if (isTransientResult && jobState.retryCount < jobState.maxRetries) {
          jobState.retryCount += 1;
          this.totalRetried += 1;
          const delayMs = this._computeBackoffMs(jobState.retryCount, result.retryAfterMs);
          jobState.status = "retry_scheduled";
          jobState.nextRunAt = new Date(Date.now() + delayMs);
          jobState.lastError = result.error || "Transient AI error; retry scheduled.";
          await this._persistJob(jobState);
          releaseWorker();

          jobState.retryTimer = setTimeout(() => {
            jobState.retryTimer = null;
            jobState.status = "queued";
            this.queue.push(jobState);
            this._persistJob(jobState);
            this._processNext();
          }, delayMs);
          return;
        }

        if (result && result.status === "failed") {
          jobState.status = "failed";
          jobState.completedAt = new Date();
          jobState.lastError = result.error || "AI evaluation failed.";
          this.totalFailed += 1;
          await this._persistJob(jobState);
          if (typeof jobState.onFailed === "function") {
            await jobState.onFailed(result, jobState);
          }
          releaseWorker();
          jobState.resolveOuter(result);
          return;
        }

        jobState.status = "completed";
        jobState.completedAt = new Date();
        jobState.modelUsed = result?.modelUsed || "";
        jobState.isFallback = Boolean(result?.isFallback);
        this.totalProcessed += 1;
        await this._persistJob(jobState);
        if (typeof jobState.onCompleted === "function") {
          await jobState.onCompleted(result, jobState);
        }
        releaseWorker();
        jobState.resolveOuter(result);
      })
      .catch(async (err) => {
        const isTransientErr =
          err?.retryable === true ||
          err?.statusCode === 429 ||
          err?.statusCode === 503 ||
          err?.name === "AbortError";

        if (isTransientErr && jobState.retryCount < jobState.maxRetries) {
          jobState.retryCount += 1;
          this.totalRetried += 1;
          const delayMs = this._computeBackoffMs(jobState.retryCount, err.retryAfterMs);
          jobState.status = "retry_scheduled";
          jobState.nextRunAt = new Date(Date.now() + delayMs);
          jobState.lastError = err.message || "Transient error; retry scheduled.";
          await this._persistJob(jobState);
          releaseWorker();

          jobState.retryTimer = setTimeout(() => {
            jobState.retryTimer = null;
            jobState.status = "queued";
            this.queue.push(jobState);
            this._persistJob(jobState);
            this._processNext();
          }, delayMs);
          return;
        }

        jobState.status = "failed";
        jobState.completedAt = new Date();
        jobState.lastError = err.message || "AI evaluation failed.";
        this.totalFailed += 1;
        await this._persistJob(jobState);
        if (typeof jobState.onFailed === "function") {
          await jobState.onFailed({ status: "failed", error: jobState.lastError }, jobState).catch(() => {});
        }
        releaseWorker();
        jobState.rejectOuter(err);
      })
      .finally(() => {
        releaseWorker();
      });
  }

  getJobStatus(idempotencyKey) {
    const job = this.jobsByKey.get(idempotencyKey);
    return job ? this._formatPublicJob(job) : null;
  }

  getStats() {
    return {
      activeWorkers: this.activeWorkers,
      waitingJobs: this.queue.length,
      concurrency: this.concurrency,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      totalRetried: this.totalRetried,
    };
  }
}

const globalAIQueue = new AIEvaluationQueue();
export default globalAIQueue;
