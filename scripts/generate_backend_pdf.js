/**
 * CLABTOPro — Dedicated Backend Documentation PDF Generator
 */

import PDFDocument from "../backend/node_modules/pdfkit/js/pdfkit.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, "../CLABTOPro_Backend_Documentation.pdf");

const NAVY = "#0F172A";
const PRIMARY = "#1E40AF";
const SECONDARY = "#2563EB";
const TEXT_MAIN = "#1E293B";
const TEXT_MUTED = "#64748B";
const BORDER_COLOR = "#CBD5E1";
const BG_LIGHT = "#F8FAFC";

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  bufferPages: true,
  autoFirstPage: false,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

function addChapterTitle(num, title) {
  doc.addPage();
  doc.rect(50, 50, 4, 24).fill(PRIMARY);
  doc.fillColor(PRIMARY).fontSize(10).font("Helvetica-Bold").text(`SECTION ${num}`, 62, 53);
  doc.fillColor(NAVY).fontSize(18).font("Helvetica-Bold").text(title, 62, 66);
  doc.moveDown(1.2);
}

function addSectionTitle(title) {
  doc.moveDown(0.8);
  doc.fillColor(PRIMARY).fontSize(11.5).font("Helvetica-Bold").text(title);
  doc.strokeColor(BORDER_COLOR).lineWidth(0.8).moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).stroke();
  doc.moveDown(0.6);
}

function addParagraph(text) {
  doc.fillColor(TEXT_MAIN).fontSize(9).font("Helvetica").text(text, { lineGap: 3.2, align: "justify" });
  doc.moveDown(0.4);
}

function addBullet(title, desc) {
  const y = doc.y;
  doc.circle(56, y + 4.5, 2.5).fill(SECONDARY);
  doc.fillColor(NAVY).fontSize(9).font("Helvetica-Bold").text(title + ": ", 65, y, { continued: true });
  doc.fillColor(TEXT_MAIN).font("Helvetica").text(desc, { lineGap: 2.8 });
  doc.moveDown(0.25);
}

function addCalloutBox(title, text, color = PRIMARY) {
  const startY = doc.y + 4;
  doc.rect(50, startY, 495, 42).fillAndStroke(BG_LIGHT, BORDER_COLOR);
  doc.rect(50, startY, 4, 42).fill(color);
  doc.fillColor(color).fontSize(8.5).font("Helvetica-Bold").text(title, 62, startY + 6);
  doc.fillColor(TEXT_MAIN).fontSize(8).font("Helvetica").text(text, 62, startY + 18, { width: 470, lineGap: 2.2 });
  doc.y = startY + 50;
}

function addCodeBlock(code) {
  const lines = code.trim().split("\n");
  const blockHeight = lines.length * 11 + 14;
  const startY = doc.y + 3;
  doc.rect(50, startY, 495, blockHeight).fillAndStroke("#0F172A", "#1E293B");
  doc.fillColor("#38BDF8").fontSize(7.5).font("Courier-Bold").text(lines.join("\n"), 60, startY + 7, {
    lineGap: 2.5,
  });
  doc.y = startY + blockHeight + 6;
}

// ==========================================
// 1. COVER PAGE
// ==========================================
doc.addPage();
doc.rect(0, 0, 595, 12).fill(PRIMARY);

doc.rect(50, 90, 495, 230).fill(BG_LIGHT);
doc.rect(50, 90, 6, 230).fill(PRIMARY);

doc.fillColor(PRIMARY).fontSize(10).font("Helvetica-Bold").text("TECHNICAL SPECIFICATIONS & API REFERENCE", 70, 118);
doc.fillColor(NAVY).fontSize(28).font("Helvetica-Bold").text("CLABTOPro Backend", 70, 138);
doc.fillColor(SECONDARY).fontSize(13).font("Helvetica").text("Deterministic Online Judge Architecture & Execution Engine", 70, 174);

doc.fillColor(TEXT_MAIN).fontSize(9).font("Helvetica").text(
  "Comprehensive technical documentation for the Node.js/Express backend services powering the CLABTOPro coding laboratory. Covers isolated Piston Docker execution, local GCC fallback, submission concurrency queueing, multi-model AI failure analysis, and complete REST API endpoints.",
  70,
  202,
  { width: 450, lineGap: 3.5 }
);

// Metadata Boxes
doc.rect(50, 345, 235, 110).fillAndStroke(BG_LIGHT, BORDER_COLOR);
doc.fillColor(PRIMARY).fontSize(9.5).font("Helvetica-Bold").text("BACKEND STACK HIGHLIGHTS", 65, 360);
doc.fillColor(TEXT_MAIN).fontSize(8).font("Helvetica").text(
  "• Runtime: Node.js 20 LTS (ES Modules)\n• Web Framework: Express 4.x\n• Database: MongoDB Atlas (Mongoose ODM)\n• Judge: Piston Docker + Host GCC 13\n• Queue: Fair Concurrency Worker Pool",
  65,
  378,
  { lineGap: 3 }
);

