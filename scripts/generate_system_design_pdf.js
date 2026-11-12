/**
 * CLABTOPro — System Design PDF Generator
 */

import PDFDocument from "../backend/node_modules/pdfkit/js/pdfkit.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, "../CLABTOPro_System_Design.pdf");

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
  doc.fillColor(SECONDARY).fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.3);
}

function addParagraph(text) {
  doc.fillColor(TEXT_MAIN).fontSize(10).font("Helvetica").text(text, { lineGap: 3 });
  doc.moveDown(0.5);
}

function addBullet(title, desc) {
  doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text(`• ${title}: `, { continued: true });
  doc.fillColor(TEXT_MAIN).font("Helvetica").text(desc, { lineGap: 2 });
  doc.moveDown(0.3);
}

function addCalloutBox(title, text) {
  const startY = doc.y;
  doc.rect(50, startY, 495, 48).fillAndStroke("#EFF6FF", "#93C5FD");
  doc.fillColor(PRIMARY).fontSize(10).font("Helvetica-Bold").text(title, 62, startY + 8);
  doc.fillColor(TEXT_MAIN).fontSize(9).font("Helvetica").text(text, 62, startY + 22, { width: 470 });
  doc.y = startY + 56;
}

function addCodeBlock(code) {
  const startY = doc.y;
  const lines = code.split("\n").length;
  const boxHeight = lines * 13 + 14;
  doc.rect(50, startY, 495, boxHeight).fill(BG_LIGHT);
  doc.rect(50, startY, 495, boxHeight).stroke(BORDER_COLOR);
  doc.fillColor("#0F766E").fontSize(8.5).font("Courier").text(code, 60, startY + 8, { lineGap: 2 });
  doc.y = startY + boxHeight + 10;
}

// ==========================================
// COVER PAGE
// ==========================================
doc.addPage();
doc.rect(0, 0, 595, 842).fill("#0B132B");

doc.circle(520, 100, 140).fillOpacity(0.08).fill("#3B82F6");
doc.circle(80, 750, 180).fillOpacity(0.05).fill("#60A5FA");
doc.fillOpacity(1);

doc.fillColor("#60A5FA").fontSize(13).font("Helvetica-Bold").text("SYSTEM DESIGN & ARCHITECTURE SPECIFICATION", 50, 240);
doc.fillColor("#FFFFFF").fontSize(34).font("Helvetica-Bold").text("CLABTOPro", 50, 265);
doc.fillColor("#93C5FD").fontSize(18).font("Helvetica").text("C-Laboratory Online Judging & AI Tutoring Platform", 50, 310);

doc.rect(50, 345, 120, 3).fill("#3B82F6");

doc.fillColor("#E2E8F0").fontSize(11).font("Helvetica").text(
  "Comprehensive technical blueprint detailing high-level system architecture, dual-engine sandboxed execution, non-authoritative AI tutoring, concurrency bounds, real-time proctoring telemetry, and database models.",
  50,
  365,
  { width: 480, lineGap: 5 }
);

const metaY = 620;
doc.rect(50, metaY, 495, 100).fillOpacity(0.12).fill("#FFFFFF");
doc.fillOpacity(1);
doc.rect(50, metaY, 495, 100).stroke("#1E293B");

doc.fillColor("#94A3B8").fontSize(9).font("Helvetica").text("PROJECT REPOSITORY", 65, metaY + 15);
doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica-Bold").text("CLABTOPro / Major_Project", 65, metaY + 28);

doc.fillColor("#94A3B8").fontSize(9).font("Helvetica").text("PRIMARY BACKEND", 240, metaY + 15);
doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica-Bold").text("Render Web Service (Node 20 + GCC 12)", 240, metaY + 28);

doc.fillColor("#94A3B8").fontSize(9).font("Helvetica").text("SECURITY MODEL", 65, metaY + 55);
doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica-Bold").text("Piston Docker + Local Sandboxed GCC", 65, metaY + 68);

doc.fillColor("#94A3B8").fontSize(9).font("Helvetica").text("DOCUMENT VERSION", 240, metaY + 55);
doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica-Bold").text("1.0.0 (Production Architecture)", 240, metaY + 68);

