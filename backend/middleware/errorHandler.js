import { logger } from "../utils/logger.js";

/**
 * Structured HTTP request logger middleware.
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const meta = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.userId || null,
    };

    if (res.statusCode >= 500) {
      logger.error("HTTP request failed", meta);
    } else if (res.statusCode >= 400) {
      logger.warn("HTTP client error", meta);
    } else {
      logger.info("HTTP request", meta);
    }
  });

  next();
};

/**
 * 404 handler for unmatched API routes.
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Centralized Express error-handling middleware.
 */
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || "Internal server error";

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path || "identifier"} format`;
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(", ") || "Validation failed";
  } else if (err.code === 11000) {
    statusCode = 409;
    const dupField = Object.keys(err.keyValue || {})[0] || "field";
    message = `Duplicate value for ${dupField}`;
  } else if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Invalid or expired token";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request payload exceeds maximum allowed size";
  }

  logger.error("Unhandled application error", {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    errorName: err.name,
    errorMessage: message,
    userId: req.user?.userId || null,
  });

  res.status(statusCode).json({
    message,
  });
};