doc.rect(310, 345, 235, 110).fillAndStroke(BG_LIGHT, BORDER_COLOR);
doc.fillColor(PRIMARY).fontSize(9.5).font("Helvetica-Bold").text("PRODUCTION SPECIFICATIONS", 325, 360);
doc.fillColor(TEXT_MAIN).fontSize(8).font("Helvetica").text(
  "• Target Capacity: ~120 Students\n• Concurrency Cap: 4 parallel workers\n• Execution Timeout: 5000ms max\n• Container: Debian Bookworm Slim + GCC\n• Live Status: Verified on Render",
  325,
  378,
  { lineGap: 3 }
);

doc.rect(50, 480, 495, 110).fillAndStroke(BG_LIGHT, BORDER_COLOR);
doc.fillColor(NAVY).fontSize(10.5).font("Helvetica-Bold").text("DEPLOYMENT & METADATA", 70, 495);
doc.fillColor(TEXT_MUTED).fontSize(8.5).font("Helvetica-Bold").text("Production Base URL:", 70, 516);
doc.fillColor(PRIMARY).fontSize(8.5).font("Helvetica-Bold").text("https://clabtopro-backend-ehns.onrender.com", 195, 516);
doc.fillColor(TEXT_MUTED).fontSize(8.5).font("Helvetica-Bold").text("Health Check Endpoint:", 70, 532);
doc.fillColor(TEXT_MAIN).fontSize(8.5).font("Helvetica").text("GET /api/execution/health", 195, 532);
doc.fillColor(TEXT_MUTED).fontSize(8.5).font("Helvetica-Bold").text("Database Engine:", 70, 548);
doc.fillColor(TEXT_MAIN).fontSize(8.5).font("Helvetica").text("MongoDB Atlas Cluster0 (TLS 1.3)", 195, 548);
doc.fillColor(TEXT_MUTED).fontSize(8.5).font("Helvetica-Bold").text("Project Developer:", 70, 564);
doc.fillColor(TEXT_MAIN).fontSize(8.5).font("Helvetica").text("Raju (College Major Project Team)", 195, 564);

// ==========================================
// 2. SECTION 1: ARCHITECTURE & ENTRY POINT
// ==========================================
addChapterTitle("1", "Server Architecture & Initialization");

addSectionTitle("1.1 Architecture & Flow");
addParagraph(
  "CLABTOPro backend operates as a decoupled RESTful API server. Submissions enter through the submission controller, are queued to maintain server stability, and are routed to either the isolated Piston Docker container or the local GCC sandbox. The official verdict is determined deterministically by comparing normalized stdout against expected outputs."
);

addCodeBlock(`
Client Request (POST /api/submissions)
    │
    ├──► server.js (Express Application & Middlewares)
    │       ├── cors() & express.json()
    │       ├── authMiddleware (JWT Validation)
    │       └── Router Dispatch (/api/submissions)
    │
    ├──► submissionController.js (Validation & Rate Limiting)
    │       └── Enqueue into submissionQueue.js (Concurrency: 4)
    │
    ├──► judgeService.js (Deterministic Orchestration)
    │       ├── Primary: pistonService.js (HTTP /api/v2/execute)
    │       └── Fallback: localGccService.js (/tmp/clabto-exec-*)
    │
    ├──► Output Normalization & Verdict Assignment
    │       ├── ACCEPTED | WRONG_ANSWER | COMPILE_ERROR | RUNTIME_ERROR | TIME_LIMIT
    │       └── Save to MongoDB (with tabSwitches & test results)
    │
    └──► aiEvaluationService.js (Optional Failure Guidance)
            └── Multi-Model Chain: gemini-flash-lite-latest -> Fallback Models
`);

addSectionTitle("1.2 Application Entry: server.js");
addParagraph(
  "The entry point 'server.js' configures environment variables via 'dotenv', initializes MongoDB connection via 'connectDB()', sets up security middlewares, and mounts seven dedicated router endpoints:"
);
addBullet("/api/auth", "Authentication & profile operations (routes/authRoutes.js)");
addBullet("/api/topics", "Curriculum categories and problem classifications (routes/topicRoutes.js)");
addBullet("/api/problems", "Problem catalog, test cases, and Daily Problem (routes/problemRoutes.js)");
addBullet("/api/submissions", "Code judging, queuing, and student history (routes/submissionRoutes.js)");
addBullet("/api/progress", "Student streaks, accuracy, and leaderboard (routes/progressRoutes.js)");
addBullet("/api/admin", "Instructor oversight, student metrics, and problem management (routes/adminRoutes.js)");
addBullet("/api/execution", "Engine health check and queue metrics (routes/executionRoutes.js)");

