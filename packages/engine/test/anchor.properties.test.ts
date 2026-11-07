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
import { structuralEqual } from "../src/equal";
import type {
  CallerOperation,
  CitationRecord,
  Document,
  Extraction,
  Override,
  QuoteRecord,
} from "../src/types";
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

/** A keyed citation or quote of a Document, as Property 26 sees it. */
type Keyed = Readonly<{
  key: string;
  start: number;
  end: number;
  text: string;
  result: unknown;
  quote: boolean;
}>;

/** The Req 15.3 Edit of a caller Operation, spelled out independently of `reanchor`. */
const editOfOp = (op: CallerOperation): { from: number; oldTo: number; newTo: number } => {
  if (op.kind === "insert") return { from: op.at, oldTo: op.at, newTo: op.at + op.text.length };
  if (op.kind === "delete") return { from: op.from, oldTo: op.to, newTo: op.from };
  return { from: op.from, oldTo: op.to, newTo: op.from + op.text.length };
};

/** Req 15.3: the image of `[start, end)` under `edit`, or null when touched. */
const imageOf = (
  start: number,
  end: number,
  edit: { from: number; oldTo: number; newTo: number },
): { start: number; end: number } | null => {
  const { from, oldTo, newTo } = edit;
  const untouched = from === oldTo ? from <= start || from >= end : oldTo <= start || from >= end;
  if (!untouched) return null;
  const delta = start >= oldTo ? newTo - oldTo : 0;
  return { start: start + delta, end: end + delta };
};

/** Every keyed item of `doc` (citations and quotes), indexed by key. */
const keyedByKey = (doc: Document): ReadonlyMap<string, Keyed> => {
  const out = new Map<string, Keyed>();
  for (const r of doc.citations) {
    if (r.kind === "other") continue;
    const { start, end, text } = r.citation;
    out.set(r.key, {
      key: r.key,
      start,
      end,
      text,
      result: r.kind === "full" ? r.result : undefined,
      quote: false,
    });
  }
  for (const q of doc.quotes) {
    const { start, end, text } = q.quote;
    out.set(q.key, { key: q.key, start, end, text, result: q.result, quote: true });
  }
  return out;
};

const citationAt = (doc: Document, start: number): CitationRecord | undefined =>
  doc.citations.find((r) => r.citation.start === start);

const overrideOf = (doc: Document, key: string): Override | undefined =>
  doc.overrides.find((o) => o.key === key);

type Edit26 = { from: number; oldTo: number; newTo: number };

/** The previous citation `r` and the new citation `n` agree, with link targets read through keys. */
const citationSurvives = (
  d: Document,
  next: Document,
  r: CitationRecord,
  n: CitationRecord,
): boolean => {
  const [a, b] = [r.citation, n.citation];
  if (a.end - a.start !== b.end - b.start || a.text !== b.text) return false;
  if (r.kind === "full") {
    return n.kind === "full" && structuralEqual(a.value, b.value) && a.normalised === b.normalised;
  }
  if (r.kind !== "short" || n.kind !== "short") return false;
  if (a.value.kind !== "short" || b.value.kind !== "short") return false;
  const [{ targetStart: ta, ...restA }, { targetStart: tb, ...restB }] = [a.value, b.value];
  if (!structuralEqual(restA, restB)) return false;
  if (ta === null || tb === null) return ta === tb;
  const oldTarget = citationAt(d, ta);
  const newTarget = citationAt(next, tb);
  return (
    oldTarget !== undefined &&
    newTarget !== undefined &&
    oldTarget.kind !== "other" &&
    newTarget.kind !== "other" &&
    oldTarget.key === newTarget.key
  );
};

