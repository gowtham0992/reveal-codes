import { apply, createDocument } from "@reveal-codes/engine";
import type { Document, Origin } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { aiParagraphRanges, formatRanges } from "../src/ai-paragraphs.js";
import type { ParagraphRange } from "../src/ai-paragraphs.js";

// _Requirements: 4.11, 4.22, 9.12_

const T0 = "2026-01-01T00:00:00.000Z";

type Mark = Readonly<{ from: number; to: number; origin?: Origin; text?: string }>;

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error("fixture rejected");
  return r.value;
}

/** Pasted text, then each marked range re-inserted by the real engine as AI (default) text. */
function build(text: string, marks: readonly Mark[]): Document {
  let doc = must(createDocument(text, T0));
  for (const m of marks) {
    const origin = m.origin ?? "AI";
    doc = must(
      apply(doc, {
        kind: "replace",
        from: m.from,
        to: m.to,
        text: m.text ?? text.slice(m.from, m.to),
        provenance:
          origin === "AI" || origin === "AI>HUM"
            ? { origin, runId: "r1", timestamp: T0 }
            : { origin, timestamp: T0 },
      }),
    ).document;
  }
  return doc;
}

const r = (from: number, to: number): ParagraphRange => ({ from, to });

type Case = Readonly<{
  name: string;
  text: string;
  marks: readonly Mark[];
  expected: readonly ParagraphRange[];
}>;

const CASES: readonly Case[] = [
  { name: "no AI span", text: "alpha\nbeta", marks: [], expected: [] },
  {
    name: "one paragraph",
    text: "alpha\nbeta\ngamma",
    marks: [{ from: 6, to: 10 }],
    expected: [r(2, 2)],
  },
  {
    name: "a span over three paragraphs",
    text: "a\nb\nc\nd",
    marks: [{ from: 0, to: 5 }],
    expected: [r(1, 3)],
  },
  {
    name: "adjacent spans merge into one range",
    text: "one\ntwo\nthree\nfour",
    marks: [
      { from: 4, to: 7 },
      { from: 8, to: 13 },
    ],
    expected: [r(2, 3)],
  },
  {
    name: "spans with a gap stay separate",
    text: "one\ntwo\nthree\nfour",
    marks: [
      { from: 0, to: 3 },
      { from: 8, to: 13 },
    ],
    expected: [r(1, 1), r(3, 3)],
  },
  {
    name: "a span on a line break only",
    text: "ab\ncd",
    marks: [{ from: 2, to: 3 }],
    expected: [],
  },
  {
    name: "an empty paragraph inside a span is not marked",
    text: "a\n\nb",
    marks: [{ from: 0, to: 4 }],
    expected: [r(1, 1), r(3, 3)],
  },
  {
    name: "a span ending at the last character",
    text: "first\nsecond\nthird",
    marks: [{ from: 13, to: 18 }],
    expected: [r(3, 3)],
  },
  {
    name: "a span starting mid-paragraph reaches the next paragraph",
    text: "first\nsecond",
    marks: [{ from: 3, to: 8 }],
    expected: [r(1, 2)],
  },
  {
    name: "AI text edited by the author still counts",
    text: "first\nsecond",
    marks: [
      { from: 6, to: 12 },
      { from: 7, to: 9, origin: "HUM", text: "XX" },
    ],
    expected: [r(2, 2)],
  },
  {
    name: "HUM spans do not count",
    text: "first\nsecond",
    marks: [{ from: 6, to: 12, origin: "HUM" }],
    expected: [],
  },
];

describe("aiParagraphRanges _Requirements: 4.11, 4.22_", () => {
  it.each(CASES)("$name", ({ text, marks, expected }) => {
    expect(aiParagraphRanges(build(text, marks))).toEqual(expected);
  });
});

const FORMAT_CASES: readonly Readonly<{
  name: string;
  ranges: readonly ParagraphRange[];
  expected: string;
}>[] = [
  { name: "single index", ranges: [r(27, 27)], expected: "27" },
  { name: "run with an en dash", ranges: [r(12, 14)], expected: "12\u201314" },
  { name: "two consecutive indexes", ranges: [r(12, 13)], expected: "12\u201313" },
  {
    name: "mixed list",
    ranges: [r(3, 3), r(7, 8), r(20, 20)],
    expected: "3, 7\u20138, 20",
  },
  { name: "empty", ranges: [], expected: "" },
];

describe("formatRanges _Requirements: 4.11, 4.22, 9.12_", () => {
  it.each(FORMAT_CASES)("$name", ({ ranges, expected }) => {
    expect(formatRanges(ranges)).toBe(expected);
  });

  it("never writes the word lines", () => {
    for (const c of FORMAT_CASES) {
      expect(formatRanges(c.ranges).toLowerCase()).not.toContain("lines");
    }
    for (const c of CASES) {
      const text = formatRanges(aiParagraphRanges(build(c.text, c.marks)));
      expect(text.toLowerCase()).not.toContain("lines");
    }
  });
});
