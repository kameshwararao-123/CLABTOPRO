/**
 * Lightweight in-memory sliding-window rate limiter middleware.
 * Keys requests by authenticated userId (when available) or client IP.
 */
export const createRateLimiter = ({
  windowMs = 60 * 1000,
  max = 30,
  message = "Too many requests. Please slow down and try again shortly.",
  keyGenerator = (req) => req.user?.userId || req.ip || "anonymous",
} = {}) => {
  const hits = new Map();

  // Periodically prune expired windows to prevent unbounded memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now >= entry.resetAt) {
        hits.delete(key);
      }
    }
  }, Math.max(windowMs, 60000));

  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }

  return (req, res, next) => {
    const key = String(keyGenerator(req));
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      hits.set(key, entry);
    } else {
      entry.count += 1;
    }

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
};

export const executionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many code execution requests. Please wait a moment before running again.",
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.ip || "anonymous",
  message: "Too many authentication attempts. Please try again later.",
});
