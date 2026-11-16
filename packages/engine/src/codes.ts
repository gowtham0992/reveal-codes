/**
 * Reveal Codes facade (design A11, A12; Req 20.1, 20.2, 20.6).
 *
 * `parse` runs lex, decode, check, and build in order. It is total: every
 * stage returns a value, and the first fault becomes a `malformed_codes`
 * error carrying the input index and the rule that failed.
 */
import { build } from "./codes/build.js";
import { check } from "./codes/check.js";
import { decodeTokens } from "./codes/decode.js";
import { lexAll } from "./codes/lex.js";
import type { EngineError, MalformedRule } from "./errors.js";
import { err, ok } from "./result.js";
import type { Result } from "./result.js";
import type { Declaration } from "./declaration.js";
import type { Document } from "./types.js";

export { render, renderRecord } from "./codes/render.js";
export { strip, stripPositions } from "./codes/strip.js";

const malformed = (f: Readonly<{ index: number; rule: MalformedRule }>): EngineError => ({
  kind: "malformed_codes",
  index: f.index,
  rule: f.rule,
});

type Fault = Readonly<{ index: number; rule: MalformedRule }>;

function lowestFault(a: Fault | undefined, b: Fault | undefined): Fault | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  return b.index < a.index ? b : a;
}

/** A Document and the author's Declaration read from one Full_Rendering. */
export type DocumentRecord = Readonly<{ document: Document; declaration: Declaration | null }>;

/**
 * Parses a Full_Rendering back into a Document and its optional Declaration.
 * A file with no `d` field gives `declaration: null`. Returns
 * `malformed_codes` for any fault; never throws.
 */
export function parseRecord(revealCodesText: string): Result<DocumentRecord, EngineError> {
  const lexed = lexAll(revealCodesText);
  const decoded = decodeTokens(lexed.tokens);
  // Req 20.3: the lowest index among all syntax faults, lex-level or decode-level.
  // A lex fault wins a tie (it is the more specific report, and lex puts `missing_doc` first).
  const lowest = lowestFault(lexed.fault, decoded.ok ? undefined : decoded.error);
  if (lowest !== undefined) return err(malformed(lowest));
  if (!decoded.ok) return err(malformed(decoded.error));
  const checked = check(decoded.value);
  if (!checked.ok) return err(malformed(checked.error));
  const built = build(checked.value);
  if (!built.ok) return err(malformed(built.error));
  return ok({ document: built.value, declaration: checked.value.draft.declaration ?? null });
}

/** Parses a Full_Rendering into its Document, discarding any Declaration. */
export function parse(revealCodesText: string): Result<Document, EngineError> {
  const record = parseRecord(revealCodesText);
  return record.ok ? ok(record.value.document) : record;
}
