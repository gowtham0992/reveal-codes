// Edits of a .docx with fflate alone; the `docx` package is never imported by a test.
import { APPENDIX_TITLE, STATEMENT_TITLE } from "@reveal-codes/export";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const DOCUMENT_PART = "word/document.xml";

/** Unzips `bytes`, applies `edit` to the text of word/document.xml, and zips the result again. */
export function editDocumentXml(bytes: Uint8Array, edit: (xml: string) => string): Uint8Array {
  const parts = unzipSync(bytes);
  const part = parts[DOCUMENT_PART];
  if (part === undefined) throw new Error(`missing part ${DOCUMENT_PART}`);
  return zipSync({ ...parts, [DOCUMENT_PART]: strToU8(edit(strFromU8(part))) });
}

function renameText(xml: string, title: string, replacement: string): string {
  return xml.split(`>${title}</w:t>`).join(`>${replacement}</w:t>`);
}

/** Renames the text of the Statement and Appendix title paragraphs, so the file is no longer an export. */
export function renameTitles(bytes: Uint8Array): Uint8Array {
  return editDocumentXml(bytes, (xml) =>
    renameText(
      renameText(xml, STATEMENT_TITLE, "Renamed Statement"),
      APPENDIX_TITLE,
      "Renamed Appendix",
    ),
  );
}

/** Rebuilds the zip without word/document.xml. */
export function zipWithout(bytes: Uint8Array): Uint8Array {
  const kept = Object.entries(unzipSync(bytes)).filter(([name]) => name !== DOCUMENT_PART);
  return zipSync(Object.fromEntries(kept));
}
