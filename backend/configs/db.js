import dns from "dns";
import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

// Only override system DNS if explicitly requested via FORCE_PUBLIC_DNS=true
if (process.env.FORCE_PUBLIC_DNS === "true") {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  } catch (dnsErr) {
    logger.warn("Could not set custom DNS servers", { error: dnsErr.message });
  }
}

let listenersRegistered = false;
let activeConnectPromise = null;

const READY_STATE_LABELS = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

const registerConnectionListeners = () => {
  if (listenersRegistered) return;
  listenersRegistered = true;

  const conn = mongoose.connection;

  conn.on("connected", () => {
    logger.info("MongoDB connected", {
      readyState: conn.readyState,
      host: conn.host || "unknown",
      name: conn.name || "unknown",
    });
  });

  conn.on("disconnected", () => {
    logger.warn("MongoDB disconnected", {
      readyState: conn.readyState,
    });
  });

  conn.on("reconnected", () => {
    logger.info("MongoDB reconnected", {
      readyState: conn.readyState,
      host: conn.host || "unknown",
    });
  });

  conn.on("error", (err) => {
    logger.error("MongoDB connection error", {
      error: err?.message || "Unknown MongoDB error",
      readyState: conn.readyState,
    });
  });
};

export const getMongoConnectOptions = () => {
  const maxPoolSize = Math.max(5, parseInt(process.env.MONGO_MAX_POOL_SIZE || "25", 10) || 25);
  const minPoolSize = Math.max(1, Math.min(maxPoolSize, parseInt(process.env.MONGO_MIN_POOL_SIZE || "5", 10) || 5));
  const serverSelectionTimeoutMS = Math.max(
    1000,
    parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "10000", 10) || 10000
  );
  const socketTimeoutMS = Math.max(
    5000,
    parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || "45000", 10) || 45000
  );

  return {
    maxPoolSize,
    minPoolSize,
    serverSelectionTimeoutMS,
    socketTimeoutMS,
    connectTimeoutMS: 10000,
  };
};

const connectDB = async ({ maxRetries = 3, retryDelayMs = 2000 } = {}) => {
  if (mongoose.connection?.readyState === 1) {
    return mongoose.connection;
  }

  if (activeConnectPromise) {
    return activeConnectPromise;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || !String(uri).trim()) {
    throw new Error("MONGODB_URI is not defined in environment");
  }

  registerConnectionListeners();
  const options = getMongoConnectOptions();

  activeConnectPromise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await mongoose.connect(uri, options);
        logger.info("Database connected successfully", {
          maxPoolSize: options.maxPoolSize,
          minPoolSize: options.minPoolSize,
        });
        return mongoose.connection;
      } catch (error) {
        lastError = error;
        logger.error("MongoDB connection attempt failed", {
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          error: error.message,
        });

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    throw new Error(
      `Could not connect to MongoDB after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`
    );
  })();

  try {
    return await activeConnectPromise;
  } finally {
    activeConnectPromise = null;
  }
};

export const getDatabaseHealth = async () => {
  const conn = mongoose.connection;
  const readyState = conn?.readyState ?? 0;
  const stateLabel = READY_STATE_LABELS[readyState] || "unknown";

  if (readyState !== 1 || !conn?.db) {
    return {
      available: false,
      status: stateLabel,
      readyState,
      pingMs: null,
    };
  }

  const startMs = Date.now();
  try {
    await conn.db.admin().ping();
    return {
      available: true,
      status: "connected",
      readyState,
      pingMs: Date.now() - startMs,
    };
  } catch (err) {
    return {
      available: false,
      status: "error",
      readyState,
      pingMs: Date.now() - startMs,
      error: err.message,
    };
  }
};

export default connectDB;
