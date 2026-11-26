import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const xlsx = require("xlsx");

import {
  detectPatternOrMatrix,
  splitRawTextIntoQuestionBlocks,
  extractQuestionsFromExcel,
  extractTextFromPdf,
  parseStructuredMatrix,
  classifyQuestionContent,
  parseBlockAllTestCases,
  parseBlockSampleTestCases,
} from "../services/questionParserService.js";
import {
  ruleBasedFallbackStructuring,
  validateQuestionConfidence,
} from "../services/questionExtractorAIService.js";
import ExamQuestion from "../models/ExamQuestion.js";
import { sanitizeExamCodeSubmissionForStudent } from "../models/ExamCodeSubmission.js";
import { judgeSubmission } from "../services/judgeService.js";
import {
  decodeHtmlEntities,
  normalizeSampleContent,
  cleanProblemStatement,
} from "../utils/textNormalization.js";

test("detectPatternOrMatrix accurately detects Star and Pyramid patterns", () => {
  const pyramid = `Write a program to print this pyramid:
    *
   ***
  *****
 *******
*********
Input: Height N
Output: Pyramid pattern`;

  assert.equal(detectPatternOrMatrix(pyramid), true);

  const starTriangle = `Generate right angle triangle:
*
**
***
****
*****`;
  assert.equal(detectPatternOrMatrix(starTriangle), true);
});

test("detectPatternOrMatrix accurately detects 2D Matrix examples", () => {
  const matrixText = `Write a C program to find the transpose of a matrix:
Matrix:
1 2 3
4 5 6
7 8 9`;

  assert.equal(detectPatternOrMatrix(matrixText), true);

  const normalQuestion = `Write a C program to calculate the factorial of a given integer N using recursion.
Input Format: Single integer N
Output Format: Factorial of N`;

  assert.equal(detectPatternOrMatrix(normalQuestion), false);
});

test("splitRawTextIntoQuestionBlocks parses various numbering formats without skipping", () => {
  const docText = `
Q1. Write a program to reverse an array.
Input: N followed by N integers.

Question 2: Check if a given string is a palindrome.
Ignore case sensitivity.

3) Find prime numbers between 1 and N.

Q4(a) Calculate the sum of digits of a number.
Q4(b) Count the frequency of each character.

5. Print the following pattern:
*
**
***
`;

  const blocks = splitRawTextIntoQuestionBlocks(docText);
  assert.equal(blocks.length, 6);
  assert.equal(blocks[0].originalQuestionNumber, "Q1");
  assert.equal(blocks[1].originalQuestionNumber, "Q2");
  assert.equal(blocks[2].originalQuestionNumber, "Q3");
  assert.equal(blocks[3].originalQuestionNumber, "Q4(a)");
  assert.equal(blocks[4].originalQuestionNumber, "Q4(b)");
  assert.equal(blocks[5].originalQuestionNumber, "Q5");
});

