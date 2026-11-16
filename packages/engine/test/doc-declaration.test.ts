import { describe, expect, it } from "vitest";
import { parse, parseRecord, render, renderRecord } from "../src/index";
import type { Declaration, Document } from "../src/index";

const T = "2026-11-03T10:00:00Z";
const BODY = `[PST{t=${T}}]hello`;

const doc: Document = {
  text: "hello world",
  spans: [
    { start: 0, end: 5, provenance: { origin: "PST", timestamp: T } },
    { start: 5, end: 11, provenance: { origin: "HUM", timestamp: T } },
  ],
  runs: [],
  citations: [],
  quotes: [],
  overrides: [],
  keyCounter: 0,
};

const withDoc = (fields: string): string => `[DOC{v=1;n=0${fields}}]${BODY}`;

describe("[DOC] d field lexing _Requirements: 8.3, 8.4, 8.8, 8.9, 8.10_", () => {
  it("reads a None Declaration and a Declared_AI Declaration", () => {
    const none = parseRecord(withDoc(";d=pasted_text,none"));
    expect(none.ok && none.value.declaration).toEqual({ subject: "pasted_text", choice: "none" });
    const ai = parseRecord(withDoc(";d=this_filing,declared_ai,ChatGPT"));
    expect(ai.ok && ai.value.declaration).toEqual({
      subject: "this_filing",
      choice: "declared_ai",
      toolName: "ChatGPT",
    });
  });

  it("rejects a duplicate d at index 0 with rule bad_field", () => {
    const r = parseRecord(withDoc(";d=pasted_text,none;d=pasted_text,none"));
    expect(r).toEqual({
      ok: false,
      error: { kind: "malformed_codes", index: 0, rule: "bad_field" },
    });
  });

  it("rejects an unknown subject", () => {
    const r = parseRecord(withDoc(";d=elsewhere,none"));
    expect(r).toEqual({
      ok: false,
      error: { kind: "malformed_codes", index: 0, rule: "bad_field" },
    });
  });

  it("rejects declared_ai without a name", () => {
    const r = parseRecord(withDoc(";d=pasted_text,declared_ai"));
    expect(r).toEqual({
      ok: false,
      error: { kind: "malformed_codes", index: 0, rule: "bad_field" },
    });
  });

  it("rejects none with a name", () => {
    const r = parseRecord(withDoc(";d=pasted_text,none,ChatGPT"));
    expect(r).toEqual({
      ok: false,
      error: { kind: "malformed_codes", index: 0, rule: "bad_field" },
    });
  });

  it("reads an old file with no d as declaration null", () => {
    const r = parseRecord(withDoc(""));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.declaration).toBeNull();
    expect(r.value.document.text).toBe("hello");
  });

  it("parse returns the Document and ignores the Declaration", () => {
    const r = parse(withDoc(";d=pasted_text,none"));
    expect(r.ok && r.value.text).toBe("hello");
  });
});

describe("renderRecord _Requirements: 8.1, 8.2, 8.3, 8.4_", () => {
  it("with no Declaration equals render(document, full)", () => {
    expect(renderRecord(doc, null, "full")).toEqual(render(doc, "full"));
    expect(render(doc, "full").text).not.toContain("d=");
  });

  it("writes the Declaration after v and n and reads it back with the Document", () => {
    const declaration: Declaration = {
      subject: "pasted_text",
      choice: "declared_ai",
      toolName: 'ChatGPT (GPT-4o); "v2", [beta] \\ 語',
    };
    const text = renderRecord(doc, declaration, "full").text;
    expect(text.startsWith("[DOC{v=1;n=0;d=pasted_text,declared_ai,")).toBe(true);
    const back = parseRecord(text);
    expect(back).toEqual({ ok: true, value: { document: doc, declaration } });
  });

  it("display mode omits the Declaration", () => {
    const declaration: Declaration = {
      subject: "this_filing",
      choice: "declared_ai",
      toolName: "Bot",
    };
    const shown = renderRecord(doc, declaration, "display");
    expect(shown).toEqual(render(doc, "display"));
    expect(shown.text).not.toContain("Bot");
    expect(shown.text).not.toContain("declared_ai");
    expect(shown.text).not.toContain("[DOC");
  });
});
