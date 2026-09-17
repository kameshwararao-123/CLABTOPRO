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

import StudentLayout from "../components/layout/StudentLayout";

import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>

      {/* Public */}
      <Route
        path="/"
        element={<Home />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      {/* Student */}
      <Route
        element={
          <ProtectedRoute>
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/today"
          element={<TodayProblem />}
        />

        <Route
          path="/problems"
          element={<Problems />}
        />

        <Route
          path="/problems/:id"
          element={<ProblemDetails />}
        />

        <Route
          path="/submissions"
          element={<Submissions />}
        />

        <Route
          path="/statistics"
          element={<Statistics />}
        />

        <Route
          path="/profile"
          element={<Profile />}
        />
      </Route>

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />

      <Route
        path="/admin/problems/create"
        element={
          <AdminRoute>
            <CreateProblem />
          </AdminRoute>
        }
      />

      {/* Fallback */}
      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />

    </Routes>
  );
};

export default AppRoutes;