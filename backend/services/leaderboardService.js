import User from "../models/User.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import Progress from "../models/Progress.js";
import LeaderboardEntry from "../models/LeaderboardEntry.js";
import LeaderboardSnapshot from "../models/LeaderboardSnapshot.js";
import { getISTDateKey, shiftISTDateKey } from "../utils/dateIST.js";

export const DIFFICULTY_WEIGHTS = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
};

const HISTORICAL_WEIGHT = 0.7;
const TODAY_WEIGHT = 0.3;
const CONSISTENCY_WEIGHT = 0.4;
const ACCURACY_WEIGHT = 0.35;
const PROBLEM_SOLVING_WEIGHT = 0.25;

const PRACTICE_DAYS_TARGET = 20; // 20+ active days in 30 days = 100% practice-day consistency
const STREAK_TARGET = 14; // 14-day streak = 100% streak bonus
const MIN_PROBLEM_POOL_POINTS = 10;
const DAILY_DIFFICULTY_TARGET = 4; // e.g., 2 Medium or 1 Hard + 1 Easy = 100% daily solving

export const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const clamp100 = (value) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * Computes pure historical & today's leaderboard metrics on a 0-100 scale.
 * Exported for deterministic unit testing and reuse.
 */
export const computeStudentLeaderboardMetrics = ({
  submissions = [],
  problemDifficultyMap = new Map(),
  maxProblemPoolPoints = MIN_PROBLEM_POOL_POINTS,
  currentStreak = 0,
  todayKey = getISTDateKey(),
}) => {
  const windowStartKey = shiftISTDateKey(todayKey, -29); // Rolling 30-day IST window

  const evaluated = submissions.filter((s) => s.status && s.status !== "pending");
  const totalAttempted = evaluated.length;
  let totalAccepted = 0;

  const uniqueSolvedProblemIds = new Set();
  const practiceDaysSet = new Set();

  let todayAttempted = 0;
  let todayAccepted = 0;
  const todayUniqueSolvedIds = new Set();

  for (const sub of evaluated) {
    const probId = sub.problem ? sub.problem.toString() : null;
    const subDate = sub.submittedAt || sub.createdAt;
    const dateKey = subDate ? getISTDateKey(new Date(subDate)) : null;

    if (dateKey && dateKey >= windowStartKey && dateKey <= todayKey) {
      practiceDaysSet.add(dateKey);
    }

    const isAccepted = sub.status === "accepted";
    if (isAccepted) {
      totalAccepted += 1;
      if (probId) {
        uniqueSolvedProblemIds.add(probId);
      }
    }

    if (dateKey === todayKey) {
      todayAttempted += 1;
      if (isAccepted) {
        todayAccepted += 1;
        if (probId) {
          todayUniqueSolvedIds.add(probId);
        }
      }
    }
  }

  // Historical Consistency (40%)
  const practiceDays30 = practiceDaysSet.size;
  const practiceRatio = Math.min(1, practiceDays30 / PRACTICE_DAYS_TARGET);
  const streakBonus = Math.min(1, Math.max(0, currentStreak) / STREAK_TARGET);
  const consistencyScore = round2(
    clamp100((practiceRatio * 0.75 + streakBonus * 0.25) * 100)
  );

  // Historical Accuracy (35%) - handles 0 attempts safely
  const accuracyPercent =
    totalAttempted > 0
      ? round2(clamp100((totalAccepted / totalAttempted) * 100))
      : 0;
  const accuracyScore = accuracyPercent;

  // Historical Problem Solving (25%) - unique accepted problems weighted by difficulty
  let earnedDifficultyPoints = 0;
  for (const probId of uniqueSolvedProblemIds) {
    const diff = problemDifficultyMap.get(probId) || "Easy";
    earnedDifficultyPoints += DIFFICULTY_WEIGHTS[diff] || 1;
  }
  const effectivePool = Math.max(MIN_PROBLEM_POOL_POINTS, maxProblemPoolPoints);
  const problemSolvingScore = round2(
    clamp100((earnedDifficultyPoints / effectivePool) * 100)
  );

  const historicalScore = round2(
    clamp100(
      consistencyScore * CONSISTENCY_WEIGHT +
        accuracyScore * ACCURACY_WEIGHT +
        problemSolvingScore * PROBLEM_SOLVING_WEIGHT
    )
  );

  // Today's Performance (0-100)
  let todayDifficultyPoints = 0;
  for (const probId of todayUniqueSolvedIds) {
    const diff = problemDifficultyMap.get(probId) || "Easy";
    todayDifficultyPoints += DIFFICULTY_WEIGHTS[diff] || 1;
  }

  let todayScore = 0;
  if (todayAttempted > 0) {
    const todayConsistency = 100; // Practiced today
    const todayAccuracy = clamp100((todayAccepted / todayAttempted) * 100);
    const todayProblemSolving = clamp100(
      (todayDifficultyPoints / DAILY_DIFFICULTY_TARGET) * 100
    );
    todayScore = round2(
      clamp100(
        todayConsistency * CONSISTENCY_WEIGHT +
          todayAccuracy * ACCURACY_WEIGHT +
          todayProblemSolving * PROBLEM_SOLVING_WEIGHT
      )
    );
  }

  // Final Unified Score: 70% Historical + 30% Today
  const overallScore = round2(
    clamp100(historicalScore * HISTORICAL_WEIGHT + todayScore * TODAY_WEIGHT)
  );

  return {
    consistencyScore,
    accuracyScore,
    problemSolvingScore,
    historicalScore,
    todayDateKey: todayKey,
    todayAttempted,
    todayAccepted,
    todayUniqueSolvedCount: todayUniqueSolvedIds.size,
    todayDifficultyPoints,
    todayScore,
    overallScore,
    totalSolved: uniqueSolvedProblemIds.size,
    totalAttempted,
    totalAccepted,
    accuracyPercent,
    currentStreak: Math.max(0, currentStreak),
    practiceDays30,
  };
};

