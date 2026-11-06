import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rescan } from "../src/citations/incremental";
import { extract } from "../src/citations/extract";
import { scanRange, type Match } from "../src/citations/scan";
import { apply, createDocument } from "../src/document";
import {
  applyTextEdit,
  arbCitationTargetedOp,
  arbDocument,
  arbEdit,
  arbOpinionWithQuotes,
  arbTextWithCitations,
} from "../src/testing/arbitraries";
import type { CitationRecord, Document, Extraction } from "../src/types";
import { runs } from "./support/fc";

const never = (): boolean => false;
const scan = (text: string): readonly Match[] => scanRange(text, 0, never);

/** Property 25's texts: `arbTextWithCitations` or `arbOpinionWithQuotes`. */
const arbP25Text: fc.Arbitrary<string> = fc.oneof(
  arbTextWithCitations.map((t) => t.text),
  arbOpinionWithQuotes.map((t) => t.text),
);

/** A text and one `arbEdit` of it. */
const arbTextAndEdit = arbP25Text.chain((t) => arbEdit(t).map((e) => ({ t, e })));

/** An `arbDocument` and one op from `arbCitationTargetedOp` (`arbEdit`-based). */
const arbDocAndOp = arbDocument.chain((d) => arbCitationTargetedOp(d).map((op) => ({ d, op })));

/** A Document's citation and quote layer without keys and results. */
const layerOf = (doc: Document): Extraction => ({
  citations: doc.citations.map((r) => r.citation),
  quotes: doc.quotes.map((q) => q.quote),
});

describe("Property 25: Incremental re-extraction equals full extraction _Requirements: 15.1_", () => {
  // Property 25
  it("rescan equals a full scan, and apply's citation layer equals extract(newText)", () => {
    fc.assert(
      fc.property(arbTextAndEdit, arbDocAndOp, ({ t, e }, { d, op }) => {
        const { text: next, edit } = applyTextEdit(t, e);
        expect(rescan(scan(t), edit, next)).toEqual(scan(next));
        const r = apply(d, op);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(layerOf(r.value.document)).toEqual(extract(r.value.document.text));
      }),
      runs(),
    );
  });
});

/** One keyed or unkeyed item of a Document, as Property 27 sees it. */
type Item = Readonly<{
  quote: boolean;
  start: number;
  text: string;
  kind: CitationRecord["kind"] | "quote";
  key: string | null;
}>;

/** Every citation and quote of `doc`, sorted test-locally in issue order. */
const itemsOf = (doc: Document): readonly Item[] =>
  [
    ...doc.citations.map((r): Item => ({
      quote: false,
      start: r.citation.start,
      text: r.citation.text,
      kind: r.kind,
      key: r.kind === "other" ? null : r.key,
    })),
    ...doc.quotes.map((q): Item => ({
      quote: true,
      start: q.quote.start,
      text: q.quote.text,
      kind: "quote",
      key: q.key,
    })),
  ].sort((a, b) => a.start - b.start || Number(a.quote) - Number(b.quote));

/** The counter value `n` of a key `k<n>`, or null for any other string. */
const keyNumber = (key: string): number | null => {
  const m = /^k(0|[1-9][0-9]*)$/.exec(key);
  return m === null ? null : Number(m[1]);
};

/** Keys of `doc` are well formed, pairwise distinct, and below its counter. */
const expectKeysBelowCounter = (doc: Document): readonly string[] => {
  const keys = itemsOf(doc).flatMap((i) => (i.key === null ? [] : [i.key]));
  expect(new Set(keys).size).toBe(keys.length);
  for (const k of keys) {
    const n = keyNumber(k);
    expect(n).not.toBeNull();
    expect(n).toBeLessThan(doc.keyCounter);
  }
  return keys;
};

describe("Property 27: Issue_Keys are fresh, unique, and assigned in document order _Requirements: 15.5, 15.7_", () => {
  // Property 27
  it("fresh keys are k<counter>… in issue order, never reused; carried keys stay on their item", () => {
    fc.assert(
      fc.property(arbDocAndOp, ({ d, op }) => {
        const r = apply(d, op);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const next = r.value.document;
        const before = new Map(
          itemsOf(d).flatMap((i) => (i.key === null ? [] : [[i.key, i] as const])),
        );
        expectKeysBelowCounter(d);
        expectKeysBelowCounter(next);
        expect(next.keyCounter).toBeGreaterThanOrEqual(d.keyCounter);
        const items = itemsOf(next);
        for (const i of items) expect(i.key === null).toBe(i.kind === "other");
        const fresh = items.flatMap((i) => (i.key !== null && !before.has(i.key) ? [i.key] : []));
        const expected = Array.from(
          { length: next.keyCounter - d.keyCounter },
          (_, n) => `k${String(d.keyCounter + n)}`,
        );
        expect(fresh).toEqual(expected);
        for (const i of items) {
          const prev = i.key === null ? undefined : before.get(i.key);
          if (prev !== undefined) expect([prev.kind, prev.text]).toEqual([i.kind, i.text]);
        }
      }),
      runs(),
    );
  });

  // Shrunk by hand from a Property 27 failure (seed 2112810442, path
  // "42:4209:0:3:1:2:2:2:2:2:2:2:2:2:2:2"), when Replace re-anchored after
  // its delete step and again after its insert step and so issued k1 to no
  // item. A Replace now re-anchors once over its combined edit (design A4,
  // D6), so the touched citation gets the one fresh key k1 and the counter 2.
  it("a Replace touching a citation issues exactly the keys its items keep", () => {
    const ts = "2026-01-01T00:00:00Z";
    const d = createDocument("See 410 U.S. 113.", ts);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const provenance = { origin: "HUM", timestamp: ts } as const;
    const r = apply(d.value, { kind: "replace", from: 4, to: 5, text: "4", provenance });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = r.value.document;
    const keys = next.citations.map((c) => (c.kind === "other" ? null : c.key));
    expect({ keys, keyCounter: next.keyCounter }).toEqual({ keys: ["k1"], keyCounter: 2 });
  });
});
