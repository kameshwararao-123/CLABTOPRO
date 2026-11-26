export const TERMINAL_EXAM_PROGRESS_STATUSES = new Set([
  "completed",
  "successfully_completed",
  "time_expired",
]);

/**
 * Authoritative frontend helper to determine whether a student's exam progress
 * has reached a terminal/completed state.
 */
export const isExamProgressCompleted = (progressOrStatus, apiResponse = null) => {
  if (apiResponse?.isCompleted || apiResponse?.isSuccessfullyCompleted) {
    return true;
  }
  const status =
    typeof progressOrStatus === "string"
      ? progressOrStatus
      : progressOrStatus?.status;
  return Boolean(status && TERMINAL_EXAM_PROGRESS_STATUSES.has(status));
};
