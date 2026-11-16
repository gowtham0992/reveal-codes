// Deterministic .docx fixtures for the reader tests (open-draft task 2.1). Test support only.
// Every date is fixed and the zip is rewritten with one fixed entry timestamp, so two runs give the same bytes.
import {
  DeletedTextRun,
  Document as DocxDocument,
  FootnoteReferenceRun,
  InsertedTextRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { buildDocx } from "../../src/index.js";
import { buildDemoDocument } from "./demo-document.js";
import { buildDemoDocumentStatement } from "./demo-statement.js";

export const FIXED_ISO = "2024-01-02T03:04:05.000Z";
const FIXED_REVISION_DATE = "2024-01-02T03:04:05Z";
// fflate reads local-time fields, so a local-time constructor gives the same DOS time on every run.
const FIXED_MTIME = new Date(2024, 0, 2, 4, 6, 8);
const AUTHOR = "Fixture Author";

export const FIXTURE_TEXT = {
  paragraphs: ["First paragraph.", "Second paragraph with a footnote."],
  table: [
    ["Cell A1", "Cell B1"],
    ["Cell A2", "Cell B2"],
  ],
  kept: "Kept ",
  inserted: "inserted text",
  deleted: "deleted text",
  footnotes: ["First footnote.", "Second footnote."],
} as const;

/** Rewrites a part map as a zip with sorted entry order and one fixed timestamp. */
export function zipFixed(
  parts: Readonly<Record<string, Uint8Array>>,
  level: 0 | 6 = 6,
): Uint8Array {
  const out: Zippable = {};
  for (const name of Object.keys(parts).sort()) {
    out[name] = [parts[name] as Uint8Array, { level, mtime: FIXED_MTIME }];
  }
  return zipSync(out);
}

export function partsOf(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

export function partText(bytes: Uint8Array, name: string): string {
  const part = unzipSync(bytes)[name];
  if (part === undefined) throw new Error(`fixture has no part ${name}`);
  return strFromU8(part);
}

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph(text)] });
}

function bodyChildren(): (Paragraph | Table)[] {
  const t = FIXTURE_TEXT;
  const revision = { author: AUTHOR, date: FIXED_REVISION_DATE };
  return [
    new Paragraph(t.paragraphs[0]),
    new Table({ rows: t.table.map((row) => new TableRow({ children: row.map(cell) })) }),
    new Paragraph({
      children: [
        new TextRun(t.kept),
        new InsertedTextRun({ text: t.inserted, id: 1, ...revision }),
        new DeletedTextRun({ text: t.deleted, id: 2, ...revision }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun(t.paragraphs[1]),
        new FootnoteReferenceRun(1),
        new FootnoteReferenceRun(2),
      ],
    }),
  ];
}

/** Paragraphs, a table, a tracked insertion and deletion, and two footnotes. The docx library writes empty endnotes. */
export async function buildFixtureDocx(): Promise<Uint8Array> {
  const file = new DocxDocument({
    creator: AUTHOR,
    lastModifiedBy: AUTHOR,
    title: "Fixture",
    footnotes: {
      1: { children: [new Paragraph(FIXTURE_TEXT.footnotes[0])] },
      2: { children: [new Paragraph(FIXTURE_TEXT.footnotes[1])] },
    },
    sections: [{ children: bodyChildren() }],
  });
  const packed: unknown = await Packer.toBuffer(file);
  if (!ArrayBuffer.isView(packed)) throw new Error("docx packer did not return bytes");
  const raw = new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength);
  return zipFixed(fixDates(partsOf(raw)));
}

/** The library stamps core.xml with the current time; replace both dates. */
function fixDates(parts: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const core = parts["docProps/core.xml"];
  if (core === undefined) throw new Error("docx output has no docProps/core.xml");
  const fixed = strFromU8(core).replace(
    /(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:)/g,
    `$1${FIXED_ISO}$2`,
  );
  return { ...parts, "docProps/core.xml": strToU8(fixed) };
}

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** A compound-file header (as Word writes for a password-protected file) with the EncryptedPackage stream name. */
export function passwordProtectedStandIn(): Uint8Array {
  const out = new Uint8Array(1536);
  out.set(CFB_MAGIC, 0);
  const name = "EncryptedPackage";
  // A directory entry starts with the stream name in UTF-16LE.
  for (let i = 0; i < name.length; i++) out[1024 + i * 2] = name.charCodeAt(i);
  return out;
}

/** The zip with its tail (and so its central directory) cut off. */
export function truncatedZip(bytes: Uint8Array): Uint8Array {
  return bytes.slice(0, Math.floor(bytes.length / 2));
}

/** A valid zip with no word/document.xml. */
export function zipWithoutDocumentXml(bytes: Uint8Array): Uint8Array {
  const kept = Object.entries(partsOf(bytes)).filter(([name]) => name !== "word/document.xml");
  return zipFixed(Object.fromEntries(kept));
}

const CENTRAL_SIGNATURE = 0x02014b50;

/**
 * A zip whose central directory declares `declared` bytes for word/document.xml while the stream inflates to
 * `actual` bytes. The local header and the compressed size are left as they are.
 */
export function oversizePartZip(declared = 10, actual = 200_000): Uint8Array {
  const body = strToU8(`<w:document>${"a".repeat(actual)}</w:document>`);
  const zip = zipFixed({ "word/document.xml": body });
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = 0; i + 46 <= zip.length; i++) {
    if (view.getUint32(i, true) === CENTRAL_SIGNATURE) view.setUint32(i + 24, declared, true);
  }
  return zip;
}

/** `bytes` with one character of the first body text run changed (a letter becomes the next letter). */
export function editOneCharacter(bytes: Uint8Array): Uint8Array {
  const parts = partsOf(bytes);
  const xml = strFromU8(parts["word/document.xml"] ?? new Uint8Array());
  const match = /(<w:t(?:\s[^>]*)?>)([A-Za-z])/.exec(xml);
  if (match === null) throw new Error("fixture has no letter to edit");
  const at = match.index + (match[1] as string).length;
  const letter = match[2] as string;
  const next =
    letter === "z" ? "a" : letter === "Z" ? "A" : String.fromCharCode(letter.charCodeAt(0) + 1);
  const edited = xml.slice(0, at) + next + xml.slice(at + 1);
  return zipFixed({ ...parts, "word/document.xml": strToU8(edited) });
}

/** An export built by the package's own buildDocx from the demo filing, and the same bytes edited by one character. */
export async function exportAndEditedExport(): Promise<{
  original: Uint8Array;
  edited: Uint8Array;
}> {
  const { statement } = await buildDemoDocumentStatement();
  const original = await buildDocx(await buildDemoDocument(), statement);
  return { original, edited: editOneCharacter(original) };
}
