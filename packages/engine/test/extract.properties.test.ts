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
import { arbBothCase, expectPrecedingWins } from "./support/both-rules";
import { COVERAGE_EXAMPLES, expectCovered, record, type Coverage } from "./support/coverage";
import { runs } from "./support/fc";
import { arbFollowCase, expectFollowAttachment } from "./support/follow-attach";
import { arbGapCase, expectGapAttachment } from "./support/gap-attach";
import { arbCandidate, expectGlueRejected } from "./support/glue";
import {
  arbExtractInput,
  expectExactSortedDisjoint,
  expectQuoteWellFormed,
} from "./support/offsets";
import { modelParty, windowAgrees } from "./support/party-model";
import {
  arbP50Input,
  expectModelParty,
  p50Before,
  p50Input,
  p50Text,
  partyForms,
} from "./support/party-model-case";
import { arbP49Input, expectPartyForms, isPartyRunRef } from "./support/party-run";
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

describe("extract following quotes _Requirements: 13.8, 13.9_", () => {
  // Property 46
  it("Property 46: following quotes attach to the citation before them in the same Sentence", () => {
    fc.assert(fc.property(arbFollowCase, expectFollowAttachment), runs());
  });
});

describe("extract both quote rules _Requirements: 13.5, 13.7_", () => {
  it("seed -1203167891: a `(D.)` court ends the Sentence, so the second quote attaches to nothing", () => {
    // Shrunk Property 47 counterexample from before `f1`/`f2` excluded terminator endings.
    // `1 A. 1` is [0, 6), `1 A. 1 (D.)` is [9, 20). `"a"` at 6–8 precedes the second
    // citation with an empty gap (13.1, 13.5). `(D.)` then a space ends the Sentence
    // (Req 8.3, 8.10), so `"a"` at 21–23 has no citation in its Sentence (13.8, 13.9).
    const t = '1 A. 1"a"1 A. 1 (D.) "a"';
    expect(extract(t).quotes).toEqual([
      { start: 7, end: 8, text: "a", citationStart: 9, rule: "preceding" },
    ]);
  });

  // Property 47
  it("Property 47: the preceding rule wins, and one citation can carry several quotes", () => {
    fc.assert(fc.property(arbBothCase, expectPrecedingWins), runs());
  });
});

describe("extract party Short_Forms _Requirements: 9.2, 12.2, 12.8_", () => {
  it("the test-local Party_Run checker follows the Glossary", () => {
    const ok = ["Roe v. Wade", "Acme, Inc. v. Smith, LLC", "Matter of Smith", "Inc.", "Id. Smith"];
    const okToo = ["United States ex rel. Smith", "Board of the City", "J. Smith", "N.A."];
    for (const p of [...ok, ...okToo]) expect({ p, ok: isPartyRunRef(p) }).toEqual({ p, ok: true });
    const bad = ["A v. B v. C", "Smith, Inc., LLC", "v. Wade", "of Smith", "Smith of", "F.3d"];
    const badToo = ["Smith, Jones", "Smith  Jones", "Smith, inc.", 'Smith "Jones"', "Roe v.Wade"];
    for (const p of [...bad, ...badToo])
      expect({ p, ok: isPartyRunRef(p) }).toEqual({ p, ok: false });
  });

  it("rare branches: `Id.` party (D16), suffix commas before the tail, 80 code units", () => {
    const full = "5 U.S. 1 (1801). ";
    const parties = (t: string): readonly string[] =>
      expectPartyForms(full + t).map((v) => v.party);
    expect(parties("Id. Smith, 5 U.S. at 9")).toEqual(["Id. Smith"]);
    expect(parties("Acme, Inc. v. Smith, LLC, 5 U.S. at 9")).toEqual(["Acme, Inc. v. Smith, LLC"]);
    expect(parties("foo, Inc., 5 U.S. at 9")).toEqual(["Inc."]);
    expect(parties("In the Matter of Smith, 5 U.S. at 9")).toEqual(["Matter of Smith"]);
    expect(parties("In v. Wade, 5 U.S. at 9")).toEqual([]);
    const p80 = `${"Abcdefghi ".repeat(6)}Abcdefghi, Inc. v. A`;
    expect(p80.length).toBe(80);
    expect(parties(`held ${p80}, 5 U.S. at 9`)).toEqual([p80]);
    expect(parties(`held ${p80}x, 5 U.S. at 9`)).toEqual([]);
  });

  // Property 49
  it("Property 49: party Short_Forms start with a Capitalised_Word and never with a stop-list entry", () => {
    fc.assert(
      fc.property(arbP49Input, (input) => {
        expectPartyForms(input.t);
      }),
      runs(),
    );
  });
});

