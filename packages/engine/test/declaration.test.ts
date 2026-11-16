import { describe, expect, it } from "vitest";
import {
  checkToolName,
  declareAi,
  declareNone,
  holdsSubstantivePasted,
  insertsPasted,
  isDeclaration,
} from "../src/index";
import type { Document, Inverse, Operation, Origin, Restore, Span } from "../src/index";

const T = "2026-11-03T10:00:00Z";

function span(start: number, end: number, origin: Origin): Span {
  return { start, end, provenance: { origin, timestamp: T } };
}

function docOf(text: string, origin: Origin): Document {
  return {
    text,
    spans: text === "" ? [] : [span(0, text.length, origin)],
    runs: [],
    citations: [],
    quotes: [],
    overrides: [],
    keyCounter: 0,
  };
}

describe("checkToolName _Requirements: 3.3, 3.4, 3.5_", () => {
  const faultOf = (raw: string) => {
    const r = checkToolName(raw);
    return r.ok ? null : r.error;
  };

  it("rejects 1 character and accepts 2 after trimming", () => {
    expect(faultOf("a")).toBe("too_short");
    expect(faultOf("  a  ")).toBe("too_short");
    expect(checkToolName("ab")).toEqual({ ok: true, value: "ab" });
    expect(checkToolName("  ab  ")).toEqual({ ok: true, value: "ab" });
  });

  it("accepts 100 and rejects 101 characters after trimming", () => {
    expect(checkToolName("x".repeat(100))).toEqual({ ok: true, value: "x".repeat(100) });
    expect(checkToolName(` ${"x".repeat(100)} `)).toEqual({ ok: true, value: "x".repeat(100) });
    expect(faultOf("x".repeat(101))).toBe("too_long");
    expect(faultOf(` ${"x".repeat(101)} `)).toBe("too_long");
  });

  it("rejects the empty string and whitespace only", () => {
    expect(faultOf("")).toBe("too_short");
    expect(faultOf("   \t\n \u00a0\u3000")).toBe("too_short");
  });

  it("rejects a line break or other control character inside the name", () => {
    expect(faultOf("Chat\nGPT")).toBe("control_character");
    expect(faultOf("Chat\rGPT")).toBe("control_character");
    expect(faultOf("Chat\u2028GPT")).toBe("control_character");
    expect(faultOf("Chat\u0000GPT")).toBe("control_character");
  });

  it("allows a trailing line break because trimming removes it", () => {
    expect(checkToolName("ChatGPT\n")).toEqual({ ok: true, value: "ChatGPT" });
  });

  it("accepts parentheses and brackets unchanged", () => {
    expect(checkToolName("ChatGPT (GPT-4o)")).toEqual({ ok: true, value: "ChatGPT (GPT-4o)" });
    expect(checkToolName("Tool [beta] {x}")).toEqual({ ok: true, value: "Tool [beta] {x}" });
  });

  it("rejects an unpaired surrogate and accepts a pair", () => {
    expect(faultOf("Chat\ud800GPT")).toBe("unpaired_surrogate");
    expect(checkToolName("Chat\ud83d\ude00")).toEqual({ ok: true, value: "Chat\ud83d\ude00" });
  });
});

describe("declareNone, declareAi, isDeclaration _Requirements: 3.3, 3.4_", () => {
  it("builds a None Declaration and a trimmed Declared_AI Declaration", () => {
    expect(declareNone("this_filing")).toEqual({ subject: "this_filing", choice: "none" });
    expect(declareAi("pasted_text", "  ChatGPT (GPT-4o) ")).toEqual({
      ok: true,
      value: { subject: "pasted_text", choice: "declared_ai", toolName: "ChatGPT (GPT-4o)" },
    });
    expect(declareAi("pasted_text", "x")).toEqual({ ok: false, error: "too_short" });
  });

  it("accepts built Declarations and rejects malformed values", () => {
    expect(isDeclaration({ subject: "pasted_text", choice: "none" })).toBe(true);
    expect(isDeclaration({ subject: "pasted_text", choice: "declared_ai", toolName: "Bot" })).toBe(
      true,
    );
    expect(isDeclaration({ subject: "pasted_text", choice: "none", toolName: "Bot" })).toBe(false);
    expect(isDeclaration({ subject: "other", choice: "none" })).toBe(false);
    expect(isDeclaration({ subject: "this_filing", choice: "maybe" })).toBe(false);
    expect(isDeclaration({ subject: "this_filing", choice: "declared_ai" })).toBe(false);
    expect(
      isDeclaration({ subject: "this_filing", choice: "declared_ai", toolName: " Bot " }),
    ).toBe(false);
    expect(isDeclaration(null)).toBe(false);
    expect(isDeclaration("none")).toBe(false);
  });
});

