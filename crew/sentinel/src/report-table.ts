import type { Finding } from "./types.js";

/** Table labels, one per Finding kind (design D4). */
export const LABELS: Readonly<Record<Finding["kind"], string>> = {
  body_edited: "Body edited",
  citation_changed: "Citation changed",
  quote_changed: "Quote changed",
  override_stale: "Override no longer needed",
  recheck_unavailable: "Recheck unavailable",
  unreadable: "Unreadable",
};

export const TABLE_HEADER = "| Finding | Line | Before | After |";
export const TABLE_SEPARATOR = "| --- | --- | --- | --- |";

/** Escape `|` and flatten line feeds so a value stays inside one table cell. */
export function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function row(finding: Finding): string {
  const line = finding.line === null ? "-" : String(finding.line);
  const cells = [LABELS[finding.kind], line, finding.before, finding.after].map(cell);
  return `| ${cells.join(" | ")} |`;
}

export function table(findings: readonly Finding[]): string {
  return [TABLE_HEADER, TABLE_SEPARATOR, ...findings.map(row)].join("\n");
}
