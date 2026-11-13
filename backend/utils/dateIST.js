const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns the YYYY-MM-DD calendar date string in Asia/Kolkata timezone.
 */
export const getISTDateKey = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/**
 * Returns UTC Date bounds [start, end] for a given YYYY-MM-DD dateKey in Asia/Kolkata (+05:30).
 */
export const getISTDayBounds = (dateKey) => {
  const start = new Date(`${dateKey}T00:00:00.000+05:30`);
  const end = new Date(`${dateKey}T23:59:59.999+05:30`);
  return { start, end };
};

/**
 * Returns the YYYY-MM-DD dateKey for N days prior to a given IST dateKey.
 */
export const shiftISTDateKey = (dateKey, deltaDays) => {
  const anchor = new Date(`${dateKey}T12:00:00.000+05:30`);
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return getISTDateKey(anchor);
};
