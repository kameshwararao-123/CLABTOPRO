import test from "node:test";
import assert from "node:assert/strict";
import { getISTDateKey, shiftISTDateKey } from "../utils/dateIST.js";
import { computeStudentLeaderboardMetrics } from "../services/leaderboardService.js";

const buildProblemMap = () =>
  new Map([
    ["p1", "Easy"],
    ["p2", "Medium"],
    ["p3", "Hard"],
    ["p4", "Medium"],
    ["p5", "Hard"],
  ]);

test("Student with no previous performance returns 0s without division errors", () => {
  const result = computeStudentLeaderboardMetrics({
    submissions: [],
    problemDifficultyMap: buildProblemMap(),
    maxProblemPoolPoints: 11,
    currentStreak: 0,
    todayKey: "2026-11-12",
  });

  assert.equal(result.historicalScore, 0);
  assert.equal(result.todayScore, 0);
  assert.equal(result.overallScore, 0);
  assert.equal(result.accuracyPercent, 0);
  assert.equal(result.totalSolved, 0);
});

test("Student with historical performance but no activity today keeps historicalScore intact", () => {
  const result = computeStudentLeaderboardMetrics({
    submissions: [
      { problem: "p1", status: "accepted", submittedAt: "2026-11-10T10:00:00+05:30" },
      { problem: "p2", status: "accepted", submittedAt: "2026-11-11T10:00:00+05:30" },
    ],
    problemDifficultyMap: buildProblemMap(),
    maxProblemPoolPoints: 11,
    currentStreak: 2,
    todayKey: "2026-11-12",
  });

  assert.equal(result.todayAttempted, 0);
  assert.equal(result.todayScore, 0);
  assert.ok(result.historicalScore > 0);
  assert.equal(
    result.overallScore,
    Math.round((result.historicalScore * 0.7 + Number.EPSILON) * 100) / 100
  );
});

test("Student practicing consistently every day achieves 100 consistencyScore", () => {
  const todayKey = "2026-11-20";
  const submissions = [];
  for (let i = 0; i < 20; i++) {
    const dayKey = shiftISTDateKey(todayKey, -i);
    submissions.push({
      problem: "p1",
      status: "accepted",
      submittedAt: `${dayKey}T12:00:00+05:30`,
    });
  }

  const result = computeStudentLeaderboardMetrics({
    submissions,
    problemDifficultyMap: buildProblemMap(),
    maxProblemPoolPoints: 11,
    currentStreak: 20,
    todayKey,
  });

  assert.equal(result.practiceDays30, 20);
  assert.equal(result.consistencyScore, 100);
});

test("Duplicate accepted submissions for the same problem do not award duplicate problem-solving rewards", () => {
  const singleAccepted = computeStudentLeaderboardMetrics({
    submissions: [
      { problem: "p3", status: "accepted", submittedAt: "2026-11-12T10:00:00+05:30" },
    ],
    problemDifficultyMap: buildProblemMap(),
    maxProblemPoolPoints: 11,
    currentStreak: 1,
    todayKey: "2026-11-12",
  });

  const duplicateAccepted = computeStudentLeaderboardMetrics({
    submissions: [
      { problem: "p3", status: "accepted", submittedAt: "2026-11-12T10:00:00+05:30" },
      { problem: "p3", status: "accepted", submittedAt: "2026-11-12T10:05:00+05:30" },
      { problem: "p3", status: "accepted", submittedAt: "2026-11-12T10:10:00+05:30" },
    ],
    problemDifficultyMap: buildProblemMap(),
    maxProblemPoolPoints: 11,
    currentStreak: 1,
    todayKey: "2026-11-12",
  });

  assert.equal(singleAccepted.totalSolved, 1);
  assert.equal(duplicateAccepted.totalSolved, 1);
  assert.equal(
    duplicateAccepted.problemSolvingScore,
    singleAccepted.problemSolvingScore
  );
  assert.equal(duplicateAccepted.todayUniqueSolvedCount, 1);
});

test("High accuracy with fewer solved vs many solved with low accuracy both stay bounded in 0-100", () => {
  const highAcc = computeStudentLeaderboardMetrics({
    submissions: [
      { problem: "p1", status: "accepted", submittedAt: "2026-11-12T10:00:00+05:30" },
    ],
    problemDifficultyMap: buildProblemMap(),
    maxProblemPoolPoints: 11,
    currentStreak: 1,
    todayKey: "2026-11-12",
  });

  const lowAccManySolved = computeStudentLeaderboardMetrics({
    submissions: [
      { problem: "p1", status: "wrong_answer", submittedAt: "2026-11-12T10:00:00+05:30" },
      { problem: "p1", status: "wrong_answer", submittedAt: "2026-11-12T10:01:00+05:30" },
      { problem: "p1", status: "accepted", submittedAt: "2026-11-12T10:02:00+05:30" },
      { problem: "p2", status: "wrong_answer", submittedAt: "2026-11-12T10:03:00+05:30" },
      { problem: "p2", status: "accepted", submittedAt: "2026-11-12T10:04:00+05:30" },
      { problem: "p3", status: "wrong_answer", submittedAt: "2026-11-12T10:05:00+05:30" },
      { problem: "p3", status: "accepted", submittedAt: "2026-11-12T10:06:00+05:30" },
    ],
    problemDifficultyMap: buildProblemMap(),
    maxProblemPoolPoints: 11,
    currentStreak: 1,
    todayKey: "2026-11-12",
  });

  assert.equal(highAcc.accuracyPercent, 100);
  assert.ok(lowAccManySolved.accuracyPercent < 50);
  assert.ok(lowAccManySolved.problemSolvingScore > highAcc.problemSolvingScore);
  assert.ok(highAcc.overallScore >= 0 && highAcc.overallScore <= 100);
  assert.ok(lowAccManySolved.overallScore >= 0 && lowAccManySolved.overallScore <= 100);
});

test("Asia/Kolkata midnight transition separates IST dates accurately", () => {
  // 2026-11-11 23:59:59 IST == 2026-11-11T18:29:59Z
  const beforeMidnight = new Date("2026-11-11T18:29:59.000Z");
  // 2026-11-12 00:00:00 IST == 2026-11-11T18:30:00Z
  const afterMidnight = new Date("2026-11-11T18:30:00.000Z");

  assert.equal(getISTDateKey(beforeMidnight), "2026-11-11");
  assert.equal(getISTDateKey(afterMidnight), "2026-11-12");
  assert.equal(shiftISTDateKey("2026-11-12", -1), "2026-11-11");
});