// ==========================================
// SECTION 1: REQUIREMENTS & SYSTEM OBJECTIVES
// ==========================================
addChapterTitle("1", "Executive Summary & System Objectives");

addParagraph(
  "CLABTOPro is designed to solve the critical challenges of conducting high-enrollment C programming laboratories (~120 concurrent students). Traditional automated judging systems either rely on vulnerable host compilation or lack intelligent pedagogical feedback. CLABTOPro bridges this gap with deterministic judging coupled with decoupled AI diagnostics."
);

addSectionTitle("1.1 Core Functional Requirements");
addBullet("Interactive In-Browser IDE", "Web-based coding environment with standard C11 support, input simulation, and instant execution.");
addBullet("Deterministic Online Judging", "Automated verification against sample and hidden test cases with millisecond execution accounting.");
addBullet("Dual Execution Sandboxing", "Primary execution inside containerized Piston instances with seamless fallback to isolated local GCC environments.");
addBullet("AI Failure Assistant", "Automatic Socratic guidance on compiler, runtime, and logic errors without leaking full solutions.");
addBullet("Anti-Cheat Proctoring Telemetry", "Real-time tracking of browser focus, tab switches, and window blur events attached to submissions.");
addBullet("Role-Based Management & Progress", "Dual roles (Student vs Admin/Teacher), daily streaks, topic completion tracking, and aggregate performance metrics.");

addSectionTitle("1.2 Non-Functional Requirements & Design Principles");
addBullet("100% Deterministic Judging", "Verdicts are decided strictly by normalized I/O comparison. AI has zero authority over pass/fail decisions.");
addBullet("Fault-Tolerant High Availability", "Zero downtime if external Docker or AI APIs degrade, via automatic dual-engine execution and multi-model AI cascading.");
addBullet("Bounded Concurrency", "Strict queue limits (max concurrency = 4) preventing server CPU/memory exhaustion during deadline spikes.");
addBullet("Information Confidentiality", "Hidden test case inputs and expected outputs are strictly sanitized before returning wire payloads to students.");

addCalloutBox(
  "Architectural Invariant: Decoupled AI Authority",
  "The AI evaluation layer is strictly non-authoritative. It is invoked purely as an asynchronous advisor when a submission fails, ensuring grading integrity is 100% reproducible and tamper-proof."
);

// ==========================================
// SECTION 2: HIGH-LEVEL ARCHITECTURE
// ==========================================
addChapterTitle("2", "High-Level Architecture (HLD)");

addParagraph(
  "The system utilizes a 5-tier decoupled architecture separating client rendering, gateway control, execution scheduling, intelligence advisory, and persistent storage."
);

addSectionTitle("2.1 Architectural Flow Diagram");
addCodeBlock(
`+-----------------------------------------------------------------------+
| Client Tier: React 18 SPA (Vite + Tailwind CSS + Monaco Editor)        |
| - Proctoring Hook (tab switches, blur, visibility change detection)   |
+-----------------------------------┬-----------------------------------+
                                    | HTTPS / REST + JWT
                                    v
+-----------------------------------------------------------------------+
| Gateway & Routing Tier: Node.js / Express (Render Web Service)        |
| - JWT Auth Guard | Rate Limiting | Hidden Test Case Sanitizer         |
+-----------------------------------┬-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| Concurrency Control: Submission Queue (EXECUTION_CONCURRENCY = 4)     |
+-----------------------------------┬-----------------------------------+
                                    |
             +----------------------+----------------------+
             |                                             |
             v (Primary)                                   v (Fallback)
+------------------------------------+    +-----------------------------+
| Piston Micro-Container (Port 2000) |    | Sandboxed Local GCC Runner  |
| - Linux cgroups, chroot, isolated  |    | - /tmp/clabto-exec-* chdir  |
+------------------┬-----------------+    +--------------┬--------------+
                   |                                     |
                   +------------------+------------------+
                                      |
                                      v
+-----------------------------------------------------------------------+
| Deterministic Judge Engine: Output Normalization & Verdict Assignment |
| (ACCEPTED | WRONG_ANSWER | COMPILE_ERROR | RUNTIME_ERROR | TIME_LIMIT)|
+------------------┬----------------------------------------------------+
                   |                                     |
     (On Failure)  v                                     v
+-------------------------------------+   +-----------------------------+
| Intelligence Tier: AI Multi-Model   |   | Persistence Tier:           |
| (Flash-Lite -> 3.5 -> 3.1 -> 3.6)   |   | MongoDB Atlas Database      |
+-------------------------------------+   +-----------------------------+`
);

