import type { Result } from "@reveal-codes/engine";
import { err, ok } from "@reveal-codes/engine";
import { strFromU8, unzipSync } from "fflate";
import { notesOf } from "./docx-notes.js";
import type { DocxReadError, DocxText, DocxWithNotes } from "./read-types.js";
import { paragraphsOf } from "./xml-text.js";

const ENTRY = "word/document.xml";
const FOOTNOTES = "word/footnotes.xml";
const ENDNOTES = "word/endnotes.xml";

type Parts = ReadonlyMap<string, string>;

/** Declared (central directory) sizes of the wanted parts; nothing is inflated. */
function declaredSizes(bytes: Uint8Array, wanted: ReadonlySet<string>): Map<string, number> {
  const sizes = new Map<string, number>();
  unzipSync(bytes, {
    filter: (f) => {
      if (wanted.has(f.name)) sizes.set(f.name, f.originalSize);
      return false;
    },
  });
  return sizes;
}

/**
 * The text of each wanted part that is present. With maxPartBytes, a wanted part that
 * declares or yields more bytes than the limit gives part_too_large. Total.
 */
function unpack(
  bytes: Uint8Array,
  wanted: ReadonlySet<string>,
  maxPartBytes?: number,
): Result<Parts, DocxReadError> {
  try {
    if (maxPartBytes !== undefined) {
      for (const size of declaredSizes(bytes, wanted).values()) {
        if (size > maxPartBytes) return err({ kind: "part_too_large" });
      }
    }
    const files = unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
    const parts = new Map<string, string>();
    for (const [name, data] of Object.entries(files)) {
      if (maxPartBytes !== undefined && data.length > maxPartBytes) {
        return err({ kind: "part_too_large" });
      }
      parts.set(name, strFromU8(data));
    }
    return ok(parts);
  } catch {
    return err({ kind: "not_docx" });
  }
}

/** Reads the paragraphs of word/document.xml. Total: never throws. */
export function readDocx(bytes: Uint8Array): Result<DocxText, DocxReadError> {
  const parts = unpack(bytes, new Set([ENTRY]));
  if (!parts.ok) return parts;
  const xml = parts.value.get(ENTRY);
  if (xml === undefined) return err({ kind: "not_docx" });
  return ok(paragraphsOf(xml));
}

/**
 * Reads the paragraphs of word/document.xml and the footnotes then endnotes of their
 * parts, refusing any wanted part over maxPartBytes before inflating it. Total.
 */
export function readDocxWithNotes(
  bytes: Uint8Array,
  limits: Readonly<{ maxPartBytes: number }>,
): Result<DocxWithNotes, DocxReadError> {
  const wanted = new Set([ENTRY, FOOTNOTES, ENDNOTES]);
  const parts = unpack(bytes, wanted, limits.maxPartBytes);
  if (!parts.ok) return parts;
  const xml = parts.value.get(ENTRY);
  if (xml === undefined) return err({ kind: "not_docx" });
  const notes = [
    ...notesOf(parts.value.get(FOOTNOTES) ?? "", "footnote"),
    ...notesOf(parts.value.get(ENDNOTES) ?? "", "endnote"),
  ];
  return ok({ paragraphs: paragraphsOf(xml), notes });
}
