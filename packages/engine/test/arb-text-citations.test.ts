import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CONNECTORS } from "../src/citations/party";
import { exactIndex } from "../src/citations/reporters";
import { GAP_SIGNALS } from "../src/citations/signals";
import { extract } from "../src/citations/extract";
import {
  arbCitingString,
  arbFollowGap,
  arbGapPunct,
  arbOffsetPair,
  arbOpinionWithQuotes,
  arbProseWords,
  arbQuoteContent,
  arbQuoteNoise,
  arbTextWithCitations,
  caseNameBoundaries,
  MAX_OPINION,
  MAX_TEXT_WITH_CITATIONS,
  PROSE_WORDS,
  type GroupRecord,
  type TextWithCitations,
} from "../src/testing/arbitraries";
import { runs } from "./support/fc";

const TAGS = [
  "same",
  "next",
  "caseName",
  "gapSignal",
  "gapSignalCase",
  "paren",
  "followParen",
  "followColon",
  "both",
  "several",
  "twoBoundaries",
  "in",
  "with",
  "twoSignals",
  "longParty",
  "followSignal",
  "lonely",
];

const sample = (): readonly TextWithCitations[] =>
  fc.sample(arbTextWithCitations, { numRuns: 1000, seed: 520 });

const groupsOf = (values: readonly TextWithCitations[]): readonly GroupRecord[] =>
  values.flatMap((v) => v.groups);

describe("arbTextWithCitations _Requirements: 22.1, 22.4_", () => {
  it("the constructed Extraction equals extract(text)", () => {
    fc.assert(
      fc.property(arbTextWithCitations, ({ text, expected }) => {
        expect(text.length).toBeLessThanOrEqual(MAX_TEXT_WITH_CITATIONS);
        expect(extract(text)).toEqual(expected);
      }),
      runs(),
    );
  });

  it("recorded offsets slice to the recorded strings", () => {
    fc.assert(
      fc.property(arbTextWithCitations, ({ text, expected }) => {
        for (const item of [...expected.citations, ...expected.quotes]) {
          expect(text.slice(item.start, item.end)).toBe(item.text);
        }
      }),
      runs(),
    );
  });

  it("every quote tag occurs, attached and unattached as built", () => {
    const groups = groupsOf(sample());
    expect(new Set(groups.map((g) => g.tag))).toEqual(new Set(TAGS));
    for (const tag of ["same", "next", "caseName", "gapSignal", "gapSignalCase", "paren"]) {
      expect(groups.some((g) => g.tag === tag && g.attached === 1)).toBe(true);
    }
    for (const tag of ["twoBoundaries", "in", "with", "twoSignals", "longParty", "lonely"]) {
      expect(groups.filter((g) => g.tag === tag).every((g) => g.attached === 0)).toBe(true);
    }
  });

  it("every GAP_SIGNALS entry occurs before a Full_Citation, a party, and a Case_Name", () => {
    const groups = groupsOf(sample());
    const seen = (tag: string, cite: string): Set<string> =>
      new Set(groups.filter((g) => g.tag === tag && g.cite === cite).flatMap((g) => g.signals));
    expect(seen("gapSignal", "full")).toEqual(new Set(GAP_SIGNALS));
    expect(seen("gapSignal", "party")).toEqual(new Set(GAP_SIGNALS));
    expect(seen("gapSignalCase", "full")).toEqual(new Set(GAP_SIGNALS));
    expect(seen("paren", "full")).toEqual(new Set(GAP_SIGNALS.filter((s) => /^[a-z]/.test(s))));
  });

  it("covers every citation kind, Orphans, Id. after an Other_Reference, and Near_Misses", () => {
    const values = sample();
    const cits = values.flatMap((v) => v.expected.citations);
    const kinds = new Set(
      cits.map((c) => (c.value.kind === "short" ? c.value.form : c.value.kind)),
    );
    expect(kinds).toEqual(new Set(["reporter", "parallel", "database", "id", "party", "other"]));
    const short = cits.flatMap((c) => (c.value.kind === "short" ? [c.value] : []));
    expect(short.some((v) => v.form === "party" && v.targetStart === null)).toBe(true);
    expect(short.some((v) => v.form === "party" && v.targetStart !== null)).toBe(true);
    expect(short.some((v) => v.form === "party" && v.party.includes(" v. "))).toBe(true);
    expect(cits.some((c) => c.normalised !== undefined)).toBe(true);
    const idAfterOther = values.some((v) =>
      v.expected.citations.some(
        (c, i) => c.value.kind === "short" && v.expected.citations[i - 1]?.value.kind === "other",
      ),
    );
    expect(idAfterOther).toBe(true);
  });

  // Shrunk counterexample of the test above. Req 13.1 says a
  // gap containing two Gap_Signals attaches nothing, but the gap matcher takes
  // S = `See` and the Case_Name `also See A, Inc. v. A & A,` (D19 rejects
  // only a leading `with` or lowercase Gap_Signal, and `also` is neither).
  it("two Gap_Signals `See also See` before a Case_Name attach nothing (Req 13.1)", () => {
    const text = 'held "a" See also See A, Inc. v. A & A, 1 A. 1 held';
    expect(extract(text).quotes).toEqual([]);
  });

  it("Cf. is neither a reporter nor a Legal_Abbreviation the boundary counts could miss", () => {
    expect(exactIndex.has("Cf.")).toBe(false);
    expect(caseNameBoundaries("J. v. Smith,")).toBe(1);
    expect(caseNameBoundaries("John J. Smith v. K. L. Doe J.,")).toBe(0);
    expect(caseNameBoundaries("Smith J. et al. v. Doe J. 12,")).toBe(2);
  });
});

