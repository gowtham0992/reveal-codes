import type { Result } from "@reveal-codes/engine";
import { err, ok } from "@reveal-codes/engine";
import { strFromU8, unzipSync } from "fflate";
import type { DocxReadError, DocxText } from "./read-types.js";
import { paragraphsOf } from "./xml-text.js";

const ENTRY = "word/document.xml";

/** Reads the paragraphs of word/document.xml. Total: never throws. */
export function readDocx(bytes: Uint8Array): Result<DocxText, DocxReadError> {
  let xml: string | undefined;
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === ENTRY });
    const entry = files[ENTRY];
    xml = entry === undefined ? undefined : strFromU8(entry);
  } catch {
    return err({ kind: "not_docx" });
  }
  if (xml === undefined) return err({ kind: "not_docx" });
  return ok(paragraphsOf(xml));
}
