import * as fc from "fast-check";
import type { Declaration, Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { arbDeclaration, arbMixedOriginDocument } from "../../engine/src/testing/arb-declaration";
import { buildStatement, renderStatement } from "../src/index.js";
import type { OrderEntry } from "../src/index.js";
import { arbOrderChoice, runs } from "./support/arbitraries.js";

type Subject = "pasted_text" | "this_filing";

const META = { now: new Date("2026-11-20T18:25:00.000Z"), verifiedAt: null } as const;

const OLD_SENTENCE = "No generative artificial intelligence was used in preparing this filing.";
const NO_PROGRAM_AUTHOR = /states that no program was used/i;
const NO_AI_PATTERN =
  /\bno (generative (artificial intelligence( program)?|AI)|program) was used\b/i;

const REMOVED_PROGRAM_RECORD =
  "The record shows that no generative artificial intelligence program was used in the editor.";

/** The one fixed Record_Sentence that may say no AI was used, written out here. */
const RECORD_SENTENCES: readonly string[] = [
  "The record shows that every character was typed in the editor and that the editor's assistant was not used.",
];

const phrase = (s: Subject): string => (s === "pasted_text" ? "the pasted text" : "this filing");
const noneSentence = (s: Subject): string =>
  `The author states that no generative AI was used to prepare ${phrase(s)}.`;

/** A Declaration of Pending (null), None or Declared_AI, for either subject. */
const arbStored: fc.Arbitrary<Declaration | null> = fc.oneof(
  fc.constant(null),
  arbDeclaration(),
  arbDeclaration("pasted_text"),
  arbDeclaration("this_filing"),
);

/** Oracle: what the Declaration is about, computed from spans and text only. */
function oracleSubject(doc: Document, entry: OrderEntry | null): Subject | "none" {
  const pasted = doc.spans.some(
    (s) => s.provenance.origin === "PST" && /\S/u.test(doc.text.slice(s.start, s.end)),
  );
  if (pasted) return "pasted_text";
  const hasAi = doc.spans.some(
    (s) => s.provenance.origin === "AI" || s.provenance.origin === "AI>HUM",
  );
  const demands =
    entry !== null &&
    (entry.kind === "certification_every_filing" ||
      entry.elements.includes("negative_certification_when_unused"));
  return !hasAi && demands ? "this_filing" : "none";
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function statementText(blocks: ReturnType<typeof renderStatement>): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "title" || b.kind === "paragraph") parts.push(b.text);
  }
  return parts.join("\n");
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=\.)\s+/u).filter((s) => s.length > 0);
}

type Input = { doc: Document; entry: OrderEntry | null; stored: Declaration | null; conf: boolean };

function build(i: Input) {
  const ctx = i.entry === null ? null : { entry: i.entry, confidentialityCertified: i.conf };
  return buildStatement(i.doc, [], META, ctx, i.stored);
}

function checkText(i: Input, text: string, subject: Subject | "none"): void {
  expect(text).not.toContain(OLD_SENTENCE);
  expect(text).not.toContain(REMOVED_PROGRAM_RECORD);
  expect(text).not.toMatch(NO_PROGRAM_AUTHOR);
  const applicable = i.stored !== null && i.stored.subject === subject ? i.stored : null;
  const noneApplies = applicable !== null && applicable.choice === "none" && subject !== "none";
  for (const s of sentencesOf(text)) {
    if (!NO_AI_PATTERN.test(s)) continue;
    const allowed = RECORD_SENTENCES.includes(s) || (noneApplies && s === noneSentence(subject));
    expect(allowed, `unexpected no-AI sentence: ${s}`).toBe(true);
  }
  for (const s of ["pasted_text", "this_filing"] as const) {
    const expected = noneApplies && subject === s ? 1 : 0;
    expect(countOf(text, noneSentence(s))).toBe(expected);
  }
  if (subject === "none") expect(text).not.toContain("The author states that");
  if (applicable !== null && applicable.choice === "declared_ai") {
    expect(text).toContain(applicable.toolName);
  }
}

describe("Statement text and the Declaration _Requirements: 1.3, 1.4, 1.5, 1.6, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 7.18, 11.2_", () => {
  // Property 1
  it("P1 the Statement asserts no AI-free claim the author did not make", () => {
    fc.assert(
      fc.property(
        arbMixedOriginDocument,
        arbOrderChoice,
        arbStored,
        fc.boolean(),
        (doc, entry, stored, conf) => {
          const input = { doc, entry, stored, conf };
          const subject = oracleSubject(doc, entry);
          const applicable = stored !== null && subject !== "none" && stored.subject === subject;
          const result = build(input);
          if (subject !== "none" && !applicable) {
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.error).toEqual({ kind: "declaration_required", subject });
            return;
          }
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const text = statementText(renderStatement(result.value));
          checkText(input, text, subject);
          const again = build(input);
          expect(again.ok).toBe(true);
          if (again.ok) expect(statementText(renderStatement(again.value))).toBe(text);
        },
      ),
      { numRuns: runs() },
    );
  });
});
