# CLABTOPro Backend — Technical Architecture & API Documentation

CLABTOPro Backend is a high-performance **Node.js/Express** online judging and student progress platform designed for C programming laboratory courses (~120 concurrent students).

It provides **deterministic code execution**, **isolated sandboxing**, **fair concurrency queueing**, **evidence-based AI debugging guidance**, and **anti-cheat proctoring audits**.

---

## 1. System Architecture Overview

```text
Student Code (POST /api/submissions)
        │
        ▼
Express Routing & JWT Auth Middleware
        │
        ▼
Rate Limiting & Problem Validation
        │
        ▼
Submission Concurrency Queue (EXECUTION_CONCURRENCY = 4)
        │
        ├──► Primary Engine: Isolated Piston Docker Sandbox (Port 2000)
        │        └── (If offline/unreachable)
        └──► Fallback Engine: Sandboxed Local GCC 13 Runner (/tmp/clabto-exec-*)
        │
        ▼
Deterministic Verdict Engine
        ├── Standard Output Normalization (CRLF -> LF, whitespace trimming)
        ├── Compare Actual vs Expected Outputs
        ├── Verdict: ACCEPTED | WRONG_ANSWER | COMPILE_ERROR | RUNTIME_ERROR | TIME_LIMIT
        ▼
Database Persistence (MongoDB Atlas)
        ├── Save Submission Document (with tabSwitches & testCaseResults)
        └── Sync Student Progress & Daily Streaks
        │
        ▼ (If Submission Failed)
Evidence-Based AI Learning Assistant (Google Gemini)
        ├── Multi-Model Failover: gemini-flash-lite-latest -> 3.5 -> 3.1 -> 3.6
        └── Fallback: Deterministic Rule-Based Explainer
        │
        ▼
HTTP 201 Response (Verdict, Passed/Total Counts, Sanitized Test Results)
```

---

## 2. Directory Structure

```text
backend/
├── configs/
│   └── db.js                        # MongoDB Mongoose connection
├── controllers/
│   ├── adminController.js           # Admin stats & student tracking
│   ├── authController.js            # User registration & login
│   ├── problemController.js         # Problem CRUD & test cases
│   ├── progressController.js        # Streak & problem solved metrics
│   ├── submissionController.js      # Submission flow & queueing
│   ├── topicController.js           # Topic categorization
│   └── userController.js            # Student profile management
├── middleware/
│   ├── admin.js                     # Admin role guard
│   └── auth.js                      # JWT authentication verification
├── models/
│   ├── Problem.js                   # Problem definition & test cases
│   ├── Progress.js                  # Streak & student aggregate metrics
│   ├── Submission.js                # Official submission records & verdicts
│   ├── Topic.js                     # Curriculum topics
│   └── User.js                      # User credentials & stats
├── routes/
│   ├── adminRoutes.js               # /api/admin
│   ├── authRoutes.js                # /api/auth
│   ├── executionRoutes.js           # /api/execution (Health check)
│   ├── problemRoutes.js             # /api/problems
│   ├── progressRoutes.js            # /api/progress
│   ├── submissionRoutes.js          # /api/submissions
│   └── topicRoutes.js               # /api/topics
├── services/
│   ├── aiEvaluationService.js       # Gemini AI explainer with failover
│   ├── judgeService.js              # Deterministic judge orchestrator
│   ├── localGccService.js           # Sandboxed local host GCC runner
│   ├── pistonService.js             # Piston Docker HTTP client
│   └── submissionQueue.js           # Concurrency worker pool
├── .env                             # Environment variables
├── Dockerfile                       # Production container with GCC 13
└── server.js                        # Server entry point
```

---

## 3. Core Backend Services

### 3.1 `judgeService.js` — The Deterministic Judge
- **Role**: Coordinates the evaluation of student code against all test cases.
- **Normalization**:
  ```javascript
  normalizeOutput(output)
  ```
  Converts Windows CRLF (`\r\n`) and lone CR (`\r`) to standard LF (`\n`), trims trailing whitespace per line, and eliminates trailing blank lines to avoid false negatives.
