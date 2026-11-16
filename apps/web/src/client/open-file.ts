import { readWordDraft } from "@reveal-codes/export";
import { decodeTextFile } from "./open-text";
import {
  notUtf8Message,
  notWordMessage,
  couldNotOpen,
  tooLargeMessage,
  wrongKindMessage,
} from "./open-messages";
import { refusal, textOutcome, wordOutcome } from "./open-outcome";
import type { OpenOutcome } from "./open-outcome";

export const SIZE_LIMIT_BYTES = 5_242_880;
export const PART_SIZE_LIMIT_BYTES = 33_554_432;

/** A `File`, or anything with a name, a size and its bytes. */
export type OpenInput = Readonly<{
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

type FileKind = "word" | "text";

function kindOf(name: string): FileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return "word";
  return lower.endsWith(".txt") || lower.endsWith(".md") ? "text" : null;
}

function classify(name: string, kind: FileKind, bytes: Uint8Array): OpenOutcome {
  if (kind === "word") {
    return wordOutcome(name, readWordDraft(bytes, { maxPartBytes: PART_SIZE_LIMIT_BYTES }));
  }
  const decoded = decodeTextFile(bytes);
  if (!decoded.ok) return refusal(name, notUtf8Message(name), decoded.error.cause);
  return textOutcome(name, decoded.value, { notes: false, note: null });
}

/**
 * Reads one file with the File API and returns what opening it would do. Refusals in order:
 * kind, size (from `size`, before any read), unreadable or encrypted, part size, text limits.
 * Does not touch the Store and makes no network request.
 */
export async function openFile(file: OpenInput): Promise<OpenOutcome> {
  const kind = kindOf(file.name);
  if (kind === null) return refusal(file.name, wrongKindMessage(file.name));
  if (file.size > SIZE_LIMIT_BYTES) return refusal(file.name, tooLargeMessage(file.name));
  const read = await file.arrayBuffer().then(
    (buffer) => ({ ok: true as const, bytes: new Uint8Array(buffer) }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  if (!read.ok) {
    const note = kind === "word" ? notWordMessage(file.name) : couldNotOpen(file.name);
    return refusal(file.name, note, read.cause);
  }
  return classify(file.name, kind, read.bytes);
}
