import type { Document, IssueKey } from "@reveal-codes/engine";

export type Mismatch = Readonly<{ cited: string | null; found: string; clusterId: string }>;

/** The wrong_case citation `key` of `document`: `cited` read from the record's `caseName`, `found` as `<foundName> (<foundYear>)`. */
export function mismatchOf(document: Document, key: IssueKey): Mismatch | null {
  const rec = document.citations.find((c) => c.kind === "full" && c.key === key);
  if (rec?.kind !== "full" || rec.result.status !== "wrong_case") return null;
  const { clusterId, foundName, foundYear } = rec.result;
  const year = foundYear === undefined ? "" : ` (${String(foundYear)})`;
  return { cited: rec.citation.caseName ?? null, found: `${foundName}${year}`, clusterId };
}

/** The lines in order: `Cited as <cited>` when `cited` is not null, then `This citation is <found>`. */
export function mismatchLines(m: Mismatch): readonly string[] {
  const found = `This citation is ${m.found}`;
  return m.cited === null ? [found] : [`Cited as ${m.cited}`, found];
}

/** The Override_Dialog lines of `issue`: only for a `CIT ≠` issue whose record is wrong_case, else null. */
export function overrideMismatch(
  document: Document,
  issue: Readonly<{ code: string; key: IssueKey }>,
): readonly string[] | null {
  if (issue.code !== "CIT ≠") return null;
  const m = mismatchOf(document, issue.key);
  return m === null ? null : mismatchLines(m);
}
