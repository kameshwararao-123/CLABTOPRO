import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Plus, Trash2, Save, ArrowLeft, AlertCircle } from "lucide-react";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Loader from "../../components/common/Loader";
import { getProblemById, updateProblem } from "../../services/problemService";

const EditProblem = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    description: "",
    topic: "Basics",
    difficulty: "Easy",
    inputFormat: "",
    outputFormat: "",
    constraints: "",
    sampleInput: "",
    sampleOutput: "",
    publishDate: "",
    status: "published",
  });

  const [testCases, setTestCases] = useState([
    {
      input: "",
      expectedOutput: "",
      isHidden: true,
    },
  ]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadProblem = async () => {
      try {
        setLoading(true);
        const data = await getProblemById(id);
        const p = data.problem;
        if (!p) {
          setError("Problem not found");
          return;
        }

        // Format publish date to YYYY-MM-DD
        let formattedDate = "";
        if (p.publishDate) {
          formattedDate = new Date(p.publishDate).toISOString().split("T")[0];
        }

        setForm({
          title: p.title || "",
          description: p.description || "",
          topic: p.topic || "Basics",
          difficulty: p.difficulty || "Easy",
          inputFormat: p.inputFormat || "",
          outputFormat: p.outputFormat || "",
          constraints: p.constraints || "",
          sampleInput: p.sampleInput || "",
          sampleOutput: p.sampleOutput || "",
          publishDate: formattedDate,
          status: p.status || "published",
        });

        if (p.testCases && p.testCases.length > 0) {
          setTestCases(p.testCases);
        }
      } catch (err) {
        console.error("Failed to load problem:", err);
        setError("Failed to load problem data.");
      } finally {
        setLoading(false);
      }
    };

    loadProblem();
  }, [id]);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleTestCaseChange = (index, field, value) => {
    const updated = [...testCases];
    updated[index][field] = value;
    setTestCases(updated);
  };

  const addTestCase = () => {
    setTestCases([
      ...testCases,
      {
        input: "",
        expectedOutput: "",
        isHidden: true,
      },
    ]);
  };

  const removeTestCase = (index) => {
    if (testCases.length === 1) return;
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError("");

      const problemData = {
        ...form,
        testCases,
      };

      await updateProblem(id, problemData);
      navigate("/admin/problems");
    } catch (err) {
      console.error("Failed to update problem:", err);
      setError(err.response?.data?.message || "Failed to update problem");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Back button */}
      <Link
        to="/admin/problems"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Back to Problems
      </Link>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Edit Problem</h1>
          <p className="text-sm text-slate-500">
            Update problem details, difficulty, constraints, and test cases.
          </p>
        </div>

        <span
          className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${
            form.status === "published"
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-800"
          }`}
        >
          Status: {form.status}
        </span>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">
            Problem Information
          </h2>

          <div className="mt-5 space-y-5">
            <Input
              label="Problem Title"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Example: Find the Largest Number"
              required
            />

            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Topic
                </label>
                <select
                  name="topic"
                  value={form.topic}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                >
                  <option>Basics</option>
                  <option>Input/Output</option>
                  <option>Conditional Statements</option>
                  <option>Loops</option>
                  <option>Arrays</option>
                  <option>Functions</option>
                  <option>Strings</option>
                  <option>Pointers</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Difficulty
                </label>
                <select
                  name="difficulty"
                  value={form.difficulty}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={6}
                required
                placeholder="Describe the problem..."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Format & Constraints */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">
            Format & Constraints
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Input Format
              </label>
              <textarea
                name="inputFormat"
                value={form.inputFormat}
                onChange={handleChange}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Output Format
              </label>
              <textarea
                name="outputFormat"
                value={form.outputFormat}
                onChange={handleChange}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-slate-700">
              Constraints
            </label>
            <textarea
              name="constraints"
              value={form.constraints}
              onChange={handleChange}
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Sample */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Sample Cases</h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Sample Input
              </label>
              <textarea
                name="sampleInput"
                value={form.sampleInput}
                onChange={handleChange}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Sample Output
              </label>
              <textarea
                name="sampleOutput"
                value={form.sampleOutput}
                onChange={handleChange}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm outline-none"
              />
            </div>
          </div>
        </div>

        {/* Test Cases */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Test Cases</h2>
              <p className="mt-1 text-sm text-slate-500">
                Used to evaluate student submissions.
              </p>
            </div>

            <button
              type="button"
              onClick={addTestCase}
              className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-100"
            >
              <Plus size={16} />
              Add Test Case
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {testCases.map((testCase, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">
                    Test Case {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeTestCase(index)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Input
                    </label>
                    <textarea
                      value={testCase.input}
                      onChange={(e) =>
                        handleTestCaseChange(index, "input", e.target.value)
                      }
                      rows={3}
                      required
                      className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Expected Output
                    </label>
                    <textarea
                      value={testCase.expectedOutput}
                      onChange={(e) =>
                        handleTestCaseChange(
                          index,
                          "expectedOutput",
                          e.target.value
                        )
                      }
                      rows={3}
                      required
                      className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none"
                    />
                  </div>
                </div>

                <label className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={testCase.isHidden}
                    onChange={(e) =>
                      handleTestCaseChange(index, "isHidden", e.target.checked)
                    }
                  />
                  Hidden test case
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Publish Date</h2>
          <input
            type="date"
            name="publishDate"
            value={form.publishDate}
            onChange={handleChange}
            required
            className="mt-4 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            onClick={() => navigate("/admin/problems")}
            className="border border-slate-300 bg-white !text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
          >
            <Save size={16} />
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default EditProblem;

