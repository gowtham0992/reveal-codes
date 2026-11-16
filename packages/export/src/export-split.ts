import { err, ok } from "@reveal-codes/engine";
import type { Document, Result } from "@reveal-codes/engine";
import { buildAppendix } from "./appendix.js";
import type { ExportParts } from "./read-types.js";
import { APPENDIX_TITLE, STATEMENT_TITLES } from "./wording.js";

export type SplitError = Readonly<{ kind: "not_reveal_codes_export" }>;

// A Document with no content: only intro.length is used, so the count of intro
// sentences is read from the Export_Package and not written as a literal.
const EMPTY_DOCUMENT: Document = {
  text: "",
  spans: [],
  runs: [],
  citations: [],
  quotes: [],
  overrides: [],
  keyCounter: 0,
};
const INTRO_LENGTH = buildAppendix(EMPTY_DOCUMENT).intro.length;

/** The last paragraph before `end` that equals a statement title, or -1. */
function lastTitleBefore(paragraphs: readonly string[], end: number): number {
  for (let i = end - 1; i >= 0; i -= 1) {
    if (STATEMENT_TITLES.includes(paragraphs[i] ?? "")) return i;
  }
  return -1;
}

/**
 * Splits the paragraphs of an export into the filing body and the Appendix lines.
 * The input is not modified; nothing is trimmed from the body.
 *
 * The export ends with the Appendix, whose lines are the Reveal Codes serialisation and so
 * never equal its title; the Appendix title is therefore the last paragraph equal to it. The
 * body is cut at the last statement title before that, because the filing's own text may hold
 * a line equal to a title (a bare "AI Certification", say) and the Statement follows the filing.
 */
export function splitExport(paragraphs: readonly string[]): Result<ExportParts, SplitError> {
  const a = paragraphs.lastIndexOf(APPENDIX_TITLE);
  const s = a === -1 ? -1 : lastTitleBefore(paragraphs, a);
  if (s === -1) return err({ kind: "not_reveal_codes_export" });
  return ok({
    body: paragraphs.slice(0, s),
    appendix: paragraphs.slice(a + 1 + INTRO_LENGTH),
  });
}

/**
 * The export date line: the paragraph just before the last Appendix title, when it has the
 * shape YYYY-MM-DD, else null. Nothing else is checked.
 */
export function exportDate(paragraphs: readonly string[]): string | null {
  const a = paragraphs.lastIndexOf(APPENDIX_TITLE);
  if (a < 1) return null;
  const line = paragraphs[a - 1] ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(line) ? line : null;
}
