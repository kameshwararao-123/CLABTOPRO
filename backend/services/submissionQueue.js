/**
 * Submission Queue Service
 * Controls execution concurrency and queues submissions to prevent overloading the Piston engine
 * when 120+ students submit concurrently.
 */

class SubmissionQueue {
  constructor(concurrency = 4, maxQueueSize = 200) {
    this.concurrency = parseInt(process.env.EXECUTION_CONCURRENCY || String(concurrency), 10);
    this.maxQueueSize = maxQueueSize;
    this.activeWorkers = 0;
    this.queue = [];
    this.totalProcessed = 0;
    this.totalFailed = 0;
  }

  /**
   * Enqueues an execution task and returns a Promise that resolves when the task finishes.
   *
   * @param {Function} task - Async function to run
   * @param {Object} metadata - Optional context for logging (e.g., submissionId, userId)
   * @returns {Promise<any>}
   */
  enqueue(task, metadata = {}) {
    if (this.queue.length >= this.maxQueueSize) {
      const error = new Error("Execution queue is at maximum capacity. Please retry in a few moments.");
      error.statusCode = 503;
      error.code = "QUEUE_OVERLOAD";
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      const item = {
        task,
        resolve,
        reject,
        metadata,
        enqueuedAt: Date.now(),
      };

      this.queue.push(item);
      console.log(
        `[SubmissionQueue] Enqueued task for user=${metadata.userId || "anonymous"}. Queue waiting: ${this.queue.length}, Active: ${this.activeWorkers}/${this.concurrency}`
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
    if (!item) return;

    this.activeWorkers++;
    const queueWaitTime = Date.now() - item.enqueuedAt;

    console.log(
      `[SubmissionQueue] Starting task. Wait time: ${queueWaitTime}ms. Active workers: ${this.activeWorkers}/${this.concurrency}`
    );

    Promise.resolve()
      .then(() => item.task())
      .then((result) => {
        this.totalProcessed++;
        item.resolve(result);
      })
      .catch((error) => {
        this.totalFailed++;
        item.reject(error);
      })
      .finally(() => {
        this.activeWorkers--;
        // Immediately schedule the next task
        this._processNext();
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
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      capacityAvailable: this.maxQueueSize - this.queue.length,
    };
  }
}

// Global singleton instance with configurable concurrency
const globalQueue = new SubmissionQueue();

export default globalQueue;
