import { createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ORDERS, buildDocx, buildStatement, orderById } from "../src/index.js";
import type { OrderContext, Statement } from "../src/index.js";
import { DEMO_NOW, buildDemoDocument } from "./support/demo-document.js";
import { buildDemoDocumentStatement } from "./support/demo-statement.js";
import { readDocxParagraphs, readDocxPart } from "./support/docx-text.js";

// _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 9.4_

const HEADING = "Use of Generative Artificial Intelligence";
const POINTER =
  "This filing was prepared using generative artificial intelligence. See the AI-Use and Verification Statement following the filing.";

function contextOf(id: string): OrderContext {
  const entry = orderById(ORDERS, id);
  if (entry === null) throw new Error(`no current entry ${id}`);
  return { entry, confidentialityCertified: false };
}

function partNames(bytes: Uint8Array): string[] {
  return Object.keys(unzipSync(bytes));
}

function plainDocument(): Document {
  const r = createDocument("Plain filing.\n\nSecond paragraph.", "2026-11-20T18:25:00.000Z");
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
}

function noAiStatement(order: OrderContext): Statement {
  const r = buildStatement(plainDocument(), [], { now: DEMO_NOW, verifiedAt: null }, order);
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
}

/** Paragraph XML strings of a part, in order. */
function paragraphXml(xml: string): string[] {
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
}

function textOfXml(p: string): string {
  return [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? "").join("");
}

describe("first-page header with ndtex-lr-7-2-f and AI used _Requirements: 7.1-7.5, 9.4_", () => {
  it("writes header1.xml, titlePg, a bold centred 12 pt heading, and the pointer sentence", async () => {
    const { statement } = await buildDemoDocumentStatement(contextOf("ndtex-lr-7-2-f"));
    expect(statement.aiUsed).toBe(true);
    const bytes = await buildDocx(await buildDemoDocument(), statement);

    expect(partNames(bytes)).toContain("word/header1.xml");
    expect(readDocxPart(bytes, "word/document.xml")).toContain("<w:titlePg");

    const paras = paragraphXml(readDocxPart(bytes, "word/header1.xml"));
    const first = paras[0] ?? "";
    expect(textOfXml(first)).toBe(HEADING);
    expect(first).toContain("<w:b/>");
    expect(first).toMatch(/<w:jc w:val="center"\/>/);
    expect(first).toContain('<w:sz w:val="24"/>');
    expect(paras.map(textOfXml)).toContain(POINTER);
  });

  it("puts 12 pt (240 twips) of spacing after the pointer paragraph and not the heading", async () => {
    const { statement } = await buildDemoDocumentStatement(contextOf("ndtex-lr-7-2-f"));
    const bytes = await buildDocx(await buildDemoDocument(), statement);
    const paras = paragraphXml(readDocxPart(bytes, "word/header1.xml"));
    expect(textOfXml(paras[0] ?? "")).toBe(HEADING);
    expect(textOfXml(paras[1] ?? "")).toBe(POINTER);
    expect(paras[0]).not.toMatch(/<w:spacing[^>]*w:after="240"/);
    expect(paras[1]).toMatch(/<w:spacing[^>]*w:after="240"/);
  });

  it("leaves the body paragraphs equal to those of the same Statement without the heading", async () => {
    const d = await buildDemoDocument();
    const { statement } = await buildDemoDocumentStatement(contextOf("ndtex-lr-7-2-f"));
    const order = statement.order;
    if (order === null) throw new Error("order missing");
    const without: Statement = { ...statement, order: { ...order, caption: null } };

    const withHeading = await buildDocx(d, statement);
    const noHeading = await buildDocx(d, without);

    expect(partNames(noHeading)).not.toContain("word/header1.xml");
    expect(readDocxParagraphs(withHeading)).toEqual(readDocxParagraphs(noHeading));
  });
});

describe("no header part _Requirements: 7.4, 7.5_", () => {
  function expectNoHeader(bytes: Uint8Array): void {
    expect(partNames(bytes)).not.toContain("word/header1.xml");
    expect(readDocxPart(bytes, "word/document.xml")).not.toContain("w:titlePg");
  }

  it("is absent when AI was not used, even with a first_page_heading caption", async () => {
    const statement = noAiStatement(contextOf("ndtex-lr-7-2-f"));
    expect(statement.aiUsed).toBe(false);
    expectNoHeader(await buildDocx(plainDocument(), statement));
  });

  it("is absent with another placement and AI used", async () => {
    const { statement } = await buildDemoDocumentStatement(contextOf("edtex-love-2025"));
    expect(statement.aiUsed).toBe(true);
    expect(statement.order?.caption?.placement).toBe("statement_title");
    expectNoHeader(await buildDocx(await buildDemoDocument(), statement));
  });

  it("is absent with order === null and AI used", async () => {
    const { statement } = await buildDemoDocumentStatement(null);
    expect(statement.aiUsed).toBe(true);
    expect(statement.order).toBeNull();
    expectNoHeader(await buildDocx(await buildDemoDocument(), statement));
  });
});
