import { describe, expect, it } from "vitest";
import { assignKeys, mapRange, reanchor, type CitationLayer, type Edit } from "../src/anchor";
import { extract } from "../src/citations/extract";
import type {
  CitationRecord,
  Document,
  IssueKey,
  Override,
  VerificationResult,
} from "../src/types";

const TS = "2026-01-01T00:00:00Z";

const spansFor = (text: string): Document["spans"] =>
  text === "" ? [] : [{ start: 0, end: text.length, provenance: { origin: "PST", timestamp: TS } }];

/** A Document for `text` keyed as creation keys it (A1 step 4). */
function created(text: string): Document {
  const layer = assignKeys(extract(text), 0);
  return { text, spans: spansFor(text), runs: [], overrides: [], ...layer };
}

const withLayer = (text: string, layer: CitationLayer): Document => ({
  text,
  spans: spansFor(text),
  runs: [],
  ...layer,
});

/** One primitive edit: `[from, oldTo)` of `prev.text` becomes `inserted`. */
function edited(prev: Document, from: number, oldTo: number, inserted: string): Document {
  const text = prev.text.slice(0, from) + inserted + prev.text.slice(oldTo);
  const edit: Edit = { from, oldTo, newTo: from + inserted.length };
  const draft = { text, spans: spansFor(text), runs: [] };
  return withLayer(text, reanchor(prev, draft, edit, extract(text)));
}

const insertAt = (d: Document, at: number, s: string): Document => edited(d, at, at, s);
const deleteRange = (d: Document, from: number, to: number): Document => edited(d, from, to, "");

function setResult(d: Document, key: IssueKey, result: VerificationResult): Document {
  const citations = d.citations.map((r): CitationRecord =>
    r.kind === "full" && r.key === key ? { ...r, result } : r,
  );
  return { ...d, citations };
}

const override = (key: IssueKey, reason = "checked by hand"): Override => ({
  key,
  reason,
  timestamp: TS,
});

const keyed = (d: Document, written: string): CitationRecord | undefined =>
  d.citations.find((r) => r.citation.text === written);

const keyOf = (r: CitationRecord | undefined): IssueKey | null =>
  r === undefined || r.kind === "other" ? null : r.key;

describe("mapRange _Requirements: 15.3_", () => {
  const range = { start: 10, end: 20 };
  it("an Insert at the start shifts, at the end stays, strictly inside touches", () => {
    expect(mapRange(range, { from: 10, oldTo: 10, newTo: 13 })).toEqual({ start: 13, end: 23 });
    expect(mapRange(range, { from: 20, oldTo: 20, newTo: 25 })).toEqual(range);
    expect(mapRange(range, { from: 5, oldTo: 5, newTo: 7 })).toEqual({ start: 12, end: 22 });
    expect(mapRange(range, { from: 11, oldTo: 11, newTo: 12 })).toBeNull();
  });

  it("a Delete touches when it shares a code unit, and shifts ranges after it", () => {
    expect(mapRange(range, { from: 4, oldTo: 10, newTo: 4 })).toEqual({ start: 4, end: 14 });
    expect(mapRange(range, { from: 20, oldTo: 30, newTo: 20 })).toEqual(range);
    expect(mapRange(range, { from: 9, oldTo: 11, newTo: 9 })).toBeNull();
    expect(mapRange(range, { from: 19, oldTo: 21, newTo: 19 })).toBeNull();
  });
});

describe("assignKeys _Requirements: 15.5, 15.7_", () => {
  it("issues k<n> in (start, citation first) order and skips Other_References", () => {
    const text =
      'See 42 U.S.C. § 1983. "the right is fundamental" Roe v. Wade, 410 U.S. 113 (1973).';
    const { citations, quotes, keyCounter } = assignKeys(extract(text), 7);
    expect(citations.map((r) => [r.kind, keyOf(r)])).toEqual([
      ["other", null],
      ["full", "k8"],
    ]);
    expect(quotes.map((q) => q.key)).toEqual(["k7"]);
    expect(keyCounter).toBe(9);
    expect(citations[1]).toMatchObject({ result: { status: "unchecked" } });
    expect(quotes[0]?.result).toEqual({ status: "unchecked" });
  });
});

