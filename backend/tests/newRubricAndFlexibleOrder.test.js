import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import ExamQuestion from "../models/ExamQuestion.js";
import {
  normalizeAndValidateRubric,
  buildEvaluationPrompt,
  generateConceptualFallback,
} from "../services/examAIService.js";

test("1. Default AI Evaluation Rubric uses Algorithmic Approach (50%) and Code Logic & Correctness (50%)", () => {
  const q = { title: "Sum of Array", problemStatement: "Compute sum of N numbers.", marks: 100 };
  const norm = normalizeAndValidateRubric(q);

  assert.equal(norm.criteria.length, 2);
  assert.equal(norm.criteria[0].criterion, "Algorithmic Approach");
  assert.equal(norm.criteria[0].maximumMarks, 50);
  assert.equal(norm.criteria[1].criterion, "Code Logic & Correctness");
  assert.equal(norm.criteria[1].maximumMarks, 50);
  assert.equal(norm.totalMaximumMarks, 100);
});

test("2. ExamQuestion schema defaults to the two-category 50/50 rubric", () => {
  const q = new ExamQuestion({
    examId: new mongoose.Types.ObjectId(),
    title: "Reverse Linked List",
    problemStatement: "Reverse a singly linked list.",
    marks: 100,
  });
  assert.equal(q.evaluationRubric.length, 2);
  assert.equal(q.evaluationRubric[0].criterion, "Algorithmic Approach");
  assert.equal(q.evaluationRubric[0].weight, 50);
  assert.equal(q.evaluationRubric[1].criterion, "Code Logic & Correctness");
  assert.equal(q.evaluationRubric[1].weight, 50);
});

test("3. buildEvaluationPrompt instructs flexible section order, edge cases, expected output, and syntax vs logic", () => {
  const q = { title: "Factorial", problemStatement: "Compute N!", marks: 100 };
  const norm = normalizeAndValidateRubric(q);
  const prompt = buildEvaluationPrompt({
    question: q,
    studentAnswer: "Expected Output: 120\nCode: int f(int n){...}\nAlgorithm: Multiply 1..n",
    normalizedRubric: norm,
  });

  assert.ok(prompt.includes("ANY ORDER"));
  assert.ok(prompt.includes("Algorithmic Approach (Max Marks: 50)"));
  assert.ok(prompt.includes("Code Logic & Correctness (Max Marks: 50)"));
  assert.ok(prompt.includes("logical errors from minor syntax errors"));
});

test("4. Fallback evaluation handles different answer section orders consistently", () => {
  const q = { title: "Find Max", problemStatement: "Find maximum element in array.", marks: 100 };
  const ansOrder1 =
    "Algorithm: Initialize max with first element and loop through array comparing each element for boundary and negative cases. Code: for(int i=1;i<n;i++) if(a[i]>max) max=a[i]; Expected Output: 9";
  const ansOrder2 =
    "Expected Output: 9\nfor(int i=1;i<n;i++) if(a[i]>max) max=a[i];\nWe initialize max with the first element and loop through the array comparing each element for boundary and negative cases.";

  const eval1 = generateConceptualFallback({ question: q, studentAnswer: ansOrder1 });
  const eval2 = generateConceptualFallback({ question: q, studentAnswer: ansOrder2 });

  assert.equal(eval1.maximumMarks, 100);
  assert.equal(eval2.maximumMarks, 100);
  assert.equal(eval1.criteriaEvaluation.length, 2);
  assert.equal(eval2.criteriaEvaluation.length, 2);
});

test("5. Legacy 5-category DB rubric is automatically normalized to the new 2-category 50/50 rubric", () => {
  const legacyQuestion = {
    title: "Legacy Question",
    marks: 100,
    evaluationRubric: [
      { criterion: "Conceptual Logic", weight: 30 },
      { criterion: "Algorithmic Approach", weight: 25 },
      { criterion: "Syntax & Structure", weight: 20 },
      { criterion: "Time & Space Complexity", weight: 15 },
      { criterion: "I/O & Boundary Conditions", weight: 10 },
    ],
  };
  const norm = normalizeAndValidateRubric(legacyQuestion);
  assert.equal(norm.criteria.length, 2);
  assert.equal(norm.criteria[0].criterion, "Algorithmic Approach");
  assert.equal(norm.criteria[0].maximumMarks, 50);
  assert.equal(norm.criteria[1].criterion, "Code Logic & Correctness");
  assert.equal(norm.criteria[1].maximumMarks, 50);
});
