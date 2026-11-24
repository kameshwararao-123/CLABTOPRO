import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  isValidCollegeEmail,
  normalizeCollegeEmail,
  COLLEGE_EMAIL_DOMAIN,
  REGISTRATION_RESTRICTION_MESSAGE,
} from "../utils/collegeEmailValidator.js";
import User from "../models/User.js";
import { registerController, loginController } from "../controllers/userController.js";

test("College Email Validator - constants and domain checks", () => {
  assert.equal(COLLEGE_EMAIL_DOMAIN, "rguktsklm.ac.in");
  assert.equal(
    REGISTRATION_RESTRICTION_MESSAGE,
    "Please register using your official @rguktsklm.ac.in college email address."
  );
});

test("College Email Validator - valid college emails", () => {
  const validEmails = [
    "s210670@rguktsklm.ac.in",
    "s210671@rguktsklm.ac.in",
    "faculty@rguktsklm.ac.in",
    "admin.user@rguktsklm.ac.in",
    "john_doe+test@rguktsklm.ac.in",
  ];

  for (const email of validEmails) {
    assert.equal(
      isValidCollegeEmail(email),
      true,
      `Expected ${email} to be valid`
    );
  }
});

test("College Email Validator - normalization (case and whitespace)", () => {
  assert.equal(
    normalizeCollegeEmail("   S210670@RGUKTSKLM.AC.IN   "),
    "s210670@rguktsklm.ac.in"
  );
  assert.equal(
    isValidCollegeEmail("   S210670@RGUKTSKLM.AC.IN   "),
    true
  );
  assert.equal(
    isValidCollegeEmail("  Faculty@RguktSklm.Ac.In  "),
    true
  );
});

test("College Email Validator - rejects unauthorized domains and invalid formats", () => {
  const invalidEmails = [
    "student@gmail.com",
    "student@yahoo.com",
    "student@outlook.com",
    "student@hotmail.com",
    "s210670@othercollege.ac.in",
    "s210670@rguktsklm.ac.in.fake.com",
    "s210670@subdomain.rguktsklm.ac.in",
    "s210670@rguktsklm.org",
    "s210670@rgukt.ac.in",
    "s210670@rguktrkv.ac.in",
    "s210670@rguktn.ac.in",
    "plainaddress",
    "@rguktsklm.ac.in",
    "user@",
    "",
    null,
    undefined,
    12345,
  ];

  for (const email of invalidEmails) {
    assert.equal(
      isValidCollegeEmail(email),
      false,
      `Expected ${email} to be rejected`
    );
  }
});

test("User Model Schema - does NOT enforce email domain restriction globally", () => {
  // Verifies Mongoose schema does not block saving or reading existing accounts with non-college domains
  const emailValidators = User.schema.path("email").validators.filter(
    (v) => typeof v.validator === "function" && v.type !== "required"
  );

  assert.equal(
    emailValidators.length,
    0,
    "User schema should not enforce global domain restriction on existing users"
  );
});

test("New User Signup - allows @rguktsklm.ac.in and rejects other domains", async () => {
  // Test rejection with Gmail
  let responseStatus = null;
  let responseData = null;

  const mockRes = {
    status(code) {
      responseStatus = code;
      return {
        json(data) {
          responseData = data;
        },
      };
    },
  };

  const gmailReq = {
    body: {
      username: "New Student",
      rollNo: "S210999",
      email: "newstudent@gmail.com",
      password: "password123",
    },
  };

  await registerController(gmailReq, mockRes);
  assert.equal(responseStatus, 400);
  assert.equal(
    responseData.message,
    "Please register using your official @rguktsklm.ac.in college email address."
  );

  // Test rejection with Yahoo
  const yahooReq = {
    body: {
      username: "New Student",
      rollNo: "S210998",
      email: "newstudent@yahoo.com",
      password: "password123",
    },
  };

  await registerController(yahooReq, mockRes);
  assert.equal(responseStatus, 400);
  assert.equal(
    responseData.message,
    "Please register using your official @rguktsklm.ac.in college email address."
  );
});

test("Existing User Login - allows existing Gmail and Yahoo users without domain restriction", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;

  try {
    const fakeHashedPassword = "hashed_password";
    const existingUsers = {
      "existingstudent@gmail.com": {
        _id: "user_gmail_1",
        username: "Existing Gmail Student",
        email: "existingstudent@gmail.com",
        password: fakeHashedPassword,
        rollNo: "S210111",
        role: "student",
      },
      "existingfaculty@yahoo.com": {
        _id: "user_yahoo_1",
        username: "Existing Yahoo Faculty",
        email: "existingfaculty@yahoo.com",
        password: fakeHashedPassword,
        rollNo: "FAC001",
        role: "admin",
      },
      "s210670@rguktsklm.ac.in": {
        _id: "user_college_1",
        username: "College Student",
        email: "s210670@rguktsklm.ac.in",
        password: fakeHashedPassword,
        rollNo: "S210670",
        role: "student",
      },
    };

    User.findOne = async ({ email }) => {
      return existingUsers[email] || null;
    };

    bcrypt.compare = async (plain, hashed) => {
      return plain === "validpassword";
    };

    process.env.JWT_SECRET = "test_jwt_secret";

    // Scenario 1: Existing Gmail user login
    let status = null;
    let data = null;
    const res = {
      status(c) {
        status = c;
        return {
          json(d) {
            data = d;
          },
        };
      },
    };

    await loginController(
      { body: { email: "existingstudent@gmail.com", password: "validpassword" } },
      res
    );
    assert.equal(status, 200, "Existing Gmail user login should succeed");
    assert.ok(data.token, "JWT token should be returned");
    assert.equal(data.user.email, "existingstudent@gmail.com");

    // Scenario 2: Existing Yahoo user login
    await loginController(
      { body: { email: "existingfaculty@yahoo.com", password: "validpassword" } },
      res
    );
    assert.equal(status, 200, "Existing Yahoo user login should succeed");
    assert.ok(data.token, "JWT token should be returned");
    assert.equal(data.user.email, "existingfaculty@yahoo.com");

    // Scenario 3: Existing College email user login
    await loginController(
      { body: { email: "s210670@rguktsklm.ac.in", password: "validpassword" } },
      res
    );
    assert.equal(status, 200, "College email user login should succeed");
    assert.ok(data.token, "JWT token should be returned");
    assert.equal(data.user.email, "s210670@rguktsklm.ac.in");
  } finally {
    User.findOne = originalFindOne;
    bcrypt.compare = originalCompare;
  }
});
