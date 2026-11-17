import { describe, expect, it } from "vitest";
import { STATUS_WORDS } from "../../src/client/check-rows";
import { FAILED_NOTICE } from "../../src/client/verify-summary";
import { COURTLISTENER_LINK_TEXT } from "../../src/components/courtlistener-link";
import { DEMO_MODE_LINE } from "../../src/components/issues-region";
import { AVIANCA_FAILED } from "../../src/components/use-document-actions";
import { WAITING_TEXT } from "../../src/components/use-verify";
import { CHECKS_BUSY, DOCUMENT_TOO_LONG } from "../../src/notices";
import {
  formatViolations,
  importsOf,
  readSources,
  textLiterals,
  violation,
  type SourceText,
  type Violation,
} from "../support/scan";

/** Requirement 8.3: the Check_Page says what the editor says, by import and by text. */
const sources = readSources(["app/check", "src/check"]);

/** The owning module of each sentence, as the path the check sources must import, without extension. */
const OWNERS: Readonly<Record<string, readonly [string, string]>> = {
  CHECKS_BUSY: [CHECKS_BUSY, "src/notices"],
  FAILED_NOTICE: [FAILED_NOTICE, "src/client/verify-summary"],
  DOCUMENT_TOO_LONG: [DOCUMENT_TOO_LONG, "src/notices"],
  WAITING_TEXT: [WAITING_TEXT, "src/components/use-verify"],
  DEMO_MODE_LINE: [DEMO_MODE_LINE, "src/components/issues-region"],
  AVIANCA_FAILED: [AVIANCA_FAILED, "src/components/use-document-actions"],
  COURTLISTENER_LINK_TEXT: [COURTLISTENER_LINK_TEXT, "src/components/courtlistener-link"],
  STATUS_WORDS: ["", "src/client/check-rows"],
};

const SENTENCES: readonly (readonly [string, string])[] = [
  ...Object.entries(OWNERS)
    .filter(([name]) => name !== "STATUS_WORDS")
    .map(([name, [text]]) => [name, text] as const),
  ...Object.entries(STATUS_WORDS).map(([code, word]) => [`STATUS_WORDS[${code}]`, word] as const),
];

/**
 * A literal repeats a sentence when it contains it. A one-word status ("found", "match") is common
 * English inside prose, so it counts only when the whole literal is that word; the phrases count
 * when contained.
 */
function repeats(literal: string, text: string): boolean {
  if (text === "") return false;
  if (!/\s/.test(text) && text.length < 12 && !/[.]/.test(text)) {
    return literal.trim().toLowerCase() === text.toLowerCase();
  }
  return literal.includes(text);
}

function literalViolations(
  files: readonly SourceText[],
  sentences: readonly (readonly [string, string])[],
): Violation[] {
  return files.flatMap((file) =>
    textLiterals(file).flatMap((lit) =>
      sentences
        .filter(([, text]) => repeats(lit.text, text))
        .map(([name]) => violation(file.path, lit.line, `literal repeats ${name}`)),
    ),
  );
}

/** Module paths (repository `apps/web`-relative, no extension) the files import from `src/`. */
function importedModules(files: readonly SourceText[]): Set<string> {
  const found = new Set<string>();
  for (const file of files) {
    const dir = file.path.split("/").slice(0, -1);
    for (const ref of importsOf(file)) {
      if (!ref.spec.startsWith(".")) continue;
      const parts = [...dir];
      for (const part of ref.spec.split("/")) {
        if (part === "..") parts.pop();
        else if (part !== ".") parts.push(part);
      }
      found.add(parts.join("/"));
    }
  }
  return found;
}

describe("static: Check_Page words come from the editor _Requirements: 8.3, 16.1_", () => {
  it("scans the page and the check modules", () => {
    const paths = sources.map((s) => s.path);
    expect(paths).toContain("app/check/page.tsx");
    expect(paths).toContain("src/check/check-page.tsx");
  });

  it("has no literal that equals or contains an Editor_Sentence or a status word", () => {
    expect(SENTENCES.every(([, text]) => text.length > 0)).toBe(true);
    expect(formatViolations(literalViolations(sources, SENTENCES))).toEqual([]);
  });

  it("treats a one-word status as a whole-literal match and a phrase as a contained match", () => {
    expect(repeats("found", "found")).toBe(true);
    expect(repeats(" Found ", "found")).toBe(true);
    expect(repeats("No citations were found in this draft.", "found")).toBe(false);
    expect(repeats("This one is wrong case today", "wrong case")).toBe(true);
  });

  it("imports each owning module", () => {
    const imported = importedModules(sources);
    const missing = Object.entries(OWNERS)
      .filter(([, [, owner]]) => !imported.has(owner))
      .map(([name, [, owner]]) => `${name} is not imported from ${owner}`);
    expect(missing).toEqual([]);
  });

  it("reports a planted copy of a sentence and of a status word, with path and line", () => {
    const text = [
      `const a = "${WAITING_TEXT}";`,
      `const b = \`prefix ${CHECKS_BUSY} suffix\`;`,
      `const c = <p>${STATUS_WORDS["CIT ≠"]}</p>;`,
      "const d = 'fine';",
      "",
    ].join("\n");
    expect(
      formatViolations(literalViolations([{ path: "src/check/x.tsx", text }], SENTENCES)),
    ).toEqual([
      "src/check/x.tsx:1 literal repeats WAITING_TEXT",
      "src/check/x.tsx:2 literal repeats CHECKS_BUSY",
      "src/check/x.tsx:3 literal repeats STATUS_WORDS[CIT ≠]",
    ]);
  });

  it("reports an owning module that no source imports", () => {
    const only = importedModules([
      { path: "src/check/x.ts", text: 'import { A } from "../notices";\n' },
    ]);
    expect([...only]).toEqual(["src/notices"]);
    expect(only.has("src/client/check-rows")).toBe(false);
  });
});
