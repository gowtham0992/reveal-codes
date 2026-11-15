import { issues, verificationOf } from "@reveal-codes/engine";
import type { Document, IssueCode, IssueKey } from "@reveal-codes/engine";

/** One page mark: a Document text range (UTF-16 offsets), its Issue code and its hover title. */
export type MarkRange = Readonly<{
  start: number;
  end: number;
  code: "CIT ✘" | "CIT ≠" | "CIT ?" | "QUO ✘";
  title: string;
}>;

const TITLES: Readonly<Partial<Record<IssueCode, string>>> = {
  "CIT ✘": "Citation not found",
  "CIT ≠": "Citation is a different case",
  "CIT ?": "Citation ambiguous",
  "QUO ✘": "Quotation not in the opinion",
};

function isMarked(code: IssueCode): code is MarkRange["code"] {
  return code === "CIT ✘" || code === "CIT ≠" || code === "CIT ?" || code === "QUO ✘";
}

function titleFor(document: Document, key: IssueKey, code: IssueCode): string | undefined {
  if (code !== "CIT ≠") return TITLES[code];
  const result = verificationOf(document, key);
  if (result === null || result.status !== "wrong_case") return TITLES[code];
  const year = result.foundYear === undefined ? "" : ` (${result.foundYear})`;
  return `This citation is ${result.foundName}${year}`;
}

/** Ranges for the Issues that are not found, ambiguous or a quote mismatch, in Engine order (Req 11.1, 11.2). */
export function markRanges(document: Document): readonly MarkRange[] {
  const ranges: MarkRange[] = [];
  for (const issue of issues(document)) {
    const title = titleFor(document, issue.key, issue.code);
    if (!isMarked(issue.code) || title === undefined) continue;
    ranges.push({ start: issue.start, end: issue.end, code: issue.code, title });
  }
  return ranges;
}
