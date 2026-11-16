import type { Declaration, Document } from "@reveal-codes/engine";
import { docxSafe } from "@reveal-codes/export";
import type { WordDraft } from "@reveal-codes/export";
import { MAX_TEXT_CHARS } from "../limits";
import {
  CHANGED_EXPORT_NOTE,
  SEVERAL_FILES_NOTE,
  SEVERAL_FILES_NOTICE,
  couldNotOpen,
  emptyMessage,
  noFilingEndMessage,
  notWordMessage,
  openedMessage,
  passwordMessage,
  reopenedMessage,
  tooLongMessage,
} from "./open-messages";
import { restoreNote } from "./open-note";

/** The Store is not touched here: the caller confirms, then dispatches `replace`, `notice` and `openNote`. */
export type OpenOutcome =
  | Readonly<{
      kind: "refused";
      /** Toolbar message: "Could not open <name>." */
      notice: string;
      /** Open_Note giving the reason. */
      note: string;
      /** The unexpected failure behind the refusal, when there was one. */
      cause?: unknown;
    }>
  | Readonly<{
      kind: "text";
      /** Text after `docxSafe`; one PST span, Declaration null, empty run log, no check date. */
      text: string;
      /** Docx_Unsafe_Characters removed (also stated in `notice`). */
      removed: number;
      notice: string;
      /** CHANGED_EXPORT_NOTE for a changed export, else null. */
      note: string | null;
    }>
  | Readonly<{
      kind: "restored";
      /** Installed as recorded: no `docxSafe`, empty run log, no check date. */
      document: Document;
      declaration: Declaration | null;
      notice: string;
      note: string | null;
    }>;

export function refusal(
  name: string,
  note: string,
  cause?: unknown,
): Extract<OpenOutcome, { kind: "refused" }> {
  const base = { kind: "refused", notice: couldNotOpen(name), note } as const;
  return cause === undefined ? base : { ...base, cause };
}

/** Requirement 14 criterion 8: a drop of several files. */
export function severalFilesOutcome(): OpenOutcome {
  return { kind: "refused", notice: SEVERAL_FILES_NOTICE, note: SEVERAL_FILES_NOTE };
}

/** Empty (White_Space only) or over MAX_TEXT_CHARS: the refusal note, else null. */
function limitNote(name: string, text: string): string | null {
  if (text.length > MAX_TEXT_CHARS) return tooLongMessage(name);
  return /^\s*$/.test(text) ? emptyMessage(name) : null;
}

const NOTES_BLOCK = /\n\nFootnotes\n1\. /;

/** Text from a Text_File (`notes` false) or a Word file: docxSafe, then the text limits. */
export function textOutcome(
  name: string,
  raw: string,
  extra: Readonly<{ notes: boolean; note: string | null }>,
): OpenOutcome {
  const safe = docxSafe(raw);
  const refused = limitNote(name, safe.text);
  if (refused !== null) return refusal(name, refused);
  return {
    kind: "text",
    text: safe.text,
    removed: safe.removed,
    notice: openedMessage(name, safe.text.length, safe.removed, extra.notes),
    note: extra.note,
  };
}

/** A readable Word file classified by `readWordDraft`. Restored text gets the limits but not docxSafe. */
export function wordOutcome(name: string, draft: WordDraft): OpenOutcome {
  switch (draft.kind) {
    case "refused":
      return refusal(name, refusalNote(name, draft.reason));
    case "plain":
      return textOutcome(name, draft.text, { notes: NOTES_BLOCK.test(draft.text), note: null });
    case "changed":
      return textOutcome(name, draft.text, {
        notes: NOTES_BLOCK.test(draft.text),
        note: CHANGED_EXPORT_NOTE,
      });
    case "restored": {
      const { document, declaration } = draft.record;
      const refused = limitNote(name, document.text);
      if (refused !== null) return refusal(name, refused);
      return {
        kind: "restored",
        document,
        declaration,
        notice: reopenedMessage(name, draft.exportedOn),
        note: restoreNote(document),
      };
    }
  }
}

function refusalNote(name: string, reason: "damaged" | "encrypted" | "no_filing_end"): string {
  if (reason === "encrypted") return passwordMessage(name);
  return reason === "damaged" ? notWordMessage(name) : noFilingEndMessage(name);
}
