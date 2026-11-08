import { describe, expect, it } from "vitest";
import {
  formatViolations,
  readSources,
  textLiterals,
  violation,
  type SourceText,
  type Violation,
} from "../support/scan";

/** Requirements 10.10 (no emoji or icons) and 10.16 (no exclamation mark, "Oops", "Let's"). */
const PICTOGRAPH =
  /\p{Extended_Pictographic}|[\u2190-\u21FF\u2600-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FFFF}]/u;
/** The check marks used in code names such as `CIT ✘`. */
const EXEMPT = /[\u2713\u2718]/g;

function copyProblems(text: string): string[] {
  const problems: string[] = [];
  if (text.includes("!")) problems.push("exclamation mark");
  if (/\boops\b/i.test(text)) problems.push('"Oops"');
  if (/\blet['\u2019]s\b/i.test(text)) problems.push('"Let\'s"');
  if (PICTOGRAPH.test(text.replace(EXEMPT, ""))) problems.push("emoji or icon character");
  return problems;
}

function copyViolations(file: SourceText): Violation[] {
  return textLiterals(file).flatMap((literal) =>
    copyProblems(literal.text).map((problem) =>
      violation(file.path, literal.line, `copy contains ${problem}`),
    ),
  );
}

describe("static: copy rules _Requirements: 10.10, 10.16_", () => {
  it("has no exclamation mark, Oops, Let's, emoji or icon in strings, templates or JSX text", () => {
    expect(formatViolations(readSources(["src", "app"]).flatMap(copyViolations))).toEqual([]);
  });
});

function reported(path: string, text: string): string[] {
  return formatViolations(copyViolations({ path, text }));
}

describe("static: copy rules self-test (planted violations)", () => {
  it("reports an exclamation mark in a string, a template and JSX text, with path and line", () => {
    const text = [
      'const a = "Saved!";',
      "const b = `Done ${a}!`;",
      "export const C = () => <p>Welcome!</p>;",
      "",
    ].join("\n");
    expect(reported("src/components/c.tsx", text)).toEqual([
      "src/components/c.tsx:1 copy contains exclamation mark",
      "src/components/c.tsx:2 copy contains exclamation mark",
      "src/components/c.tsx:3 copy contains exclamation mark",
    ]);
  });

  it("reports Oops and Let's, in either apostrophe", () => {
    const text =
      'const a = "Oops, try again";\nconst b = "Let\u2019s go";\nconst c = "Let\'s go";\n';
    expect(reported("src/x.ts", text)).toEqual([
      'src/x.ts:1 copy contains "Oops"',
      'src/x.ts:2 copy contains "Let\'s"',
      'src/x.ts:3 copy contains "Let\'s"',
    ]);
  });

  it("reports emoji and icon characters but exempts the check mark and cross", () => {
    const text =
      'const a = "Done \u{1F389}";\nconst b = "CIT \u2718 and QUO \u2713";\nconst c = "Next \u2192";\n';
    expect(reported("src/x.ts", text)).toEqual([
      "src/x.ts:1 copy contains emoji or icon character",
      "src/x.ts:3 copy contains emoji or icon character",
    ]);
  });

  it("ignores comments, operators and module specifiers", () => {
    const text = '// Oops!\nimport { a } from "./not!allowed";\nexport const b = a !== 1 && !a;\n';
    expect(reported("src/x.ts", text)).toEqual([]);
  });
});
