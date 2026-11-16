import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  holdsEncryptedPackage,
  isCompoundFile,
  notesBlock,
  notesOf,
  readDocx,
  readDocxWithNotes,
} from "../src/index.js";

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (t: string): string => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

const FOOTNOTES = `<w:footnotes ${NS}>
<w:footnote w:type="separator" w:id="-1">${p("x")}</w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0">${p("y")}</w:footnote>
<w:footnote w:id="1">${p("See")}<w:p><w:r><w:t>Roe</w:t><w:tab/><w:t>v.</w:t><w:br/><w:t>Wade</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="2"><w:p/></w:footnote>
<w:footnote w:id="3">${p("Third")}</w:footnote>
</w:footnotes>`;

const ENDNOTES = `<w:endnotes ${NS}><w:endnote w:id="1">${p("End")}</w:endnote></w:endnotes>`;

function docx(parts: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(parts)) entries[name] = strToU8(text);
  return zipSync(entries);
}

describe("notesOf and notesBlock", () => {
  it("skips separators and empty notes and joins paragraphs with one space", () => {
    expect(notesOf(FOOTNOTES, "footnote")).toEqual(["See Roe v. Wade", "Third"]);
    expect(notesOf(ENDNOTES, "endnote")).toEqual(["End"]);
    expect(notesOf(ENDNOTES, "footnote")).toEqual([]);
  });

  it("numbers notes from 1 and is empty when there are none", () => {
    expect(notesBlock(["a", "b"])).toBe("\n\nFootnotes\n1. a\n2. b");
    expect(notesBlock([])).toBe("");
    expect(notesBlock(["", " "])).toBe("");
  });
});

describe("signature", () => {
  const head = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const name = Array.from("EncryptedPackage", (c) => [c.charCodeAt(0), 0]).flat();

  it("tells a compound file, an encrypted one and a zip apart", () => {
    expect(isCompoundFile(Uint8Array.from(head))).toBe(true);
    expect(isCompoundFile(Uint8Array.from(head.slice(0, 7)))).toBe(false);
    expect(holdsEncryptedPackage(Uint8Array.from([...head, 1, 2, ...name, 3]))).toBe(true);
    expect(holdsEncryptedPackage(Uint8Array.from([...head, 1, 2, 3]))).toBe(false);
    expect(holdsEncryptedPackage(Uint8Array.from([1, 2, ...name]))).toBe(false);
  });
});

describe("readDocxWithNotes", () => {
  const bytes = docx({
    "word/document.xml": `<w:document ${NS}><w:body>${p("Body")}</w:body></w:document>`,
    "word/footnotes.xml": FOOTNOTES,
    "word/endnotes.xml": ENDNOTES,
  });

  it("returns paragraphs and notes, footnotes first", () => {
    const r = readDocxWithNotes(bytes, { maxPartBytes: 1_000_000 });
    expect(r).toEqual({
      ok: true,
      value: { paragraphs: ["Body"], notes: ["See Roe v. Wade", "Third", "End"] },
    });
  });

  it("gives part_too_large for a wanted part over the limit", () => {
    const r = readDocxWithNotes(bytes, { maxPartBytes: 50 });
    expect(r).toEqual({ ok: false, error: { kind: "part_too_large" } });
  });

  it("gives not_docx for garbage and for a zip without the body", () => {
    const bad = { ok: false, error: { kind: "not_docx" } };
    expect(readDocxWithNotes(Uint8Array.from([1, 2, 3]), { maxPartBytes: 9 })).toEqual(bad);
    expect(readDocxWithNotes(docx({ "x.txt": "a" }), { maxPartBytes: 9 })).toEqual(bad);
  });

  it("leaves readDocx unlimited and body-only", () => {
    expect(readDocx(bytes)).toEqual({ ok: true, value: ["Body"] });
  });
});