describe("quote-test part arbitraries _Requirements: 22.1, 22.4_", () => {
  it("arbGapPunct, arbFollowGap, and arbQuoteContent stay in their alphabets", () => {
    fc.assert(
      fc.property(arbGapPunct, arbFollowGap, arbQuoteContent, (p, g, q) => {
        expect(p).toMatch(/^[ \n,;:().]{0,6}$/);
        expect(p.split(".").length).toBeLessThanOrEqual(2);
        expect(g).toMatch(/^[ ,;:(]{0,4}$/);
        expect(q).toMatch(/^[a-z][a-z, ]*\.?$/);
        expect(q.length).toBeLessThanOrEqual(200);
      }),
      runs(),
    );
  });

  it("prose holds no with, Gap_Signal word, Connector, or at", () => {
    const banned = new Set([
      "with",
      "at",
      ...GAP_SIGNALS.flatMap((s) => s.split(/[ ,]+/)),
      ...CONNECTORS.flat(),
    ]);
    expect(PROSE_WORDS.filter((w) => banned.has(w))).toEqual([]);
    fc.assert(
      fc.property(arbProseWords, (w) => {
        expect(w.split(" ").every((x) => PROSE_WORDS.includes(x))).toBe(true);
      }),
      runs(),
    );
  });

  it("arbOffsetPair gives 0 <= x < y < length", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }).chain((t) => arbOffsetPair(t).map((p) => [t, p] as const)),
        ([t, p]) => {
          if (t.length < 2) {
            expect(p).toBeNull();
            return;
          }
          expect(p).not.toBeNull();
          const [x, y] = p ?? [0, 0];
          expect(0 <= x && x < y && y < t.length).toBe(true);
        },
      ),
      runs(),
    );
  });

  it("arbCitingString's citationStart is the start of its last extracted citation", () => {
    fc.assert(
      fc.property(arbCitingString, ({ text, citationStart }) => {
        expect(extract(text).citations.at(-1)?.start).toBe(citationStart);
      }),
      runs(),
    );
  });

  it("arbQuoteNoise pieces start and end with quotation marks", () => {
    fc.assert(
      fc.property(arbQuoteNoise, (pieces) => {
        for (const n of pieces) {
          expect(n).toMatch(/^["“”][\s\S]*$/);
          expect(n).toMatch(/["“”]$/);
        }
      }),
      runs(),
    );
  });

  it("arbOpinionWithQuotes offsets slice to the quotations", () => {
    fc.assert(
      fc.property(arbOpinionWithQuotes, ({ text, quotations }) => {
        expect(text.length).toBeLessThanOrEqual(MAX_OPINION);
        expect(quotations.length).toBeGreaterThanOrEqual(1);
        expect(quotations.length).toBeLessThanOrEqual(10);
        for (const q of quotations) expect(text.slice(q.start, q.end)).toBe(q.text);
      }),
      { numRuns: 50 },
    );
  });
});