- **Verdict Hierarchy**:
  1. `compile_error`: GCC failed to compile code.
  2. `time_limit`: Execution exceeded `EXECUTION_TIMEOUT_MS` (SIGKILL).
  3. `runtime_error`: Non-zero exit code, segmentation fault (`SIGSEGV`), or fatal signal.
  4. `wrong_answer`: Output mismatch against expected output.
  5. `accepted`: All public and hidden test cases passed.

### 3.2 `pistonService.js` — Isolated Piston Container Runner
- **Role**: Communicates with the isolated Piston container via HTTP REST.
- **Endpoints**:
  - `GET /api/v2/runtimes`: Health check and runtime discovery.
  - `POST /api/v2/execute`: Executes code with `compile_timeout` and `run_timeout`.
- **Security**: Ensures student C code runs in an isolated Linux container with process count and memory limits.

### 3.3 `localGccService.js` — Sandboxed Local GCC Fallback
- **Role**: Provides zero-downtime execution when Docker is offline or not installed on host.
- **Features**:
  - Creates isolated temporary workspaces: `/tmp/clabto-exec-XXXXXX`.
  - Compiles with: `gcc -O2 -Wall -std=c11 solution.c -o solution -lm`.
  - Enforces execution timeouts with `child.kill("SIGKILL")`.
  - **EPIPE Stream Protection**: Attaches error listeners on `child.stdin` to prevent process crashes if student programs terminate without reading stdin.
  - Limits buffer sizes to 64KB to prevent runaway memory usage.
  - Cleans up temporary directories in `finally` blocks.

### 3.4 `submissionQueue.js` — Concurrency Worker Pool
- **Role**: Controls simultaneous execution load for ~120 students.
- **Configuration**: `EXECUTION_CONCURRENCY=4` (configurable).
- **Features**:
  - FIFO in-memory queue.
  - Active worker tracking (`activeWorkers / concurrency`).
  - Graceful rejection when queue is overloaded (`QUEUE_OVERLOAD`, HTTP 503).
  - Can be replaced with Redis/BullMQ in high-scale distributed setups.

### 3.5 `aiEvaluationService.js` — Evidence-Based AI Debug Assistant
- **Role**: Provides educational explanations and debugging hints when code fails.
- **Architectural Rule**: The AI **NEVER** determines or modifies the official verdict.
- **Evidence Input**: Feeds the real compiler output, exit code, or output mismatch into the prompt.
- **Multi-Model Failover Chain**:
  1. `gemini-flash-lite-latest`
  2. `gemini-3.5-flash-lite`
  3. `gemini-3.1-flash-lite`
  4. `gemini-3.6-flash`
  5. `generateRuleBasedFallback(...)`: Deterministic fallback if all cloud APIs are unreachable.

---

## 4. Database Models & Schema Design

### `User` (`models/User.js`)
| Field | Type | Description |
| :--- | :--- | :--- |
| `username` | String | Unique username |
| `email` | String | Unique email address |
| `password` | String | Bcrypt hashed password |
| `role` | String | `"student"` or `"admin"` |
| `currentStreak`| Number | Consecutive days solved |
| `longestStreak`| Number | Maximum historical streak |

### `Problem` (`models/Problem.js`)
| Field | Type | Description |
| :--- | :--- | :--- |
| `title` | String | Problem title |
| `description`| String | Problem statement |
| `topic` | String | Basics, Loops, Arrays, Strings, Pointers, Functions |
| `difficulty` | String | Easy, Medium, Hard |
| `sampleInput`| String | Public sample input |
| `sampleOutput`|String | Public sample output |
| `testCases` | Array | `[{ input, expectedOutput, isHidden }]` |

