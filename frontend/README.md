# ClabToPro Frontend

Modern, high-performance client application for **ClabToPro**, built with **React 18**, **Vite**, **Tailwind CSS**, and **Monaco Editor**.

---

## 1. Overview & Key Capabilities

- **Split-Pane Code Studio:** Integrated Monaco Editor with full C syntax highlighting, dark mode (`vs-dark`), test case runner, and real-time execution feedback.
- **Pedagogical AI Learning Drawer:** Real-time evidence-based hints and algorithmic explanations powered by Google Gemini.
- **Academic Examination Suite:**
  - Fullscreen distraction-free layout with tab-switch & blur audit logging.
  - Dedicated conceptual gatekeeper interface (**ExamPaperNotepad**) requiring 50% automated rubric score before code editing unlocks.
  - Exam-hardened Monaco Editor mode with all autocompletions, parameter hints, snippets, and suggestions completely disabled.
- **Faculty & Admin Portal:**
  - Multi-step exam creator (internal vs external, durations, dates).
  - Bulk PDF/Excel question uploader with interactive preview and classification review.
  - Real-time student progress & telemetry monitoring.

---

## 2. Directory Structure

```text
frontend/src/
├── components/
│   ├── common/              # Button, Card, Modal, Loader, Input, Badge
│   ├── dashboard/           # Student streaks, activity cards, recommendations
│   ├── exam/                # ExamHeader, TelemetryPill, GuidelinesModal
│   ├── layout/              # StudentLayout, AdminLayout, Navbar, Sidebar
│   └── problem/             # ProblemDescription, TestCasesList, CodeRunner
├── context/
│   ├── AuthContext.jsx      # Global authentication state & user tokens
│   └── ThemeContext.jsx     # Dark/Light theme toggle
├── hooks/
│   ├── useDebounce.js       # Input debouncing hook
│   └── useFullscreen.js     # Exam full-screen lockdown enforcement
├── pages/
│   ├── admin/               # AdminDashboard, CreateExam, AdminExams, AdminExamDetails, AdminProblems
│   ├── auth/                # Login, Register, ForgotPassword, ResetPassword
│   ├── student/             # Dashboard, Problems, ProblemDetails, StudentExams, Exam*
│   └── Home.jsx             # Public landing page
├── routes/
│   └── AppRoutes.jsx        # Role-based route definitions & code splitting
├── services/
│   ├── api.js               # Axios instance with JWT interceptors
│   ├── examService.js       # Exam API client
│   └── problemService.js    # Problem & submission API client
└── utils/
    ├── formatters.js        # Date, time, and score formatting utilities
    └── validators.js        # Form validation schemas
```

---

## 3. Environment Variables

Create `.env` in the `frontend` folder:

```env
VITE_API_URL=http://localhost:5000/api
```

---

## 4. Development & Build Commands

```bash
# Install dependencies
npm install

# Start local Vite development server (HMR enabled)
npm run dev

# Run Oxlint / ESLint linter
npm run lint

# Build production distribution bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 5. Routing Reference

| Path | Component | Target Role | Description |
|---|---|---|---|
| `/` | `Home.jsx` | Public | Welcome & feature landing |
| `/login` | `Login.jsx` | Public | Authentication portal |
| `/dashboard` | `Dashboard.jsx` | Student | Student progress overview & streaks |
| `/problems` | `Problems.jsx` | Student | Practice problem library |
| `/problems/:id`| `ProblemDetails.jsx`| Student | Live coding & practice judge studio |
| `/exams` | `StudentExams.jsx` | Student | List of scheduled & active exams |
| `/exams/:id/instructions` | `ExamInstructions.jsx` | Student | Exam rules & acknowledgment |
| `/exams/:id/question` | `ExamAssignedQuestion.jsx`| Student | Display of allocated unique question |
| `/exams/:id/paper` | `ExamPaperNotepad.jsx` | Student | Conceptual logic gate (50% threshold) |
| `/exams/:id/editor` | `ExamCodeEditorPage.jsx` | Student | Exam-hardened Monaco compiler |
| `/exams/:id/completed` | `ExamCompleted.jsx` | Student | Final submission report |
| `/admin` | `AdminDashboard.jsx` | Faculty/Admin | Overview & quick statistics |
| `/admin/exams`| `AdminExams.jsx` | Faculty/Admin | Exam management & scheduling |
| `/admin/exams/:id` | `AdminExamDetails.jsx` | Faculty/Admin | Live telemetry, allocations & question uploads |

---

*Part of the ClabToPro Academic Laboratory Evaluation Suite.*
