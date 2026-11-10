import { apply, createDocument } from "@reveal-codes/engine";
import type { Document, Origin } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { aiPassages } from "../src/ai-paragraphs.js";
import type { AiPassage } from "../src/ai-paragraphs.js";
import {
  howUsedSentence,
  plural,
  portionsSentence,
  promptRecordsSentence,
  prohibitionLine,
} from "../src/wording.js";

// _Requirements: 4.11, 4.12, 4.15, 4.21, 4.22, 4.25, 5.5, 9.12_

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

const p = (paragraph: number, words: string): AiPassage => ({ paragraph, words });

type Case = Readonly<{
  name: string;
  text: string;
  marks: readonly Mark[];
  expected: readonly AiPassage[];
}>;

const CASES: readonly Case[] = [
  { name: "no AI span", text: "alpha\nbeta", marks: [], expected: [] },
  {
    name: "one paragraph",
    text: "alpha\nbeta\ngamma",
    marks: [{ from: 6, to: 10 }],
    expected: [p(2, "beta")],
  },
  {
    name: "a span over three paragraphs is one passage with the first eight words",
    text: "a b c\nd e f\ng h i\nj",
    marks: [{ from: 0, to: 17 }],
    expected: [p(1, "a b c d e f g h")],
  },
  {
    name: "adjacent AI spans join",
    text: "one\ntwo\nthree\nfour",
    marks: [
      { from: 4, to: 8 },
      { from: 8, to: 13 },
    ],
    expected: [p(2, "two three")],
  },
  {
    name: "spans with a gap stay separate",
    text: "one\ntwo\nthree\nfour",
    marks: [
      { from: 0, to: 3 },
      { from: 8, to: 13 },
    ],
    expected: [p(1, "one"), p(3, "three")],
  },
  {
    name: "a span on a line break only is not a passage",
    text: "ab\ncd",
    marks: [{ from: 2, to: 3 }],
    expected: [],
  },
  {
    name: "blank paragraphs are not counted",
    text: "a\n\n\nb\n\nc",
    marks: [{ from: 7, to: 8 }],
    expected: [p(3, "c")],
  },
  {
    name: "a run starting on a line break is numbered by its first word",
    text: "first\nsecond",
    marks: [{ from: 5, to: 12 }],
    expected: [p(2, "second")],
  },
  {
    name: "AI text edited by the author still counts",
    text: "first\nsecond",
    marks: [
      { from: 6, to: 12 },
      { from: 7, to: 9, origin: "HUM", text: "XX" },
    ],
    expected: [p(2, "s"), p(2, "ond")],
  },
  {
    name: "HUM spans do not count",
    text: "first\nsecond",
    marks: [{ from: 6, to: 12, origin: "HUM" }],
    expected: [],
  },
];

describe("aiPassages _Requirements: 4.11, 4.21, 4.22_", () => {
  it.each(CASES)("$name", ({ text, marks, expected }) => {
    expect(aiPassages(build(text, marks))).toEqual(expected);
  });
});

const SIX: readonly AiPassage[] = [1, 2, 3, 4, 5, 6, 7].map((n) => p(n, `w${String(n)}`));

describe("plural _Requirements: 4.25_", () => {
  it.each([0, 1, 2, 3])("prompt, run, passage and remain over %i", (n) => {
    const one = n === 1;
    expect(plural(n, "prompt", "prompts")).toBe(one ? "prompt" : "prompts");
    expect(plural(n, "run", "runs")).toBe(one ? "run" : "runs");
    expect(plural(n, "passage", "passages")).toBe(one ? "passage" : "passages");
    expect(plural(n, "remains", "remain")).toBe(one ? "remains" : "remain");
    expect(promptRecordsSentence(n)).toContain(`(${String(n)} ${one ? "prompt" : "prompts"})`);
    expect(howUsedSentence(n)).toContain(`${String(n)} ${one ? "run" : "runs"};`);
  });
});

describe("portionsSentence _Requirements: 4.11, 4.22_", () => {
  const TAIL = " Paragraphs are counted from the first line of the caption, skipping blank lines.";

  it("names one passage", () => {
    expect(portionsSentence([p(27, "alpha beta")])).toBe(
      'The text drafted with the program appears in 1 passage of the filing: paragraph 27, beginning "alpha beta\u2026".' +
        TAIL,
    );
  });

  it("lists two passages in order", () => {
    expect(portionsSentence([p(3, "a"), p(7, "b")])).toBe(
      'The text drafted with the program appears in 2 passages of the filing: paragraph 3, beginning "a\u2026"; paragraph 7, beginning "b\u2026".' +
        TAIL,
    );
  });

  it("lists five and summarises the rest", () => {
    const five = portionsSentence(SIX.slice(0, 5));
    expect(five).toContain("in 5 passages");
    expect(five).toContain('paragraph 5, beginning "w5\u2026".');
    const seven = portionsSentence(SIX);
    expect(seven).toContain("in 7 passages");
    expect(seven).toContain(
      'paragraph 5, beginning "w5\u2026" and 2 more, each marked with an AI code in the Provenance Appendix.',
    );
    expect(seven).not.toContain("w6");
    expect(portionsSentence(SIX.slice(0, 6))).toContain(" and 1 more, each");
  });
});

describe("prohibitionLine _Requirements: 5.5, 9.12_", () => {
  const base = { judgeSurname: "Newman", instrument: "Order 1" };

  it("one passage remains", () => {
    expect(prohibitionLine({ ...base, passages: [p(2, "two")] })).toBe(
      'Judge Newman\'s order prohibits AI-drafted text. 1 AI-origin passage remains: paragraph 2, beginning "two\u2026".',
    );
  });

  it.each([2, 5, 6, 7])("%i passages remain, quoting the first", (n) => {
    expect(prohibitionLine({ ...base, judgeSurname: null, passages: SIX.slice(0, n) })).toBe(
      `Order 1 prohibits AI-drafted text. ${String(n)} AI-origin passages remain, the first at paragraph 1, beginning "w1\u2026".`,
    );
  });

  it("line breaks only", () => {
    expect(prohibitionLine({ ...base, passages: [] })).toBe(
      "Judge Newman's order prohibits AI-drafted text. AI-origin text remains, consisting of line breaks only.",
    );
  });
});

describe("no sentence writes the word lines _Requirements: 9.12_", () => {
  it("passes over every case and every wording function", () => {
    const texts = [
      ...CASES.filter((c) => c.expected.length > 0).map((c) =>
        portionsSentence(aiPassages(build(c.text, c.marks))),
      ),
      ...CASES.map((c) =>
        prohibitionLine({
          judgeSurname: null,
          instrument: "X",
          passages: aiPassages(build(c.text, c.marks)),
        }),
      ),
      portionsSentence(SIX),
      howUsedSentence(2),
      promptRecordsSentence(2),
    ];
    // The fixed counting note says "first line of the caption, skipping blank lines"; remove it.
    const note =
      /Paragraphs are counted from the first line of the caption, skipping blank lines\./;
    for (const t of texts) expect(t.replace(note, "").toLowerCase()).not.toMatch(/\blines\b/);
  });
});
