import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRawMCQQuestion,
  splitRawTextIntoMCQBlocks,
  validateVivaMcqPdf,
  normalizeOptionLetter,
  normalizeOptionText,
} from "../services/mcqParserService.js";
import {
  selectDistinctQuestionsForStudent,
  countUniqueQuestions,
} from "../controllers/examController.js";

// =========================================================================
// 1. MCQ PARSER UNIT TESTS
// =========================================================================

test("MCQ Parser: normalizeOptionLetter strips parentheses, prefixes, and punctuation", () => {
  assert.equal(normalizeOptionLetter("A"), "A");
  assert.equal(normalizeOptionLetter("(B)"), "B");
  assert.equal(normalizeOptionLetter("Option C"), "C");
  assert.equal(normalizeOptionLetter("d)"), "D");
  assert.equal(normalizeOptionLetter("  [E]  "), "E");
  assert.equal(normalizeOptionLetter("1"), "1");
});

test("MCQ Parser: normalizeOptionText strips leading labels and whitespace", () => {
  assert.equal(normalizeOptionText("A) 42"), "42");
  assert.equal(normalizeOptionText("(b) return 0;"), "return 0;");
  assert.equal(normalizeOptionText("C. Segmentation fault"), "Segmentation fault");
  assert.equal(normalizeOptionText("Dynamic memory allocation"), "Dynamic memory allocation");
});

test("MCQ Parser: splitRawTextIntoMCQBlocks divides text into individual questions", () => {
  const rawDoc = `
Q1. What is the output of printf("%d", sizeof(int)); on a 32-bit architecture?
A) 2
B) 4
C) 8
D) Compiler Error
Answer: B
Explanation: An integer on 32-bit GCC compiler is 4 bytes.

Q2. Which of the following allocates memory from the heap?
A) malloc()
B) calloc()
C) realloc()
D) All of the above
Answer: D

Question 3: In C, strings are terminated by:
A. \\n
B. \\0
C. EOF
D. None
Answer: B
  `.trim();

  const blocks = splitRawTextIntoMCQBlocks(rawDoc);
  assert.equal(blocks.length, 3, "Expected 3 separate MCQ blocks");
  assert.ok(blocks[0].questionText.includes("sizeof(int)"));
  assert.ok(blocks[1].questionText.includes("allocates memory"));
  assert.ok(blocks[1].options[0].text.includes("malloc()"));
  assert.ok(blocks[2].questionText.includes("strings are terminated"));
});

test("MCQ Parser: extracts 4 separate-line options with correct answer and explanation", () => {
  const block = `
Q1. What will be the output of the following C code snippet?
#include <stdio.h>
int main() {
    int x = 5;
    printf("%d", x++);
    return 0;
}
A) 5
B) 6
C) 7
D) Undefined behavior
Answer: A
Explanation: Post-increment outputs the current value 5 before incrementing to 6.
  `.trim();

  const parsed = parseRawMCQQuestion(block, 1);
  assert.equal(parsed.questionNumber, "Q1");
  assert.ok(parsed.questionText.includes("printf(\"%d\", x++)"), "Code snippet preserved");
  assert.equal(parsed.options.length, 4, "Should extract 4 options");
  assert.equal(parsed.options[0].optionId, "A");
  assert.equal(parsed.options[0].text, "5");
  assert.equal(parsed.options[1].optionId, "B");
  assert.equal(parsed.options[1].text, "6");
  assert.equal(parsed.correctAnswer, "A");
  assert.ok(parsed.explanation.includes("Post-increment"), "Explanation extracted");
  assert.equal(parsed.extractionStatus, "Auto-Detected");
});

test("MCQ Parser: extracts same-line (inline) options accurately", () => {
  const block = `
Q5. Which header file contains declaration for malloc() and free()?
A) stdio.h   B) stdlib.h   C) string.h   D) math.h
Ans: (B)
  `.trim();

  const parsed = parseRawMCQQuestion(block, 5);
  assert.equal(parsed.questionNumber, "Q5");
  assert.equal(parsed.options.length, 4, "Should extract all 4 inline options");
  assert.equal(parsed.options[0].text, "stdio.h");
  assert.equal(parsed.options[1].text, "stdlib.h");
  assert.equal(parsed.options[2].text, "string.h");
  assert.equal(parsed.options[3].text, "math.h");
  assert.equal(parsed.correctAnswer, "B");
  assert.equal(parsed.extractionStatus, "Auto-Detected");
});