const loadProblemDifficultyContext = async () => {
  const problems = await Problem.find({})
    .select("_id difficulty status")
    .lean();

  const problemDifficultyMap = new Map();
  let maxProblemPoolPoints = 0;

  for (const p of problems) {
    const diff = p.difficulty || "Easy";
    problemDifficultyMap.set(p._id.toString(), diff);
    if (p.status === "published") {
      maxProblemPoolPoints += DIFFICULTY_WEIGHTS[diff] || 1;
    }
  }

  return {
    problemDifficultyMap,
    maxProblemPoolPoints: Math.max(MIN_PROBLEM_POOL_POINTS, maxProblemPoolPoints),
  };
};

/**
 * Recomputes dense/1-based ranks across all LeaderboardEntry documents
 * and attaches previousRank from yesterday's snapshot if available.
 */
export const recalculateRanks = async (todayKey = getISTDateKey()) => {
  const yesterdayKey = shiftISTDateKey(todayKey, -1);

  const [entries, snapshot] = await Promise.all([
    LeaderboardEntry.find({})
      .select("_id user overallScore historicalScore totalSolved accuracyPercent")
      .sort({
        overallScore: -1,
        historicalScore: -1,
        totalSolved: -1,
        accuracyPercent: -1,
        user: 1,
      })
      .lean(),
    LeaderboardSnapshot.findOne({ dateKey: yesterdayKey }).lean(),
  ]);

  if (entries.length === 0) return;

  const prevRankMap = new Map();
  if (snapshot && Array.isArray(snapshot.ranks)) {
    for (const item of snapshot.ranks) {
      prevRankMap.set(item.user.toString(), item.rank);
    }
  }

  const bulkOps = entries.map((entry, idx) => {
    const newRank = idx + 1;
    const prevRank = prevRankMap.has(entry.user.toString())
      ? prevRankMap.get(entry.user.toString())
      : null;

    return {
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            currentRank: newRank,
            previousRank: prevRank,
            previousRankDateKey: prevRank !== null ? yesterdayKey : null,
          },
        },
      },
    };
  });

  if (bulkOps.length > 0) {
    await LeaderboardEntry.bulkWrite(bulkOps, { ordered: false });
  }
};

/**
 * Handles Asia/Kolkata midnight rollover without erasing historical performance.
 * Saves yesterday's ranking snapshot before resetting today's counters to 0.
 */
