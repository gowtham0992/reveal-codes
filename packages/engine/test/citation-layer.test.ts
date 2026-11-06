import { describe, expect, it } from "vitest";
import { matchesOf } from "../src/citation-layer";
import { extract } from "../src/citations/extract";
import { scanRange } from "../src/citations/scan";
import { apply, createDocument } from "../src/document";
import type { Result } from "../src/result";
import type { CitationRecord, Document, Operation } from "../src/types";

const TS = "2026-11-03T10:00:00Z";
const TEXT =
  'Plain words here. Roe v. Wade, 410 U.S. 113, 116 (1973), held "the right of privacy is broad." Id. at 153. See 42 U.S.C. § 1983.';
const FULL_START = 31;
const QUOTE_START = 63;

function unwrap<T>(r: Result<T, unknown>): T {
  if (!r.ok) throw new Error(`unexpected error: ${JSON.stringify(r.error)}`);
  return r.value;
}

const created = (text = TEXT): Document => unwrap(createDocument(text, TS));

const run = (doc: Document, op: Operation): Document => unwrap(apply(doc, op)).document;

const hum = { origin: "HUM", timestamp: TS } as const;

/** The created Document with its Full_Citation recorded as verified. */
function verifiedDoc(): Document {
  const doc = created();
  const citations = doc.citations.map((r): CitationRecord =>
    r.kind === "full" ? { ...r, result: { status: "verified", clusterId: "108713" } } : r,
  );
  return { ...doc, citations };
}

/** Keys in issue order: citations then quotes, by start. */
function keysOf(doc: Document): readonly string[] {
  const items = [
    ...doc.citations.flatMap((r) => (r.kind === "other" ? [] : [[r.citation.start, r.key]])),
    ...doc.quotes.map((q) => [q.quote.start, q.key]),
  ] as [number, string][];
  return items.sort((a, b) => a[0] - b[0]).map(([, k]) => k);
}

/** The extracted citations and quotes of `doc`, without keys or results. */
function layerOf(doc: Document): unknown {
  return {
    citations: doc.citations.map((r) => r.citation),
    quotes: doc.quotes.map((q) => q.quote),
  };
}

describe("citation layer at creation  _Requirements: 2.3_", () => {
  it("extracts every citation and quote, unchecked, keyed k0… in issue order", () => {
    const doc = created();
    expect(layerOf(doc)).toEqual(extract(TEXT));
    expect(doc.citations.map((r) => r.kind)).toEqual(["full", "short", "other"]);
    expect(keysOf(doc)).toEqual(["k0", "k1", "k2"]);
    expect(doc.keyCounter).toBe(3);
    expect(doc.overrides).toEqual([]);
    const full = doc.citations[0];
    expect(full?.kind === "full" && full.result).toEqual({ status: "unchecked" });
    expect(doc.quotes.map((q) => q.result)).toEqual([{ status: "unchecked" }]);
  });

  it("rebuilds the match layer of the Text from the Document", () => {
    expect(matchesOf(created())).toEqual(scanRange(TEXT, 0, () => false));
  });
});

describe("citation layer after Insert and Delete  _Requirements: 15.1, 15.4_", () => {
  it("an Insert far from every citation keeps keys and the verified result", () => {
    const doc = verifiedDoc();
    const next = run(doc, { kind: "insert", at: 0, text: "Also, ", provenance: hum });
    expect(layerOf(next)).toEqual(extract(next.text));
    expect(keysOf(next)).toEqual(["k0", "k1", "k2"]);
    expect(next.keyCounter).toBe(3);
    expect(next.citations[0]).toEqual({
      ...doc.citations[0],
      citation: { ...doc.citations[0]?.citation, start: FULL_START + 6, end: 55 + 6 },
    });
  });

  it("an Insert inside a Full_Citation resets it and everything linked to it", () => {
    const doc = verifiedDoc();
    const next = run(doc, { kind: "insert", at: FULL_START + 1, text: "0", provenance: hum });
    expect(layerOf(next)).toEqual(extract(next.text));
    // The citation, its Id. (target reset), and the quote attached to the Id.
    expect(keysOf(next)).toEqual(["k3", "k4", "k5"]);
    expect(next.keyCounter).toBe(6);
    const full = next.citations[0];
    expect(full?.kind === "full" && full.result).toEqual({ status: "unchecked" });
  });

  it("a Short_Form keeps its key when its target is untouched", () => {
    const doc = verifiedDoc();
    const next = run(doc, { kind: "insert", at: QUOTE_START + 4, text: "x", provenance: hum });
    expect(layerOf(next)).toEqual(extract(next.text));
    // Only the quote resets; the Full_Citation and its Id. keep k0 and k2.
    expect(keysOf(next)).toEqual(["k0", "k3", "k2"]);
    expect(next.keyCounter).toBe(4);
    const full = next.citations[0];
    expect(full?.kind === "full" && full.result.status).toBe("verified");
  });
});

describe("citation layer after Replace  _Requirements: 4.6, 15.4_", () => {
  const from = FULL_START + 9;
  const to = from + 3; // "113"

  it("re-extracts after the delete and after the insert, even for identical text", () => {
    const doc = verifiedDoc();
    const next = run(doc, { kind: "replace", from, to, text: "113", provenance: hum });
    expect(next.text).toBe(TEXT);
    expect(layerOf(next)).toEqual(extract(TEXT));
    // Delete: quote k3, orphaned Id. k4. Insert: citation k5, quote k6, Id. k7.
    expect(keysOf(next)).toEqual(["k5", "k6", "k7"]);
    expect(next.keyCounter).toBe(8);
    const full = next.citations[0];
    expect(full?.kind === "full" && full.result).toEqual({ status: "unchecked" });
  });

  it("equals Delete followed by Insert, keys and counter included", () => {
    const doc = verifiedDoc();
    const replaced = run(doc, { kind: "replace", from, to, text: "113", provenance: hum });
    const deleted = run(doc, { kind: "delete", from, to, actor: "HUM" });
    const mid = { keys: keysOf(deleted), counter: deleted.keyCounter };
    expect(mid).toEqual({ keys: ["k3", "k4"], counter: 5 });
    const inserted = run(deleted, { kind: "insert", at: from, text: "113", provenance: hum });
    expect(replaced).toEqual(inserted);
  });

  it("its Inverse restores keys, results, and the counter", () => {
    const doc = verifiedDoc();
    const applied = unwrap(apply(doc, { kind: "replace", from, to, text: "113", provenance: hum }));
    expect(run(applied.document, applied.inverse)).toEqual(doc);
  });
});
