import { describe, expect, it } from "vitest";
import {
  CODE_NAMES,
  codeString,
  escapePayload,
  escapeRetained,
  escapeText,
  isCodeName,
  unescape,
} from "../src/codes/syntax.js";

describe("codes/syntax (_Requirements: 19.2, 19.3, 19.11_)", () => {
  it("uses the exact glyphs from product.md", () => {
    expect(Object.values(CODE_NAMES)).toEqual([
      "HUM",
      "PST",
      "AI",
      "AI>HUM",
      "CIT ✓",
      "CIT ✘",
      "CIT ≠",
      "CIT ?",
      "CIT …",
      "QUO ✓",
      "QUO ✘",
      "QUO …",
      "REF",
      "/CIT",
      "/QUO",
      "/REF",
      "OVR",
      "DOC",
    ]);
    expect(isCodeName("CIT ✓")).toBe(true);
    expect(isCodeName("CIT x")).toBe(false);
  });

  it("escapes per context", () => {
    const s = "a\\b[c]d{e}f;g=h,i";
    expect(escapeText(s)).toBe("a\\\\b\\[c\\]d{e}f;g=h,i");
    expect(escapeRetained(s)).toBe("a\\\\b\\[c\\]d\\{e}f;g=h,i");
    expect(escapePayload(s)).toBe("a\\\\b\\[c\\]d\\{e\\}f\\;g\\=h\\,i");
  });

  it("round-trips through unescape in each context", () => {
    const s = "x\\[y]{z};=,\\";
    expect(unescape(escapeText(s), "text")).toEqual({ ok: true, value: s });
    expect(unescape(escapeRetained(s), "retained")).toEqual({ ok: true, value: s });
    expect(unescape(escapePayload(s), "payload")).toEqual({ ok: true, value: s });
  });

  it("reports a dangling escape at its index", () => {
    expect(unescape("ab\\", "text")).toEqual({
      ok: false,
      error: { kind: "dangling_escape", index: 2 },
    });
    expect(unescape("a\\x", "text")).toEqual({
      ok: false,
      error: { kind: "dangling_escape", index: 1 },
    });
    expect(unescape("a\\{", "text").ok).toBe(false);
    expect(unescape("a\\{", "retained").ok).toBe(true);
  });

  it("builds full and display Code strings", () => {
    const f = [{ key: "t", values: ["2026-11-03T10:00:00Z"] }];
    expect(codeString(CODE_NAMES.ai, "r[1]", f, "full")).toBe(
      "[AI:r\\[1\\]{t=2026-11-03T10:00:00Z}]",
    );
    expect(codeString(CODE_NAMES.ai, "r[1]", f, "display")).toBe("[AI:r\\[1\\]]");
    expect(codeString(CODE_NAMES.closeCit, null, [], "full")).toBe("[/CIT]");
    const doc = [
      { key: "v", values: ["1"] },
      { key: "r", values: ["a\\b", "4", "0", "1"] },
    ];
    expect(codeString(CODE_NAMES.doc, null, doc, "full")).toBe("[DOC{v=1;r=a\\\\b,4,0,1}]");
    expect(codeString(CODE_NAMES.ovr, "why: [x]", f, "display")).toBe("[OVR:why: \\[x\\]]");
  });
});
