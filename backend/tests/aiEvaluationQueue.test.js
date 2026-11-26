import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { AIEvaluationQueue } from "../services/aiEvaluationQueue.js";
import { evaluateConceptualAnswer } from "../services/examAIService.js";

test("1. AIEvaluationQueue enforces controlled concurrency across 90 concurrent evaluation requests", async () => {
  const queue = new AIEvaluationQueue({ concurrency: 2, maxQueueSize: 200, baseRetryDelayMs: 5 });
  const examId = new mongoose.Types.ObjectId().toString();
  const qId = new mongoose.Types.ObjectId().toString();

  let active = 0;
  let maxObservedActive = 0;

  const jobs = Array.from({ length: 90 }, (_, idx) =>
    queue.enqueue({
      examId,
      studentId: `student-${idx}`,
      questionId: qId,
      submissionId: `sub-${idx}`,
      attemptNumber: 1,
      task: async () => {
        active++;
        if (active > maxObservedActive) maxObservedActive = active;
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return { status: "success", errorPercentage: 10, modelUsed: "gemini-2.5-flash-lite" };
      },
    })
  );

  const results = await Promise.all(jobs.map((j) => j.promise));
  assert.equal(maxObservedActive, 2);
  assert.equal(results.length, 90);
  assert.equal(queue.getStats().totalProcessed, 90);
  assert.equal(queue.getStats().activeWorkers, 0);
});

test("2. AIEvaluationQueue prevents duplicate jobs for same submission version and allows new versions", async () => {
  const queue = new AIEvaluationQueue({ concurrency: 1, baseRetryDelayMs: 5 });
  let executions = 0;
  let releaseFirst;
  const gate = new Promise((r) => {
    releaseFirst = r;
  });

  const first = queue.enqueue({
    examId: "e1",
    studentId: "s1",
    questionId: "q1",
    submissionId: "sub1",
    attemptNumber: 1,
    task: async () => {
      executions++;
      return gate;
    },
  });

  // Duplicate request for same attemptNumber=1 -> deduplicated
  const dup = queue.enqueue({
    examId: "e1",
    studentId: "s1",
    questionId: "q1",
    submissionId: "sub1",
    attemptNumber: 1,
    task: async () => {
      executions++;
      return { status: "success" };
    },
  });

  // Updated submission attemptNumber=2 -> allowed as a new job
  const v2 = queue.enqueue({
    examId: "e1",
    studentId: "s1",
    questionId: "q1",
    submissionId: "sub2",
    attemptNumber: 2,
    task: async () => {
      executions++;
      return { status: "success", attempt: 2 };
    },
  });

  assert.equal(first.deduplicated, false);
  assert.equal(dup.deduplicated, true);
  assert.equal(v2.deduplicated, false);

  releaseFirst({ status: "success", attempt: 1 });
  const [r1, rDup, rV2] = await Promise.all([first.promise, dup.promise, v2.promise]);
  assert.equal(r1.attempt, 1);
  assert.equal(rDup.attempt, 1);
  assert.equal(rV2.attempt, 2);
  assert.equal(executions, 2);
});

test("3. AIEvaluationQueue retries transient 429/503 responses with backoff and respects permanent failure limit", async () => {
  const queue = new AIEvaluationQueue({ concurrency: 1, maxRetries: 2, baseRetryDelayMs: 10 });
  let attempts = 0;

  const queued = queue.enqueue({
    examId: "e1",
    studentId: "s2",
    questionId: "q1",
    submissionId: "sub2",
    attemptNumber: 1,
    task: async () => {
      attempts++;
      if (attempts < 3) {
        return {
          status: "transient_error",
          retryable: true,
          statusCode: 429,
          retryAfterMs: 15,
          error: "HTTP 429 rate limited",
        };
      }
      return { status: "success", errorPercentage: 15, modelUsed: "gemini-2.5-flash-lite" };
    },
  });

  const result = await queued.promise;
  assert.equal(result.status, "success");
  assert.equal(attempts, 3);
  assert.equal(queue.getStats().totalRetried, 2);
});

test("4. evaluateConceptualAnswer uses primary + secondary model, handles 429 transient vs 401 permanent, and marks fallback", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  try {
    process.env.GEMINI_API_KEY = "test-key";

    // Permanent 401 -> stops after 1 call without cascading through 4 models
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls++;
      return { ok: false, status: 401, headers: new Headers() };
    };

    const permRes = await evaluateConceptualAnswer({
      question: { title: "Reverse Array", marks: 10 },
      studentAnswer: "Use two pointers left and right and swap elements until they meet.",
      allowFallback: false,
    });
    assert.equal(fetchCalls, 1);
    assert.equal(permRes.status, "failed");
    assert.equal(permRes.retryable, false);

    // Transient 429 with Retry-After -> returns transient_error when allowFallback=false
    fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls++;
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "2" }),
      };
    };

    const transRes = await evaluateConceptualAnswer({
      question: { title: "Reverse Array", marks: 10 },
      studentAnswer: "Use two pointers left and right and swap elements until they meet.",
      allowFallback: false,
    });
    assert.equal(fetchCalls, 2); // primary + 1 secondary fallback
    assert.equal(transRes.status, "transient_error");
    assert.equal(transRes.retryable, true);
    assert.equal(transRes.retryAfterMs, 2000);

    // When allowFallback=true after retries exhausted -> marks isFallback=true clearly
    const fallbackRes = await evaluateConceptualAnswer({
      question: { title: "Reverse Array", marks: 10 },
      studentAnswer: "Use two pointers left and right and swap elements until they meet.",
      allowFallback: true,
    });
    assert.equal(fallbackRes.isFallback, true);
    assert.equal(fallbackRes.evaluationSource, "rule_based_fallback");

    // HTTP 404 on primary model tries secondary model
    fetchCalls = 0;
    globalThis.fetch = async (url) => {
      fetchCalls++;
      if (String(url).includes("gemini-2.5-flash-lite") || String(url).includes("gemini-flash-lite-latest")) {
        return { ok: false, status: 404, headers: new Headers() };
      }
      return { ok: false, status: 503, headers: new Headers() };
    };
    const res404 = await evaluateConceptualAnswer({
      question: { title: "Reverse Array", marks: 10 },
      studentAnswer: "Use two pointers left and right and swap elements until they meet.",
      allowFallback: true,
    });
    assert.equal(fetchCalls, 2);
    assert.equal(res404.isFallback, true);
  } finally {
    process.env.GEMINI_API_KEY = origKey;
    globalThis.fetch = origFetch;
  }
});
