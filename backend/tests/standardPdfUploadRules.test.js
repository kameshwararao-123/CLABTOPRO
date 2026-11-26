import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractTextFromPdf,
  extractStandardPdfMetadata,
  splitRawTextIntoQuestionBlocks,
  validateStandardCodingPdf,
} from "../services/questionParserService.js";

test("1. Standard 60Q PDF structure with metadata, sample & hidden test cases, and patterns passes validation", () => {
  const header = `ClabToPro Standard C Programming Paper
Difficulty Level: Medium
Programming Language: C
Total Number of Questions: 60
Marks Per Question: 100
Total Hidden Test Cases: 120
`;

  const questions = [];
  for (let i = 1; i <= 60; i++) {
    if (i === 1) {
      questions.push(`Q1. Hollow Pyramid Pattern
Difficulty: Medium
Marks: 100
Problem Description:
Print a centered star pyramid of N rows preserving leading spaces.
Sample Test Cases
Sample Test Case 1
Sample Input: 3
Sample Output:
  *
 * *
*****
Hidden Test Cases
Hidden Test Case 1
Hidden Input: 2
Hidden Output:
 *
***
Hidden Test Case 2
Hidden Input: 1
Hidden Output:
*`);
    } else if (i === 2) {
      questions.push(`Q2. Matrix Row Sum
Difficulty: Medium
Marks: 100
Problem Description:
Read a 2x2 matrix and print the matrix rows.
Sample Test Cases
Sample Test Case 1
Sample Input:
1 2
3 4
Sample Output:
1 2
3 4
Hidden Test Cases
Hidden Test Case 1
Hidden Input:
5 6
7 8
Hidden Output:
5 6
7 8
Hidden Test Case 2
Hidden Input:
0 0
0 0
Hidden Output:
0 0
0 0`);
    } else {
      questions.push(`Q${i}. Sum of Two Integers Variant ${i}
Difficulty: Medium
Marks: 100
Problem Description:
Given two integers a and b, compute and print their sum a + b.
Sample Test Cases
Sample Test Case 1
Sample Input: ${i} 10
Sample Output: ${i + 10}
Hidden Test Cases
Hidden Test Case 1
Hidden Input: -5 5
Hidden Output: 0
Hidden Test Case 2
Hidden Input: 100 200
Hidden Output: 300`);
    }
  }

  const fullText = `${header}\n${questions.join("\n\n")}`;
  const metadata = extractStandardPdfMetadata(fullText);
  assert.equal(metadata.programmingLanguage, "C");
  assert.equal(metadata.difficultyLevel, "Medium");
  assert.equal(metadata.totalQuestionsDeclared, 60);
  assert.equal(metadata.marksPerQuestion, 100);
  assert.equal(metadata.totalHiddenTestCasesDeclared, 120);

  const blocks = splitRawTextIntoQuestionBlocks(fullText, metadata);
  assert.equal(blocks.length, 60);
  assert.equal(blocks[0].sampleTestCases.length, 1);
  assert.equal(blocks[0].hiddenTestCases.length, 2);
  assert.ok(blocks[0].sampleTestCases[0].expectedOutput.includes("  *"));
  assert.equal(blocks[1].contentType, "matrix");

  const validation = validateStandardCodingPdf({ rawInput: fullText, blocks, metadata });
  assert.equal(validation.valid, true, `Expected valid, got errors: ${validation.errors.join("; ")}`);
  assert.equal(validation.summary.totalQuestions, 60);
  assert.equal(validation.summary.totalHiddenTestCases, 120);
});

test("2. Corrupted or non-PDF files are rejected with a clear error", async () => {
  const tmpFile = path.join(os.tmpdir(), `corrupt_${Date.now()}.pdf`);
  await fs.promises.writeFile(tmpFile, "NOT_A_PDF_FILE_CONTENT");
  try {
    await assert.rejects(() => extractTextFromPdf(tmpFile), /unreadable or corrupted/i);
  } finally {
    await fs.promises.unlink(tmpFile).catch(() => {});
  }
});

test("3. Missing hidden test cases, non-continuous numbering, duplicates, and unsupported language are rejected", () => {
  const badText = `Test Paper
Programming Language: COBOL
Total Number of Questions: 3

Q1. First Problem
Problem Description:
Compute the sum of two numbers accurately.
Sample Test Cases
Sample Test Case 1
Sample Input: 1 2
Sample Output: 3
Hidden Test Cases
Hidden Test Case 1
Hidden Input: 5 5
Hidden Output: 10

Q3. Skipped Q2 Problem
Problem Description:
Compute the product of two numbers accurately.
Sample Test Cases
Sample Test Case 1
Sample Input: 2 3
Sample Output: 6
`;

  const metadata = extractStandardPdfMetadata(badText);
  const blocks = splitRawTextIntoQuestionBlocks(badText, metadata);
  const validation = validateStandardCodingPdf({ rawInput: badText, blocks, metadata });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => /Unsupported programming language/i.test(e)));
  assert.ok(validation.errors.some((e) => /Question count mismatch/i.test(e)));
  assert.ok(validation.errors.some((e) => /Q3.*Missing Hidden Test Cases/i.test(e)));
  assert.ok(validation.errors.some((e) => /not continuous.*expected Q2.*found Q3/i.test(e)));
});
