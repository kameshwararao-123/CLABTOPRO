import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import { registerUser } from "../../services/authService";

const Register = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    rollNo: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      await registerUser(form);

      navigate("/login");
    } catch (error) {
      setError(
        error.response?.data?.message || "Registration failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-8">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">

        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white">
            C
          </div>

          <h1 className="text-3xl font-bold text-slate-800">
            Create Account
          </h1>

          <p className="mt-2 text-slate-500">
            Start practicing C every day
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          <Input
            label="Username"
            name="username"
            value={form.username}
            onChange={handleChange}
            placeholder="Enter username"
            required
          />

          <Input
            label="Roll Number"
            name="rollNo"
            value={form.rollNo}
            onChange={handleChange}
            placeholder="Enter roll number"
            required
          />

          <Input
            label="Email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Enter email"
            required
          />

          <Input
            label="Password"
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Minimum 6 characters"
            required
          />

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? "Creating..." : "Create Account"}
          </Button>

        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-indigo-600 hover:underline"
          >
            Login
          </Link>
        </p>

      </div>
    </div>
  );
};

export default Register;