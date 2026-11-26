import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import connectDB, { getDatabaseHealth } from './configs/db.js';

import authRoutes from "./routes/authRoutes.js";
import topicRoutes from "./routes/topicRoutes.js";
import problemRoutes from "./routes/problemRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import progressRoutes from "./routes/progressRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import executionRoutes from "./routes/executionRoutes.js";
import draftRoutes from "./routes/draftRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import leaderboardRoutes from "./routes/leaderboardRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import {
  requestLogger,
  notFoundHandler,
  errorHandler,
} from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";

const app = express();

// Configure proxy trust safely for Render (1 reverse-proxy hop) without blindly trusting arbitrary X-Forwarded-For chains.
const trustProxySetting =
  process.env.TRUST_PROXY !== undefined
    ? process.env.TRUST_PROXY === "false" || process.env.TRUST_PROXY === "0"
      ? false
      : Number.isNaN(Number(process.env.TRUST_PROXY))
      ? 1
      : Number(process.env.TRUST_PROXY)
    : process.env.NODE_ENV === "production" || Boolean(process.env.RENDER)
    ? 1
    : false;
app.set("trust proxy", trustProxySetting);

app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(requestLogger);

// Connect to MongoDB before accepting traffic; fail fast if initial connection fails
try {
  await connectDB();
} catch (dbErr) {
  logger.error("Fatal startup failure: MongoDB connection failed", {
    error: dbErr.message,
  });
  process.exit(1);
}
//route...
app.use("/api/auth", authRoutes);

app.use("/api/topics", topicRoutes);

app.use("/api/problems", problemRoutes);

app.use("/api/submissions", submissionRoutes);

app.use("/api/progress", progressRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/execution", executionRoutes);

app.use("/api/drafts", draftRoutes);

app.use("/api/notifications", notificationRoutes);

app.use("/api/leaderboard", leaderboardRoutes);

app.use("/api/exams", examRoutes);

// Health check endpoint (lightweight MongoDB ping)
app.get("/api/health", async (req, res) => {
  const dbHealth = await getDatabaseHealth();
  const isHealthy = dbHealth.available;
  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    database: dbHealth,
  });
});

//for server testing.....
app.get("/", (req, res) => {
    res.send("welcome to clab to pro server runs successfully");
});

app.use(notFoundHandler);
app.use(errorHandler);

//for server...
const PORT = process.env.PORT || 3400;
const server = app.listen(PORT, () => {
    logger.info("Server started", { port: PORT });
});

const shutdownGracefully = async (signal) => {
  logger.info("Shutdown signal received", { signal });
  server.close(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore close errors
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdownGracefully("SIGINT"));
process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
