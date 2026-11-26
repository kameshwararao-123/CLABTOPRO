/**
 * Submission Queue Service
 * Controls execution concurrency and queues submissions to prevent overloading the Piston engine
 * when 120+ students submit concurrently.
 */

class SubmissionQueue {
  constructor(concurrency = 4, maxQueueSize = 200, taskTimeoutMs = 45000) {
    const parsedConcurrency = parseInt(process.env.EXECUTION_CONCURRENCY || String(concurrency), 10);
    const parsedMaxQueueSize = parseInt(
      process.env.EXECUTION_MAX_QUEUE_SIZE || String(maxQueueSize),
      10
    );
    const parsedTimeout = parseInt(
      process.env.EXECUTION_TASK_TIMEOUT_MS || String(taskTimeoutMs),
      10
    );

    this.concurrency = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 4;
    this.maxQueueSize = Number.isFinite(parsedMaxQueueSize) && parsedMaxQueueSize > 0 ? parsedMaxQueueSize : 200;
    this.taskTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout >= 0 ? parsedTimeout : 45000;
    this.activeWorkers = 0;
    this.queue = [];
    this.jobCounter = 0;
    this.totalProcessed = 0;
    this.totalFailed = 0;
    this.totalTimedOut = 0;
    this.totalRejected = 0;
  }

  /**
   * Enqueues an execution task and returns a Promise that resolves when the task finishes.
   *
   * @param {Function} task - Async function to run
   * @param {Object} metadata - Optional context for logging (e.g., submissionId, userId, examId, timeoutMs)
   * @returns {Promise<any>}
   */
  enqueue(task, metadata = {}) {
    if (typeof task !== "function") {
      const error = new Error("Execution task must be a function.");
      error.statusCode = 500;
      error.code = "INVALID_TASK";
      return Promise.reject(error);
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.totalRejected++;
      const error = new Error("Execution queue is at maximum capacity. Please retry in a few moments.");
      error.statusCode = 503;
      error.code = "QUEUE_OVERLOAD";
      error.retryable = true;
      error.retryAfterSeconds = 5;
      return Promise.reject(error);
    }

    const jobId = metadata.jobId || `job-${Date.now()}-${++this.jobCounter}`;
    const timeoutMs =
      metadata.timeoutMs !== undefined ? metadata.timeoutMs : this.taskTimeoutMs;

    return new Promise((resolve, reject) => {
      const item = {
        jobId,
        task,
        resolve,
        reject,
        metadata,
        enqueuedAt: Date.now(),
        settled: false,
        timerId: null,
        releaseWorker: null,
        cleanupTimer: () => {
          if (item.timerId) {
            clearTimeout(item.timerId);
            item.timerId = null;
          }
        },
      };

      if (timeoutMs > 0) {
        item.timerId = setTimeout(() => {
          if (item.settled) return;
          item.settled = true;
          item.timerId = null;
          this.totalTimedOut++;

          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }

          if (typeof item.releaseWorker === "function") {
            item.releaseWorker();
          }

          const timeoutErr = new Error(
            "Code execution timed out while waiting in queue. Please retry shortly."
          );
          timeoutErr.statusCode = 503;
          timeoutErr.code = "QUEUE_TIMEOUT";
          timeoutErr.retryable = true;
          timeoutErr.retryAfterSeconds = 5;
          reject(timeoutErr);
        }, timeoutMs);

        if (typeof item.timerId.unref === "function") {
          item.timerId.unref();
        }
      }

      this.queue.push(item);
      console.log(
        `[SubmissionQueue] Enqueued ${jobId} (${metadata.action || "submit"}) for user=${metadata.userId || "anonymous"}. Queue waiting: ${this.queue.length}, Active: ${this.activeWorkers}/${this.concurrency}`
      );

      this._processNext();
    });
  }

  /**
   * Internal scheduler: runs tasks up to this.concurrency.
   */
  _processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item || item.settled) return;

    this.activeWorkers++;
    let workerReleased = false;
    const releaseWorker = () => {
      if (workerReleased) return;
      workerReleased = true;
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      this._processNext();
    };
    item.releaseWorker = releaseWorker;

    const queueWaitTime = Date.now() - item.enqueuedAt;

    console.log(
      `[SubmissionQueue] Starting ${item.jobId}. Wait time: ${queueWaitTime}ms. Active workers: ${this.activeWorkers}/${this.concurrency}`
    );

    Promise.resolve()
      .then(() => item.task())
      .then((result) => {
        item.cleanupTimer();
        releaseWorker();
        if (!item.settled) {
          item.settled = true;
          this.totalProcessed++;
          item.resolve(result);
        }
      })
      .catch((error) => {
        item.cleanupTimer();
        releaseWorker();
        if (!item.settled) {
          item.settled = true;
          this.totalFailed++;
          item.reject(error);
        }
      })
      .finally(() => {
        releaseWorker();
      });
  }

  /**
   * Returns current queue statistics for monitoring and health checks.
   */
  getStats() {
    return {
      activeWorkers: this.activeWorkers,
      waitingTasks: this.queue.length,
      concurrency: this.concurrency,
      maxQueueSize: this.maxQueueSize,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      totalTimedOut: this.totalTimedOut,
      totalRejected: this.totalRejected,
      capacityAvailable: Math.max(0, this.maxQueueSize - this.queue.length),
    };
  }
}

// Global singleton instance with configurable concurrency
const globalQueue = new SubmissionQueue();

export { SubmissionQueue };
export default globalQueue;
