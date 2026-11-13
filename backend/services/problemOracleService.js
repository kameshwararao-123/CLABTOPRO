/**
 * Deterministic Problem Oracle & Custom Output Analyzer
 *
 * Predicts expected outputs for arbitrary custom inputs on CLABTOPRO C problems
 * by matching the problem specification against deterministic C-lab evaluators AND
 * verifying 100% agreement against all visible (sample) test cases before trusting
 * any prediction. Also analyzes mismatches between expected and actual stdout.
 */

const normalizeText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
};

const parseNumbers = (input) => {
  const matches = String(input ?? "").match(/[-+]?(?:\d*\.\d+|\d+)/g);
  return matches ? matches.map(Number).filter(Number.isFinite) : [];
};

const parseInts = (input) => parseNumbers(input).map((n) => Math.trunc(n));

const isPrimeNumber = (n) => {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
};

const isArmstrongNumber = (n) => {
  if (!Number.isInteger(n) || n < 0) return false;
  const digits = String(n).split("").map(Number);
  const power = digits.length;
  const sum = digits.reduce((acc, d) => acc + d ** power, 0);
  return sum === n;
};

const isPerfectNumber = (n) => {
  if (!Number.isInteger(n) || n <= 1) return false;
  let sum = 1;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) {
      sum += i;
      if (i * i !== n) sum += n / i;
    }
  }
  return sum === n;
};

const gcd = (a, b) => {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

const factorial = (n) => {
  if (!Number.isInteger(n) || n < 0 || n > 20) return null;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
};

const fibonacciTerm = (n) => {
  if (!Number.isInteger(n) || n < 0 || n > 70) return null;
  if (n === 0) return 0;
  if (n === 1) return 1;
  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
    const next = a + b;
    a = b;
    b = next;
  }
  return b;
};

const reverseDigits = (n) => {
  const sign = n < 0 ? -1 : 1;
  const rev = Number(String(Math.abs(Math.trunc(n))).split("").reverse().join(""));
  return sign * rev;
};

/**
 * Formats a numeric value using the same decimal precision as a reference string when present,
 * and adapts optional prefix/suffix template extracted from the problem's sample output.
 */
const adaptNumericFormatter = (rawSampleVal, sampleExpected) => {
  if (rawSampleVal === null || rawSampleVal === undefined || Number.isNaN(rawSampleVal)) {
    return null;
  }
  const expected = normalizeText(sampleExpected);
  const floatMatch = expected.match(/[-+]?\d+(?:\.(\d+))?/);
  const decimals = floatMatch && floatMatch[1] ? floatMatch[1].length : null;

  const formattedSample =
    decimals !== null && !Number.isInteger(rawSampleVal)
      ? Number(rawSampleVal).toFixed(decimals)
      : decimals !== null
      ? Number(rawSampleVal).toFixed(decimals)
      : String(rawSampleVal);

  if (expected === formattedSample) {
    return (v) =>
      decimals !== null ? Number(v).toFixed(decimals) : String(v);
  }

  const idx = expected.lastIndexOf(formattedSample);
  if (idx !== -1) {
    const prefix = expected.slice(0, idx);
    const suffix = expected.slice(idx + formattedSample.length);
    return (v) => {
      const rendered = decimals !== null ? Number(v).toFixed(decimals) : String(v);
      return `${prefix}${rendered}${suffix}`;
    };
  }

  return null;
};

