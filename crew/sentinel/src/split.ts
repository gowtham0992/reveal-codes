import { err, ok } from "@reveal-codes/engine";
import type { Document, Result } from "@reveal-codes/engine";
import { APPENDIX_TITLE, STATEMENT_TITLES, buildAppendix } from "@reveal-codes/export";
import type { ExportParts, SentinelError } from "./types.js";

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

/**
 * Splits the paragraphs of an export into the filing body and the Appendix lines.
 * The input is not modified; nothing is trimmed from the body.
 */
export function splitExport(paragraphs: readonly string[]): Result<ExportParts, SentinelError> {
  const s = paragraphs.findIndex((p) => STATEMENT_TITLES.includes(p));
  if (s === -1) return err({ kind: "not_reveal_codes_export" });
  const a = paragraphs.indexOf(APPENDIX_TITLE, s + 1);
  if (a === -1) return err({ kind: "not_reveal_codes_export" });
  return ok({
    body: paragraphs.slice(0, s),
    appendix: paragraphs.slice(a + 1 + INTRO_LENGTH),
  });
}
