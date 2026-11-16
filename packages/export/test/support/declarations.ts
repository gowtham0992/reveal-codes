import { declareAi, declareNone } from "@reveal-codes/engine";
import type { Declaration, DeclarationSubject, Document } from "@reveal-codes/engine";
import { declarationSubject } from "../../src/declaration.js";
import type { OrderEntry } from "../../src/orders-types.js";

/** The author's Declaration that no generative AI was used. */
export function noneFor(subject: DeclarationSubject): Declaration {
  return declareNone(subject);
}

/** The author's Declaration that generative AI was used, naming the tool. */
export function aiFor(subject: DeclarationSubject, tool = "ChatGPT (GPT-4o)"): Declaration {
  const made = declareAi(subject, tool);
  if (!made.ok) throw new Error(`declaration rejected: ${made.error}`);
  return made.value;
}

/**
 * A Declaration that makes the statement buildable for this Document and order:
 * None for whatever subject is asked, or null when none is asked.
 */
export function declarationFor(document: Document, entry: OrderEntry | null): Declaration | null {
  const subject = declarationSubject(document, entry);
  return subject === "none" ? null : noneFor(subject);
}