const OPPOSITE_LABEL_PAIRS = [
  ["Yes", "No"],
  ["YES", "NO"],
  ["yes", "no"],
  ["True", "False"],
  ["TRUE", "FALSE"],
  ["Even", "Odd"],
  ["EVEN", "ODD"],
  ["even", "odd"],
  ["Even Number", "Odd Number"],
  ["Prime", "Not Prime"],
  ["Prime Number", "Not Prime Number"],
  ["Prime Number", "Not a Prime Number"],
  ["Prime", "Not a Prime Number"],
  ["PRIME", "NOT PRIME"],
  ["Leap Year", "Not Leap Year"],
  ["Leap Year", "Not a Leap Year"],
  ["Leap year", "Not a leap year"],
  ["Palindrome", "Not Palindrome"],
  ["Palindrome", "Not a Palindrome"],
  ["Palindrome Number", "Not a Palindrome Number"],
  ["Palindrome Number", "Not Palindrome Number"],
  ["Armstrong", "Not Armstrong"],
  ["Armstrong Number", "Not Armstrong Number"],
  ["Armstrong Number", "Not an Armstrong Number"],
  ["Perfect", "Not Perfect"],
  ["Perfect Number", "Not Perfect Number"],
  ["Perfect Number", "Not a Perfect Number"],
  ["Vowel", "Consonant"],
  ["VOWEL", "CONSONANT"],
  ["Found", "Not Found"],
  ["Pass", "Fail"],
  ["PASS", "FAIL"],
  ["Eligible", "Not Eligible"],
  ["Divisible", "Not Divisible"],
  ["Positive", "Negative"],
];

/**
 * Resolves true/false labels from visible sample examples, with safe canonical opposites
 * only when the observed sample label matches a standard binary pair.
 */
const resolveBooleanLabels = (predicate, visibleCases) => {
  let trueLabel = null;
  let falseLabel = null;

  for (const tc of visibleCases) {
    const verdict = predicate(tc.input);
    if (verdict === null || verdict === undefined) return null;
    const label = normalizeText(tc.expectedOutput);
    if (!label) return null;
    if (verdict === true) {
      if (trueLabel && trueLabel !== label) return null;
      trueLabel = label;
    } else {
      if (falseLabel && falseLabel !== label) return null;
      falseLabel = label;
    }
  }

  if (trueLabel && !falseLabel) {
    const pair = OPPOSITE_LABEL_PAIRS.find(([pos]) => pos.toLowerCase() === trueLabel.toLowerCase());
    if (pair) falseLabel = pair[1];
  } else if (!trueLabel && falseLabel) {
    const pair = OPPOSITE_LABEL_PAIRS.find(([, neg]) => neg.toLowerCase() === falseLabel.toLowerCase());
    if (pair) trueLabel = pair[0];
  }

  if (!trueLabel || !falseLabel) return null;
  return (val) => (val ? trueLabel : falseLabel);
};

/**
 * Deterministic C-lab problem solver catalog.
 * Each entry specifies keyword relevance + either numeric/string `solve` or boolean `predicate`.
 */