describe("extract party reference model _Requirements: 9.2, 12.2_", () => {
  const F = { kind: "reporter", volume: 5, reporter: "U.S.", page: 1, year: 1801 } as const;
  const at = (l: string, x: string, r: string): ReturnType<typeof p50Input> =>
    p50Input(F, l, x, r, 9);
  const P76 = `${"Abcdefghi ".repeat(7)}Abcdef`;
  const R81 = `${"Abcdefghi ".repeat(8)}A`;

  it("rare branches: leading Connectors after a stop entry, `ex rel.`, `v.` left first", () => {
    const party = (l: string, x: string, r: string): string | null => {
      const m = expectModelParty(at(l, x, r));
      return m.kind === "party" ? m.party : null;
    };
    expect(party("", "In the ", "Matter of Smith")).toBe("Matter of Smith");
    expect(party("held ", "See In ", "United States ex rel. Smith")).toBe(
      "United States ex rel. Smith",
    );
    expect(party("(", "In ex rel. ", "Smith")).toBe("Smith");
    expect(party("", "Under the ", "Acme, Inc. v. Smith, LLC")).toBe("Acme, Inc. v. Smith, LLC");
    expect(modelParty(p50Before(at("", "In ", "v. Wade")))).toMatchObject({ kind: "not_run" });
    expect(party("", "In ", "v. Wade")).toBeNull();
  });

  it("window edges: 80 and 81 code units, and the D17 read window", () => {
    const p80 = `${"Abcdefghi ".repeat(6)}Abcdefghi, Inc. v. A`;
    expect(expectModelParty(at("held ", "", p80))).toMatchObject({ kind: "party", party: p80 });
    expect(expectModelParty(at("held ", "", `${p80}x`))).toMatchObject({ kind: "too_long" });
    expect(expectModelParty(at("extensively ", "", P76))).toMatchObject({ party: P76 });
    // An over-long run whose first start past 80 has its predecessor at the window edge.
    const edge = at("", "", `A${"b".repeat(78)} ${R81}`);
    expect(windowAgrees(p50Before(edge), expectModelParty(edge))).toBe(true);
    // One code unit further the model's guard refuses, though the engine still agrees.
    const out = at("", "", `A${"b".repeat(79)} ${R81}`);
    const m = modelParty(p50Before(out));
    expect([m.kind, windowAgrees(p50Before(out), m), partyForms(p50Text(out))]).toEqual([
      "too_long",
      false,
      [],
    ]);
    // D17: a 90-code-unit word starts outside the window, so the engine keeps the party.
    const d17 = at(`A${"b".repeat(89)} `, "", P76);
    const md17 = modelParty(p50Before(d17));
    expect([md17.kind, windowAgrees(p50Before(d17), md17)]).toEqual(["too_long", false]);
    const start = p50Text(d17).length - d17.tail.length - P76.length;
    expect(partyForms(p50Text(d17))).toEqual([[start, P76, 0]]);
  });

  // Property 50
  it("Property 50: the party is the longest Party_Run with stop-list entries and Connectors stripped", () => {
    fc.assert(
      fc.property(arbP50Input, (input) => {
        expectModelParty(input);
      }),
      runs(),
    );
  });
});