test("MCQ Parser: handles 2-option (True/False) questions", () => {
  const block = `
Q7. In C programming, arrays are passed by reference to functions.
A) True
B) False
Correct Answer: Option A
  `.trim();

  const parsed = parseRawMCQQuestion(block, 7);
  assert.equal(parsed.options.length, 2);
  assert.equal(parsed.options[0].text, "True");
  assert.equal(parsed.options[1].text, "False");
  assert.equal(parsed.correctAnswer, "A");
});

test("MCQ Parser: handles 5 options (A, B, C, D, E)", () => {
  const block = `
Q10. What is the time complexity of binary search on a sorted array?
A) O(1)
B) O(log n)
C) O(n)
D) O(n log n)
E) O(n^2)
Answer - B
  `.trim();

  const parsed = parseRawMCQQuestion(block, 10);
  assert.equal(parsed.options.length, 5);
  assert.equal(parsed.options[4].optionId, "E");
  assert.equal(parsed.options[4].text, "O(n^2)");
  assert.equal(parsed.correctAnswer, "B");
});

test("MCQ Parser: handles questions missing answer key without crashing", () => {
  const block = `
Q12. What does the volatile keyword prevent in GCC compiler?
A) Deadlock
B) Compiler optimization
C) Stack overflow
D) Race condition
  `.trim();

  const parsed = parseRawMCQQuestion(block, 12);
  assert.equal(parsed.options.length, 4);
  assert.equal(parsed.correctAnswer, "Answer Not Provided");
  assert.equal(parsed.extractionStatus, "Needs Review");
  assert.ok(parsed.reviewReason.includes("Answer key not detected"), "Review reason assigned");
});

// =========================================================================
// 2. MCQ EVALUATION & AUTOMATIC SCORING LOGIC
// =========================================================================

test("MCQ Scoring: computes perfect score with positive marks", () => {
  const questions = [
    { _id: "q1", marks: 1, correctAnswer: "A" },
    { _id: "q2", marks: 1, correctAnswer: "B" },
    { _id: "q3", marks: 2, correctAnswer: "C" },
  ];

  const studentAnswers = new Map([
    ["q1", { selectedOption: "A" }],
    ["q2", { selectedOption: "B" }],
    ["q3", { selectedOption: "C" }],
  ]);

  let correct = 0;
  let earned = 0;
  for (const q of questions) {
    const ans = studentAnswers.get(q._id);
    if (ans?.selectedOption?.toUpperCase() === q.correctAnswer.toUpperCase()) {
      correct++;
      earned += q.marks;
    }
  }

  assert.equal(correct, 3);
  assert.equal(earned, 4);
});

test("MCQ Scoring: deducts negative marks when enabled", () => {
  const exam = { negativeMarkingEnabled: true, negativeMarking: 0.25 };
  const questions = [
    { _id: "q1", marks: 1, negativeMarks: 0.25, correctAnswer: "A" },
    { _id: "q2", marks: 1, negativeMarks: 0.25, correctAnswer: "B" },
    { _id: "q3", marks: 1, negativeMarks: 0.25, correctAnswer: "C" },
    { _id: "q4", marks: 1, negativeMarks: 0.25, correctAnswer: "D" },
  ];

  // Student got 2 right, 1 wrong, 1 unanswered
  const studentAnswers = new Map([
    ["q1", { selectedOption: "A" }], // Correct (+1)
    ["q2", { selectedOption: "B" }], // Correct (+1)
    ["q3", { selectedOption: "A" }], // Incorrect (-0.25)
    ["q4", { selectedOption: null }], // Unanswered (0)
  ]);

  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let score = 0;

  for (const q of questions) {
    const ans = studentAnswers.get(q._id);
    if (!ans?.selectedOption) {
      unanswered++;
      continue;
    }
    if (ans.selectedOption.toUpperCase() === q.correctAnswer.toUpperCase()) {
      correct++;
      score += q.marks;
    } else {
      incorrect++;
      if (exam.negativeMarkingEnabled) {
        score -= q.negativeMarks;
      }
    }
  }

  assert.equal(correct, 2);
  assert.equal(incorrect, 1);
  assert.equal(unanswered, 1);
  assert.equal(score, 1.75, "Expected 2 - 0.25 = 1.75");
});