const PROBLEM_SPECS = [
  {
    id: "square_number",
    name: "Square of a Number",
    keywords: /\bsquare\b(?!\s*root)/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 1 ? Number((nums[0] * nums[0]).toFixed(10)) : null;
    },
    explain: (input, out) => {
      const n = parseNumbers(input)[0];
      return `Computed square: ${n} * ${n} = ${out}.`;
    },
  },
  {
    id: "cube_number",
    name: "Cube of a Number",
    keywords: /\bcube\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 1 ? Number((nums[0] * nums[0] * nums[0]).toFixed(10)) : null;
    },
    explain: (input, out) => {
      const n = parseNumbers(input)[0];
      return `Computed cube: ${n} * ${n} * ${n} = ${out}.`;
    },
  },
  {
    id: "square_root",
    name: "Square Root of a Number",
    keywords: /\bsquare\s*root\b|\bsqrt\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 1 && nums[0] >= 0 ? Math.sqrt(nums[0]) : null;
    },
    explain: (input, out) => `Computed sqrt(${parseNumbers(input)[0]}) = ${out}.`,
  },
  {
    id: "absolute_value",
    name: "Absolute Value",
    keywords: /\babsolute\s*value\b|\babs\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 1 ? Math.abs(nums[0]) : null;
    },
    explain: (input, out) => `Absolute value of ${parseNumbers(input)[0]} is ${out}.`,
  },
  {
    id: "sum_two",
    name: "Sum of Two Numbers",
    keywords: /\b(sum|add|addition|plus)\b.*\b(two|2)\b|\b(two|2)\b.*\b(sum|add|addition)\b|\bsum of integers\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 2 ? Number((nums[0] + nums[1]).toFixed(10)) : null;
    },
    explain: (input, out) => {
      const nums = parseNumbers(input);
      return `Added inputs ${nums[0]} + ${nums[1]} = ${out}.`;
    },
  },
  {
    id: "difference_two",
    name: "Difference of Two Numbers",
    keywords: /\b(difference|subtract|subtraction)\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 2 ? Number((nums[0] - nums[1]).toFixed(10)) : null;
    },
    explain: (input, out) => {
      const nums = parseNumbers(input);
      return `Computed ${nums[0]} - ${nums[1]} = ${out}.`;
    },
  },
  {
    id: "product_two",
    name: "Product of Two Numbers",
    keywords: /\b(product|multiply|multiplication)\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 2 ? Number((nums[0] * nums[1]).toFixed(10)) : null;
    },
    explain: (input, out) => {
      const nums = parseNumbers(input);
      return `Multiplied ${nums[0]} * ${nums[1]} = ${out}.`;
    },
  },
  {
    id: "rectangle_area",
    name: "Area of Rectangle",
    keywords: /\barea\b.*\brectangle\b|\brectangle\b.*\barea\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 2 ? Number((nums[0] * nums[1]).toFixed(10)) : null;
    },
    explain: (input, out) => {
      const nums = parseNumbers(input);
      return `Rectangle area = length (${nums[0]}) * width (${nums[1]}) = ${out}.`;
    },
  },
  {
    id: "rectangle_perimeter",
    name: "Perimeter of Rectangle",
    keywords: /\bperimeter\b.*\brectangle\b|\brectangle\b.*\bperimeter\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 2 ? Number((2 * (nums[0] + nums[1])).toFixed(10)) : null;
    },
    explain: (input, out) => {
      const nums = parseNumbers(input);
      return `Perimeter = 2 * (${nums[0]} + ${nums[1]}) = ${out}.`;
    },
  },
  {
    id: "circle_area",
    name: "Area of Circle",
    keywords: /\barea\b.*\bcircle\b|\bcircle\b.*\barea\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 1 ? Math.PI * nums[0] * nums[0] : null;
    },
    explain: (input, out) => `Circle area = pi * r^2 = ${out}.`,
  },
  {
    id: "simple_interest",
    name: "Simple Interest",
    keywords: /\bsimple interest\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 3 ? (nums[0] * nums[1] * nums[2]) / 100 : null;
    },
    explain: (input, out) => {
      const nums = parseNumbers(input);
      return `Simple Interest = (${nums[0]} * ${nums[1]} * ${nums[2]}) / 100 = ${out}.`;
    },
  },
  {
    id: "celsius_to_fahrenheit",
    name: "Celsius to Fahrenheit",
    keywords: /\bcelsius\b.*\bfahrenheit\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 1 ? (nums[0] * 9) / 5 + 32 : null;
    },
    explain: (input, out) => `Converted Celsius to Fahrenheit: (${parseNumbers(input)[0]} * 9/5) + 32 = ${out}.`,
  },
  {
    id: "even_odd",
    name: "Even or Odd",
    keywords: /\beven\b.*\bodd\b|\bodd\b.*\beven\b/i,
    predicate: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? ints[0] % 2 === 0 : null;
    },
    explain: (input, out) => {
      const n = parseInts(input)[0];
      return `${n} % 2 === ${Math.abs(n % 2)}, so expected output is "${out}".`;
    },
  },
  {
    id: "leap_year",
    name: "Leap Year Check",
    keywords: /\bleap\s*year\b/i,
    predicate: (input) => {
      const ints = parseInts(input);
      if (ints.length < 1) return null;
      const y = ints[0];
      return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    },
    explain: (input, out) => {
      const y = parseInts(input)[0];
      return `Checked leap year divisibility rules for ${y} -> "${out}".`;
    },
  },
  {
    id: "prime_check",
    name: "Prime Number Check",
    keywords: /\bprime\b/i,
    predicate: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? isPrimeNumber(ints[0]) : null;
    },
    explain: (input, out) => {
      const n = parseInts(input)[0];
      return `Tested primality of ${n} -> "${out}".`;
    },
  },
  {
    id: "palindrome_number",
    name: "Palindrome Number Check",
    keywords: /\bpalindrome\b/i,
    predicate: (input) => {
      const ints = parseInts(input);
      if (ints.length >= 1 && /^\s*-?\d+\s*$/.test(String(input))) {
        return ints[0] >= 0 && ints[0] === reverseDigits(ints[0]);
      }
      const s = normalizeText(input).trim();
      return s ? s === s.split("").reverse().join("") : null;
    },
    explain: (input, out) => `Checked palindrome symmetry for "${normalizeText(input).trim()}" -> "${out}".`,
  },
  {
    id: "armstrong_number",
    name: "Armstrong Number Check",
    keywords: /\barmstrong\b/i,
    predicate: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? isArmstrongNumber(ints[0]) : null;
    },
    explain: (input, out) => `Checked sum of digits raised to digit count for ${parseInts(input)[0]} -> "${out}".`,
  },
  {
    id: "perfect_number",
    name: "Perfect Number Check",
    keywords: /\bperfect\s*number\b/i,
    predicate: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? isPerfectNumber(ints[0]) : null;
    },
    explain: (input, out) => `Checked proper divisor sum for ${parseInts(input)[0]} -> "${out}".`,
  },
  {
    id: "max_numbers",
    name: "Maximum / Largest Number",
    keywords: /\b(largest|maximum|max|biggest|greatest)\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      if (nums.length === 0) return null;
      // Handle array style: first number is N followed by N elements
      if (nums.length >= 3 && Number.isInteger(nums[0]) && nums[0] === nums.length - 1) {
        return Math.max(...nums.slice(1));
      }
      return Math.max(...nums);
    },
    explain: (_input, out) => `Maximum value among the given inputs is ${out}.`,
  },
  {
    id: "min_numbers",
    name: "Minimum / Smallest Number",
    keywords: /\b(smallest|minimum|min)\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      if (nums.length === 0) return null;
      if (nums.length >= 3 && Number.isInteger(nums[0]) && nums[0] === nums.length - 1) {
        return Math.min(...nums.slice(1));
      }
      return Math.min(...nums);
    },
    explain: (_input, out) => `Minimum value among the given inputs is ${out}.`,
  },
  {
    id: "factorial",
    name: "Factorial of a Number",
    keywords: /\bfactorial\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? factorial(ints[0]) : null;
    },
    explain: (input, out) => `Computed ${parseInts(input)[0]}! = ${out}.`,
  },
  {
    id: "vote_eligibility",
    name: "Voting Eligibility",
    keywords: /\bvot(e|ing)\b|\beligible\b/i,
    predicate: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? ints[0] >= 18 : null;
    },
    explain: (input, out) => `Checked age ${parseInts(input)[0]} >= 18 -> "${out}".`,
  },
  {
    id: "positive_negative_zero",
    name: "Positive, Negative or Zero",
    keywords: /\bpositive\b.*\bnegative\b|\bnegative\b.*\bpositive\b/i,
    solveString: (input) => {
      const nums = parseNumbers(input);
      if (nums.length < 1) return null;
      return nums[0] > 0 ? "Positive" : nums[0] < 0 ? "Negative" : "Zero";
    },
    explain: (input, out) => `Checked sign of ${parseNumbers(input)[0]} -> "${out}".`,
  },
  {
    id: "sum_natural",
    name: "Sum of First N Natural Numbers",
    keywords: /\bsum\b.*\b(first\s+n|natural\s+numbers|1\s+to\s+n)\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      if (ints.length < 1 || ints[0] < 0) return null;
      return (ints[0] * (ints[0] + 1)) / 2;
    },
    explain: (input, out) => {
      const n = parseInts(input)[0];
      return `Sum from 1 to ${n} = ${n} * (${n} + 1) / 2 = ${out}.`;
    },
  },
  {
    id: "sum_digits",
    name: "Sum of Digits",
    keywords: /\bsum\b.*\bdigits\b|\bdigit\s*sum\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      if (ints.length < 1) return null;
      return String(Math.abs(ints[0]))
        .split("")
        .reduce((acc, ch) => acc + Number(ch), 0);
    },
    explain: (input, out) => `Summed individual digits of ${parseInts(input)[0]} = ${out}.`,
  },
  {
    id: "count_digits",
    name: "Count Digits",
    keywords: /\bcount\b.*\bdigits\b|\bnumber of digits\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      if (ints.length < 1) return null;
      return String(Math.abs(ints[0])).length;
    },
    explain: (input, out) => `Counted digits in ${parseInts(input)[0]} = ${out}.`,
  },
  {
    id: "reverse_number",
    name: "Reverse a Number",
    keywords: /\breverse\b.*\b(number|integer|digits)\b|\breversed\s*number\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? reverseDigits(ints[0]) : null;
    },
    explain: (input, out) => `Reversed digits of ${parseInts(input)[0]} = ${out}.`,
  },
  {
    id: "fibonacci_nth",
    name: "Fibonacci Nth Term",
    keywords: /\bfibonacci\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      return ints.length >= 1 ? fibonacciTerm(ints[0]) : null;
    },
    explain: (input, out) => `Fibonacci term F(${parseInts(input)[0]}) = ${out}.`,
  },
  {
    id: "gcd_two",
    name: "GCD / HCF of Two Numbers",
    keywords: /\b(gcd|hcf|greatest common divisor)\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      return ints.length >= 2 ? gcd(ints[0], ints[1]) : null;
    },
    explain: (input, out) => {
      const ints = parseInts(input);
      return `GCD(${ints[0]}, ${ints[1]}) = ${out}.`;
    },
  },
  {
    id: "lcm_two",
    name: "LCM of Two Numbers",
    keywords: /\blcm\b|\bleast common multiple\b/i,
    solve: (input) => {
      const ints = parseInts(input);
      if (ints.length < 2) return null;
      const g = gcd(ints[0], ints[1]);
      return g === 0 ? 0 : Math.abs((ints[0] * ints[1]) / g);
    },
    explain: (input, out) => {
      const ints = parseInts(input);
      return `LCM(${ints[0]}, ${ints[1]}) = ${out}.`;
    },
  },
  {
    id: "power_ab",
    name: "Power of a Number",
    keywords: /\bpower\b|\bexponent\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      return nums.length >= 2 ? nums[0] ** nums[1] : null;
    },
    explain: (input, out) => {
      const nums = parseNumbers(input);
      return `Computed ${nums[0]} ^ ${nums[1]} = ${out}.`;
    },
  },
  {
    id: "array_sum",
    name: "Sum of Array Elements",
    keywords: /\bsum\b.*\barray\b|\barray\b.*\bsum\b|\bsum of elements\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      if (nums.length === 0) return null;
      const elements =
        nums.length >= 2 && Number.isInteger(nums[0]) && nums[0] === nums.length - 1
          ? nums.slice(1)
          : nums;
      return elements.reduce((acc, v) => acc + v, 0);
    },
    explain: (_input, out) => `Summed the array elements = ${out}.`,
  },
  {
    id: "array_average",
    name: "Average of Numbers",
    keywords: /\baverage\b|\bmean\b/i,
    solve: (input) => {
      const nums = parseNumbers(input);
      if (nums.length === 0) return null;
      const elements =
        nums.length >= 2 && Number.isInteger(nums[0]) && nums[0] === nums.length - 1
          ? nums.slice(1)
          : nums;
      if (elements.length === 0) return null;
      return elements.reduce((acc, v) => acc + v, 0) / elements.length;
    },
    explain: (_input, out) => `Computed arithmetic mean of the input numbers = ${out}.`,
  },
  {
    id: "string_length",
    name: "Length of String",
    keywords: /\blength\b.*\bstring\b|\bstring\b.*\blength\b|\bstrlen\b/i,
    solve: (input) => normalizeText(input).replace(/\n$/, "").length,
    explain: (input, out) => `Length of input string is ${out} characters.`,
  },
  {
    id: "string_reverse",
    name: "Reverse a String",
    keywords: /\breverse\b.*\bstring\b|\bstring\b.*\breverse\b/i,
    solveString: (input) => normalizeText(input).replace(/\n$/, "").split("").reverse().join(""),
    explain: (_input, out) => `Reversed string characters -> "${out}".`,
  },
];

