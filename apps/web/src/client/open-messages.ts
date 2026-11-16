/** Wording of the Open flow (open-draft Requirements 7, 8, 9, 10, 14, 22). Exact, with no other text. */

export const NOTES_SENTENCE = " Footnotes and endnotes follow the body.";

export const CHANGED_EXPORT_NOTE =
  "This file was changed after it was exported, so its provenance record was not restored. The text is marked as pasted.";

export const SEVERAL_FILES_NOTE = "Open one file at a time. Drop a single file.";
export const SEVERAL_FILES_NOTICE = "Open one file at a time.";

export function couldNotOpen(name: string): string {
  return `Could not open ${name}.`;
}

export function notWordMessage(name: string): string {
  return `${name} is not a Word document, or it is damaged. Save it again as .docx from Word, or choose another file.`;
}

export function passwordMessage(name: string): string {
  return `${name} is password-protected, so it cannot be read. Remove the password in Word, save a copy, and open the copy.`;
}

export function tooLargeMessage(name: string): string {
  return `${name} is larger than 5 MB. Open a smaller file, or paste the text into the page.`;
}

export function tooLongMessage(name: string): string {
  return `${name} holds more than 200,000 characters, which is more than this page can check. Split the filing and open one part.`;
}

export function emptyMessage(name: string): string {
  return `${name} is empty. Choose a file that has text in it.`;
}

export function wrongKindMessage(name: string): string {
  return `${name} is not a .docx, .txt or .md file. Choose one of those.`;
}

export function notUtf8Message(name: string): string {
  return `${name} is not UTF-8 text. Save it as UTF-8 and open it again.`;
}

export function noFilingEndMessage(name: string): string {
  return `${name} has a Provenance Appendix but its filing could not be separated from it. Open the original export, or copy the filing into a new file.`;
}

/** Requirement 22 criterion 5: the sentence for k removed characters, or "" when none. */
export function removedSentence(removed: number): string {
  if (removed < 1) return "";
  if (removed === 1) return " 1 character that Word files cannot store was removed.";
  return ` ${String(removed)} characters that Word files cannot store were removed.`;
}

/** Opened sentence, then removed sentence, then notes sentence. */
export function openedMessage(
  name: string,
  characters: number,
  removed: number,
  hasNotes: boolean,
): string {
  const opened = `Opened ${name}: ${String(characters)} characters, marked as pasted.`;
  return opened + removedSentence(removed) + (hasNotes ? NOTES_SENTENCE : "");
}

/** `exportedOn` is a YYYY-MM-DD string, or null to drop the parenthetical. */
export function reopenedMessage(name: string, exportedOn: string | null): string {
  const base = `Reopened ${name} with its provenance record`;
  return exportedOn === null ? `${base}.` : `${base} (exported ${exportedOn}).`;
}