export const rolloverIfMidnightPassed = async (todayKey = getISTDateKey()) => {
  const staleEntry = await LeaderboardEntry.findOne({
    todayDateKey: { $ne: todayKey },
  })
    .select("_id todayDateKey")
    .lean();

  if (!staleEntry) return false;

  const yesterdayKey = shiftISTDateKey(todayKey, -1);
  const existingSnapshot = await LeaderboardSnapshot.findOne({
    dateKey: yesterdayKey,
  })
    .select("_id")
    .lean();

  if (!existingSnapshot) {
    const currentEntries = await LeaderboardEntry.find({})
      .select("user currentRank overallScore")
      .sort({
        overallScore: -1,
        historicalScore: -1,
        totalSolved: -1,
        accuracyPercent: -1,
        user: 1,
      })
      .lean();

    if (currentEntries.length > 0) {
      await LeaderboardSnapshot.findOneAndUpdate(
        { dateKey: yesterdayKey },
        {
          $setOnInsert: {
            dateKey: yesterdayKey,
            ranks: currentEntries.map((e, idx) => ({
              user: e.user,
              rank: e.currentRank > 0 ? e.currentRank : idx + 1,
              overallScore: e.overallScore || 0,
            })),
          },
        },
        { upsert: true }
      );
    }
  }

  // Reset only today's metrics while keeping historicalScore completely intact
  const entriesToReset = await LeaderboardEntry.find({
    todayDateKey: { $ne: todayKey },
  })
    .select("_id historicalScore")
    .lean();

  if (entriesToReset.length > 0) {
    const resetOps = entriesToReset.map((entry) => ({
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            todayDateKey: todayKey,
            todayAttempted: 0,
            todayAccepted: 0,
            todayUniqueSolvedCount: 0,
            todayDifficultyPoints: 0,
            todayScore: 0,
            overallScore: round2(clamp100((entry.historicalScore || 0) * HISTORICAL_WEIGHT)),
          },
        },
      },
    }));

    await LeaderboardEntry.bulkWrite(resetOps, { ordered: false });
  }

  await recalculateRanks(todayKey);
  return true;
};

/**
 * Updates a single student's LeaderboardEntry after a submission is evaluated.
 * Uses submissionId idempotency to prevent duplicate submission rewards.
 */
export const updateStudentLeaderboardAfterSubmission = async ({
  userId,
  submissionId = null,
  now = new Date(),
}) => {
  const todayKey = getISTDateKey(now);
  await rolloverIfMidnightPassed(todayKey);

  if (submissionId) {
    const existing = await LeaderboardEntry.findOne({
      user: userId,
      lastEvaluatedSubmissionId: submissionId,
    })
      .select("_id")
      .lean();

    if (existing) {
      return null; // Idempotent guard: already processed
    }
  }

  const [user, progress, submissions, diffContext] = await Promise.all([
    User.findById(userId).select("_id username rollNo role currentStreak").lean(),
    Progress.findOne({ user: userId }).select("currentStreak").lean(),
    Submission.find({ user: userId, status: { $ne: "pending" } })
      .select("problem status submittedAt createdAt")
      .lean(),
    loadProblemDifficultyContext(),
  ]);

  if (!user || user.role === "admin") {
    return null;
  }

  const currentStreak = progress?.currentStreak ?? user.currentStreak ?? 0;
  const metrics = computeStudentLeaderboardMetrics({
    submissions,
    problemDifficultyMap: diffContext.problemDifficultyMap,
    maxProblemPoolPoints: diffContext.maxProblemPoolPoints,
    currentStreak,
    todayKey,
  });

  const updateFields = {
    username: user.username,
    rollNo: user.rollNo || "",
    ...metrics,
  };
  if (submissionId) {
    updateFields.lastEvaluatedSubmissionId = submissionId;
  }

  await LeaderboardEntry.findOneAndUpdate(
    { user: userId },
    { $set: updateFields },
    { upsert: true, new: true }
  );

  await recalculateRanks(todayKey);

  return LeaderboardEntry.findOne({ user: userId }).lean();
};

/**
 * Initial seed / full rebuild for all students when LeaderboardEntry is empty.
 */