/** Whether the previous quote `q` is expected to carry over to the new quote `n` (Req 15.6, 15.7). */
const quoteSurvives = (d: Document, next: Document, q: QuoteRecord, n: QuoteRecord): boolean => {
  if (q.quote.text !== n.quote.text || q.quote.rule !== n.quote.rule) return false;
  if (q.quote.end - q.quote.start !== n.quote.end - n.quote.start) return false;
  const was = citationAt(d, q.quote.citationStart);
  const now = citationAt(next, n.quote.citationStart);
  return (
    was !== undefined &&
    now !== undefined &&
    was.kind !== "other" &&
    now.kind !== "other" &&
    was.key === now.key
  );
};

/** A carried item keeps key, result, and Override at the mapped Offsets. */
const expectCarried = (d: Document, next: Document, was: Keyed, now: Keyed | undefined): void => {
  expect(now).toBeDefined();
  if (now === undefined) return;
  expect(now.key).toBe(was.key);
  expect(now.result).toEqual(was.result);
  expect(overrideOf(next, was.key)).toEqual(overrideOf(d, was.key));
};

/** Every previous item untouched under Req 15.3 and still extracted the same way carries over. */
const expectUntouchedCarry = (d: Document, next: Document, edit: Edit26): void => {
  const nextItems = keyedByKey(next);
  for (const r of d.citations) {
    if (r.kind === "other") continue;
    const m = imageOf(r.citation.start, r.citation.end, edit);
    const n = m === null ? undefined : citationAt(next, m.start);
    if (m === null || n === undefined || n.citation.end !== m.end) continue;
    if (!citationSurvives(d, next, r, n) || n.kind === "other") continue;
    expectCarried(d, next, keyedByKey(d).get(r.key) as Keyed, nextItems.get(n.key));
    expect(n.citation.start).toBe(m.start);
  }
  for (const q of d.quotes) {
    const m = imageOf(q.quote.start, q.quote.end, edit);
    const n = m === null ? undefined : next.quotes.find((x) => x.quote.start === m.start);
    if (m === null || n === undefined || n.quote.end !== m.end) continue;
    if (!quoteSurvives(d, next, q, n)) continue;
    expectCarried(d, next, keyedByKey(d).get(q.key) as Keyed, nextItems.get(n.key));
  }
};

/** A key present in both Documents is a carry-over: untouched, shifted, same text. Anything else is fresh. */
const expectResetOrFresh = (d: Document, next: Document, edit: Edit26): void => {
  const before = keyedByKey(d);
  for (const now of keyedByKey(next).values()) {
    const was = before.get(now.key);
    if (was === undefined) {
      expect(keyNumber(now.key)).toBeGreaterThanOrEqual(d.keyCounter);
      expect(overrideOf(next, now.key)).toBeUndefined();
      if (now.quote) expect(now.result).toEqual({ status: "unchecked" });
      else if (now.result !== undefined) expect(now.result).toMatchObject({ status: "unchecked" });
      continue;
    }
    const m = imageOf(was.start, was.end, edit);
    expect(m).not.toBeNull();
    expect([now.quote, now.start, now.end, now.text]).toEqual([
      was.quote,
      m?.start,
      m?.end,
      was.text,
    ]);
  }
  for (const o of next.overrides) expect(before.has(o.key)).toBe(true);
};

describe("Property 26: Touched citations reset, untouched ones carry over with shifted offsets _Requirements: 15.2, 15.3, 15.4, 15.6, 15.7_", () => {
  // Property 26
  it("untouched items keep key, result, and Override at mapped Offsets; every other item is fresh and unchecked", () => {
    fc.assert(
      fc.property(arbDocAndOp, ({ d, op }) => {
        const r = apply(d, op);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const edit = editOfOp(op);
        if (edit.from === edit.oldTo && edit.oldTo === edit.newTo) {
          // Req 4.7: an empty edit over an empty range changes nothing.
          expect(r.value.document).toEqual(d);
          return;
        }
        expectUntouchedCarry(d, r.value.document, edit);
        expectResetOrFresh(d, r.value.document, edit);
      }),
      runs(),
    );
  });
});
