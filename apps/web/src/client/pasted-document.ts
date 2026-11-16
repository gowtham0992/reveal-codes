import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { noticeForError } from "../notices";

/**
 * One PST insert over an empty Document; the whole text is a single span (Requirement 20).
 * Returns a notice string when the Engine refuses. Callers pass text already made safe by `docxSafe`.
 */
export function pastedDocument(text: string, iso: string): Document | string {
  const empty = createDocument("", iso);
  if (!empty.ok) return noticeForError(empty.error);
  const inserted = apply(empty.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "PST", timestamp: iso },
  });
  return inserted.ok ? inserted.value.document : noticeForError(inserted.error);
}