addSectionTitle("2.2 Layer Responsibilities");
addBullet("Client Tier", "Delivers responsive UI, manages code editor state, captures anti-cheat signals, and displays sanitized execution results.");
addBullet("API Gateway", "Authenticates sessions, validates request formats, enforces role guards, and sanitizes output payloads.");
addBullet("Execution Tier", "Regulates compilation throughput, enforces memory and CPU limits, and calculates deterministic verdicts.");
addBullet("Intelligence Tier", "Provides pedagogical hints for failed submissions using resilient fallback AI models.");
addBullet("Persistence Tier", "Stores users, problems, test cases, submissions, and student streaks in MongoDB Atlas.");

// ==========================================
// SECTION 3: EXECUTION ENGINE & SANDBOXING
// ==========================================
addChapterTitle("3", "Execution Engine & Sandboxing Deep Dive");

addParagraph(
  "Executing untrusted student code requires strict sandboxing, timeout enforcement, and memory caps. CLABTOPro achieves this through a dual-engine architecture with automatic failover."
);

addSectionTitle("3.1 Dual-Engine Strategy");
addBullet("Primary Engine (Piston)", "Interacts with an isolated Piston micro-container via REST API. Employs Linux namespaces, cgroups, user isolation, and chroot.");
addBullet("Fallback Engine (Local GCC)", "Compiles and executes locally inside `/tmp/clabto-exec-<uuid>/`. Ideal for cloud environments (Render) where Docker daemon access is restricted.");

addSectionTitle("3.2 Safety & Sandboxing Mechanisms");
addBullet("Compilation Constraints", "Compiles with: gcc -O2 -Wall -std=c11 solution.c -o solution -lm. Flags prevent UB and enforce standard semantics.");
addBullet("Wall-Clock Timeouts", "Child process execution is wrapped with a 3,000 ms timer. Exceeding limits triggers SIGKILL to stop infinite loops.");
addBullet("Stream Error Protection", "Attaches child.stdin.on('error') handler to silently intercept broken pipes (EPIPE) when student binaries terminate early.");
addBullet("Ephemeral Workspace Reclaim", "Guaranteed cleanup in a finally block removes temporary compilation artifacts and binaries from disk.");

addSectionTitle("3.3 Bounded Concurrency Queue");
addParagraph(
  "To handle burst loads when a lab of 120 students submits simultaneously, submissionQueue.js limits active concurrent compilation/run tasks to 4. Subsequent requests are queued in FIFO order, preventing host CPU starvation."
);

// ==========================================
// SECTION 4: AI TUTORING & RESILIENT CASCADE
// ==========================================
addChapterTitle("4", "AI Tutoring & Multi-Model Cascade");

addParagraph(
  "The AI tutoring service provides immediate educational assistance when submissions fail. To ensure 100% uptime during Google Cloud capacity spikes, a cascading multi-model fallback chain is enforced."
);

addSectionTitle("4.1 Multi-Model Failover Architecture");
addCodeBlock(
`Request -> [gemini-flash-lite-latest] --(503 Spike)--> [gemini-3.5-flash-lite]
                                                               | (503 Spike)
                                                               v
Response <- [Deterministic Regex Explainer] <--(Fail)-- [gemini-3.1-flash-lite]
                                                               | (503 Spike)
                                                               v
                                                      [gemini-3.6-flash]`
);

addSectionTitle("4.2 Pedagogical Guardrails");
addBullet("No Direct Solution Giving", "Prompts explicitly instruct the model to provide conceptual hints rather than rewritten code blocks.");
addBullet("Evidence-Based Inputs", "AI receives compiler errors, failed sample test mismatches, and execution signals, ensuring targeted feedback.");
addBullet("Rule-Based Fallback", "If all external AI APIs fail or network breaks, a local regex-based diagnostic engine generates structured hints for common syntax errors and segfaults.");

// ==========================================
// SECTION 5: PROCTORING & SECURITY
// ==========================================
addChapterTitle("5", "Proctoring, Security & Anti-Cheat");

