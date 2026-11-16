import { ellipsize, judgeSurname } from "@reveal-codes/export";
import type { OrderEntry, OrderKind } from "@reveal-codes/export";

/** Where a court's caption sits; derived because the package index does not export the type. */
type CaptionPlacement = NonNullable<OrderEntry["caption"]>["placement"];

export const NO_ORDER_LABEL = "No specific order \u2014 general statement";

export const CONFIDENTIALITY_LABEL =
  "I entered no confidential or business proprietary information into the AI tool.";

export const CONFIDENTIALITY_REQUIRED =
  "The statement is not shown until you tick the confidentiality statement above.";

/** Typed over every kind, so a new kind fails to compile until it has words. */
export const kindWords: Record<OrderKind, string> = {
  certification_every_filing: "Statement in every filing",
  disclosure_when_used: "Disclosure when AI is used",
  prohibition: "AI drafting prohibited",
  verification_only: "Verification required",
  guidance: "Guidance",
};

export const appliesWords: Record<OrderEntry["applies_to"], string> = {
  all: "attorneys and self-represented parties",
  attorneys: "attorneys",
  pro_se: "self-represented parties",
};

/** Typed over every placement, so a new placement fails to compile until it has words. */
export const placementWords: Record<CaptionPlacement, string> = {
  first_page_heading: "Heading on the first page",
  statement_title: "Title of the statement",
  separate_declaration: "Separate declaration",
};

/** Longest title or instrument shown in an option; the year stays visible after it. */
export const OPTION_TEXT_MAX = 80;

/** Option text of the Picker: court-wide entries by instrument, judge entries by surname. */
export function optionText(entry: OrderEntry): string {
  const year = entry.date.slice(0, 4);
  if (entry.judge === null)
    return `Court-wide \u2014 ${ellipsize(entry.instrument, OPTION_TEXT_MAX)} (${year})`;
  return `Judge ${judgeSurname(entry.judge)} \u2014 ${ellipsize(entry.title, OPTION_TEXT_MAX)} (${year})`;
}

export function summaryLine(entry: OrderEntry): string {
  return `${kindWords[entry.kind]} \u00B7 ${appliesWords[entry.applies_to]} \u00B7 ${entry.date}`;
}

/** Real quotation marks (U+201C, U+201D); the Export dialog only. */
export function curlyQuoted(text: string): string {
  return `\u201C${text}\u201D`;
}

export function quoted(text: string): string {
  return `"${text}"`;
}
