import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countBoundaries } from "../src/boundary";
import { extract } from "../src/citations/extract";
import {
  arbBoundaryText,
  arbLetterOrDigit,
  arbOffsetPair,
  arbText,
  arbTextWithCitations,
} from "../src/testing/arbitraries";
import { COVERAGE_EXAMPLES, expectCovered, record, type Coverage } from "./support/coverage";
import { runs } from "./support/fc";
import { arbGapCase, expectGapAttachment } from "./support/gap-attach";
import { arbCandidate, expectGlueRejected } from "./support/glue";
import {
  arbExtractInput,
  expectExactSortedDisjoint,
  expectQuoteWellFormed,
} from "./support/offsets";
import { modelQuotes } from "./support/quote-model";
import { arbNoisyText, shifted } from "./support/quote-noise";
import { sentenceIndex, sentencesOf } from "./support/sentence-index";

describe("extract offsets _Requirements: 9.2, 9.7, 9.9, 13.2, 13.7_", () => {
  // Property 17
  it("Property 17: extraction offsets are exact on any string", () => {
    fc.assert(
      fc.property(arbExtractInput, (text) => {
        const { citations, quotes } = extract(text);
        expectExactSortedDisjoint(text, citations);
        expectExactSortedDisjoint(text, quotes);
        for (const q of quotes) expectQuoteWellFormed(text, citations, q);
      }),
      runs(),
    );
  });
});

describe("extract on constructed text _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 12.1, 12.2, 12.3, 12.6, 12.7, 13.1, 13.5, 13.7, 13.8, 13.9_", () => {
  // Property 18
  it("Property 18: extraction finds exactly the constructed citations, links, and quotes", () => {
    const seen: Coverage = new Set();
    fc.assert(
      fc.property(arbTextWithCitations, (v) => {
        expect(extract(v.text)).toEqual(v.expected);
        record(seen, v);
      }),
      { numRuns: runs().numRuns + COVERAGE_EXAMPLES.length, examples: COVERAGE_EXAMPLES },
    );
    expectCovered(seen);
  });
});

describe("extract word boundaries _Requirements: 9.8_", () => {
  // Property 19
  it("Property 19: citations glued to letters or digits are not extracted", () => {
    fc.assert(fc.property(arbCandidate, arbLetterOrDigit, expectGlueRejected), runs());
  });
});

describe("extract quote reference model _Requirements: 13.1, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_", () => {
  it("the reference model reads the Req 13.10 and D21 examples as the design does", () => {
    /** `[quoted text, cited text, rule]` for each model quote. */
    const at = (t: string): readonly string[][] =>
      modelQuotes(t, extract(t).citations).map((q) => [
        q.text,
        t.slice(q.citationStart, q.citationStart + 4) + "@" + String(q.citationStart),
        q.rule,
      ]);
    const nested = '"He wrote “no” 410 U.S. 113 today." Roe v. Wade, 410 U.S. 113';
    expect(at(nested)).toEqual([
      [
        "He wrote “no” 410 U.S. 113 today.",
        `410 @${String(nested.lastIndexOf("410"))}`,
        "preceding",
      ],
    ]);
    expect(at('"a “b" 410 U.S. 113 c” 5 U.S. 1')).toEqual([["a “b", "410 @7", "preceding"]]);
    expect(at('Roe, 410 U.S. 113 ("a “b" c”) 5 U.S. 1')).toEqual([["a “b", "410 @5", "following"]]);
    expect(at('"q" See also See A, Inc. v. A & A, 410 U.S. 113')).toEqual([]);
    expect(at('"q" See also Roe v. Wade, 410 U.S. 113')).toEqual([["q", "410 @26", "preceding"]]);
    expect(at('"q," with Casey v. Smith, 5 U.S. 1')).toEqual([]);
    expect(at('"q" In Casey, 505 U.S. at 833')).toEqual([]);
  });

  it("Property 20 counterexample (seed -341920749): no `Id.` right after a closing `”` (Req 12.1)", () => {
    expect(extract("argued later. Id.").citations.map((c) => c.start)).toEqual([14]);
    expect(extract('"argued later. "”Id.').citations).toEqual([]);
    expect(extract('"argued later. "“Id.').citations.map((c) => c.start)).toEqual([17]);
  });

  // Property 20
  it("Property 20: quote pairing and attachment agree with a reference model", () => {
    fc.assert(
      fc.property(arbNoisyText, ({ base, text, shift }) => {
        const got = extract(text);
        expect(got.citations).toEqual(extract(base).citations.map((c) => shifted(c, shift)));
        expect(got.quotes).toEqual(modelQuotes(text, got.citations));
      }),
      runs(),
    );
  });
});

/** Citing text with abbreviations and initials spliced in, or plain prose, with an Offset pair. */
const arbBoundaryPair = fc
  .oneof(
    { arbitrary: arbBoundaryText.map((b) => b.text), weight: 3 },
    { arbitrary: arbText, weight: 1 },
  )
  .chain((t) => arbOffsetPair(t).map((pair) => ({ t, pair })));

describe("extract boundary counting _Requirements: 13.1, 13.8_", () => {
  // Property 44
  it("Property 44: boundary counting agrees with the Segmenter's Sentences", () => {
    fc.assert(
      fc.property(arbBoundaryPair, fc.integer({ min: 1, max: 3 }), ({ t, pair }, cap) => {
        if (pair === null) return;
        const [x, y] = pair;
        const cits = extract(t).citations;
        const sentences = sentencesOf(t);
        const want = sentenceIndex(sentences, y) - sentenceIndex(sentences, x);
        expect(countBoundaries(t, x, y, cits, Infinity)).toBe(want);
        expect(countBoundaries(t, x, y, cits, cap)).toBe(Math.min(want, cap));
      }),
      runs(),
    );
  });
});

describe("extract preceding gaps _Requirements: 13.1, 13.9_", () => {
  // Property 45
  it("Property 45: Case_Name and Gap_Signal gaps attach; `In`, `with`, two-signal, over-long do not", () => {
    fc.assert(fc.property(arbGapCase, expectGapAttachment), runs());
  });
});