// ==========================================
// 3. SECTION 2: DETERMINISTIC JUDGING ENGINE
// ==========================================
addChapterTitle("2", "Deterministic Online Judge Pipeline");

addSectionTitle("2.1 The Core Judge: judgeService.js");
addParagraph(
  "The judge service is the central evaluation authority. It rejects simulated guessing and strictly enforces physical compilation and test case execution. It handles:"
);
addBullet("Pre-Flight Engine Resolution", "Calls 'checkJudgeEngineHealth()' to dynamically select Piston Docker or Local GCC.");
addBullet("Output Normalization", "Applies 'normalizeOutput(str)' to strip CRLF, lone CR, and trailing blank lines while preserving numerical content.");
addBullet("Early Compilation Halt", "If compilation fails on test #1, remaining test cases are marked 'skipped' to conserve CPU resources.");
addBullet("Deterministic Verdict Assignment", "Assigns official status: accepted, wrong_answer, compile_error, runtime_error, or time_limit.");

addSectionTitle("2.2 Container Sandbox: pistonService.js");
addParagraph(
  "Communicates with the Piston execution engine (running inside Docker on port 2000). Code is packaged as 'solution.c' with execution limits. It captures compile output, runtime stdout, stderr, exit codes, and process termination signals."
);

addSectionTitle("2.3 Host GCC Runner: localGccService.js");
addParagraph(
  "When Piston Docker is not running (e.g. cloud host without Docker-in-Docker), this service compiles and runs C code using the host's installed GCC 13 compiler. Features:"
);
addBullet("Temporary Workspace Isolation", "Creates randomized temporary directories (/tmp/clabto-exec-XXXXXX) with 0o700 permissions.");
addBullet("Stream EPIPE Protection", "Attaches error listeners to child.stdin to prevent process crashes if student code exits before consuming input.");
addBullet("Watchdog Timer", "Kills runaway processes with SIGKILL after runTimeout (default 3000ms).");
addBullet("Buffer Cap", "Limits stdout/stderr collection to 64KB to avoid memory exhaustion from infinite printf loops.");

// ==========================================
// 4. SECTION 3: CONCURRENCY QUEUE & AI EXPLAINER
// ==========================================
addChapterTitle("3", "Concurrency Control & AI Debugging");

addSectionTitle("3.1 Queue Worker Pool: submissionQueue.js");
addParagraph(
  "Online judges cannot handle unlimited parallel C compilations without crashing the CPU. The submission queue enforces controlled concurrency:"
);
addBullet("Configurable Capacity", "EXECUTION_CONCURRENCY=4 limits active GCC workers. Extra requests are queued in FIFO order.");
addBullet("Queue Overload Protection", "Rejects submissions with HTTP 503 if waiting queue exceeds 200 tasks to prevent memory leaks.");
addBullet("Non-Failing Safe Handshake", "Failed execution services reject submissions with HTTP 503 rather than falsely recording WRONG_ANSWER.");

addSectionTitle("3.2 Educational AI Assistant: aiEvaluationService.js");
addParagraph(
  "Google Gemini is integrated strictly as an educational learning assistant, decoupled from the official judge. It is fed actual execution evidence (compiler diagnostic text, exit code, or output mismatch)."
);
addBullet("Prompt Constraint", "Strict system instructions prohibit the AI from changing or predicting the official verdict.");
addBullet("Hidden Test Case Redaction", "If a hidden test case fails, secret inputs and outputs are replaced with '[HIDDEN TEST CASE]' to protect exam integrity.");
addBullet("Multi-Model Failover Chain", "Prevents HTTP 503 high-demand crashes by trying: gemini-flash-lite-latest -> 3.5 -> 3.1 -> 3.6.");
addBullet("Deterministic Rule-Based Fallback", "If all cloud AI APIs fail, provides structured diagnostic hints derived directly from GCC error strings.");

// ==========================================
// 5. SECTION 4: DATA MODELS & SCHEMAS
// ==========================================
addChapterTitle("4", "Data Models & Mongoose Schemas");

addSectionTitle("4.1 Core Schema Specifications");

addBullet("User Schema (models/User.js)", "username, email, password (bcrypt), role ('student'/'admin'), currentStreak, longestStreak, lastSolvedDate.");
addBullet("Problem Schema (models/Problem.js)", "title, description, topic (enum), difficulty ('Easy'/'Medium'/'Hard'), inputFormat, outputFormat, constraints, sampleInput, sampleOutput, testCases: [{ input, expectedOutput, isHidden }], publishDate, status ('draft'/'published').");
addBullet("Submission Schema (models/Submission.js)", "user (Ref), problem (Ref), code, language ('c'), status (enum), testCasesPassed, totalTestCases, tabSwitches, executionTime, compilerOutput, testCaseResults, aiEvaluation, submittedAt.");
addBullet("Progress Schema (models/Progress.js)", "user (Ref), totalSolved, totalAccepted, totalAttempted, currentStreak, longestStreak, lastSolvedDate.");

