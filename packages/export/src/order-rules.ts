import type { Declaration, Document } from "@reveal-codes/engine";
import { aiPassages } from "./ai-paragraphs.js";
import { prohibitionDeclaredLine, subjectPhrase } from "./declaration-wording.js";
import { applicableDeclaration, holdsAssistantText, usedAi } from "./declaration.js";
import { judgeSurname } from "./orders.js";
import type { OrderEntry } from "./orders-types.js";
import { prohibitionLine, prohibitionSubject } from "./wording.js";

/** True when the entry asks for a confidentiality statement and the filing used AI. */
export function needsConfidentiality(
  document: Document,
  entry: OrderEntry | null,
  declaration: Declaration | null,
): boolean {
  return (
    entry !== null &&
    entry.elements.includes("confidentiality") &&
    usedAi(document, entry, declaration)
  );
}

export type ProhibitionNotice = Readonly<{ line: string; keyLanguage: string }>;

function noticeLine(
  document: Document,
  entry: OrderEntry,
  declaration: Declaration | null,
): string {
  const parts = {
    judgeSurname: entry.judge === null ? null : judgeSurname(entry.judge),
    instrument: entry.instrument,
    passages: aiPassages(document),
  };
  const applicable = applicableDeclaration(document, entry, declaration);
  if (holdsAssistantText(document)) {
    const line = prohibitionLine(parts);
    if (applicable?.choice !== "declared_ai") return line;
    return `${line} The author also declared that generative AI was used to prepare ${subjectPhrase(applicable.subject)}.`;
  }
  // usedAi holds without assistant text, so the applicable Declaration is declared_ai.
  const subject = applicable === null ? "pasted_text" : applicable.subject;
  return prohibitionDeclaredLine(prohibitionSubject(parts), subject);
}

/** The Prohibition_Block content, or null unless the entry prohibits AI and the filing used AI. */
export function prohibitionNotice(
  document: Document,
  entry: OrderEntry | null,
  declaration: Declaration | null,
): ProhibitionNotice | null {
  if (entry === null || entry.kind !== "prohibition" || !usedAi(document, entry, declaration)) {
    return null;
  }
  return { line: noticeLine(document, entry, declaration), keyLanguage: entry.key_language };
}