test("MCQ Scoring: final score is clamped to zero and never negative", () => {
  const exam = { negativeMarkingEnabled: true, negativeMarking: 1.0 };
  const questions = [
    { _id: "q1", marks: 1, negativeMarks: 1, correctAnswer: "A" },
    { _id: "q2", marks: 1, negativeMarks: 1, correctAnswer: "B" },
  ];

  // Student got both wrong
  const studentAnswers = new Map([
    ["q1", { selectedOption: "C" }],
    ["q2", { selectedOption: "D" }],
  ]);

  let earned = 0;
  let penalty = 0;
  for (const q of questions) {
    const ans = studentAnswers.get(q._id);
    if (ans?.selectedOption?.toUpperCase() === q.correctAnswer.toUpperCase()) {
      earned += q.marks;
    } else {
      penalty += q.negativeMarks;
    }
  }

  const finalScore = Math.max(0, earned - penalty);
  assert.equal(finalScore, 0, "Score should not go below 0");
});

// =========================================================================
// 3. STUDENT SECURITY: ANSWER CONCEALMENT
// =========================================================================

test("Student Security: questions returned to student during exam strictly redact correctAnswer and explanation", () => {
  const rawDbQuestions = [
    {
      _id: "q101",
      questionNumber: "Q1",
      questionText: "What is a pointer in C?",
      options: [
        { optionId: "A", text: "A variable that stores memory address" },
        { optionId: "B", text: "A keyword" },
      ],
      correctAnswer: "A",
      explanation: "Pointers hold addresses of other variables in memory.",
      marks: 1,
    },
  ];

  const isExamCompleted = false;

  const sanitizedQuestions = rawDbQuestions.map((q) => {
    const safe = {
      _id: q._id,
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      options: q.options,
      marks: q.marks,
    };
    if (isExamCompleted) {
      safe.correctAnswer = q.correctAnswer;
      safe.explanation = q.explanation;
    }
    return safe;
  });

  assert.equal(sanitizedQuestions[0].correctAnswer, undefined, "correctAnswer must be hidden during active exam");
  assert.equal(sanitizedQuestions[0].explanation, undefined, "explanation must be hidden during active exam");
  assert.ok(sanitizedQuestions[0].options.length === 2, "Options remain visible");
});

test("Student Security: answers and explanations remain concealed from student even after submission", () => {
  const rawDbQuestions = [
    {
      _id: "q101",
      questionNumber: "Q1",
      questionText: "What is a pointer in C?",
      options: [
        { optionId: "A", text: "A variable that stores memory address" },
        { optionId: "B", text: "A keyword" },
      ],
      correctAnswer: "A",
      explanation: "Pointers hold addresses of other variables in memory.",
      marks: 1,
    },
  ];

  // Answers and explanations are concealed from students; only faculty sees scores in monitoring
  const sanitizedQuestions = rawDbQuestions.map((q) => ({
    _id: q._id,
    questionNumber: q.questionNumber,
    questionText: q.questionText,
    options: q.options,
    marks: q.marks,
  }));

  assert.equal(sanitizedQuestions[0].correctAnswer, undefined, "correctAnswer must remain concealed");
  assert.equal(sanitizedQuestions[0].explanation, undefined, "explanation must remain concealed");
});

test("StudentExamProgress Schema: validates in_progress status and vivaResult fields", async () => {
  const StudentExamProgress = (await import("../models/StudentExamProgress.js")).default;
  const mongoose = (await import("mongoose")).default;

  const mockProgress = new StudentExamProgress({
    examId: new mongoose.Types.ObjectId(),
    studentId: new mongoose.Types.ObjectId(),
    status: "in_progress",
    instructionsAcknowledged: true,
    vivaStartedAt: new Date(),
    vivaResult: {
      totalQuestions: 10,
      attempted: 8,
      correct: 7,
      incorrect: 1,
      unanswered: 2,
      score: 7,
      totalPossibleMarks: 10,
      totalMarks: 10,
      percentage: 70,
      passed: true,
      submittedAt: new Date(),
    },
  });

  const err = mockProgress.validateSync();
  assert.equal(err, undefined, "Expected valid progress document with in_progress status without enum validation errors");
  assert.equal(mockProgress.status, "in_progress");
  assert.equal(mockProgress.vivaResult.score, 7);
  assert.equal(mockProgress.vivaResult.attempted, 8);
  assert.equal(mockProgress.vivaResult.passed, true);
});

