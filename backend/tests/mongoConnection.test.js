import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import connectDB, {
  getMongoConnectOptions,
  getDatabaseHealth,
} from "../configs/db.js";

test("1. getMongoConnectOptions returns safe production connection pool & timeout defaults", () => {
  const opts = getMongoConnectOptions();
  assert.ok(opts.maxPoolSize >= 5);
  assert.ok(opts.minPoolSize >= 1 && opts.minPoolSize <= opts.maxPoolSize);
  assert.equal(opts.serverSelectionTimeoutMS, 10000);
  assert.equal(opts.socketTimeoutMS, 45000);
  assert.equal(opts.connectTimeoutMS, 10000);
});

test("2. connectDB fails fast when MONGODB_URI is missing or connection fails after retries", async () => {
  const origUri = process.env.MONGODB_URI;
  const origConnect = mongoose.connect;

  try {
    delete process.env.MONGODB_URI;
    await assert.rejects(() => connectDB({ maxRetries: 0 }), /MONGODB_URI is not defined/);

    process.env.MONGODB_URI = "mongodb://invalid-host:27017/test";
    let connectAttempts = 0;
    mongoose.connect = async () => {
      connectAttempts++;
      throw new Error("ECONNREFUSED");
    };

    await assert.rejects(
      () => connectDB({ maxRetries: 1, retryDelayMs: 5 }),
      /Could not connect to MongoDB after 2 attempts/
    );
    assert.equal(connectAttempts, 2);
  } finally {
    if (origUri !== undefined) process.env.MONGODB_URI = origUri;
    else delete process.env.MONGODB_URI;
    mongoose.connect = origConnect;
  }
});

test("3. connectDB deduplicates concurrent connection calls and avoids duplicate connections", async () => {
  const origUri = process.env.MONGODB_URI;
  const origConnect = mongoose.connect;
  let connectCalls = 0;

  try {
    process.env.MONGODB_URI = "mongodb://localhost:27017/clabtopro";
    mongoose.connect = async (uri, opts) => {
      connectCalls++;
      assert.ok(opts.maxPoolSize >= 5);
      await new Promise((r) => setTimeout(r, 15));
      return mongoose;
    };

    await Promise.all([
      connectDB({ maxRetries: 0 }),
      connectDB({ maxRetries: 0 }),
      connectDB({ maxRetries: 0 }),
    ]);

    assert.equal(connectCalls, 1);
  } finally {
    if (origUri !== undefined) process.env.MONGODB_URI = origUri;
    else delete process.env.MONGODB_URI;
    mongoose.connect = origConnect;
  }
});

test("4. getDatabaseHealth performs lightweight ping and reflects connected vs disconnected states", async () => {
  const origConn = mongoose.connection;

  // When disconnected (default in unit tests)
  const downHealth = await getDatabaseHealth();
  assert.equal(downHealth.available, false);
  assert.equal(downHealth.readyState, 0);

  // Mock connected state with ping()
  let pingCount = 0;
  Object.defineProperty(mongoose, "connection", {
    configurable: true,
    value: {
      readyState: 1,
      db: {
        admin: () => ({
          ping: async () => {
            pingCount++;
            return { ok: 1 };
          },
        }),
      },
    },
  });

  try {
    const upHealth = await getDatabaseHealth();
    assert.equal(upHealth.available, true);
    assert.equal(upHealth.status, "connected");
    assert.equal(pingCount, 1);
  } finally {
    Object.defineProperty(mongoose, "connection", {
      configurable: true,
      value: origConn,
    });
  }
});