describe("reanchor _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_", () => {
  const roe = "410 U.S. 113 (1973)";
  const base = `Intro. Roe v. Wade, ${roe}. Tail.`;

  it("carries an untouched Full_Citation's result, wait_until, key, and Override with shifted Offsets", () => {
    const d0 = created(base);
    const k = keyOf(keyed(d0, roe)) as IssueKey;
    const waiting: VerificationResult = { status: "unchecked", waitUntil: TS };
    const d1 = { ...setResult(d0, k, waiting), overrides: [override(k)] };
    const d2 = insertAt(d1, 0, "New. ");
    const r = keyed(d2, roe);
    expect(r).toMatchObject({ kind: "full", key: k, result: waiting });
    expect(r?.citation.start).toBe(d2.text.indexOf(roe));
    expect(d2.overrides).toEqual([override(k)]);
    expect(d2.keyCounter).toBe(d1.keyCounter);
  });

  it("an Insert strictly inside resets to unchecked with a fresh key and drops the Override", () => {
    const d0 = created(base);
    const k = keyOf(keyed(d0, roe)) as IssueKey;
    const d1 = { ...setResult(d0, k, { status: "not_found" }), overrides: [override(k)] };
    const d2 = insertAt(d1, base.indexOf("113") + 1, "0");
    const r = keyed(d2, "410 U.S. 1013 (1973)");
    expect(r).toMatchObject({ kind: "full", key: `k${String(d1.keyCounter)}` });
    expect(r).toMatchObject({ result: { status: "unchecked" } });
    expect(d2.overrides).toEqual([]);
  });

  it("a Delete then Insert of identical text resets the citation twice (Replace, Req 15.4)", () => {
    const d0 = created(base);
    const k = keyOf(keyed(d0, roe)) as IssueKey;
    const d1 = setResult(d0, k, { status: "verified", clusterId: "108713" });
    const from = base.indexOf("113") + 2;
    const d2 = insertAt(deleteRange(d1, from, from + 1), from, "3");
    expect(d2.text).toBe(base);
    expect(keyed(d2, roe)).toMatchObject({ key: "k2", result: { status: "unchecked" } });
    expect(d2.keyCounter).toBe(3);
  });

  it("a Short_Form carries over when an edit before its target shifts both (D5)", () => {
    const text = `${base} Id. at 153.`;
    const d0 = created(text);
    const idKey = keyOf(keyed(d0, "Id. at 153"));
    const d1 = insertAt(d0, 0, "Preface. ");
    expect(keyOf(keyed(d1, "Id. at 153"))).toBe(idKey);
    expect(d1.keyCounter).toBe(d0.keyCounter);
  });

  it("a Short_Form whose target resets gets a fresh key, and an Orphan's Override is dropped", () => {
    const text = `${base} Id. at 153.`;
    const d0 = created(text);
    const idKey = keyOf(keyed(d0, "Id. at 153")) as IssueKey;
    const from = text.indexOf(roe);
    const d1 = deleteRange(d0, from, from + roe.length + 1);
    const id = keyed(d1, "Id. at 153");
    expect(keyOf(id)).not.toBe(idKey);
    expect(id?.citation.value).toMatchObject({ targetStart: null });
    const orphaned = { ...d1, overrides: [override(keyOf(id) as IssueKey)] };
    const d2 = insertAt(orphaned, 0, "x ");
    expect(d2.overrides).toEqual(orphaned.overrides);
    expect(keyOf(keyed(d2, "Id. at 153"))).toBe(keyOf(id));
  });

  it("carries a quote whose citation carries over, and resets it when the citation resets (Req 15.6)", () => {
    const text = `Intro. "the right is fundamental" Roe v. Wade, ${roe}.`;
    const d0 = created(text);
    const q0 = d0.quotes[0];
    expect(q0?.quote.rule).toBe("preceding");
    const qKey = q0?.key as IssueKey;
    const d1 = {
      ...d0,
      quotes: d0.quotes.map((q) => ({ ...q, result: { status: "match" as const } })),
    };
    const d2 = insertAt(d1, 0, "A. ");
    expect(d2.quotes[0]).toMatchObject({ key: qKey, result: { status: "match" } });
    const inside = d2.text.indexOf("113") + 1;
    const d3 = insertAt({ ...d2, overrides: [] }, inside, "0");
    expect(d3.quotes[0]?.key).not.toBe(qKey);
    expect(d3.quotes[0]?.result).toEqual({ status: "unchecked" });
  });

  it("a gap-only edit that removes the attachment drops the quote and its Override (Req 15.7, 15.8)", () => {
    const text = `Intro. "the right is fundamental" See Roe v. Wade, ${roe}.`;
    const d0 = created(text);
    const qKey = d0.quotes[0]?.key as IssueKey;
    const d1 = { ...d0, overrides: [override(qKey)] };
    const at = text.indexOf("See");
    const d2 = insertAt(deleteRange(d1, at, at + 3), at, "In the matter of. Also. Then.");
    expect(d2.quotes.map((q) => q.key)).not.toContain(qKey);
    expect(d2.overrides).toEqual([]);
  });

  it("keeps Overrides in issue order and drops those of deleted items", () => {
    const text = `A 1 U.S. 1 (1790). B 2 U.S. 2 (1791). C 3 U.S. 3 (1792).`;
    const d0 = created(text);
    const keys = d0.citations.map(keyOf) as IssueKey[];
    const d1 = {
      ...d0,
      overrides: [override(keys[2] ?? ""), override(keys[1] ?? ""), override(keys[0] ?? "")],
    };
    const from = text.indexOf("B ");
    const d2 = deleteRange(d1, from, text.indexOf("C "));
    expect(d2.overrides.map((o) => o.key)).toEqual([keys[0], keys[2]]);
  });

  it("an Edit inconsistent with the Texts resets everything with fresh keys", () => {
    const d0 = created(base);
    const k = keyOf(keyed(d0, roe)) as IssueKey;
    const d1 = { ...setResult(d0, k, { status: "verified", clusterId: "1" }), overrides: [] };
    const draft = { text: base, spans: spansFor(base), runs: [] };
    const layer = reanchor(d1, draft, { from: 0, oldTo: 0, newTo: 4 }, extract(base));
    expect(layer.citations[0]).toMatchObject({ key: "k1", result: { status: "unchecked" } });
    expect(layer.keyCounter).toBe(2);
  });
});
