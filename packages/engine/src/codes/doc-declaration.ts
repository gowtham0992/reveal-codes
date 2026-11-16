/**
 * The `d` field of `[DOC]`: `d=<subject>,<choice>[,<toolName>]`
 * (pasted-text-declaration, design D6). Values are escaped by the existing
 * payload escaping in `codeString`, so a Tool_Name needs no further rule.
 */
import { isDeclaration } from "../declaration.js";
import type { Declaration } from "../declaration.js";
import type { CodeField } from "./syntax.js";

export const DECLARATION_KEY = "d";

/** The `d` field for a Declaration. The caller guarantees `isDeclaration(declaration)`. */
export function encodeDeclaration(declaration: Declaration): CodeField {
  const values =
    declaration.choice === "declared_ai"
      ? [declaration.subject, declaration.choice, declaration.toolName]
      : [declaration.subject, declaration.choice];
  return { key: DECLARATION_KEY, values };
}

/**
 * Decodes the unescaped values of a `d` field. Returns `undefined` for an
 * unknown subject or choice, a wrong value count, a missing or extra
 * Tool_Name, or an invalid or untrimmed Tool_Name.
 */
export function decodeDeclaration(values: readonly string[]): Declaration | undefined {
  const [subject, choice, toolName] = values;
  if (values.length < 2 || values.length > 3) return undefined;
  const candidate: unknown =
    toolName === undefined ? { subject, choice } : { subject, choice, toolName };
  return isDeclaration(candidate) ? candidate : undefined;
}
