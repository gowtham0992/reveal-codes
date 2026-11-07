import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENTITY_SUFFIX_WORDS } from "../src/abbreviations";
import { extract } from "../src/citations/extract";
import { rescan } from "../src/citations/incremental";
import { PARTY_STOP_LIST } from "../src/citations/party";
import { LOOKBEHIND, scanRange, type Match } from "../src/citations/scan";
import {
  applyTextEdit,
  arbEdit,
  type EditTarget,
  type EditTargetKind,
  type TextEdit,
} from "../src/testing/arb-edit";
import { apply } from "../src/document";
import { arbDocument } from "../src/testing/arb-document";
import { arbCitationTargetedOp } from "../src/testing/arb-ops";
import { arbOpinionWithQuotes } from "../src/testing/arb-opinion";
import { arbTextWithCitations } from "../src/testing/arb-text-citations";
import { runs } from "./support/fc";

const never = (): boolean => false;
const scan = (text: string): readonly Match[] => scanRange(text, 0, never);

const arbSource: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: arbTextWithCitations.map((t) => t.text), weight: 3 },
  arbOpinionWithQuotes.map((o) => o.text),
);

const arbCase = arbSource.chain((t) => arbEdit(t).map((e) => ({ t, e })));

const STOPS: ReadonlySet<string> = new Set(PARTY_STOP_LIST.map((e) => e.join(" ")));
const SUFFIXES: ReadonlySet<string> = new Set(ENTITY_SUFFIX_WORDS.map((w) => `, ${w}`));
const QUOTE = /["\u201c\u201d]/;

/** Checks a target against `t` without using `arb-edit.ts` code. */
function isGenuine(t: string, x: EditTarget): boolean {
  const s = t.slice(x.start, x.end);
  const cits = extract(t).citations;
  switch (x.kind) {
    case "citation":
      return cits.some((c) => c.start === x.start && c.end === x.end);
    case "party":
      return cits.some(
        (c) => c.start === x.start && c.value.kind === "short" && c.text.startsWith(s + ","),
      );
    case "stop":
      return STOPS.has(s);
    case "suffix":
      return SUFFIXES.has(s);
    case "versus":
      return s === " v. ";
    case "gap":
      return !QUOTE.test(s) && cits.some((c) => c.start === x.end || c.end === x.start);
    case "before":
      return x.end - x.start <= LOOKBEHIND + 1;
  }
}

describe("arbEdit aims at every Edit_Target kind _Requirements: 22.1, 22.4_", () => {
  it("a seeded sample hits each kind, inside or up to LOOKBEHIND + 1 before the genuine target", () => {
    const hits = new Map<EditTargetKind, number>();
    const samples = fc.sample(arbCase, { numRuns: 600, seed: 42 });
    for (const { t, e } of samples) {
      expect(0 <= e.from && e.from <= e.oldTo && e.oldTo <= t.length).toBe(true);
      const x = e.target;
      if (x === null) continue;
      expect(isGenuine(t, x)).toBe(true);
      expect(x.start - LOOKBEHIND - 1 <= e.from && e.from <= x.end).toBe(true);
      hits.set(x.kind, (hits.get(x.kind) ?? 0) + 1);
    }
    const kinds: EditTargetKind[] = [
      "citation",
      "party",
      "stop",
      "before",
      "suffix",
      "versus",
      "gap",
    ];
    for (const k of kinds) expect(hits.get(k) ?? 0, k).toBeGreaterThanOrEqual(5);
  });

  it("before-targets reach exactly LOOKBEHIND − 1 to LOOKBEHIND + 1 code units back", () => {
    const back = new Set<number>();
    for (const { e } of fc.sample(arbCase, { numRuns: 1500, seed: 7 })) {
      if (e.target?.kind === "before") back.add(e.target.end - e.from);
    }
    for (const d of [LOOKBEHIND - 1, LOOKBEHIND, LOOKBEHIND + 1])
      expect(back.has(d), String(d)).toBe(true);
  });

  it("inserted text includes stop-list prefixes, Gap_Signals, suffixes, ` v. `, and Party_Run splitters", () => {
    const texts = fc.sample(arbCase, { numRuns: 600, seed: 3 }).map(({ e }) => e.text);
    for (const piece of ["In ", "See", ", Inc.", " v. ", "v. ", ", ", "; ", "of "]) {
      expect(
        texts.some((s) => s.includes(piece)),
        piece,
      ).toBe(true);
    }
  });
});

describe("arbDocument and arbCitationTargetedOp reach the citation layer _Requirements: 22.1, 22.4_", () => {
  it("a seeded arbDocument sample has Documents with citations, Short_Forms, and quotes", () => {
    const docs = fc.sample(arbDocument, { numRuns: 200, seed: 11 });
    expect(docs.filter((d) => d.citations.length > 0).length).toBeGreaterThanOrEqual(40);
    const short = docs.some((d) => d.citations.some((c) => c.citation.value.kind === "short"));
    expect(short).toBe(true);
    expect(docs.some((d) => d.quotes.length > 0)).toBe(true);
  });

  it("every arbCitationTargetedOp applies, and some touch a citation or quote range", () => {
    const arb = arbDocument.chain((d) => arbCitationTargetedOp(d).map((op) => ({ d, op })));
    let touched = 0;
    for (const { d, op } of fc.sample(arb, { numRuns: 300, seed: 13 })) {
      expect(apply(d, op).ok).toBe(true);
      const [lo, hi] = op.kind === "insert" ? [op.at, op.at] : [op.from, op.to];
      const ranges = [...d.citations.map((c) => c.citation), ...d.quotes.map((q) => q.quote)];
      if (ranges.some((r) => lo <= r.end && r.start <= hi)) touched += 1;
    }
    // Measured rate is about 17% (41 to 64 of 300 across seeds), so 60 only passed by seed luck.
    expect(touched).toBeGreaterThanOrEqual(30);
  });
});

describe("arbEdit drives rescan to a full scan _Requirements: 15.1, 22.4_", () => {
  it("rescan(scan(t), edit, t′) equals scanRange(t′)", () => {
    fc.assert(
      fc.property(arbCase, ({ t, e }: { t: string; e: TextEdit }) => {
        const next = applyTextEdit(t, e);
        expect(rescan(scan(t), next.edit, next.text)).toEqual(scan(next.text));
      }),
      runs(),
    );
  });
});