addParagraph(
  "Academic integrity is maintained through multi-layered telemetry and confidential test case sanitization."
);

addSectionTitle("5.1 Client-Side Proctoring Telemetry");
addBullet("Viewport Focus Tracking", "Listens to visibilitychange and window.onblur events. Any navigation away from the lab IDE increments tabSwitches.");
addBullet("Warning Modal System", "Displays immediate feedback when focus is lost, warning students that events are audited.");
addBullet("Submission Auditing", "Every code submission permanently records the accumulated tab switch count and timestamps into MongoDB for instructor review.");

addSectionTitle("5.2 Hidden Test Case Sanitization");
addCalloutBox(
  "Zero-Leakage Confidentiality Guarantee",
  "Student responses are filtered through sanitizeSubmissionForStudent(). Hidden test case inputs, expected outputs, and diffs are completely stripped before serialization."
);

// ==========================================
// SECTION 6: DATA MODELS & PERSISTENCE
// ==========================================
addChapterTitle("6", "Data Architecture & Schema Design");

addParagraph("The database schema in MongoDB Atlas is optimized for fast lookups, analytics, and audit logging.");

addSectionTitle("6.1 Core Entities");
addBullet("User", "Stores credentials (bcrypt), email, role ('student' | 'admin'), and aggregate problems solved.");
addBullet("Problem", "Defines statement, difficulty, time/memory limits, sample test cases (public), and hidden test cases (confidential).");
addBullet("Submission", "Contains submitted code, deterministic verdict, test breakdown, execution time, AI hints, and tabSwitches audit.");
addBullet("Progress", "Tracks daily active streaks (currentStreak, maxStreak) and list of solved problem IDs.");

addSectionTitle("6.2 Data Schema Summary");
addCodeBlock(
`User:       { _id, name, email, password, role: 'student'|'admin', problemsSolved }
Problem:    { _id, title, description, difficulty, sampleTests: [], hiddenTests: [] }
Submission: { _id, userId, problemId, code, status, passedTests, totalTests, tabSwitches, aiFeedback }
Progress:   { _id, userId, currentStreak, maxStreak, lastActiveDate, solvedProblems: [] }`
);

// ==========================================
// SECTION 7: DEPLOYMENT TOPOLOGY
// ==========================================
addChapterTitle("7", "Deployment Topology & Operations");

addParagraph(
  "CLABTOPro is deployed on modern cloud infrastructure providing containerized isolation without requiring complex Kubernetes management."
);

addSectionTitle("7.1 Production Environment Topology");
addBullet("Backend (Render)", "Hosted as a Dockerized Web Service (Node 20 + GCC 12/13). Includes built-in compiler toolchain for zero-dependency execution.");
addBullet("Database (MongoDB Atlas)", "Managed cloud cluster with automated daily snapshots, connection pooling, and replica sets.");
addBullet("Frontend (Vercel)", "Edge-distributed static hosting with automatic SPA rewrite rules and SSL termination.");
addBullet("External AI (Google Gemini)", "Secure HTTPS API communication with multi-model failover keys.");

addSectionTitle("7.2 Operational Health Endpoints");
addBullet("Execution Health (/api/execution/health)", "Returns live status of compilation engines, active compiler version, concurrency limits, and queue load.");
addBullet("Admin Metrics (/api/admin/overview)", "Provides real-time submission pass rates, error distributions, and proctoring audit flags.");

// ==========================================
// FOOTERS & PAGE NUMBERS
// ==========================================
const totalPages = doc.bufferedPageRange().count;
for (let i = 1; i <= totalPages; i++) {
  doc.switchToPage(i - 1);
  if (i === 1) continue; // Skip cover

  doc.rect(50, 785, 495, 0.5).fill(BORDER_COLOR);
  doc.fillColor(TEXT_MUTED).fontSize(8).font("Helvetica")
    .text("CLABTOPro System Design Specification", 50, 795);
  doc.fillColor(TEXT_MUTED).fontSize(8).font("Helvetica")
    .text(`Page ${i} of ${totalPages}`, 490, 795, { align: "right" });
}

doc.end();

writeStream.on("finish", () => {
  console.log(`[SUCCESS] System Design PDF successfully generated at: ${outputPath}`);
});
