import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";

// Student pages
import Dashboard from "../pages/student/Dashboard";
import TodayProblem from "../pages/student/TodayProblem";
import Problems from "../pages/student/Problems";
import ProblemDetails from "../pages/student/ProblemDetails";
import Submissions from "../pages/student/Submissions";
import Statistics from "../pages/student/Statistics";
import Profile from "../pages/student/Profile";

// Admin pages
import AdminDashboard from "../pages/admin/AdminDashboard";
import CreateProblem from "../pages/admin/CreateProblem";
import AdminProblems from "../pages/admin/AdminProblems";
import AdminStudents from "../pages/admin/AdminStudents";
import EditProblem from "../pages/admin/EditProblem";
import AdminProblemDetails from "../pages/admin/AdminProblemDetails";

import StudentLayout from "../components/layout/StudentLayout";
import AdminLayout from "../components/layout/AdminLayout";

import { useAuth } from "../context/AuthContext";

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
    <Routes>
      {/* Public */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

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
  );
};

export default AppRoutes;