/**
 * Predicts expected output for `customInput` deterministically if a solver in the catalog
 * matches the problem specification AND passes 100% of all visible sample test cases.
 *
 * @param {Object} params
 * @param {Object} params.problem
 * @param {string} params.customInput
 * @param {Array<{input: string, expectedOutput: string}>} [params.visibleCases]
 * @returns {{ expectedOutput: string, explanation: string, ruleName: string } | null}
 */
export const predictCustomOutputFromSpec = ({
  problem,
  customInput = "",
  visibleCases = [],
}) => {
  if (!problem) {
    return null;
  }

  // Combine visible sample cases with server-side problem testCases ONLY for internal
  // formula verification & label learning (never returned or exposed to students).
  const internalVerificationCases = [...visibleCases];
  if (Array.isArray(problem.testCases)) {
    for (const tc of problem.testCases) {
      if (
        tc &&
        typeof tc.expectedOutput === "string" &&
        tc.expectedOutput.trim().length > 0 &&
        !internalVerificationCases.some(
          (v) =>
            normalizeText(v.input || "") === normalizeText(tc.input || "") &&
            normalizeText(v.expectedOutput || "") === normalizeText(tc.expectedOutput || "")
        )
      ) {
        internalVerificationCases.push(tc);
      }
    }
  }

  if (internalVerificationCases.length === 0) {
    return null;
  }

  const problemText = `${problem.title || ""}\n${problem.description || ""}\n${problem.outputFormat || ""}`;
  const validVisibleCases = internalVerificationCases.filter(
    (tc) => typeof tc.expectedOutput === "string" && tc.expectedOutput.trim().length > 0
  );
  if (validVisibleCases.length === 0) return null;

  for (const spec of PROBLEM_SPECS) {
    if (!spec.keywords.test(problemText)) continue;

    if (spec.predicate) {
      const formatter = resolveBooleanLabels(spec.predicate, validVisibleCases);
      if (!formatter) continue;

      const allMatch = validVisibleCases.every(
        (tc) => formatter(spec.predicate(tc.input)) === normalizeText(tc.expectedOutput)
      );
      if (!allMatch) continue;

      const customBool = spec.predicate(customInput);
      if (customBool === null || customBool === undefined) continue;
      const expectedOutput = formatter(customBool);
      return {
        expectedOutput,
        explanation: spec.explain ? spec.explain(customInput, expectedOutput) : "",
        ruleName: spec.name,
      };
    }

    if (spec.solveString) {
      const allMatch = validVisibleCases.every(
        (tc) => normalizeText(spec.solveString(tc.input)) === normalizeText(tc.expectedOutput)
      );
      if (!allMatch) continue;

      const expectedOutput = spec.solveString(customInput);
      if (expectedOutput === null || expectedOutput === undefined) continue;
      return {
        expectedOutput,
        explanation: spec.explain ? spec.explain(customInput, expectedOutput) : "",
        ruleName: spec.name,
      };
    }

    if (spec.solve) {
      const firstSampleVal = spec.solve(validVisibleCases[0].input);
      const formatter = adaptNumericFormatter(firstSampleVal, validVisibleCases[0].expectedOutput);
      if (!formatter) continue;

      const allMatch = validVisibleCases.every((tc) => {
        const val = spec.solve(tc.input);
        if (val === null || val === undefined) return false;
        return normalizeText(formatter(val)) === normalizeText(tc.expectedOutput);
      });
      if (!allMatch) continue;

      const customVal = spec.solve(customInput);
      if (customVal === null || customVal === undefined) continue;
      const expectedOutput = formatter(customVal);
      return {
        expectedOutput,
        explanation: spec.explain ? spec.explain(customInput, expectedOutput) : "",
        ruleName: spec.name,
      };
    }
  }

  return null;
};