export const rebuildAllLeaderboardEntries = async (now = new Date()) => {
  const todayKey = getISTDateKey(now);

  const [students, progresses, submissions, diffContext] = await Promise.all([
    User.find({ role: "student" })
      .select("_id username rollNo currentStreak")
      .lean(),
    Progress.find({}).select("user currentStreak").lean(),
    Submission.find({ status: { $ne: "pending" } })
      .select("user problem status submittedAt createdAt")
      .lean(),
    loadProblemDifficultyContext(),
  ]);

  if (students.length === 0) return [];

  const streakByUser = new Map();
  for (const p of progresses) {
    streakByUser.set(p.user.toString(), p.currentStreak || 0);
  }

  const subsByUser = new Map();
  for (const sub of submissions) {
    const uid = sub.user.toString();
    if (!subsByUser.has(uid)) {
      subsByUser.set(uid, []);
    }
    subsByUser.get(uid).push(sub);
  }

  const ops = students.map((student) => {
    const uid = student._id.toString();
    const currentStreak = streakByUser.get(uid) ?? student.currentStreak ?? 0;
    const userSubs = subsByUser.get(uid) || [];

    const metrics = computeStudentLeaderboardMetrics({
      submissions: userSubs,
      problemDifficultyMap: diffContext.problemDifficultyMap,
      maxProblemPoolPoints: diffContext.maxProblemPoolPoints,
      currentStreak,
      todayKey,
    });

    return {
      updateOne: {
        filter: { user: student._id },
        update: {
          $set: {
            user: student._id,
            username: student.username,
            rollNo: student.rollNo || "",
            ...metrics,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await LeaderboardEntry.bulkWrite(ops, { ordered: false });
  }

  await recalculateRanks(todayKey);
  return LeaderboardEntry.find({}).sort({ currentRank: 1 }).lean();
};

const formatEntryForResponse = (entry, hasPreviousSnapshot) => {
  const rank = entry.currentRank || 0;
  const previousRank =
    hasPreviousSnapshot && typeof entry.previousRank === "number"
      ? entry.previousRank
      : null;
  const rankMovement =
    previousRank !== null && rank > 0 ? previousRank - rank : null;

  return {
    userId: entry.user,
    username: entry.username,
    rollNo: entry.rollNo || "",
    rank,
    previousRank,
    rankMovement,
    overallScore: round2(entry.overallScore || 0),
    historicalScore: round2(entry.historicalScore || 0),
    historicalContribution: round2((entry.historicalScore || 0) * HISTORICAL_WEIGHT),
    todayScore: round2(entry.todayScore || 0),
    todayContribution: round2((entry.todayScore || 0) * TODAY_WEIGHT),
    consistencyScore: round2(entry.consistencyScore || 0),
    accuracyScore: round2(entry.accuracyScore || 0),
    problemSolvingScore: round2(entry.problemSolvingScore || 0),
    totalSolved: entry.totalSolved || 0,
    totalAttempted: entry.totalAttempted || 0,
    totalAccepted: entry.totalAccepted || 0,
    accuracyPercent: round2(entry.accuracyPercent || 0),
    currentStreak: entry.currentStreak || 0,
    practiceDays30: entry.practiceDays30 || 0,
    todayAttempted: entry.todayAttempted || 0,
    todayAccepted: entry.todayAccepted || 0,
    todayUniqueSolvedCount: entry.todayUniqueSolvedCount || 0,
  };
};

/**
 * Authenticated leaderboard read path.
 * Uses cached LeaderboardEntry documents rather than recalculating full history per request.
 */
export const getLeaderboardForUser = async ({ userId, limit = 50 }) => {
  const todayKey = getISTDateKey();
  const yesterdayKey = shiftISTDateKey(todayKey, -1);

  const count = await LeaderboardEntry.countDocuments();
  if (count === 0) {
    await rebuildAllLeaderboardEntries();
  } else {
    await rolloverIfMidnightPassed(todayKey);
  }

  const [entries, myEntry, yesterdaySnapshot] = await Promise.all([
    LeaderboardEntry.find({})
      .sort({ currentRank: 1, user: 1 })
      .limit(limit)
      .lean(),
    LeaderboardEntry.findOne({ user: userId }).lean(),
    LeaderboardSnapshot.findOne({ dateKey: yesterdayKey })
      .select("_id")
      .lean(),
  ]);

  const hasPreviousSnapshot = Boolean(yesterdaySnapshot);
  const formattedEntries = entries.map((e) =>
    formatEntryForResponse(e, hasPreviousSnapshot)
  );

  const currentUserFormatted = myEntry
    ? formatEntryForResponse(myEntry, hasPreviousSnapshot)
    : null;

  return {
    dateKey: todayKey,
    timezone: "Asia/Kolkata",
    hasPreviousSnapshot,
    topStudents: formattedEntries.slice(0, 3),
    entries: formattedEntries,
    currentUser: currentUserFormatted,
  };
};