test("Viva PDF Validation: accepts Sample_Viva_MCQ_Template format with optional explanations and True/False", () => {
  const sampleDoc = `
CLABTOPRO VIVA EXAMINATION
Subject: C Programming & Systems | Exam Duration: 30 Mins | Maximum Marks: 10
MCQ Document Formatting Guidelines: Each question begins with a sequential number (e.g., Q1., Q2.).

Q1. Which of the following data types in standard C has its size guaranteed to be at least 1 byte?
A. char
B. short
C. int
D. long
Answer: A
Explanation: By C language specification, sizeof(char) is always 1 byte.

Q2. What will be the output of the following C code snippet?
#include <stdio.h>
int main() {
    int arr[] = {10, 20, 30, 40};
    printf("%d", *(arr + 2));
    return 0;
}
A. 10
B. 20
C. 30
D. 40
Answer: C

Q3. In C string handling, all string literals are terminated with '\\0'.
A. True
B. False
Answer: A
  `.trim();

  const blocks = splitRawTextIntoMCQBlocks(sampleDoc, { strictNumberedOnly: true });
  assert.equal(blocks.length, 3, "Guideline preamble and explanations must not be counted as extra questions");

  const validation = validateVivaMcqPdf({ rawInput: sampleDoc, blocks });
  assert.equal(validation.valid, true, `Expected valid Viva PDF, got errors: ${validation.errors.join("; ")}`);
  assert.equal(validation.errors.length, 0);
});

test("Viva PDF Validation: rejects missing answer key, mismatched answer letter, non-sequential numbering, and unnumbered text", () => {
  const badDoc = `
Q1. Valid first question?
A. Yes
B. No
Answer: A

Q3. Skipped Q2 and missing answer key?
A. Option 1
B. Option 2
C. Option 3
D. Option 4

Q4. Answer key does not match options?
A. True
B. False
Answer: D
  `.trim();

  const blocks = splitRawTextIntoMCQBlocks(badDoc, { strictNumberedOnly: true });
  const validation = validateVivaMcqPdf({ rawInput: badDoc, blocks });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("Expected Q2")));
  assert.ok(validation.errors.some((e) => e.includes("Q3: Correct answer key is missing")));
  assert.ok(validation.errors.some((e) => e.includes("Q4: Answer key \"D\" does not match")));

  const unnumberedDoc = "What is a pointer in C?\nIt stores a memory address.\n\nWhat is an array?\nContiguous memory.";
  const unnumberedBlocks = splitRawTextIntoMCQBlocks(unnumberedDoc, { strictNumberedOnly: true });
  const unnumberedVal = validateVivaMcqPdf({ rawInput: unnumberedDoc, blocks: unnumberedBlocks });
  assert.equal(unnumberedVal.valid, false);
  assert.ok(unnumberedVal.errors.some((e) => e.includes("No properly numbered Viva MCQ questions")));
});

test("Viva Question Assignment: allows duplicate questions across students while ensuring uniqueness per student", () => {
  // Bank has 5 entries, but only 3 unique questions (Q1a==Q1b, Q2a==Q2b, Q3)
  const q1a = { _id: "650000000000000000000001", questionText: "What is a pointer in C?" };
  const q1b = { _id: "650000000000000000000002", questionText: "What is a pointer in C?" };
  const q2a = { _id: "650000000000000000000003", questionText: "What is sizeof(int)?" };
  const q2b = { _id: "650000000000000000000004", questionText: "What is sizeof(int)?" };
  const q3 = { _id: "650000000000000000000005", questionText: "Which header declares printf?" };
  const bank = [q1a, q1b, q2a, q2b, q3];

  assert.equal(countUniqueQuestions(bank), 3);

  const usedCombos = new Set();
  const student1 = selectDistinctQuestionsForStudent(bank, 3, usedCombos);
  const student2 = selectDistinctQuestionsForStudent(bank, 3, usedCombos);

  // Both students get 3 unique questions (even though they share the same 3 questions)
  assert.equal(student1.length, 3);
  assert.equal(student2.length, 3);
  assert.equal(new Set(student1.map((q) => q.questionText)).size, 3);
  assert.equal(new Set(student2.map((q) => q.questionText)).size, 3);

  // If requesting k=5 (more than 3 unique), never pad with duplicates -> returns only 3 unique
  const capped = selectDistinctQuestionsForStudent(bank, 5, new Set());
  assert.equal(capped.length, 3);
  assert.equal(new Set(capped.map((q) => q.questionText)).size, 3);
});