addSectionTitle("4.2 Security: sanitizeSubmissionForStudent");
addParagraph(
  "Exported from 'Submission.js', this function scrubs secret inputs and expected outputs from hidden test cases before returning submission payloads to students over HTTP, preventing students from inspecting network responses to cheat."
);

// ==========================================
// 6. SECTION 5: API ENDPOINTS & HEALTH
// ==========================================
addChapterTitle("5", "API Endpoint Specifications");

addSectionTitle("5.1 REST Endpoint Mapping");

addBullet("POST /api/auth/register", "Registers a student. Body: { username, email, password }");
addBullet("POST /api/auth/login", "Authenticates credentials. Returns: { token, user }");
addBullet("GET /api/problems", "Lists published problems with solved status indicator.");
addBullet("GET /api/problems/:id", "Returns problem details and student's last submitted code.");
addBullet("POST /api/submissions", "Enqueues C code for judging. Body: { problemId, code, language: 'c', tabSwitches }");
addBullet("GET /api/submissions/my", "Retrieves authenticated student's submission history.");
addBullet("GET /api/execution/health", "Live judge engine connectivity, active compiler version, and queue statistics.");
addBullet("GET /api/admin/dashboard", "Platform summary: total students, problems, submissions, pass rates.");
addBullet("GET /api/admin/students", "Detailed student roster showing problems solved and recorded tab switch violations.");

addSectionTitle("5.2 Health Check Payload Example");
addCodeBlock(`
// GET /api/execution/health -> HTTP 200 OK
{
  "status": "healthy",
  "activeEngine": "local_gcc",
  "engine": {
    "connected": true,
    "cInstalled": true,
    "compiler": "gcc",
    "version": "gcc (Debian 12.2.0-14+deb12u1) 12.2.0"
  },
  "queue": {
    "activeWorkers": 0,
    "waitingTasks": 0,
    "concurrency": 4,
    "capacityAvailable": 200
  }
}
`);

// ==========================================
// 7. SECTION 6: CONFIGURATION & DEPLOYMENT
// ==========================================
addChapterTitle("6", "Configuration & Deployment");

addSectionTitle("6.1 Environment Variables (.env)");
addBullet("PORT", "Port number (default 3400).");
addBullet("MONGODB_URI", "MongoDB Atlas connection string with replica set options.");
addBullet("JWT_SECRET", "Private key for signing student and admin session tokens.");
addBullet("GEMINI_API_KEY", "Google Gemini API key for evidence-based failure hints.");
addBullet("GEMINI_MODEL", "Set to 'gemini-flash-lite-latest' for high throughput.");
addBullet("PISTON_URL", "Piston Docker sandbox URL (default 'http://localhost:2000').");
addBullet("ENABLE_LOCAL_GCC_FALLBACK", "Set 'true' to allow host GCC execution when Docker is offline.");
addBullet("EXECUTION_CONCURRENCY", "Maximum simultaneous C execution workers (default 4).");
addBullet("EXECUTION_TIMEOUT_MS", "Execution timeout per test case in milliseconds (default 5000).");

addSectionTitle("6.2 Cloud Deployment on Render");
addParagraph(
  "The backend is containerized via 'backend/Dockerfile' using 'node:20-bookworm-slim' with 'gcc' and 'build-essential' pre-installed. It deploys on Render as a Web Service with zero setup. Live endpoint: https://clabtopro-backend-ehns.onrender.com"
);

// Footers
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  if (i > 0) {
    doc.fillColor(TEXT_MUTED).fontSize(7.5).font("Helvetica").text(
      "CLABTOPro Backend — Technical Architecture Documentation",
      50,
      25,
      { align: "left" }
    );
    doc.strokeColor(BORDER_COLOR).lineWidth(0.5).moveTo(50, 36).lineTo(545, 36).stroke();

    doc.strokeColor(BORDER_COLOR).lineWidth(0.5).moveTo(50, 792 - 40).lineTo(545, 792 - 40).stroke();
    doc.fillColor(TEXT_MUTED).fontSize(8).font("Helvetica").text(
      `Page ${i + 1} of ${totalPages}`,
      50,
      792 - 32,
      { align: "right" }
    );
    doc.text("Confidential — CLABTOPro Backend Specification", 50, 792 - 32, { align: "left" });
  }
}

doc.end();

writeStream.on("finish", () => {
  console.log(`[PDF Generator] Backend Documentation generated at: ${outputPath}`);
});