### `Submission` (`models/Submission.js`)
| Field | Type | Description |
| :--- | :--- | :--- |
| `user` | ObjectId | Ref to `User` |
| `problem` | ObjectId | Ref to `Problem` |
| `code` | String | Submitted C source code |
| `status` | String | `accepted`, `wrong_answer`, `compile_error`, `runtime_error`, `time_limit` |
| `testCasesPassed` | Number | Count of passed test cases |
| `totalTestCases` | Number | Total test cases evaluated |
| `tabSwitches` | Number | Proctoring count (tab and app switches) |
| `executionTime` | Number | Execution duration in milliseconds |
| `compilerOutput`| String | Raw GCC diagnostic text |
| `testCaseResults`| Array | Individual test statuses (sanitized for students) |
| `aiEvaluation` | Object | Educational guidance and hints |

---

## 5. API Endpoint Reference

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new student account.
- `POST /api/auth/login` — Authenticate and receive JWT token.
- `GET /api/auth/profile` — Get authenticated user details.

### Problems (`/api/problems`)
- `GET /api/problems` — List published problems (filtered by user progress).
- `GET /api/problems/today` — Retrieve problem of the day with last submission.
- `GET /api/problems/:id` — Retrieve problem details and student's previous code.
- `POST /api/problems` *(Admin)* — Create a new problem with test cases.
- `PUT /api/problems/:id` *(Admin)* — Update problem metadata and test cases.
- `DELETE /api/problems/:id` *(Admin)* — Remove problem.

### Submissions & Judging (`/api/submissions`)
- `POST /api/submissions` — Submit C code for evaluation.
  - **Body**: `{ problemId, code, language: "c", tabSwitches }`
  - **Returns**: `{ message, status, allPassed, testCasesPassed, totalTestCases, testCases, aiEvaluation }`
- `GET /api/submissions/my` — Get submission history for the logged-in student.
- `GET /api/submissions/:id` — Get sanitized submission details.

### Execution Engine Health (`/api/execution`)
- `GET /api/execution/health` — Engine connectivity and worker pool status.
  - **Sample Output**:
    ```json
    {
      "status": "healthy",
      "activeEngine": "local_gcc",
      "engine": {
        "connected": true,
        "cInstalled": true,
        "compiler": "gcc",
        "version": "gcc (Ubuntu 13.3.0) 13.3.0"
      },
      "queue": {
        "activeWorkers": 0,
        "waitingTasks": 0,
        "concurrency": 4
      }
    }
    ```

### Admin Operations (`/api/admin`)
- `GET /api/admin/dashboard` — Platform overview statistics.
- `GET /api/admin/students` — Student list with solved counts and tab switch records.
- `GET /api/admin/problems` — Catalog of published and draft problems.

---

## 6. Environment Variables Reference

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `3400` | Port on which the Express server listens |
| `MONGODB_URI` | String | Required | MongoDB Atlas connection string |
| `JWT_SECRET` | String | Required | Secret key for signing JSON Web Tokens |
| `GEMINI_API_KEY` | String | Optional | Google Gemini API Key for AI failure explanations |
| `GEMINI_MODEL` | String | `gemini-flash-lite-latest` | Preferred Gemini model identifier |
| `PISTON_URL` | String | `http://localhost:2000` | URL of the Piston Docker sandbox |
| `PISTON_API_KEY` | String | `""` | Optional authorization key for Piston |
| `EXECUTION_CONCURRENCY`| Number | `4` | Max simultaneous code execution workers |
| `EXECUTION_TIMEOUT_MS` | Number | `5000` | Timeout per test case execution (ms) |
| `ENABLE_LOCAL_GCC_FALLBACK` | Boolean | `true` | Enables host GCC runner when Piston is offline |

---

## 7. Deployment Instructions

### Cloud Deployment (Render)
1. In Render, select **New + Web Service** → Connect your repository.
2. Set **Runtime** to `Docker` (Render automatically uses `backend/Dockerfile` with GCC 13).
3. Set environment variables (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `ENABLE_LOCAL_GCC_FALLBACK=true`).
4. Click **Deploy**.

### Docker Compose (On-Premise / Ubuntu Server)
```bash
# Start backend and isolated Piston container
docker compose up -d --build

# Verify engine health
curl http://localhost:3400/api/execution/health
```
