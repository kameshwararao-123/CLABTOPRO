import { lazy, Suspense } from "react";
import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Loader from "../components/common/Loader";
import StudentLayout from "../components/layout/StudentLayout";
import AdminLayout from "../components/layout/AdminLayout";
import { useAuth } from "../context/AuthContext";

// Public pages
const Home = lazy(() => import("../pages/Home"));
const Login = lazy(() => import("../pages/auth/Login"));
const Register = lazy(() => import("../pages/auth/Register"));
const ForgotPassword = lazy(() => import("../pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/auth/ResetPassword"));

// Student pages (ProblemDetails lazy-loads Monaco Editor only when needed)
const Dashboard = lazy(() => import("../pages/student/Dashboard"));
const TodayProblem = lazy(() => import("../pages/student/TodayProblem"));
const Problems = lazy(() => import("../pages/student/Problems"));
const ProblemDetails = lazy(() => import("../pages/student/ProblemDetails"));
const Submissions = lazy(() => import("../pages/student/Submissions"));
const Statistics = lazy(() => import("../pages/student/Statistics"));
const Leaderboard = lazy(() => import("../pages/student/Leaderboard"));
const Profile = lazy(() => import("../pages/student/Profile"));

// Admin pages
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
const CreateProblem = lazy(() => import("../pages/admin/CreateProblem"));
const AdminProblems = lazy(() => import("../pages/admin/AdminProblems"));
const AdminStudents = lazy(() => import("../pages/admin/AdminStudents"));
const EditProblem = lazy(() => import("../pages/admin/EditProblem"));
const AdminProblemDetails = lazy(() => import("../pages/admin/AdminProblemDetails"));

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Prevent admin from accidentally falling into student panel
  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const FallbackRoute = () => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/dashboard" replace />;
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
      {/* Public */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      {/* Student */}
      <Route
        element={
          <ProtectedRoute>
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/today" element={<TodayProblem />} />
        <Route path="/problems" element={<Problems />} />
        <Route path="/problems/:id" element={<ProblemDetails />} />
        <Route path="/submissions" element={<Submissions />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* Admin */}
      <Route
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
        <Route
          path="/admin/dashboard"
          element={<Navigate to="/admin" replace />}
        />
        <Route path="/admin/problems" element={<AdminProblems />} />
        <Route path="/admin/problems/create" element={<CreateProblem />} />
        <Route path="/admin/problems/:id" element={<AdminProblemDetails />} />
        <Route path="/admin/problems/:id/edit" element={<EditProblem />} />
        <Route path="/admin/students" element={<AdminStudents />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<FallbackRoute />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;