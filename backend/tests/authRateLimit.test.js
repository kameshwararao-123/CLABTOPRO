import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

import {
  createRateLimiter,
  loginAccountRateLimiter,
  loginIpSafetyLimiter,
  registerAccountRateLimiter,
  registerIpSafetyLimiter,
  forgotPasswordAccountLimiter,
  forgotPasswordIpLimiter,
  resetPasswordRateLimiter,
  resetPasswordIpLimiter,
} from "../middleware/rateLimit.js";

const createMockReqRes = ({ ip = "203.0.113.50", body = {}, params = {} } = {}) => {
  const headers = {};
  const req = { ip, body, params, socket: { remoteAddress: ip } };
  const res = {
    statusCode: 200,
    headers,
    data: null,
    setHeader(k, v) {
      headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return { req, res };
};

const runChain = async (middlewares, req, res, finalHandler) => {
  let idx = 0;
  const next = async () => {
    if (idx < middlewares.length) {
      const mw = middlewares[idx++];
      await mw(req, res, next);
    } else if (finalHandler) {
      await finalHandler(req, res);
    }
  };
  await next();
};

test("1 & 2. 90 legitimate students sharing one college public IP can all log in without 429", async () => {
  const collegeIp = "198.51.100.42";
  let passedCount = 0;

  for (let i = 1; i <= 90; i++) {
    const { req, res } = createMockReqRes({
      ip: collegeIp,
      body: { email: `student${i}@rguktsklm.ac.in`, password: "correct-password" },
    });
    await runChain([loginIpSafetyLimiter, loginAccountRateLimiter], req, res, (_rq, rs) => {
      rs.status(200).json({ message: "Login successful", token: `tok-${i}` });
    });
    assert.equal(res.statusCode, 200, `Student #${i} should not be rate-limited`);
    passedCount++;
  }

  assert.equal(passedCount, 90);
});

test("3 & 4 & 8. Repeated failed logins for one account are blocked with 429 + Retry-After, while peers on same IP succeed", async () => {
  const collegeIp = "198.51.100.77";
  const attackerEmail = "victim@rguktsklm.ac.in";

  // 10 failed login attempts for victim account
  for (let i = 1; i <= 10; i++) {
    const { req, res } = createMockReqRes({
      ip: collegeIp,
      body: { email: `  ${attackerEmail.toUpperCase()} `, password: "wrong" },
    });
    await runChain([loginIpSafetyLimiter, loginAccountRateLimiter], req, res, (_rq, rs) => {
      rs.status(401).json({ message: "Invalid email or password" });
    });
    assert.equal(res.statusCode, 401);
  }

  // 11th attempt for same account -> HTTP 429 with Retry-After
  const { req: blockedReq, res: blockedRes } = createMockReqRes({
    ip: collegeIp,
    body: { email: attackerEmail, password: "wrong" },
  });
  await runChain([loginIpSafetyLimiter, loginAccountRateLimiter], blockedReq, blockedRes, (_rq, rs) => {
    rs.status(401).json({ message: "Should not reach controller" });
  });
  assert.equal(blockedRes.statusCode, 429);
  assert.ok(Number(blockedRes.headers["Retry-After"]) >= 1);
  assert.ok(blockedRes.data.retryAfterSeconds >= 1);

  // Different student on the exact same college IP is NOT blocked
  const { req: peerReq, res: peerRes } = createMockReqRes({
    ip: collegeIp,
    body: { email: "innocent.peer@rguktsklm.ac.in", password: "correct" },
  });
  await runChain([loginIpSafetyLimiter, loginAccountRateLimiter], peerReq, peerRes, (_rq, rs) => {
    rs.status(200).json({ message: "Login successful" });
  });
  assert.equal(peerRes.statusCode, 200);
});

test("5. Invalid or missing email inputs cannot bypass login rate limiting", async () => {
  const ip = "203.0.113.99";
  for (let i = 1; i <= 10; i++) {
    const { req, res } = createMockReqRes({
      ip,
      body: { email: i % 2 === 0 ? "" : "not-an-email", password: "bad" },
    });
    await runChain([loginIpSafetyLimiter, loginAccountRateLimiter], req, res, (_rq, rs) => {
      rs.status(400).json({ message: "Email and password are required" });
    });
    assert.equal(res.statusCode, 400);
  }

  const { req: req11, res: res11 } = createMockReqRes({
    ip,
    body: { email: null, password: "bad" },
  });
  await runChain([loginIpSafetyLimiter, loginAccountRateLimiter], req11, res11, () => {});
  assert.equal(res11.statusCode, 429);
});

test("6. Registration allows 90 distinct students on same IP, while blocking spam for one email", async () => {
  const collegeIp = "198.51.100.88";

  // 90 distinct students register from same college IP
  for (let i = 1; i <= 90; i++) {
    const { req, res } = createMockReqRes({
      ip: collegeIp,
      body: { email: `reguser${i}@rguktsklm.ac.in` },
    });
    await runChain([registerIpSafetyLimiter, registerAccountRateLimiter], req, res, (_rq, rs) => {
      rs.status(201).json({ message: "User registered successfully" });
    });
    assert.equal(res.statusCode, 201);
  }

  // Repeated registration attempts for a single email are blocked after 10
  const spamEmail = "spamreg@rguktsklm.ac.in";
  for (let i = 1; i <= 10; i++) {
    const { req, res } = createMockReqRes({ ip: collegeIp, body: { email: spamEmail } });
    await runChain([registerIpSafetyLimiter, registerAccountRateLimiter], req, res, (_rq, rs) => {
      rs.status(400).json({ message: "Account already exists" });
    });
    assert.equal(res.statusCode, 400);
  }
  const { req: spamReq, res: spamRes } = createMockReqRes({ ip: collegeIp, body: { email: spamEmail } });
  await runChain([registerIpSafetyLimiter, registerAccountRateLimiter], spamReq, spamRes, () => {});
  assert.equal(spamRes.statusCode, 429);
  assert.ok(Number(spamRes.headers["Retry-After"]) >= 1);
});

test("7 & 8. Forgot-password & Reset-password are protected without leaking account existence", async () => {
  const ip = "198.51.100.120";
  const targetEmail = "resetuser@rguktsklm.ac.in";

  for (let i = 1; i <= 5; i++) {
    const { req, res } = createMockReqRes({ ip, body: { email: targetEmail } });
    await runChain([forgotPasswordIpLimiter, forgotPasswordAccountLimiter], req, res, (_rq, rs) => {
      rs.status(200).json({ message: "Sent" });
    });
    assert.equal(res.statusCode, 200);
  }
  const { req: fReq6, res: fRes6 } = createMockReqRes({ ip, body: { email: targetEmail } });
  await runChain([forgotPasswordIpLimiter, forgotPasswordAccountLimiter], fReq6, fRes6, () => {});
  assert.equal(fRes6.statusCode, 429);
  assert.ok(!fRes6.data.message.toLowerCase().includes("exists"));
  assert.ok(Number(fRes6.headers["Retry-After"]) >= 1);

  const token = "abcdef1234567890abcdef1234567890";
  for (let i = 1; i <= 10; i++) {
    const { req, res } = createMockReqRes({ ip, params: { token } });
    await runChain([resetPasswordIpLimiter, resetPasswordRateLimiter], req, res, (_rq, rs) => {
      rs.status(400).json({ message: "Invalid token" });
    });
    assert.equal(res.statusCode, 400);
  }
  const { req: rReq11, res: rRes11 } = createMockReqRes({ ip, params: { token } });
  await runChain([resetPasswordIpLimiter, resetPasswordRateLimiter], rReq11, rRes11, () => {});
  assert.equal(rRes11.statusCode, 429);
  assert.ok(Number(rRes11.headers["Retry-After"]) >= 1);
});

test("9. Express trust proxy = 1 resolves rightmost Render proxy IP and prevents spoofing", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/ip-check", (req, res) => {
    res.json({ ip: req.ip });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    // Attacker spoofs leftmost X-Forwarded-For ("1.2.3.4"), Render appends real client IP ("198.51.100.55")
    const resp = await fetch(`http://127.0.0.1:${port}/ip-check`, {
      headers: {
        "X-Forwarded-For": "1.2.3.4, 198.51.100.55",
      },
    });
    const json = await resp.json();
    assert.equal(json.ip, "198.51.100.55", "trust proxy = 1 must pick rightmost proxy-appended IP, not spoofed 1.2.3.4");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
