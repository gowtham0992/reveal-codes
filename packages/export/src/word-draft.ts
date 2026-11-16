import { recordedRecord } from "./appendix-parse.js";
import type { RecordedRecord } from "./appendix-parse.js";
import { readDocxWithNotes } from "./docx-read.js";
import { notesBlock } from "./docx-notes.js";
import { holdsEncryptedPackage, isCompoundFile } from "./docx-signature.js";
import { exportDate, splitExport } from "./export-split.js";
import { APPENDIX_TITLE } from "./wording.js";

export type WordLimits = Readonly<{ maxPartBytes: number }>;

export type WordDraft =
  | Readonly<{ kind: "plain"; text: string }>
  | Readonly<{
      kind: "restored";
      record: RecordedRecord;
      exportedOn: string | null;
    }>
  | Readonly<{ kind: "changed"; text: string }>
  | Readonly<{ kind: "refused"; reason: "damaged" | "encrypted" | "no_filing_end" }>;

const DAMAGED: WordDraft = { kind: "refused", reason: "damaged" };

function newlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Classifies a Word file: plain text, a Reveal Codes export restored from its Appendix, an
 * export whose body or Appendix no longer matches, or a refusal. Total; calls no docxSafe.
 */
export function readWordDraft(bytes: Uint8Array, limits: WordLimits): WordDraft {
  if (holdsEncryptedPackage(bytes)) return { kind: "refused", reason: "encrypted" };
  if (isCompoundFile(bytes)) return DAMAGED;
  const read = readDocxWithNotes(bytes, limits);
  if (!read.ok) return DAMAGED;
  const { paragraphs, notes } = read.value;
  if (!paragraphs.includes(APPENDIX_TITLE)) {
    return { kind: "plain", text: newlines(paragraphs.join("\n") + notesBlock(notes)) };
  }
  const split = splitExport(paragraphs);
  if (!split.ok) return { kind: "refused", reason: "no_filing_end" };
  const bodyText = split.value.body.join("\n") + notesBlock(notes);
  const record = recordedRecord(split.value.appendix);
  if (record.ok && record.value.document.text === bodyText) {
    return { kind: "restored", record: record.value, exportedOn: exportDate(paragraphs) };
  }
  return { kind: "changed", text: newlines(bodyText) };
}
