/**
 * The author's Declaration about pasted text (pasted-text-declaration spec).
 * Pure functions over plain data; the Declaration travels beside the Document.
 */
import { err, ok } from "./result.js";
import type { Result } from "./result.js";
import type { Document, Operation } from "./types.js";
import { firstUnpairedSurrogate } from "./validate.js";

export type DeclarationSubject = "pasted_text" | "this_filing";

export type Declaration = Readonly<
  | { subject: DeclarationSubject; choice: "none" }
  | { subject: DeclarationSubject; choice: "declared_ai"; toolName: string }
>;

export type ToolNameFault = "too_short" | "too_long" | "control_character" | "unpaired_surrogate";

export const TOOL_NAME_MIN = 2;
export const TOOL_NAME_MAX = 100;

const CONTROL = /[\p{Cc}\u2028\u2029]/u;
const NON_SPACE = /\P{White_Space}/u;

/** Trims, then checks in the order too_short, too_long, control_character, unpaired_surrogate. */
export function checkToolName(raw: string): Result<string, ToolNameFault> {
  const name = raw.trim();
  if (name.length < TOOL_NAME_MIN) return err("too_short");
  if (name.length > TOOL_NAME_MAX) return err("too_long");
  if (CONTROL.test(name)) return err("control_character");
  if (firstUnpairedSurrogate(name) !== null) return err("unpaired_surrogate");
  return ok(name);
}

export function declareNone(subject: DeclarationSubject): Declaration {
  return { subject, choice: "none" };
}

export function declareAi(
  subject: DeclarationSubject,
  rawToolName: string,
): Result<Declaration, ToolNameFault> {
  const name = checkToolName(rawToolName);
  if (!name.ok) return name;
  return ok({ subject, choice: "declared_ai", toolName: name.value });
}

function isSubject(value: unknown): value is DeclarationSubject {
  return value === "pasted_text" || value === "this_filing";
}

/** Shape, known subject, known choice, trimmed and valid Tool_Name. */
export function isDeclaration(value: unknown): value is Declaration {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { subject?: unknown; choice?: unknown; toolName?: unknown };
  if (!isSubject(v.subject)) return false;
  if (v.choice === "none") return v.toolName === undefined;
  if (v.choice !== "declared_ai" || typeof v.toolName !== "string") return false;
  const checked = checkToolName(v.toolName);
  return checked.ok && checked.value === v.toolName;
}

/** True when a PST span covers at least one character that is not Unicode White_Space. */
export function holdsSubstantivePasted(document: Document): boolean {
  return document.spans.some(
    (s) => s.provenance.origin === "PST" && NON_SPACE.test(document.text.slice(s.start, s.end)),
  );
}

/** True when applying `operation` puts at least one PST character into the Document. */
export function insertsPasted(operation: Operation): boolean {
  if (operation.kind === "insert" || operation.kind === "replace") {
    return operation.text !== "" && operation.provenance.origin === "PST";
  }
  if (operation.kind === "delete") return false;
  const { at, insertText, spans } = operation.restore;
  if (insertText === "") return false;
  const end = at + insertText.length;
  return spans.some((s) => s.provenance.origin === "PST" && s.start < end && s.end > at);
}
