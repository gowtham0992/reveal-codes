import type { CheckRow } from "../client/check-rows";

const FOUND_PREFIX = "This citation is ";

function capitalised(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function onRecord(row: CheckRow): string | null {
  const wrong = row.mismatch[row.mismatch.length - 1];
  const found =
    row.found ??
    (wrong !== undefined && wrong.startsWith(FOUND_PREFIX)
      ? wrong.slice(FOUND_PREFIX.length)
      : null);
  if (found === null) return null;
  const sentence = `On record: ${found.replace(/\.+$/, "")}.`;
  return row.href === null ? sentence : `${sentence} ${row.href}`;
}

function rowLine(row: CheckRow): string {
  const head = `${capitalised(row.words)}: ${row.text.replace(/\.+$/, "")}.`;
  const record = onRecord(row);
  return (record === null ? head : `${head} ${record}`).replaceAll("|", "/");
}

/**
 * Plain text of the results: the Citations line, one line per row, then the date line.
 * `date` is a local `YYYY-MM-DD`, or null when the check time could not be read.
 */
export function copyText(
  rows: readonly CheckRow[],
  citationsLine: string,
  date: string | null,
): string {
  const closing =
    date === null
      ? "Checked with Reveal Codes against CourtListener."
      : `Checked on ${date} with Reveal Codes against CourtListener.`;
  return [citationsLine.replaceAll("|", "/"), ...rows.map(rowLine), closing].join("\n");
}