test("extractQuestionsFromExcel parses multi-row, multiline patterns and preserved whitespace", async () => {
  const tempDir = path.resolve("backend/uploads/temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const testExcelPath = path.join(tempDir, "test_sample.xlsx");

  // Generate a test workbook with patterns and tabular columns
  const data = [
    ["Q.No", "Title", "Problem Statement", "Input Format", "Output Format", "Sample Input", "Sample Output", "Difficulty"],
    [
      "Q1",
      "Sum of Two Numbers",
      "Write a C program to add two integers.\nRead A and B from standard input.",
      "Two space-separated integers",
      "Sum of integers",
      "5 10",
      "15",
      "Easy",
    ],
    [
      "Q2",
      "Pyramid Star Pattern",
      "Write a program to print the following pyramid:\n    *\n   ***\n  *****\n *******",
      "Integer N",
      "Star pyramid pattern",
      "4",
      "    *\n   ***\n  *****\n *******",
      "Medium",
    ],
    [
      "Q3",
      "Matrix Transpose",
      "Given a 3x3 matrix, output its transpose.\nMatrix example:\n1 2 3\n4 5 6\n7 8 9",
      "9 integers",
      "Transposed 3x3 matrix",
      "1 2 3 4 5 6 7 8 9",
      "1 4 7\n2 5 8\n3 6 9",
      "Hard",
    ],
  ];

  const ws = xlsx.utils.aoa_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Questions");
  xlsx.writeFile(wb, testExcelPath);

  try {
    const extracted = await extractQuestionsFromExcel(testExcelPath);
    assert.equal(extracted.length, 3);
    assert.equal(extracted[0].title, "Sum of Two Numbers");
    assert.equal(extracted[1].hasPatternOrMatrix, true);
    assert.equal(extracted[2].hasPatternOrMatrix, true);
    assert.ok(extracted[1].problemStatement.includes("    *"));
  } finally {
    if (fs.existsSync(testExcelPath)) {
      fs.unlinkSync(testExcelPath);
    }
  }
});

test("Large Document Testing: Generates and processes a representative 200-question document in batches", async () => {
  const tempDir = path.resolve("backend/uploads/temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const test200Path = path.join(tempDir, "test_200_questions.xlsx");

  const rows = [
    ["Q.No", "Title", "Problem Statement", "Input Format", "Output Format", "Difficulty", "Marks"],
  ];

  for (let i = 1; i <= 200; i++) {
    const isPattern = i % 5 === 0;
    const isMatrix = i % 10 === 0;

    let statement = `Write a C program for Task #${i}. Process integer input and verify edge cases.`;
    if (isPattern) {
      statement = `Task #${i}: Print an inverted pyramid of height 4:\n*******\n *****\n  ***\n   *`;
    } else if (isMatrix) {
      statement = `Task #${i}: Compute determinant of 2x2 matrix:\n1 2\n3 4`;
    }

    rows.push([
      `Q${i}`,
      `Programming Challenge ${i}`,
      statement,
      "Standard input according to problem specification",
      "Standard output format",
      i % 3 === 0 ? "Hard" : i % 2 === 0 ? "Medium" : "Easy",
      100,
    ]);
  }

  const ws = xlsx.utils.aoa_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "200_Questions_Bank");
  xlsx.writeFile(wb, test200Path);

  try {
    const rawBlocks = await extractQuestionsFromExcel(test200Path);
    assert.equal(rawBlocks.length, 200, "Must extract exactly 200 questions without skipping any");

    // Test dividing into batches of 15 questions
    const BATCH_SIZE = 15;
    const batches = [];
    for (let i = 0; i < rawBlocks.length; i += BATCH_SIZE) {
      batches.push(rawBlocks.slice(i, i + BATCH_SIZE));
    }

    assert.equal(batches.length, 14, "200 questions at 15/batch should produce 14 batches");
    assert.equal(batches[0].length, 15);
    assert.equal(batches[13].length, 5); // 13 * 15 + 5 = 200

    // Test structuring fallback on all 200 questions to verify formatting preservation
    const structuredQuestions = rawBlocks.map((b) => ruleBasedFallbackStructuring(b));
    assert.equal(structuredQuestions.length, 200);

    // Verify first, 100th, and 200th question
    assert.equal(structuredQuestions[0].originalQuestionNumber, "Q1");
    assert.equal(structuredQuestions[99].originalQuestionNumber, "Q100");
    assert.equal(structuredQuestions[199].originalQuestionNumber, "Q200");

    // Verify pattern preservation on pattern questions (e.g. Q5, Q10)
    const q5 = structuredQuestions[4];
    assert.equal(q5.hasPatternOrMatrix, true);
    assert.ok(q5.problemStatement.includes("*******"));
    assert.equal(q5.status, "needs_review", "Pattern questions should be flagged for review");
  } finally {
    if (fs.existsSync(test200Path)) {
      fs.unlinkSync(test200Path);
    }
  }
});

test("QuestionExtractionJob and ExamQuestion schema validation for bulk extraction", () => {
  const mongoose = require("mongoose");
  const QuestionExtractionJob = require("../models/QuestionExtractionJob.js").default;
  const ExamQuestion = require("../models/ExamQuestion.js").default;

  const mockExamId = new mongoose.Types.ObjectId();
  const mockFacultyId = new mongoose.Types.ObjectId();

  // Validate QuestionExtractionJob document schema
  const job = new QuestionExtractionJob({
    examId: mockExamId,
    facultyId: mockFacultyId,
    fileName: "exam_questions_200.xlsx",
    fileType: "xlsx",
    fileSize: 1024 * 50,
    status: "completed",
    totalDetected: 200,
    totalExtracted: 200,
    totalValidated: 180,
    totalNeedsReview: 20,
    extractedQuestions: [
      {
        originalQuestionNumber: "Q1",
        title: "Print Star Pyramid",
        problemStatement: "    *\n   ***\n  *****",
        hasPatternOrMatrix: true,
        status: "approved",
        difficulty: "Medium",
        marks: 100,
      },
    ],
  });

  const jobValidationError = job.validateSync();
  assert.equal(jobValidationError, undefined, "QuestionExtractionJob schema should validate cleanly");

  // Validate ExamQuestion with bulk_extracted source and questionNumber
  const examQuestion = new ExamQuestion({
    examId: mockExamId,
    questionNumber: "Q1",
    orderIndex: 1,
    source: "bulk_extracted",
    hasPatternOrMatrix: true,
    title: "Print Star Pyramid",
    problemStatement: "    *\n   ***\n  *****",
    testCases: [
      { input: "3", expectedOutput: "    *\n   ***\n  *****", isHidden: false },
      { input: "5", expectedOutput: "        *\n       ***\n      *****", isHidden: true },
    ],
  });

  const questionValidationError = examQuestion.validateSync();
  assert.equal(questionValidationError, undefined, "ExamQuestion schema should validate with bulk extraction fields");
  assert.equal(examQuestion.questionNumber, "Q1");
  assert.equal(examQuestion.source, "bulk_extracted");
  assert.equal(examQuestion.hasPatternOrMatrix, true);
});

test("Fisher-Yates Allocation Compatibility: 1-to-1 unique allocation with bulk-extracted questions", () => {
  // Simulate 100 bulk-extracted questions and 50 students
  const totalQuestions = 100;
  const totalStudents = 50;

  const questionBank = [];
  for (let i = 1; i <= totalQuestions; i++) {
    questionBank.push({
      _id: `q_id_${i}`,
      questionNumber: `Q${i}`,
      title: `Programming Problem ${i}`,
    });
  }

  const studentList = [];
  for (let s = 1; s <= totalStudents; s++) {
    studentList.push({
      _id: `student_id_${s}`,
      rollNo: `22CS${100 + s}`,
    });
  }

  // Pure Fisher-Yates shuffle implementation matching examController.js
  const shuffledQuestions = [...questionBank];
  for (let i = shuffledQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
  }

  const allocations = studentList.map((student, idx) => ({
    studentId: student._id,
    questionId: shuffledQuestions[idx]._id,
    questionNumber: shuffledQuestions[idx].questionNumber,
  }));

  // Assertions
  assert.equal(allocations.length, totalStudents);

  const assignedQuestionIds = new Set(allocations.map((a) => a.questionId));
  assert.equal(
    assignedQuestionIds.size,
    totalStudents,
    "Every student must receive a strictly unique question with 0 duplicates"
  );
});

test("Text Normalization & Label Deduplication: removes redundant 'Input: Input:' and 'Output: Output:' labels", () => {
  const rawInput = "Input: Input: 4";
  const normalizedInput = normalizeSampleContent(rawInput, "input");
  assert.equal(normalizedInput, "4");

  const rawSampleInput = "Sample Input: \n4";
  assert.equal(normalizeSampleContent(rawSampleInput, "input"), "4");

  const rawOutput = "Output: Output: 1 1 2 1 2 3 1 2 3 4&#x20;";
  const normalizedOutput = normalizeSampleContent(rawOutput, "output");
  assert.equal(normalizedOutput, "1 1 2 1 2 3 1 2 3 4");

  const nestedOutput = "Expected Output: Output: Sample Output:\nHello World";
  assert.equal(normalizeSampleContent(nestedOutput, "output"), "Hello World");
});

test("HTML Entity Decoding: safely decodes &#x20;, &nbsp;, &#160;, &#xa0; to standard whitespace", () => {
  const entityString = "1&#x20;2&nbsp;3&#160;4&#xa0;5";
  const decoded = decodeHtmlEntities(entityString);
  assert.equal(decoded, "1 2 3 4 5");

  const specialChars = "&lt;stdio.h&gt; &amp; &quot;main&quot; &#39;c&#39;";
  assert.equal(decodeHtmlEntities(specialChars), '<stdio.h> & "main" \'c\'');
});

test("Pattern 1 - Increasing number triangle: exact preservation of newlines and internal spaces", () => {
  const expectedTriangle = "1\n1 2\n1 2 3\n1 2 3 4";
  const rawBlockText = `Q28. Increasing Number Triangle
Write a C program to print an increasing number triangle of height N.

Sample Input:
4

Sample Output:
Output: ${expectedTriangle}&#x20;
`;

  const structured = ruleBasedFallbackStructuring({
    originalQuestionNumber: "Q28",
    rawContent: rawBlockText,
  });

  assert.equal(structured.sampleTestCases.length, 1);
  assert.equal(structured.sampleTestCases[0].input, "4");
  assert.equal(structured.sampleTestCases[0].expectedOutput, expectedTriangle);
  assert.equal(structured.sampleTestCases[0].expectedOutput.split("\n").length, 4);
});

test("Pattern 2 - Star triangle: exact preservation of newlines and asterisks", () => {
  const expectedStar = "*\n* *\n* * *\n* * * *";
  const rawBlockText = `Q29. Star Triangle Pattern
Sample Input:
4

Sample Output:
${expectedStar}
`;

  const structured = ruleBasedFallbackStructuring({
    originalQuestionNumber: "Q29",
    rawContent: rawBlockText,
  });

  assert.equal(structured.sampleTestCases.length, 1);
  assert.equal(structured.sampleTestCases[0].input, "4");
  assert.equal(structured.sampleTestCases[0].expectedOutput, expectedStar);
});

test("Pattern 3 - Pyramid with leading spaces: exact preservation of leading spaces and indentation", () => {
  const expectedPyramid = "   *\n  ***\n *****\n*******";
  const rawBlockText = `Q30. Center Aligned Star Pyramid
Sample Input:
4

Sample Output:
${expectedPyramid}
`;

  const structured = ruleBasedFallbackStructuring({
    originalQuestionNumber: "Q30",
    rawContent: rawBlockText,
  });

  assert.equal(structured.sampleTestCases.length, 1);
  assert.equal(structured.sampleTestCases[0].input, "4");
  assert.equal(structured.sampleTestCases[0].expectedOutput, expectedPyramid);

  // Validate exact leading whitespace on each line
  const lines = structured.sampleTestCases[0].expectedOutput.split("\n");
  assert.equal(lines[0], "   *");
  assert.equal(lines[1], "  ***");
  assert.equal(lines[2], " *****");
  assert.equal(lines[3], "*******");
});

test("Pattern 4 - Hollow square: exact preservation of perimeter asterisks and interior spaces", () => {
  const expectedHollow = "* * * * *\n*       *\n*       *\n*       *\n* * * * *";
  const rawBlockText = `Q31. Hollow Square Pattern
Sample Input:
5

Sample Output:
${expectedHollow}
`;

  const structured = ruleBasedFallbackStructuring({
    originalQuestionNumber: "Q31",
    rawContent: rawBlockText,
  });

  assert.equal(structured.sampleTestCases.length, 1);
  assert.equal(structured.sampleTestCases[0].input, "5");
  assert.equal(structured.sampleTestCases[0].expectedOutput, expectedHollow);

  const lines = structured.sampleTestCases[0].expectedOutput.split("\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[0], "* * * * *");
  assert.equal(lines[1], "*       *");
  assert.equal(lines[4], "* * * * *");
});

test("Pattern 5 - Matrix representation: exact preservation of row breaks and column spacing", () => {
  const expectedMatrix = "1 2 3\n4 5 6\n7 8 9";
  const rawBlockText = `Q32. Matrix Print
Sample Input:
3 3

Sample Output:
${expectedMatrix}
`;

  const structured = ruleBasedFallbackStructuring({
    originalQuestionNumber: "Q32",
    rawContent: rawBlockText,
  });

  assert.equal(structured.sampleTestCases.length, 1);
  assert.equal(structured.sampleTestCases[0].input, "3 3");
  assert.equal(structured.sampleTestCases[0].expectedOutput, expectedMatrix);

  const lines = structured.sampleTestCases[0].expectedOutput.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "1 2 3");
  assert.equal(lines[1], "4 5 6");
  assert.equal(lines[2], "7 8 9");
});

test("30-Question C Programming PDF: end-to-end extraction, classification, and zero phantom questions", async () => {
  const pdfPath = path.resolve("backend/uploads/temp/1795195195397-93676-C_Programming_Test_Question_Paper_30_Questions.pdf");
  if (!fs.existsSync(pdfPath)) {
    console.log("[Test Skipped] 30-question PDF not found at path:", pdfPath);
    return;
  }

  const { fullText, pages } = await extractTextFromPdf(pdfPath);
  assert.ok(fullText.length > 500, "PDF fullText should be substantively extracted");
  assert.ok(pages.length >= 4, "PDF should have at least 4 pages");

  const blocks = splitRawTextIntoQuestionBlocks({ fullText, pages });
  assert.equal(blocks.length, 30, "Exactly 30 questions must be extracted without phantom questions");

  // Verify all question numbers from Q1 to Q30 exist sequentially
  for (let i = 1; i <= 30; i++) {
    assert.equal(blocks[i - 1].originalQuestionNumber, `Q${i}`);
    assert.ok(blocks[i - 1].sourcePageNumber >= 1 && blocks[i - 1].sourcePageNumber <= pages.length);
  }

  // Verify Q12, Q13, Q15 are classified as 'text' (NOT pattern or matrix)
  assert.equal(blocks[11].contentType, "text", "Q12 (Second largest) must be classified as 'text'");
  assert.equal(blocks[12].contentType, "text", "Q13 (Sort even and odd) must be classified as 'text'");
  assert.equal(blocks[14].contentType, "text", "Q15 (Frequency of element) must be classified as 'text'");

  // Structure all blocks with fallback structuring to check test cases & confidence
  const structured = blocks.map((b) => ruleBasedFallbackStructuring(b));

  // Check Q15 sample output is intact and no phantom Q2/Q3/Q5 created
  assert.ok(structured[14].sampleTestCases.length >= 1, "Q15 must have sample test case");
  assert.ok(structured[14].sampleTestCases[0].expectedOutput.includes("2: 3"));
  assert.ok(structured[14].sampleTestCases[0].expectedOutput.includes("3: 2"));

  // Verify Q19, Q20, Q21, Q22 are classified as 'matrix' and have matrixData
  for (const qIdx of [18, 19, 20, 21]) {
    assert.equal(structured[qIdx].contentType, "matrix", `Q${qIdx + 1} must be classified as 'matrix'`);
    assert.ok(structured[qIdx].matrixData, `Q${qIdx + 1} must have parsed matrixData`);
    assert.equal(structured[qIdx].matrixData.type, "matrix");
    assert.ok(structured[qIdx].matrixData.rows >= 2);
    assert.ok(structured[qIdx].matrixData.columns >= 2);
  }

  // Verify Q23 to Q30 are classified as 'pattern'
  for (let qIdx = 22; qIdx < 30; qIdx++) {
    assert.equal(structured[qIdx].contentType, "pattern", `Q${qIdx + 1} must be classified as 'pattern'`);
  }

  // Verify Q25 (Number pyramid) has preserved leading spaces
  const q25Lines = structured[24].sampleTestCases[0].expectedOutput.split("\n");
  assert.ok(q25Lines.some((l) => /^\s{2,}/.test(l)), "Q25 should have leading spaces for pyramid alignment");

  // Verify Q26 (Hollow square) has preserved internal spaces
  const q26Lines = structured[25].sampleTestCases[0].expectedOutput.split("\n");
  assert.ok(q26Lines.slice(1, -1).some((l) => /\s{3,}/.test(l)), "Q26 should have internal spaces for hollow square");

  // Verify Q27 (Diamond) has centered spaces
  const q27Lines = structured[26].sampleTestCases[0].expectedOutput.split("\n");
  assert.ok(q27Lines.some((l) => /^\s{2,}/.test(l)), "Q27 should have centered leading spaces for diamond");

  // Verify Q28 (Increasing number triangle)
  const q28Output = structured[27].sampleTestCases[0].expectedOutput;
  assert.equal(q28Output, "1\n1 2\n1 2 3\n1 2 3 4", "Q28 must match exact increasing number triangle");

  // Verify Q29 (Floyd's triangle) specifically
  const q29 = structured[28];
  assert.equal(q29.originalQuestionNumber, "Q29");
  assert.equal(q29.title, "Floyd's triangle");
  assert.equal(q29.sampleTestCases.length, 1);
  assert.equal(q29.sampleTestCases[0].input, "4");
  assert.equal(
    q29.sampleTestCases[0].expectedOutput,
    "1\n2 3\n4 5 6\n7 8 9 10",
    "Q29 expected output must match exact multiline Floyd's triangle without flattening"
  );
  assert.ok(
    !q29.sampleTestCases[0].expectedOutput.includes("ClabToPro"),
    "Q29 output must not contain ClabToPro footer"
  );
  assert.ok(
    !q29.sampleTestCases[0].expectedOutput.includes("Page"),
    "Q29 output must not contain Page token"
  );
  assert.ok(
    !q29.sampleTestCases[0].expectedOutput.includes("&#x20;"),
    "Q29 output must not contain HTML entities"
  );
  assert.equal(q29.status, "approved", "Q29 must be approved");

  // Verify Q30 (Alphabet pyramid)
  const q30Output = structured[29].sampleTestCases[0].expectedOutput;
  assert.equal(
    q30Output,
    "A\nA B A\nA B C B A\nA B C D C B A",
    "Q30 must match exact alphabet pyramid"
  );

  // Verify confidence: all 30 questions are complete and should be 'approved'
  const approvedCount = structured.filter((q) => q.status === "approved").length;
  assert.equal(approvedCount, 30, "All 30 complete questions should have status 'approved'");
});

test("PDF Footer & Header Contamination Resilience: strips repeated footers and trailer tokens", () => {
  // Test case 1: Injected trailer footer at end of flattened string
  const contaminatedSingleLine =
    "1 2 3 4 5 6 7 8 9 10 ClabToPro | C Programming Extraction Test Paper Page 7";
  const cleanedSingleLine = normalizeSampleContent(contaminatedSingleLine, "output");
  assert.equal(cleanedSingleLine, "1 2 3 4 5 6 7 8 9 10");

  // Test case 2: Injected trailer footer at end of multiline pattern block
  const contaminatedBlock = `Question 29: Floyd's triangle
Read n and print n rows of consecutive natural numbers, starting from 1. Row i must contain i numbers.
Sample Input
Input: 4
Sample Output
Output:
1
2 3
4 5 6
7 8 9 10
ClabToPro | C Programming Extraction Test Paper Page 7
`;

  const structured = ruleBasedFallbackStructuring({
    originalQuestionNumber: "Q29",
    rawContent: contaminatedBlock,
  });

  assert.equal(structured.sampleTestCases.length, 1);
  assert.equal(structured.sampleTestCases[0].input, "4");
  assert.equal(
    structured.sampleTestCases[0].expectedOutput,
    "1\n2 3\n4 5 6\n7 8 9 10",
    "Must exclude the footer and preserve multiline output"
  );
  assert.ok(!structured.sampleTestCases[0].expectedOutput.includes("ClabToPro"));
  assert.ok(!structured.sampleTestCases[0].expectedOutput.includes("Page 7"));
  assert.equal(structured.status, "approved");
});

test("160–200 Question synthetic benchmark: batching, boundary precision, and zero leakage", () => {
  const TOTAL_QUESTIONS = 200;
  const questions = [];

  for (let i = 1; i <= TOTAL_QUESTIONS; i++) {
    let blockText = "";
    if (i % 10 === 0) {
      blockText = `Q${i}. Floyd's Triangle ${i}\nGenerate Floyd's Triangle with ${i} lines.\nSample Input:\n3\nSample Output:\n1\n2 3\n4 5 6`;
    } else if (i % 10 === 5) {
      blockText = `Q${i}. Matrix Transpose ${i}\nTranspose a square matrix.\nSample Input:\n2 2\n1 2\n3 4\nSample Output:\n1 3\n2 4`;
    } else {
      blockText = `Q${i}. Array Processing Problem ${i}\nFind element at index ${i}.\nSample Input:\n5\n1 2 3 4 5\nSample Output:\n${i}`;
    }
    questions.push(blockText);
  }

  const combinedDoc = questions.join("\n\n");
  const parsedBlocks = splitRawTextIntoQuestionBlocks(combinedDoc);

  assert.equal(parsedBlocks.length, TOTAL_QUESTIONS, "Must split exactly 200 questions without skipping or merging");

  // Verify batch slicing (e.g. BATCH_SIZE = 15)
  const BATCH_SIZE = 15;
  const batches = [];
  for (let i = 0; i < parsedBlocks.length; i += BATCH_SIZE) {
    batches.push(parsedBlocks.slice(i, i + BATCH_SIZE));
  }

  assert.equal(batches.length, Math.ceil(TOTAL_QUESTIONS / BATCH_SIZE));
  assert.equal(batches[0].length, 15);
  assert.equal(batches[batches.length - 1].length, TOTAL_QUESTIONS % BATCH_SIZE || BATCH_SIZE);

  // Verify question structure mapping across all batches
  const processedQuestions = parsedBlocks.map((b) => ruleBasedFallbackStructuring(b));
  assert.equal(processedQuestions.length, TOTAL_QUESTIONS);
  assert.ok(processedQuestions.every((q) => q.title && q.problemStatement && q.sampleTestCases.length > 0));
});

test("Test Case Extraction: PDF with only sample test cases", () => {
  const block = `Q1. Sum of Two Numbers
Read two integers A and B and print their sum.

Sample Test Cases:
Sample Input:
2 3
Sample Output:
5`;

  const { sampleTestCases, hiddenTestCases } = parseBlockAllTestCases(block, "Sum of Two Numbers");
  assert.equal(sampleTestCases.length, 1);
  assert.equal(sampleTestCases[0].input, "2 3");
  assert.equal(sampleTestCases[0].expectedOutput, "5");
  assert.equal(sampleTestCases[0].isHidden, false);
  assert.equal(hiddenTestCases.length, 0);
});

test("Test Case Extraction: PDF with both sample and hidden test cases", () => {
  const block = `Q2. Difference of Two Numbers
Read two integers A and B and print A - B.

Sample Test Cases:
Sample Input:
10 4
Sample Output:
6

Hidden Test Cases:
Hidden Input:
-5 -10
Hidden Output:
5`;

  const { sampleTestCases, hiddenTestCases } = parseBlockAllTestCases(block, "Difference of Two Numbers");
  assert.equal(sampleTestCases.length, 1);
  assert.equal(sampleTestCases[0].input, "10 4");
  assert.equal(sampleTestCases[0].expectedOutput, "6");
  assert.equal(sampleTestCases[0].isHidden, false);
  assert.equal(sampleTestCases[0].type, "sample");

  assert.equal(hiddenTestCases.length, 1);
  assert.equal(hiddenTestCases[0].input, "-5 -10");
  assert.equal(hiddenTestCases[0].expectedOutput, "5");
  assert.equal(hiddenTestCases[0].isHidden, true);
  assert.equal(hiddenTestCases[0].type, "hidden");
});

test("Test Case Extraction: Multiple sample and multiple hidden test cases", () => {
  const block = `Q3. Multiply Two Numbers
Multiply integers.

Sample Test Case 1:
Input:
2 3
Output:
6

Sample Test Case 2:
Input:
4 5
Output:
20

Hidden Test Case 1:
Input:
0 100
Output:
0

Hidden Test Case 2:
Input:
-2 3
Output:
-6

Hidden Test Case 3:
Input:
-5 -5
Output:
25`;

  const { sampleTestCases, hiddenTestCases } = parseBlockAllTestCases(block, "Multiply Two Numbers");
  assert.equal(sampleTestCases.length, 2);
  assert.equal(sampleTestCases[0].input, "2 3");
  assert.equal(sampleTestCases[0].expectedOutput, "6");
  assert.equal(sampleTestCases[1].input, "4 5");
  assert.equal(sampleTestCases[1].expectedOutput, "20");

  assert.equal(hiddenTestCases.length, 3);
  assert.equal(hiddenTestCases[0].input, "0 100");
  assert.equal(hiddenTestCases[0].expectedOutput, "0");
  assert.equal(hiddenTestCases[1].input, "-2 3");
  assert.equal(hiddenTestCases[1].expectedOutput, "-6");
  assert.equal(hiddenTestCases[2].input, "-5 -5");
  assert.equal(hiddenTestCases[2].expectedOutput, "25");
});

test("Test Case Extraction: Supports Private Test Cases, Hidden Input/Output, and inline labels", () => {
  const block = `Q4. Check Palindrome Number
Determine if N is a palindrome.

Example 1:
Example Input:
121
Example Output:
YES

Private Test Cases:
Private Input:
12321
Private Output:
YES

Test Case 3 (Hidden):
Input:
1234
Output:
NO`;

  const { sampleTestCases, hiddenTestCases } = parseBlockAllTestCases(block, "Check Palindrome");
  assert.equal(sampleTestCases.length, 1);
  assert.equal(sampleTestCases[0].input, "121");
  assert.equal(sampleTestCases[0].expectedOutput, "YES");

  assert.equal(hiddenTestCases.length, 2);
  assert.equal(hiddenTestCases[0].input, "12321");
  assert.equal(hiddenTestCases[0].expectedOutput, "YES");
  assert.equal(hiddenTestCases[1].input, "1234");
  assert.equal(hiddenTestCases[1].expectedOutput, "NO");
});

test("Test Case Extraction: Preserves multiline pattern outputs in hidden test cases", () => {
  const block = `Q5. Star Pyramid
Print centered star pyramid.

Sample Test Case 1:
Input:
2
Output:
 *
***

Hidden Test Case 1:
Hidden Input:
3
Hidden Output:
  *
 ***
*****`;

  const structured = ruleBasedFallbackStructuring({
    originalQuestionNumber: "Q5",
    title: "Star Pyramid",
    rawContent: block,
  });

  assert.equal(structured.sampleTestCases.length, 1);
  assert.ok(structured.sampleTestCases[0].expectedOutput.includes("\n"));
  assert.equal(structured.hiddenTestCases.length, 1);
  assert.ok(structured.hiddenTestCases[0].expectedOutput.includes("\n"));
  assert.equal(structured.hiddenTestCases[0].input, "3");
  assert.equal(structured.hiddenTestCases[0].expectedOutput, "  *\n ***\n*****");
  assert.equal(structured.hiddenTestCases[0].isHidden, true);
});

test("validateQuestionConfidence: Flags incomplete test cases with missing expected output", () => {
  const incompleteQuestion = {
    originalQuestionNumber: "Q6",
    title: "Incomplete Question Example",
    problemStatement: "A valid complete problem statement of sufficient length.",
    contentType: "text",
    sampleTestCases: [
      {
        input: "10 20",
        expectedOutput: "", // Missing expected output!
        isHidden: false,
      },
    ],
    hiddenTestCases: [],
  };

  const validation = validateQuestionConfidence(incompleteQuestion);
  assert.equal(validation.status, "needs_review");
  assert.ok(validation.reviewReason.includes("missing expected output"));
});

test("ExamQuestion Schema: Validates testCases array with type and isHidden attributes", () => {
  const mockExamId = "507f1f77bcf86cd799439011";
  const question = new ExamQuestion({
    examId: mockExamId,
    questionNumber: "Q1",
    title: "Sum Test",
    problemStatement: "A problem statement that has sufficient length.",
    testCases: [
      {
        type: "sample",
        input: "1 2",
        expectedOutput: "3",
        isHidden: false,
      },
      {
        type: "hidden",
        input: "10 20",
        expectedOutput: "30",
        isHidden: true,
      },
    ],
  });

  const err = question.validateSync();
  assert.equal(err, undefined);
  assert.equal(question.testCases.length, 2);
  assert.equal(question.testCases[0].type, "sample");
  assert.equal(question.testCases[0].isHidden, false);
  assert.equal(question.testCases[1].type, "hidden");
  assert.equal(question.testCases[1].isHidden, true);
});

test("Strict Hidden Test Security: sanitizeExamCodeSubmissionForStudent strictly conceals hidden test cases", () => {
  const submissionData = {
    testCasesPassed: 2,
    totalTestCases: 3,
    testCaseResults: [
      {
        testCaseNumber: 1,
        status: "passed",
        executionTime: 12,
        isHidden: false,
        input: "2 3",
        expectedOutput: "5",
        actualOutput: "5",
        error: "",
      },
      {
        testCaseNumber: 2,
        status: "passed",
        executionTime: 14,
        isHidden: true,
        input: "-5 5",
        expectedOutput: "0",
        actualOutput: "0",
        error: "",
      },
      {
        testCaseNumber: 3,
        status: "failed",
        executionTime: 10,
        isHidden: true,
        input: "100 200",
        expectedOutput: "300",
        actualOutput: "299",
        error: "Wrong answer",
      },
    ],
  };

  const sanitized = sanitizeExamCodeSubmissionForStudent(submissionData);

  // Verify visible sample test case keeps input, expectedOutput, actualOutput
  assert.equal(sanitized.testCases[0].isHidden, false);
  assert.equal(sanitized.testCases[0].input, "2 3");
  assert.equal(sanitized.testCases[0].expectedOutput, "5");
  assert.equal(sanitized.testCases[0].actualOutput, "5");

  // Verify hidden test case 2 strictly strips input, expectedOutput, and actualOutput
  assert.equal(sanitized.testCases[1].isHidden, true);
  assert.equal(sanitized.testCases[1].input, undefined);
  assert.equal(sanitized.testCases[1].expectedOutput, undefined);
  assert.equal(sanitized.testCases[1].actualOutput, undefined);
  assert.equal(sanitized.testCases[1].visibility, "hidden");

  // Verify hidden test case 3 strictly strips input and expectedOutput, while allowing student actualOutput on failure
  assert.equal(sanitized.testCases[2].isHidden, true);
  assert.equal(sanitized.testCases[2].input, undefined);
  assert.equal(sanitized.testCases[2].expectedOutput, undefined);
  assert.equal(sanitized.testCases[2].actualOutput, "299");
  assert.equal(sanitized.testCases[2].hiddenTestNumber, 2);
  assert.equal(sanitized.testCases[2].statusLabel, "Wrong Answer");
  assert.equal(sanitized.testCases[2].visibility, "hidden");

  // Verify aggregates are safe and correct
  assert.equal(sanitized.summary.passedTests, 2);
  assert.equal(sanitized.summary.failedTests, 1);
  assert.equal(sanitized.summary.totalTests, 3);
});

test("Deterministic Judge Execution: Executes against both sample and hidden test cases", async () => {
  const code = `#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}`;

  const testCases = [
    { input: "1 2", expectedOutput: "3", isHidden: false },
    { input: "10 20", expectedOutput: "30", isHidden: true },
    { input: "-5 5", expectedOutput: "0", isHidden: true },
  ];

  const result = await judgeSubmission({
    code,
    testCases,
    problemTitle: "Sum Test Execution",
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.testCasesPassed, 3);
  assert.equal(result.totalTestCases, 3);
  assert.equal(result.testCaseResults.length, 3);
  assert.equal(result.testCaseResults[0].isHidden, false);
  assert.equal(result.testCaseResults[1].isHidden, true);
  assert.equal(result.testCaseResults[2].isHidden, true);
});



