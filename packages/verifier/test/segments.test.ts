import { describe, expect, it } from "vitest";
import { indexFrom, longestPrefixOccurring } from "../src/kmp";
import { frontier, matchSegments, segmentSpans, splitSegments } from "../src/segments";

describe("kmp _Requirements: 8.14_", () => {
  it("indexFrom finds the first match at or after the start", () => {
    expect(indexFrom("aba", "ababa", 0)).toBe(0);
    expect(indexFrom("aba", "ababa", 1)).toBe(2);
    expect(indexFrom("aba", "ababa", 3)).toBe(-1);
    expect(indexFrom("x", "abc", 0)).toBe(-1);
  });

  it("longestPrefixOccurring returns the longest occurring prefix", () => {
    expect(longestPrefixOccurring("abcd", "xxabcyy", 0)).toBe(3);
    expect(longestPrefixOccurring("abcd", "xxabcyy", 5)).toBe(0);
    expect(longestPrefixOccurring("abcd", "zabcd", 0)).toBe(4);
    expect(longestPrefixOccurring("aab", "aaaab", 0)).toBe(3);
  });
});

describe("segmentSpans _Requirements: 8.5_", () => {
  it("ignores a leading and a trailing ellipsis", () => {
    expect(splitSegments("… held that the …")).toEqual(["held that the"]);
  });

  it("a quote with no ellipsis has one segment", () => {
    expect(splitSegments("held that the")).toEqual(["held that the"]);
  });

  it("reports next as the index after the following ellipsis", () => {
    const s = "ab … cd";
    const spans = segmentSpans(s);
    expect(spans).toEqual([
      { a: 0, b: 2, next: 4 },
      { a: 5, b: 7, next: 7 },
    ]);
  });

  it("returns nothing for an ellipsis-only or empty string", () => {
    expect(segmentSpans("…")).toEqual([]);
    expect(segmentSpans("")).toEqual([]);
  });
});

describe("matchSegments _Requirements: 8.14, 8.16_", () => {
  const opinion = "the court held that the statute is void because it burdens speech and remanded";

  it("matches short first and last segments", () => {
    expect(matchSegments(opinion, ["the", "statute is void because", "and remanded"]).ok).toBe(true);
    expect(matchSegments(opinion, ["the court held that", "it burdens speech", "ed"]).ok).toBe(true);
  });

  it("rejects segments that each occur but in the wrong order", () => {
    const r = matchSegments(opinion, ["the statute is void", "the court held that"]);
    expect(r.ok).toBe(false);
  });

  it("rejects a short interior segment although it occurs", () => {
    const r = matchSegments(opinion, ["the court held", "void", "it burdens speech"]);
    expect(r).toEqual({ ok: false, index: 1, pos: 14 });
  });

  it("requires a repeated segment to occur twice without overlap", () => {
    const seg = "abcdefghijkl";
    expect(matchSegments(seg + " " + seg, [seg, seg]).ok).toBe(true);
    expect(matchSegments(seg, [seg, seg]).ok).toBe(false);
    expect(matchSegments("aaaaaaaaaaaaa", ["aaaaaaa", "aaaaaaa"]).ok).toBe(false);
  });

  it("a single short segment is an exact substring test", () => {
    expect(matchSegments("a b c", ["b"]).ok).toBe(true);
    expect(matchSegments("a b c", ["z"]).ok).toBe(false);
  });
});

describe("frontier _Requirements: 8.15_", () => {
  it("single segment: start plus longest occurring prefix", () => {
    const v = "… abcdx";
    expect(frontier(v, segmentSpans(v), "zzabcdzz", true)).toBe(2 + 4);
  });

  it("multi segment: partial prefix of the failing segment", () => {
    const v = "the court … remanded the cases";
    const o = "the court held; remanded the case.";
    expect(frontier(v, segmentSpans(v), o, false)).toBe(v.indexOf("remanded") + "remanded the case".length);
  });

  it("multi segment: a short interior segment that occurs stops after its ellipsis", () => {
    const v = "the court held … see id … remanded the case";
    const o = "the court held that the writ issued. see id. the court later remanded the case.";
    const spans = segmentSpans(v);
    expect(frontier(v, spans, o, false)).toBe((spans[1] as { next: number }).next);
  });

  it("no spans gives 0", () => {
    expect(frontier("…", [], "abc", false)).toBe(0);
  });
});
