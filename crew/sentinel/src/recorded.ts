import { err, ok, parseRecord } from "@reveal-codes/engine";
import type { Declaration, Document, EngineError, Result } from "@reveal-codes/engine";
import type { SentinelError } from "./types.js";

export type RecordedRecord = Readonly<{ document: Document; declaration: Declaration | null }>;

function describe(error: EngineError): string {
  if (error.kind === "malformed_codes") {
    return `engine error ${error.kind} at index ${String(error.index)}: ${error.rule}`;
  }
  return `engine error ${error.kind}`;
}

/**
 * Rebuilds the Recorded_Document and the author's Declaration (null when the
 * file carries none, as for a file exported before the Declaration existed)
 * from the Appendix lines. Never throws.
 */
export function recordedRecord(appendix: readonly string[]): Result<RecordedRecord, SentinelError> {
  const parsed = parseRecord(appendix.join("\n"));
  if (parsed.ok) return ok(parsed.value);
  return err({ kind: "appendix_unparseable", detail: describe(parsed.error) });
}

/** Rebuilds the Recorded_Document from the Appendix lines. Never throws. */
export function recordedDocument(appendix: readonly string[]): Result<Document, SentinelError> {
  const record = recordedRecord(appendix);
  return record.ok ? ok(record.value.document) : record;
}