describe("holdsSubstantivePasted _Requirements: 3.3, 3.4_", () => {
  it("is false for a PST span of whitespace only, including U+0085 and U+FEFF", () => {
    expect(holdsSubstantivePasted(docOf(" \n\t", "PST"))).toBe(false);
    expect(holdsSubstantivePasted(docOf("\u0085", "PST"))).toBe(false);
    expect(holdsSubstantivePasted(docOf("\u00a0\u2003\u3000", "PST"))).toBe(false);
  });

  it("is true for U+FEFF, which is not White_Space", () => {
    expect(holdsSubstantivePasted(docOf("\ufeff", "PST"))).toBe(true);
    expect(holdsSubstantivePasted(docOf(" \ufeff ", "PST"))).toBe(true);
  });

  it("is true for a PST span with visible text and false for empty or non-PST text", () => {
    expect(holdsSubstantivePasted(docOf("  motion ", "PST"))).toBe(true);
    expect(holdsSubstantivePasted(docOf("", "PST"))).toBe(false);
    expect(holdsSubstantivePasted(docOf("typed text", "HUM"))).toBe(false);
  });

  it("looks only at PST spans of a mixed document", () => {
    const mixed: Document = {
      ...docOf("typed   real", "HUM"),
      spans: [span(0, 5, "HUM"), span(5, 8, "PST"), span(8, 12, "HUM")],
    };
    expect(holdsSubstantivePasted(mixed)).toBe(false);
    const withText: Document = { ...mixed, spans: [span(0, 5, "HUM"), span(5, 12, "PST")] };
    expect(holdsSubstantivePasted(withText)).toBe(true);
  });
});

describe("insertsPasted _Requirements: 3.5_", () => {
  const prov = (origin: Origin) => ({ origin, timestamp: T });

  it("is true for an insert or replace of non-empty PST text", () => {
    expect(insertsPasted({ kind: "insert", at: 0, text: "x", provenance: prov("PST") })).toBe(true);
    expect(
      insertsPasted({ kind: "replace", from: 0, to: 1, text: "x", provenance: prov("PST") }),
    ).toBe(true);
  });

  it("is false for an insert or replace of empty text or of non-PST text", () => {
    expect(insertsPasted({ kind: "insert", at: 0, text: "", provenance: prov("PST") })).toBe(false);
    expect(
      insertsPasted({ kind: "replace", from: 0, to: 1, text: "", provenance: prov("PST") }),
    ).toBe(false);
    expect(insertsPasted({ kind: "insert", at: 0, text: "x", provenance: prov("HUM") })).toBe(
      false,
    );
    expect(
      insertsPasted({ kind: "replace", from: 0, to: 1, text: "x", provenance: prov("HUM") }),
    ).toBe(false);
  });

  it("is false for a delete, even of PST text", () => {
    expect(insertsPasted({ kind: "delete", from: 0, to: 3, actor: "PST" })).toBe(false);
    expect(insertsPasted({ kind: "delete", from: 0, to: 3, actor: "HUM" })).toBe(false);
  });

  function inverse(at: number, insertText: string, spans: readonly Span[]): Operation {
    const restore: Restore = {
      at,
      removeLength: 0,
      insertText,
      spans,
      runs: [],
      citations: [],
      quotes: [],
      overrides: [],
      keyCounter: 0,
    };
    const result: Inverse = { kind: "inverse", expect: docOf("", "HUM"), restore };
    return result;
  }

  it("is true for an Inverse that restores PST text", () => {
    expect(insertsPasted(inverse(0, "pasted", [span(0, 6, "PST")]))).toBe(true);
  });

  it("is false for an Inverse that restores HUM text", () => {
    expect(insertsPasted(inverse(0, "typed", [span(0, 5, "HUM")]))).toBe(false);
  });

  it("is false for an Inverse that restores nothing, or whose PST span lies outside the restored range", () => {
    expect(insertsPasted(inverse(0, "", [span(0, 6, "PST")]))).toBe(false);
    expect(insertsPasted(inverse(0, "ab", [span(0, 2, "HUM"), span(2, 8, "PST")]))).toBe(false);
  });

  it("is true when a PST span overlaps only part of the restored range", () => {
    expect(insertsPasted(inverse(2, "abcd", [span(0, 3, "PST"), span(3, 6, "HUM")]))).toBe(true);
  });
});
