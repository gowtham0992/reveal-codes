import type { Document } from "@reveal-codes/engine";
import { aiPassages } from "./ai-paragraphs.js";
import { judgeSurname } from "./orders.js";
import type { OrderEntry } from "./orders-types.js";
import { usedAi } from "./statement-parts.js";
import { prohibitionLine } from "./wording.js";

/** True when the entry asks for a confidentiality statement and the document holds AI text. */
export function needsConfidentiality(document: Document, entry: OrderEntry | null): boolean {
  return entry !== null && entry.elements.includes("confidentiality") && usedAi(document);
}

export type ProhibitionNotice = Readonly<{ line: string; keyLanguage: string }>;

/** The Prohibition_Block content, or null unless the entry prohibits AI and AI text remains. */
export function prohibitionNotice(
  document: Document,
  entry: OrderEntry | null,
): ProhibitionNotice | null {
  if (entry === null || entry.kind !== "prohibition" || !usedAi(document)) return null;
  const line = prohibitionLine({
    judgeSurname: entry.judge === null ? null : judgeSurname(entry.judge),
    instrument: entry.instrument,
    passages: aiPassages(document),
  });
  return { line, keyLanguage: entry.key_language };
}
