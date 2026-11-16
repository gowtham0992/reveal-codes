import { Document as DocxDocument, Packer } from "docx";
import { strToU8, zipSync } from "fflate";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { filingParagraph } from "../src/docx-blocks.js";
import { notesBlock, notesOf, readDocx, readDocxWithNotes } from "../src/index.js";
import { arbParagraphs, runs } from "./support/arbitraries.js";

async function packParagraphs(paragraphs: readonly string[]): Promise<Uint8Array> {
  const file = new DocxDocument({
    sections: [{ children: paragraphs.map(filingParagraph) }],
  });
  const packed: unknown = await Packer.toBuffer(file);
  if (!ArrayBuffer.isView(packed)) throw new Error("docx packer did not return bytes");
  return new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength);
}

describe("docx reader round trip _Requirements: 6.2, 6.3, 6.8, 6.9, 18.2, 18.3_", () => {
  // Property 1
  it("P1 readDocx of filingParagraph output joins to the paragraphs joined by newline", async () => {
    await fc.assert(
      fc.asyncProperty(arbParagraphs, async (paragraphs) => {
        const read = readDocx(await packParagraphs(paragraphs));
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.value.join("\n")).toBe(paragraphs.join("\n"));
      }),
      { numRuns: runs() },
    );
  });
});

type TotalityCase =
  | Readonly<{ tag: "bytes"; bytes: Uint8Array }>
  | Readonly<{ tag: "truncated"; paragraphs: string[]; keep: number }>
  | Readonly<{ tag: "parts"; document: string; footnotes: string }>
  | Readonly<{ tag: "valid"; paragraphs: string[] }>;

const arbTotalityCase: fc.Arbitrary<TotalityCase> = fc.oneof(
  fc.uint8Array({ maxLength: 512 }).map((bytes) => ({ tag: "bytes" as const, bytes })),
  fc
    .record({ paragraphs: arbParagraphs, keep: fc.double({ min: 0, max: 1, noNaN: true }) })
    .map((c) => ({ tag: "truncated" as const, ...c })),
  fc
    .record({ document: fc.string({ maxLength: 200 }), footnotes: fc.string({ maxLength: 200 }) })
    .map((c) => ({ tag: "parts" as const, ...c })),
  arbParagraphs.map((paragraphs) => ({ tag: "valid" as const, paragraphs })),
);

const LIMITS = { maxPartBytes: 1 << 20 };
const KINDS: readonly string[] = ["not_docx", "part_too_large"];

async function bytesOf(c: TotalityCase): Promise<Uint8Array> {
  if (c.tag === "bytes") return c.bytes;
  if (c.tag === "parts") {
    return zipSync({
      "word/document.xml": strToU8(c.document),
      "word/footnotes.xml": strToU8(c.footnotes),
    });
  }
  const whole = await packParagraphs(c.paragraphs);
  return c.tag === "valid" ? whole : whole.slice(0, Math.floor(whole.length * c.keep));
}

describe("docx reader totality _Requirements: 1.6_", () => {
  // Property 9
  it("P9 readDocx and readDocxWithNotes return a Result with a declared error kind", async () => {
    await fc.assert(
      fc.asyncProperty(arbTotalityCase, async (c) => {
        const bytes = await bytesOf(c);
        const plain = readDocx(bytes);
        const withNotes = readDocxWithNotes(bytes, LIMITS);
        for (const r of [plain, withNotes]) {
          if (!r.ok) expect(KINDS).toContain(r.error.kind);
        }
        expect(plain.ok).toBe(withNotes.ok);
        if (c.tag === "valid") {
          expect(plain.ok && plain.value.join("\n")).toBe(c.paragraphs.join("\n"));
          expect(withNotes.ok && withNotes.value.paragraphs.join("\n")).toBe(
            c.paragraphs.join("\n"),
          );
        }
        if (c.tag === "truncated" && c.keep < 0.5) expect(plain.ok).toBe(false);
      }),
      { numRuns: runs() },
    );
  });
});

type NoteEntry = Readonly<{
  shape: "text" | "empty" | "blank" | "sepId" | "sepType" | "sepContinuation";
  text: string;
}>;

const arbNoteEntry: fc.Arbitrary<NoteEntry> = fc.record({
  shape: fc.constantFrom("text", "text", "text", "empty", "blank", "sepId", "sepType", "sepContinuation"),
  text: fc.stringMatching(/^[A-Za-z0-9]+( [A-Za-z0-9]+){0,3}$/),
});

const arbNoteEntries = fc.array(arbNoteEntry, { maxLength: 6 });

function noteXml(tag: "footnote" | "endnote", entry: NoteEntry, index: number): string {
  const para = (t: string): string => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const id = String(index + 1);
  switch (entry.shape) {
    case "text":
      return `<w:${tag} w:id="${id}">${para(entry.text)}</w:${tag}>`;
    case "empty":
      return `<w:${tag} w:id="${id}"><w:p/></w:${tag}>`;
    case "blank":
      return `<w:${tag} w:id="${id}">${para("   ")}</w:${tag}>`;
    case "sepId":
      return `<w:${tag} w:id="${index % 2 === 0 ? "-1" : "0"}">${para(entry.text)}</w:${tag}>`;
    case "sepType":
      return `<w:${tag} w:type="separator" w:id="${id}">${para(entry.text)}</w:${tag}>`;
    case "sepContinuation":
      return `<w:${tag} w:type="continuationSeparator" w:id="${id}">${para(entry.text)}</w:${tag}>`;
  }
}

function partXml(tag: "footnote" | "endnote", entries: readonly NoteEntry[]): string {
  const body = entries.map((e, i) => noteXml(tag, e, i)).join("");
  return `<w:${tag}s xmlns:w="w">${body}</w:${tag}s>`;
}

describe("note numbering _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_", () => {
  // Property 12
  it("P12 notes are numbered 1..N without separators, footnotes then endnotes", () => {
    fc.assert(
      fc.property(arbNoteEntries, arbNoteEntries, (footnotes, endnotes) => {
        const flat = [
          ...notesOf(partXml("footnote", footnotes), "footnote"),
          ...notesOf(partXml("endnote", endnotes), "endnote"),
        ];
        const expected = [...footnotes, ...endnotes]
          .filter((e) => e.shape === "text")
          .map((e) => e.text);
        expect(flat).toEqual(expected);
        const block = notesBlock(flat);
        if (expected.length === 0) {
          expect(block).toBe("");
          return;
        }
        const lines = expected.map((t, i) => `${String(i + 1)}. ${t}`);
        expect(block).toBe(`\n\nFootnotes\n${lines.join("\n")}`);
      }),
      { numRuns: runs() },
    );
  });
});
