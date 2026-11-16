import { APPENDIX_TITLE, STATEMENT_TITLE, buildAppendix, buildDocx } from "@reveal-codes/export";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readDocx } from "../src/docx-read.js";
import { zipWithout } from "./support/docx-edit.js";
import {
  DEMO_DECLARATION,
  buildDemoDocument,
  buildDemoDocumentStatement,
} from "./support/export-support.js";

describe("readDocx", () => {
  it("reads the filing, the titles and the Appendix in document order", async () => {
    const doc = await buildDemoDocument();
    const { statement } = await buildDemoDocumentStatement();
    const result = readDocx(await buildDocx(doc, statement));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const list = result.value;
    const body = doc.text.split("\n");
    const lines = buildAppendix(doc, DEMO_DECLARATION).lines;
    expect(list.slice(0, body.length)).toEqual(body);
    const s = list.indexOf(STATEMENT_TITLE);
    const a = list.indexOf(APPENDIX_TITLE);
    expect(s).toBeGreaterThanOrEqual(body.length);
    expect(a).toBeGreaterThan(s);
    expect(list.slice(list.length - lines.length)).toEqual(lines);
  });

  it("returns not_docx for a zip without word/document.xml", async () => {
    const doc = await buildDemoDocument();
    const { statement } = await buildDemoDocumentStatement();
    const bytes = zipWithout(await buildDocx(doc, statement));
    expect(readDocx(bytes)).toEqual({ ok: false, error: { kind: "not_docx" } });
  });

  it.each([
    ["non-zip text", strToU8("this is not a zip file")],
    ["empty array", new Uint8Array([])],
    ["three bytes", new Uint8Array([1, 2, 3])],
  ])("returns not_docx for %s", (_name, bytes) => {
    expect(readDocx(bytes)).toEqual({ ok: false, error: { kind: "not_docx" } });
  });

  it("returns not_docx when the document entry is corrupt", () => {
    const name = "word/document.xml";
    const bytes = zipSync({ [name]: strToU8("<w:p><w:t>a</w:t></w:p>".repeat(200)) });
    const dataStart = 30 + name.length;
    bytes.fill(0xff, dataStart, dataStart + 8);
    expect(readDocx(bytes)).toEqual({ ok: false, error: { kind: "not_docx" } });
  });
});
