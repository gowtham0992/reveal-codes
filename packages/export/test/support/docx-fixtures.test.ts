import { inflateSync, strFromU8, strToU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { addEndnotes } from "./docx-endnotes.js";
import {
  FIXTURE_TEXT,
  buildFixtureDocx,
  editOneCharacter,
  exportAndEditedExport,
  oversizePartZip,
  partText,
  partsOf,
  passwordProtectedStandIn,
  truncatedZip,
  zipFixed,
  zipWithoutDocumentXml,
} from "./docx-fixtures.js";

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("fixture builder self-test", () => {
  it("gives identical bytes on two runs", async () => {
    const a = await buildFixtureDocx();
    const b = await buildFixtureDocx();
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("holds a table, a tracked insertion and deletion, and two footnotes with fixed dates", async () => {
    const bytes = await buildFixtureDocx();
    const body = partText(bytes, "word/document.xml");
    expect(body).toContain("<w:tbl>");
    expect(body).toContain(`<w:t xml:space="preserve">${FIXTURE_TEXT.inserted}</w:t>`);
    expect(body).toContain(`<w:delText xml:space="preserve">${FIXTURE_TEXT.deleted}</w:delText>`);
    expect(count(body, "<w:footnoteReference ")).toBe(2);
    const notes = partText(bytes, "word/footnotes.xml");
    for (const t of FIXTURE_TEXT.footnotes) expect(notes).toContain(t);
    const core = partText(bytes, "docProps/core.xml");
    expect(core).toContain("2024-01-02T03:04:05.000Z");
  });
});

describe("endnotes helper self-test", () => {
  const notes = ["First endnote.", "Second & last endnote."];

  it("holds word/endnotes.xml with its content-type and relationship entries once", async () => {
    const out = addEndnotes(await buildFixtureDocx(), notes);
    const types = partText(out, "[Content_Types].xml");
    const rels = partText(out, "word/_rels/document.xml.rels");
    expect(count(types, 'PartName="/word/endnotes.xml"')).toBe(1);
    expect(count(rels, 'Target="endnotes.xml"')).toBe(1);
    expect(partText(out, "word/endnotes.xml")).toContain("Second &amp; last endnote.");
  });

  it("holds the separator and continuation-separator notes and numbers the real notes from 1", async () => {
    const xml = partText(addEndnotes(await buildFixtureDocx(), notes), "word/endnotes.xml");
    expect(xml).toContain('<w:endnote w:type="separator" w:id="-1">');
    expect(xml).toContain('<w:endnote w:type="continuationSeparator" w:id="0">');
    expect(xml).toContain('<w:endnote w:id="1">');
    expect(xml).toContain('<w:endnote w:id="2">');
    expect(count(xml, "<w:endnote ")).toBe(4);
  });

  it("adds the part and both entries to a package that has none, and is deterministic", async () => {
    const bare = partsOf(await buildFixtureDocx());
    delete bare["word/endnotes.xml"];
    delete bare["word/_rels/endnotes.xml.rels"];
    const types = strFromU8(bare["[Content_Types].xml"] as Uint8Array).replace(
      /<Override[^>]*endnotes[^>]*\/>/,
      "",
    );
    const rels = strFromU8(bare["word/_rels/document.xml.rels"] as Uint8Array).replace(
      /<Relationship [^>]*endnotes[^>]*\/>/,
      "",
    );
    bare["[Content_Types].xml"] = strToU8(types);
    bare["word/_rels/document.xml.rels"] = strToU8(rels);
    const bytes = zipFixed(bare);
    expect(partText(bytes, "[Content_Types].xml")).not.toContain("endnotes");
    const out = addEndnotes(bytes, notes);
    expect(count(partText(out, "[Content_Types].xml"), 'PartName="/word/endnotes.xml"')).toBe(1);
    expect(count(partText(out, "word/_rels/document.xml.rels"), "/relationships/endnotes")).toBe(1);
    expect(Array.from(addEndnotes(bytes, notes))).toEqual(Array.from(out));
  });

  it("references each endnote from the body", async () => {
    const body = partText(addEndnotes(await buildFixtureDocx(), notes), "word/document.xml");
    expect(body).toContain('<w:endnoteReference w:id="1"/>');
    expect(body).toContain('<w:endnoteReference w:id="2"/>');
  });
});

describe("other fixtures", () => {
  it("password-protected stand-in has the compound-file magic and the EncryptedPackage name in UTF-16LE", () => {
    const bytes = passwordProtectedStandIn();
    expect(Array.from(bytes.slice(0, 8))).toEqual([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const name = Array.from("EncryptedPackage").flatMap((c) => [c.charCodeAt(0), 0]);
    expect(Array.from(bytes.slice(1024, 1024 + name.length))).toEqual(name);
  });

  it("the truncated zip cannot be unzipped", async () => {
    const bytes = truncatedZip(await buildFixtureDocx());
    expect(() => unzipSync(bytes)).toThrow();
  });

  it("the zip without document.xml unzips and lacks only that part", async () => {
    const full = partsOf(await buildFixtureDocx());
    const parts = partsOf(zipWithoutDocumentXml(await buildFixtureDocx()));
    expect(parts["word/document.xml"]).toBeUndefined();
    expect(Object.keys(parts)).toEqual(
      Object.keys(full)
        .filter((n) => n !== "word/document.xml")
        .sort(),
    );
  });

  it("the oversize zip declares less in the central directory than the stream inflates to", () => {
    const zip = oversizePartZip(10, 5000);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const central = Array.from({ length: zip.length - 46 }, (_, i) => i).find(
      (i) => view.getUint32(i, true) === 0x02014b50,
    );
    expect(central).toBeDefined();
    expect(view.getUint32((central as number) + 24, true)).toBe(10);
    // The local header keeps the real compressed size; inflating that stream gives the real length.
    const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    const stream = zip.slice(start, start + view.getUint32(18, true));
    expect(inflateSync(stream).length).toBeGreaterThan(5000);
  });

  it("the edited export differs from the export in exactly one character of word/document.xml", async () => {
    const { original, edited } = await exportAndEditedExport();
    const a = partText(original, "word/document.xml");
    const b = partText(edited, "word/document.xml");
    expect(b.length).toBe(a.length);
    expect(Array.from(a).filter((c, i) => c !== b[i])).toHaveLength(1);
    expect(Array.from(editOneCharacter(original))).toEqual(Array.from(edited));
  });
});
