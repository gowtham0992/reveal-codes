import { holdsSubstantivePasted } from "@reveal-codes/engine";
import type { Declaration, DeclarationSubject, Document } from "@reveal-codes/engine";
import type { OrderEntry } from "./orders-types.js";
import { isAiSpan } from "./statement-parts.js";

export type SubjectOrNone = DeclarationSubject | "none";

/** True when some span has origin AI or AI>HUM. */
export function holdsAssistantText(document: Document): boolean {
  return document.spans.some(isAiSpan);
}

/** True when the order demands a statement even for a filing that used no AI. */
export function orderRequiresStatement(entry: OrderEntry | null): boolean {
  if (entry === null) return false;
  return (
    entry.kind === "certification_every_filing" ||
    entry.elements.includes("negative_certification_when_unused")
  );
}

/** What the author's Declaration is about, or "none" when no Declaration is asked. */
export function declarationSubject(document: Document, entry: OrderEntry | null): SubjectOrNone {
  if (holdsSubstantivePasted(document)) return "pasted_text";
  if (!holdsAssistantText(document) && orderRequiresStatement(entry)) return "this_filing";
  return "none";
}

/** The stored Declaration when its subject matches the current subject; otherwise null. */
export function applicableDeclaration(
  document: Document,
  entry: OrderEntry | null,
  stored: Declaration | null,
): Declaration | null {
  const subject = declarationSubject(document, entry);
  return stored !== null && subject !== "none" && stored.subject === subject ? stored : null;
}

/** True when a Declaration is asked and none applicable is stored. */
export function declarationRequired(
  document: Document,
  entry: OrderEntry | null,
  stored: Declaration | null,
): boolean {
  return (
    declarationSubject(document, entry) !== "none" &&
    applicableDeclaration(document, entry, stored) === null
  );
}

/** The single definition of AI use for the filing. */
export function usedAi(
  document: Document,
  entry: OrderEntry | null,
  stored: Declaration | null,
): boolean {
  return (
    holdsAssistantText(document) ||
    applicableDeclaration(document, entry, stored)?.choice === "declared_ai"
  );
}
