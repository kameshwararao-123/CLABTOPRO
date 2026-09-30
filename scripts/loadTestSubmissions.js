/**
 * CLABTOPro - Load Testing Suite for Submission Queue & Execution Engine
 *
 * Tests simulated bursts of submissions for:
 * 10, 20, 40, 60, 100, 120 concurrent submissions.
 *
 * Measures:
 * - Active & waiting queue lengths
 * - Average, minimum, and maximum execution times
 * - CPU utilization (user & system time)
 * - RAM memory footprint (RSS & Heap)
 * - Failed execution count
 * - Throughput (submissions/sec)
 */

import submissionQueue from "../backend/services/submissionQueue.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Simulates a single student submission execution task.
 * Can simulate either mock execution (for testing queue mechanics under load)
 * or real Piston execution if running.
 */
const createMockSubmissionTask = (studentId, simulatedDurationMs = 60) => {
  return async () => {
    // Add jitter (40ms - 100ms) to simulate varying compilation and test times
    const jitter = Math.floor(Math.random() * 40) - 20;
    const duration = Math.max(10, simulatedDurationMs + jitter);
    await sleep(duration);

    return {
      studentId,
      status: "accepted",
      duration,
    };
  };
};

/**
 * Runs a burst test of N concurrent submissions.
 */
const runBurstTest = async (concurrentCount, concurrencySetting = 4) => {
  // Update concurrency for this run if specified
  submissionQueue.concurrency = concurrencySetting;

  const startCpu = process.cpuUsage();
  const startMemory = process.memoryUsage();
  const burstStartTime = Date.now();

  const executionTimes = [];
  let failures = 0;
  let maxQueueObserved = 0;

  console.log(`\n===============================================================`);
  console.log(` Starting Burst Test: ${concurrentCount} Concurrent Submissions`);
  console.log(` Queue Concurrency: ${submissionQueue.concurrency} Workers`);
  console.log(`===============================================================`);

  // Fire all submissions simultaneously to create a realistic burst
  const promises = Array.from({ length: concurrentCount }).map(async (_, idx) => {
    const studentId = `student_${idx + 1}`;
    const submitTime = Date.now();

    const stats = submissionQueue.getStats();
    if (stats.waitingTasks > maxQueueObserved) {
      maxQueueObserved = stats.waitingTasks;
    }

    try {
      const task = createMockSubmissionTask(studentId, 50);
      await submissionQueue.enqueue(task, { studentId });
      const elapsed = Date.now() - submitTime;
      executionTimes.push(elapsed);
    } catch (err) {
      failures++;
    }
  });

  await Promise.all(promises);

  const burstTotalTimeMs = Date.now() - burstStartTime;
  const endCpu = process.cpuUsage(startCpu);
  const endMemory = process.memoryUsage();

  const totalTimeSec = burstTotalTimeMs / 1000;
  const throughput = (concurrentCount / totalTimeSec).toFixed(2);

  const avgTime =
    executionTimes.length > 0
      ? (executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length).toFixed(1)
      : 0;
  const minTime = executionTimes.length > 0 ? Math.min(...executionTimes) : 0;
  const maxTime = executionTimes.length > 0 ? Math.max(...executionTimes) : 0;

  // Convert CPU microsecond usage to percentages over duration
  const totalCpuMicroseconds = endCpu.user + endCpu.system;
  const cpuPercent = ((totalCpuMicroseconds / 1000 / burstTotalTimeMs) * 100).toFixed(1);

  const ramUsedMb = ((endMemory.rss - startMemory.rss) / (1024 * 1024)).toFixed(2);
  const totalHeapMb = (endMemory.heapUsed / (1024 * 1024)).toFixed(2);

  const result = {
    concurrentSubmissions: concurrentCount,
    concurrencyWorkers: submissionQueue.concurrency,
    totalBurstTimeMs: burstTotalTimeMs,
    throughputReqSec: throughput,
    avgLatencyMs: avgTime,
    minLatencyMs: minTime,
    maxLatencyMs: maxTime,
    maxQueueLength: maxQueueObserved,
    failedCount: failures,
    cpuPercent: `${cpuPercent}%`,
    heapUsedMb: `${totalHeapMb} MB`,
    ramDeltaMb: `${ramUsedMb} MB`,
  };

  console.log(`Results for ${concurrentCount} Submissions:`);
  console.log(`  • Total Burst Time:    ${burstTotalTimeMs} ms`);
  console.log(`  • Throughput:          ${throughput} req/s`);
  console.log(`  • Average Latency:     ${avgTime} ms`);
  console.log(`  • Min / Max Latency:   ${minTime} ms / ${maxTime} ms`);
  console.log(`  • Peak Queue Length:   ${maxQueueObserved}`);
  console.log(`  • Failures / Rejects:  ${failures}`);
  console.log(`  • CPU Usage:           ${cpuPercent}%`);
  console.log(`  • Heap Memory Used:    ${totalHeapMb} MB`);

  return result;
};

const runAllLoadTests = async () => {
  const burstSizes = [10, 20, 40, 60, 100, 120];
  const summaryTable = [];

  console.log("===============================================================");
  console.log("   CLABTOPro Load Testing Suite - 120 Student Concurrency Test  ");
  console.log("===============================================================");

  for (const size of burstSizes) {
    const res = await runBurstTest(size, 4);
    summaryTable.push(res);
    // Cool-down pause between bursts
    await sleep(250);
  }

  console.log("\n==========================================================================================");
  console.log("                                  FINAL LOAD TEST SUMMARY                                  ");
  console.log("==========================================================================================");
  console.table(summaryTable);
  console.log("==========================================================================================\n");
};

runAllLoadTests().catch((err) => {
  console.error("Load test suite encountered error:", err);
  process.exit(1);
});