/**
 * Analyzes the student's actual stdout against expected output (when available) or
 * provides diagnostic insights for custom execution runs.
 */
export const analyzeCustomRunOutput = ({
  customInput = "",
  expectedOutput = null,
  actualOutput = "",
  matched = null,
  stderr = "",
  baseExplanation = "",
}) => {
  const normActual = normalizeText(actualOutput);
  const normExpected = expectedOutput !== null && expectedOutput !== undefined ? normalizeText(expectedOutput) : null;

  if (normExpected === null) {
    if (!normActual) {
      return "Your program finished with exit code 0 but printed no stdout output. Check that printf is reached and your input matches scanf format.";
    }
    if (stderr && stderr.trim()) {
      return `Program produced output with stderr notices: ${stderr.trim().slice(0, 140)}`;
    }
    return `Program produced output "${normActual}" for custom input "${normalizeText(customInput) || "<empty>"}". Enter an Expected Output above if you want to verify a custom assertion for this problem.`;
  }

  if (matched) {
    const rawDiffers = String(actualOutput) !== String(expectedOutput);
    const prefix = baseExplanation ? `${baseExplanation} ` : "";
    return rawDiffers
      ? `${prefix}Your output matches the expected answer after standard whitespace/newline normalization.`
      : `${prefix}Your output matches the expected answer exactly.`;
  }

  // Mismatch diagnostics
  const reasons = [];
  if (baseExplanation) {
    reasons.push(baseExplanation);
  }

  if (!normActual) {
    reasons.push("Your program printed empty output. Check scanf input parsing and ensure printf executes on all paths.");
  } else if (normActual.toLowerCase() === normExpected.toLowerCase()) {
    reasons.push(`Letter casing differs: your output "${normActual}" should match exact casing "${normExpected}".`);
  } else {
    const actualNums = parseNumbers(normActual);
    const expectedNums = parseNumbers(normExpected);
    if (expectedNums.length === 1 && actualNums.length === 1) {
      const diff = actualNums[0] - expectedNums[0];
      if (actualNums[0] === -expectedNums[0] && expectedNums[0] !== 0) {
        reasons.push(`Sign mismatch: got ${actualNums[0]} instead of ${expectedNums[0]}.`);
      } else if (Math.abs(diff) === 1) {
        reasons.push(`Off-by-one error: your value (${actualNums[0]}) is off by 1 from expected (${expectedNums[0]}).`);
      } else if (normActual !== String(actualNums[0]) && String(expectedNums[0]) === normExpected) {
        reasons.push(`Extra text detected around the number. Print only "${normExpected}" without prompt/label text.`);
      } else {
        reasons.push(`Numeric mismatch: expected ${expectedNums[0]}, but your code printed ${actualNums[0]}.`);
      }
    } else {
      const expectedLines = normExpected.split("\n");
      const actualLines = normActual.split("\n");
      if (expectedLines.length !== actualLines.length) {
        reasons.push(`Line count mismatch: expected ${expectedLines.length} line(s), got ${actualLines.length} line(s).`);
      } else {
        reasons.push(`Output content mismatch: expected "${normExpected}", got "${normActual}".`);
      }
    }
  }

  return reasons.join(" ");
};
