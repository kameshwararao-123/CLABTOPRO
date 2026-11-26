/**
 * Lightweight in-memory sliding-window rate limiter middleware.
 * Keys requests by authenticated userId, normalized account identifier, or client IP.
 *
 * NOTE: Uses process-local in-memory Map storage (suitable for Render Free single-instance
 * deployment without requiring a paid Redis add-on). Limits reset on server restart and
 * are not shared across horizontally scaled instances unless backed by a shared store.
 */

const normalizeEmailKey = (req) => {
  const raw = req.body?.email;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();
  // Ensure invalid/non-email strings still map to a bounded fallback bucket rather than bypassing limits
  if (!trimmed || trimmed.length > 254 || !trimmed.includes("@")) {
    return "";
  }
  return trimmed;
};

const getClientIp = (req) => req.ip || req.socket?.remoteAddress || "anonymous";

export const createRateLimiter = ({
  windowMs = 60 * 1000,
  max = 30,
  message = "Too many requests. Please slow down and try again shortly.",
  keyGenerator = (req) => req.user?.userId || getClientIp(req),
  skipSuccessfulRequests = false,
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
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    if (entry.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (skipSuccessfulRequests) {
      let refunded = false;
      const refundIfSuccess = () => {
        if (refunded) return;
        if (res.statusCode && res.statusCode < 400) {
          refunded = true;
          entry.count = Math.max(0, entry.count - 1);
        }
      };

      if (typeof res.on === "function") {
        res.on("finish", refundIfSuccess);
      }
      // Also wrap res.json for lightweight mock response objects in unit tests
      if (typeof res.json === "function") {
        const origJson = res.json.bind(res);
        res.json = (body) => {
          refundIfSuccess();
          return origJson(body);
        };
      }
    }

    next();
  };
};

export const executionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many code execution requests. Please wait a moment before running again.",
});

// 1. Login: Account-based failed-attempt limiter (prevents brute-force on one account without blocking lab peers)
export const loginAccountRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = normalizeEmailKey(req);
    const ip = getClientIp(req);
    return email ? `login:acct:${email}` : `login:invalid:${ip}`;
  },
  message: "Too many failed login attempts for this account. Please try again later.",
});

// 2. Login: College-lab-friendly IP safety limiter (allows 90-100+ students sharing one public IP)
export const loginIpSafetyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 250,
  keyGenerator: (req) => `login:ip:${getClientIp(req)}`,
  message: "Too many login requests from this network. Please wait a moment and try again.",
});

// 3. Registration: Per-email/identifier limiter + college-lab IP safety limiter
export const registerAccountRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const email = normalizeEmailKey(req);
    const ip = getClientIp(req);
    return email ? `register:acct:${email}` : `register:invalid:${ip}`;
  },
  message: "Too many registration attempts for this email. Please try again later.",
});

export const registerIpSafetyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 250,
  keyGenerator: (req) => `register:ip:${getClientIp(req)}`,
  message: "Too many registration requests from this network. Please try again shortly.",
});

// 4. Forgot Password: Per-email limiter + IP safety limiter (never leaks account existence)
export const forgotPasswordAccountLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const email = normalizeEmailKey(req);
    const ip = getClientIp(req);
    return email ? `forgot:acct:${email}` : `forgot:invalid:${ip}`;
  },
  message: "Too many password reset requests. Please try again later.",
});

export const forgotPasswordIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `forgot:ip:${getClientIp(req)}`,
  message: "Too many password reset requests from this network. Please try again later.",
});

// 5. Reset Password: Per-token+IP limiter + IP safety limiter
export const resetPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const token = typeof req.params?.token === "string" ? req.params.token.slice(0, 16) : "none";
    return `reset:${token}:${getClientIp(req)}`;
  },
  message: "Too many password reset attempts. Please try again later.",
});

export const resetPasswordIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `reset:ip:${getClientIp(req)}`,
  message: "Too many password reset requests from this network. Please try again later.",
});

// Backward-compatible alias
export const authRateLimiter = loginIpSafetyLimiter;
