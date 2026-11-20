import { createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { legendLines } from "../src/core/legend.js";
import { viewRecord, type ViewMode } from "../src/core/view.js";
const AT = "2026-11-19T10:00:00Z";
const RUN = "1 Probe task one 2026-11-19T10:00:00Z.2";
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
function pst(text: string): Document {
  const made = createDocument(text, AT);
  if (!made.ok) throw new Error(made.error.kind);
  return made.value;
}
/** A document of three spans: HUM, AI, AI>HUM. */
function mixed(text: string): Document {
  const third = Math.floor(text.length / 3);
  const doc = pst(text);
  const prov = (origin: "HUM" | "AI" | "AI>HUM"): Document["spans"][number]["provenance"] =>
    origin === "HUM" ? { origin, timestamp: AT } : { origin, runId: RUN, timestamp: AT };
  return {
    ...doc,
    spans: [
      { start: 0, end: third, provenance: prov("HUM") },
      { start: third, end: 2 * third, provenance: prov("AI") },
      { start: 2 * third, end: text.length, provenance: prov("AI>HUM") },
    ],
  };
}
const MODES: ViewMode[] = ["truecolor", "ansi256", "plain"];
describe("viewRecord (Req 9)", () => {
  it("prints the header naming the file, then the four legend lines, then the body", () => {
    const lines = viewRecord(pst("x\n"), "plain", "src/a.ts").split("\n");
    expect(lines[0]).toBe("Reveal Codes: src/a.ts");
    expect(lines.slice(1, 5)).toEqual(legendLines());
    expect(lines[5]).toMatch(/^\[PST\]x$/);
  });
  it("prints an Unchanged_File as one [PST] code and its text", () => {
    const out = viewRecord(pst("one\ntwo\n"), "plain", "f.txt");
    expect(out.endsWith("[PST]one\ntwo\n")).toBe(true);
    expect(out.match(/\[PST\]/g)?.length).toBe(1 + 1); // the legend item and the code
  });
  it("escapes backslash and brackets in plain mode only", () => {
    const doc = pst("a[b]c\\d");
    expect(viewRecord(doc, "plain", "f").endsWith("[PST]a\\[b\\]c\\\\d")).toBe(true);
    for (const mode of ["truecolor", "ansi256"] as const) {
      expect(viewRecord(doc, mode, "f").replace(ANSI, "").endsWith("[PST]a[b]c\\d")).toBe(true);
    }
  });
  it("prints no escape sequence from the file in any mode", () => {
    const doc = pst("x\u001b[31my\rz\u0085\u007f");
    for (const mode of MODES) {
      const out = viewRecord(doc, mode, "f");
      expect(out.replace(ANSI, "")).not.toContain("\u001b");
      const bracket = mode === "plain" ? "\\[" : "[";
      expect(out).toContain(`x\u241b${bracket}31my\u240dz\ufffd\u2421`);
    }
    expect(viewRecord(doc, "plain", "f")).not.toContain("\u001b");
  });
  it("keeps tab and line feed", () => {
    expect(viewRecord(pst("a\tb\nc"), "plain", "f").endsWith("a\tb\nc")).toBe(true);
  });
  it("names the control characters of a file name too", () => {
    expect(viewRecord(pst("x"), "plain", "a\u001bb").split("\n")[0]).toBe("Reveal Codes: a\u241bb");
  });
  it("prints no citation, quote, reference, override or document code for citation-like text", () => {
    const text = 'See Roe v. Wade, 410 U.S. 113 (1973) ("the right"), 42 U.S.C. § 1983.';
    for (const mode of MODES) {
      const out = viewRecord(pst(text), mode, "f").replace(ANSI, "");
      expect(out).not.toMatch(/\[\/?(CIT|QUO|REF|OVR|DOC)/);
    }
  });
  it("prints the codes of AI and AI>HUM spans with their run, and the colours of the pane", () => {
    const doc = mixed("aaabbbccc");
    const plain = viewRecord(doc, "plain", "f");
    expect(plain.endsWith(`[HUM]aaa[AI:${RUN}]bbb[AI>HUM:${RUN}]ccc`)).toBe(true);
    const colour = viewRecord(doc, "truecolor", "f");
    expect(colour).toContain("\u001b[38;2;232;236;246m\u001b[48;2;15;39;102m[HUM]aaa");
    expect(colour).toContain("\u001b[38;2;166;212;247m\u001b[48;2;15;39;102m[AI:");
    expect(colour).toContain("\u001b[38;2;215;198;245m\u001b[48;2;15;39;102m[AI>HUM:");
    expect(viewRecord(doc, "ansi256", "f")).toContain("\u001b[48;5;17m");
  });
  it("ends every coloured line with a reset", () => {
    const out = viewRecord(mixed("ab\ncd\nef\ngh\n"), "truecolor", "f");
    for (const line of out.split("\n").slice(0, -1)) expect(line.endsWith("\u001b[0m")).toBe(true);
    expect(out.endsWith("\u001b[0m")).toBe(true);
  });
  it("unescaping the text of the plain view gives the coloured view without ANSI (Req 9.8)", () => {
    const doc = mixed("a[x]\\y\u001bz\nq[");
    const head = (s: string): string => s.split("\n").slice(0, 5).join("\n");
    const body = (s: string): string => s.split("\n").slice(5).join("\n");
    const plain = viewRecord(doc, "plain", "f");
    const unescapedBody = body(plain).replace(/\\([\s\S])/g, "$1");
    for (const mode of ["truecolor", "ansi256"] as const) {
      const stripped = viewRecord(doc, mode, "f").replace(ANSI, "");
      expect(head(stripped)).toBe(head(plain));
      expect(body(stripped)).toBe(unescapedBody);
    }
    expect(body(plain)).toContain("a\\[x");
    expect(body(plain)).toContain("\\]\\\\y");
    expect(body(plain)).toContain("\u241bz");
  });
});
