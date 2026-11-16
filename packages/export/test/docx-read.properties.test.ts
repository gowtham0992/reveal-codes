import { Document as DocxDocument, Packer } from "docx";
import { strToU8, zipSync } from "fflate";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { filingParagraph } from "../src/docx-blocks.js";
import { readDocx, readDocxWithNotes } from "../src/index.js";
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
