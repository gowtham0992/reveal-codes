import { createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it, vi } from "vitest";
import { buildDocx } from "../src/index.js";
import { buildAppendix } from "../src/appendix.js";
import { buildStatement } from "../src/statement.js";
import type { Statement } from "../src/types.js";
import { DEMO_NOW } from "./support/demo-document.js";
import { DEMO_DECLARATION, buildDemoDocumentStatement } from "./support/demo-statement.js";
import { buildDemoDocument } from "./support/demo-document.js";
import { readDocxParagraphs, readDocxPart } from "./support/docx-text.js";
import { noneFor } from "./support/declarations.js";

const AT = "2026-11-20T18:25:00.000Z";
/** Every Document here is pasted text, so the author declares that no AI was used. */
const DECLARATION = noneFor("pasted_text");
function doc(text: string): Document {
  const r = createDocument(text, AT);
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
}
function statementOf(d: Document): Statement {
  const r = buildStatement(d, [], { now: DEMO_NOW, verifiedAt: null }, null, DECLARATION);
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
}
async function build(d: Document): Promise<Uint8Array> {
  return buildDocx(d, statementOf(d));
}
function xml(bytes: Uint8Array): string {
  return readDocxPart(bytes, "word/document.xml");
}
/** The XML of the paragraph that follows each page break. */
function titleParagraphs(x: string): string[] {
  return x
    .split('<w:br w:type="page"/>')
    .slice(1)
    .map((s) => s.slice(0, s.indexOf("</w:p>")));
}

/** A filing with one full citation, so the Statement carries a citation table. */
const CITING = "Hello\n\nSee Roe v. Wade, 410 U.S. 113 (1973).";

describe("buildDocx", () => {
  it("writes the two titles after page markers, bold, and no other title", async () => {
    const bytes = await build(doc(CITING));
    const paras = readDocxParagraphs(bytes);
    const marks = paras.flatMap((p, i) => (p === "\f" ? [i] : []));
    expect(marks).toHaveLength(2);
    expect(paras[(marks[0] ?? -1) + 1]).toBe("AI-Use and Verification Statement");
    expect(paras[(marks[1] ?? -1) + 1]).toBe("Provenance Appendix");
    const titles = titleParagraphs(xml(bytes));
    expect(titles).toHaveLength(2);
    for (const t of titles) expect(t).toContain("<w:b/>");
    expect(xml(bytes).match(/<w:b\/>/g)?.length).toBeGreaterThan(2); // table headers are bold too
  });

  it("uses 480 spacing for the filing, 240 for the Statement, and the fonts and sizes", async () => {
    const x = xml(await build(doc("one\ntwo")));
    expect(x.match(/w:line="480"/g)).toHaveLength(2);
    expect(x).toContain('w:line="240"');
    expect(x).toContain('w:ascii="Times New Roman"');
    expect(x).toContain('w:val="24"');
    expect(x).toContain('w:ascii="Courier New"');
    expect(x).toContain('w:val="18"');
  });

  it("sets US Letter with 1440 margins", async () => {
    const x = xml(await build(doc("x")));
    expect(x).toContain('w:w="12240"');
    expect(x).toContain('w:h="15840"');
    for (const side of ["top", "right", "bottom", "left"]) expect(x).toContain(`w:${side}="1440"`);
  });

  it("draws single borders on all six table edges", async () => {
    const x = xml(await build(doc(CITING)));
    const borders = x.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)?.[0] ?? "";
    for (const edge of ["top", "bottom", "left", "right", "insideH", "insideV"]) {
      expect(borders).toMatch(new RegExp(`<w:${edge} w:val="single"`));
    }
  });

  it("writes no table, and the two plain sentences, for a filing with no citation or quotation", async () => {
    const bytes = await build(doc("Notice of appearance."));
    expect(xml(bytes)).not.toContain("<w:tbl>");
    const paras = readDocxParagraphs(bytes);
    expect(paras).toContain("3. This filing contains no legal citations.");
    expect(paras).toContain(
      "4. This filing contains no quotations attributed to a cited decision.",
    );
    expect(paras.some((p) => p.includes("Every legal citation"))).toBe(false);
  });

  it("sets creator and the caption as title in core properties", async () => {
    const bytes = await build(doc("A Caption\nbody"));
    const core = readDocxPart(bytes, "docProps/core.xml");
    expect(core).toContain("<dc:creator>Reveal Codes</dc:creator>");
    expect(core).toContain("<dc:title>A Caption</dc:title>");
  });

  it("builds an empty Document with no title element", async () => {
    const bytes = await build(doc(""));
    expect(readDocxPart(bytes, "docProps/core.xml")).not.toContain("<dc:title>");
    expect(readDocxParagraphs(bytes).filter((p) => p === "\f")).toHaveLength(2);
  });

  it("writes filing paragraphs one to one, empty ones kept, and appendix lines unmodified", async () => {
    const d = doc("  lead  \n\nb & <c>\n");
    const paras = readDocxParagraphs(await build(d));
    const first = paras.indexOf("\f");
    expect(paras.slice(0, first)).toEqual(d.text.split("\n"));
    const lines = buildAppendix(d, DECLARATION).lines;
    expect(paras.slice(paras.length - lines.length)).toEqual(lines);
  });

  it("writes the signature pair with the date alone, and no empty paragraph before the appendix", async () => {
    const paras = readDocxParagraphs(await build(doc("x")));
    const sig = paras.indexOf("/s/ ________________");
    expect(sig).toBeGreaterThan(-1);
    expect(paras[sig + 1]).toBe(statementOf(doc("x")).generatedDate);
    expect(paras.some((p) => p.startsWith("Date:"))).toBe(false);
    const marks = paras.flatMap((p, i) => (p === "\f" ? [i] : []));
    const stmt = paras.slice((marks[0] ?? 0) + 1, marks[1]);
    expect(stmt.every((p) => p !== "")).toBe(true);
    expect(paras[(marks[1] ?? -1) - 1]).toBe(paras[sig + 1]);
  });

  it("writes every appendix line for the Demo_Document and never calls fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const { statement } = await buildDemoDocumentStatement();
      const d = await buildDemoDocument();
      const paras = readDocxParagraphs(await buildDocx(d, statement));
      const lines = buildAppendix(d, DEMO_DECLARATION).lines;
      expect(paras.slice(paras.length - lines.length)).toEqual(lines);
      expect(paras.filter((p) => p === "\f")).toHaveLength(2);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("writes local override timestamps and marked cut quotations; the Appendix keeps raw instants", async () => {
    const { statement } = await buildDemoDocumentStatement();
    const d = await buildDemoDocument();
    const bytes = await buildDocx(d, statement);
    const xml = readDocxPart(bytes, "word/document.xml");
    expect(xml).toContain("2026-11-20 10:25");
    expect(xml).toMatch(/…<\/w:t>/);
    const appendix = readDocxParagraphs(bytes).slice(
      -buildAppendix(d, DEMO_DECLARATION).lines.length,
    );
    expect(appendix.some((l) => l.includes("2026-11-20T18:25"))).toBe(true);
  });
});
