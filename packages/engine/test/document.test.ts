import { describe, expect, it } from "vitest";
import { createDocument, normalise } from "../src/document";
import type { Document } from "../src/types";

const T1 = "2024-01-01T00:00:00Z";

describe("createDocument success _Requirements: 2.1, 2.2_", () => {
  it("gives one PST Span over citation-free text", () => {
    const text = "The motion should be granted.";
    const expected: Document = {
      text,
      spans: [{ start: 0, end: text.length, provenance: { origin: "PST", timestamp: T1 } }],
      runs: [],
      citations: [],
      quotes: [],
      overrides: [],
      keyCounter: 0,
    };
    expect(createDocument(text, T1)).toEqual({ ok: true, value: expected });
  });

  it("keeps a well-formed surrogate pair as text, code unit for code unit", () => {
    const text = "a\uD83D\uDE00b";
    const result = createDocument(text, T1);
    expect(result).toEqual({
      ok: true,
      value: {
        text,
        spans: [{ start: 0, end: 4, provenance: { origin: "PST", timestamp: T1 } }],
        runs: [],
        citations: [],
        quotes: [],
        overrides: [],
        keyCounter: 0,
      },
    });
  });

  it("gives zero Spans for empty text", () => {
    const expected: Document = {
      text: "",
      spans: [],
      runs: [],
      citations: [],
      quotes: [],
      overrides: [],
      keyCounter: 0,
    };
    expect(createDocument("", T1)).toEqual({ ok: true, value: expected });
  });
});

describe("createDocument errors _Requirements: 2.6, 2.7_", () => {
  it.each([
    ["lone high surrogate mid-text", "ab\uD800c", 2],
    ["lone low surrogate at start", "\uDC00abc", 0],
    ["lone high surrogate at end", "abc\uD800", 3],
    ["first of two lone surrogates", "a\uDC00b\uD800", 1],
  ])("returns split_surrogate at the Offset: %s", (_name, text, offset) => {
    expect(createDocument(text, T1)).toEqual({
      ok: false,
      error: { kind: "split_surrogate", offset, where: "text" },
    });
  });

  it.each([
    ["date only", "2024-01-01"],
    ["non-UTC offset", "2024-01-01T00:00:00+01:00"],
    ["impossible day", "2023-02-29T00:00:00Z"],
    ["empty string", ""],
  ])("returns invalid_timestamp carrying the value: %s", (_name, value) => {
    expect(createDocument("text", value)).toEqual({
      ok: false,
      error: { kind: "invalid_timestamp", value },
    });
  });

  it("checks the timestamp before the surrogate", () => {
    expect(createDocument("ab\uD800c", "not-a-time")).toEqual({
      ok: false,
      error: { kind: "invalid_timestamp", value: "not-a-time" },
    });
  });
});

describe("normalise on a created Document _Requirements: 3.4_", () => {
  it("returns the Document unchanged", () => {
    const created = createDocument("Paste this draft.", T1);
    if (!created.ok) throw new Error(`createDocument failed: ${created.error.kind}`);
    expect(normalise(created.value)).toEqual({ ok: true, value: created.value });
  });
});
