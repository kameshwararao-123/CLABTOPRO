import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import connectDB from './configs/db.js';

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
import {
  requestLogger,
  notFoundHandler,
  errorHandler,
} from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(requestLogger);

//mongodb connection...
await connectDB();
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

//for server testing.....
app.get("/", (req, res) => {
    res.send("welcome to clab to pro server runs successfully");
});

app.use(notFoundHandler);
app.use(errorHandler);

//for server...
const PORT = process.env.PORT || 3400;
app.listen(PORT, () => {
    logger.info("Server started", { port: PORT });
});
