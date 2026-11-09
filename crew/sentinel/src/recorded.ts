import { err, ok, parse } from "@reveal-codes/engine";
import type { Document, EngineError, Result } from "@reveal-codes/engine";
import type { SentinelError } from "./types.js";

function describe(error: EngineError): string {
  if (error.kind === "malformed_codes") {
    return `engine error ${error.kind} at index ${String(error.index)}: ${error.rule}`;
  }
  return `engine error ${error.kind}`;
}

/** Rebuilds the Recorded_Document from the Appendix lines. Never throws. */
export function recordedDocument(appendix: readonly string[]): Result<Document, SentinelError> {
  const parsed = parse(appendix.join("\n"));
  if (parsed.ok) return ok(parsed.value);
  return err({ kind: "appendix_unparseable", detail: describe(parsed.error) });
}
