import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Trash2,
  Send,
} from "lucide-react";

import Input from "../../components/common/Input";
import Button from "../../components/common/Button";

import { createProblem } from "../../services/problemService";

const CreateProblem = () => {

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
  });


  const [testCases, setTestCases] = useState([
    {
      input: "",
      expectedOutput: "",
      isHidden: true,
    },
  ]);


  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");


  // ===================================================
  // INPUT CHANGE
  // ===================================================

  const handleChange = (e) => {

    setForm({
      ...form,

      [e.target.name]:
        e.target.value,
    });

  };


  // ===================================================
  // TEST CASE CHANGE
  // ===================================================

  const handleTestCaseChange = (
    index,
    field,
    value
  ) => {

    const updated =
      [...testCases];

    updated[index][field] =
      value;

    setTestCases(updated);
  };


  // ===================================================
  // ADD TEST CASE
  // ===================================================

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


  // ===================================================
  // REMOVE TEST CASE
  // ===================================================

  const removeTestCase = (index) => {

    if (testCases.length === 1) {
      return;
    }

    setTestCases(
      testCases.filter(
        (_, i) => i !== index
      )
    );
  };


  // ===================================================
  // SUBMIT
  // ===================================================

  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      setLoading(true);
      setError("");

      const problemData = {
        ...form,
        testCases,
      };

      await createProblem(
        problemData
      );

      navigate(
        "/admin/problems"
      );

    } catch (error) {

      setError(
        error.response?.data?.message ||
          "Failed to create problem"
      );

    } finally {

      setLoading(false);

    }
  };


  return (
    <div className="min-h-screen bg-[#f6f8ff]">

      {/* Header */}

      <div className="border-b border-slate-200 bg-white px-6 py-5">

        <div className="mx-auto max-w-5xl">

          <h1 className="text-2xl font-bold">
            Create Problem of the Day
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Create a problem for students to solve.
          </p>

        </div>

      </div>


      <div className="mx-auto max-w-5xl px-6 py-8">

        {error && (
          <div className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}


        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >

          {/* ===========================================
              BASIC INFORMATION
          ============================================ */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">

            <h2 className="text-lg font-bold">
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


              <div className="grid gap-5 md:grid-cols-2">

                <div>

                  <label className="text-sm font-medium">
                    Topic
                  </label>

                  <select
                    name="topic"
                    value={form.topic}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
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

                  <label className="text-sm font-medium">
                    Difficulty
                  </label>

                  <select
                    name="difficulty"
                    value={form.difficulty}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                  >

                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>

                  </select>

                </div>

              </div>


              <div>

                <label className="text-sm font-medium">
                  Description
                </label>

                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={6}
                  required
                  placeholder="Describe the problem..."
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />

              </div>

            </div>

          </div>


          {/* ===========================================
              INPUT OUTPUT
          ============================================ */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">

            <h2 className="text-lg font-bold">
              Input & Output
            </h2>


            <div className="mt-5 grid gap-5 md:grid-cols-2">

              <div>

                <label className="text-sm font-medium">
                  Input Format
                </label>

                <textarea
                  name="inputFormat"
                  value={form.inputFormat}
                  onChange={handleChange}
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />

              </div>


              <div>

                <label className="text-sm font-medium">
                  Output Format
                </label>

                <textarea
                  name="outputFormat"
                  value={form.outputFormat}
                  onChange={handleChange}
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />

              </div>

            </div>


            <div className="mt-5">

              <label className="text-sm font-medium">
                Constraints
              </label>

              <textarea
                name="constraints"
                value={form.constraints}
                onChange={handleChange}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              />

            </div>

          </div>


          {/* ===========================================
              SAMPLE
          ============================================ */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">

            <h2 className="text-lg font-bold">
              Sample
            </h2>


            <div className="mt-5 grid gap-5 md:grid-cols-2">

              <div>

                <label className="text-sm font-medium">
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

                <label className="text-sm font-medium">
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


          {/* ===========================================
              TEST CASES
          ============================================ */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-lg font-bold">
                  Test Cases
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Used to evaluate student submissions.
                </p>

              </div>


              <button
                type="button"
                onClick={addTestCase}
                className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-100"
              >
                <Plus size={16} />
                Add
              </button>

            </div>


            <div className="mt-5 space-y-4">

              {testCases.map(
                (testCase, index) => (

                  <div
                    key={index}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                  >

                    <div className="mb-4 flex items-center justify-between">

                      <p className="text-sm font-bold">
                        Test Case {index + 1}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          removeTestCase(index)
                        }
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
                          value={
                            testCase.input
                          }
                          onChange={(e) =>
                            handleTestCaseChange(
                              index,
                              "input",
                              e.target.value
                            )
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
                          value={
                            testCase.expectedOutput
                          }
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
                        checked={
                          testCase.isHidden
                        }
                        onChange={(e) =>
                          handleTestCaseChange(
                            index,
                            "isHidden",
                            e.target.checked
                          )
                        }
                      />

                      Hidden test case

                    </label>

                  </div>

                )
              )}

            </div>

          </div>


          {/* ===========================================
              DATE
          ============================================ */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6">

            <h2 className="text-lg font-bold">
              Publish Date
            </h2>

            <input
              type="date"
              name="publishDate"
              value={form.publishDate}
              onChange={handleChange}
              required
              className="mt-4 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
            />

          </div>


          {/* ===========================================
              SUBMIT
          ============================================ */}

          <div className="flex justify-end gap-3">

            <Button
              type="button"
              onClick={() =>
                navigate(
                  "/admin/problems"
                )
              }
              className="border border-slate-300 bg-white !text-slate-700"
            >
              Cancel
            </Button>


            <Button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2"
            >

              <Send size={16} />

              {loading
                ? "Creating..."
                : "Create Problem"}

            </Button>

          </div>

        </form>

      </div>

    </div>
  );
};

export default CreateProblem;