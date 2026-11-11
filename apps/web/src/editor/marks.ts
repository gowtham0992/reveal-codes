import { issues } from "@reveal-codes/engine";
import type { Document, IssueCode } from "@reveal-codes/engine";

/** One page mark: a Document text range (UTF-16 offsets), its Issue code and its hover title. */
export type MarkRange = Readonly<{
  start: number;
  end: number;
  code: "CIT ✘" | "CIT ?" | "QUO ✘";
  title: string;
}>;

const TITLES: Readonly<Partial<Record<IssueCode, string>>> = {
  "CIT ✘": "Citation not found",
  "CIT ?": "Citation ambiguous",
  "QUO ✘": "Quotation not in the opinion",
};

function isMarked(code: IssueCode): code is MarkRange["code"] {
  return code === "CIT ✘" || code === "CIT ?" || code === "QUO ✘";
}

/** Ranges for the Issues that are not found, ambiguous or a quote mismatch, in Engine order (Req 11.1, 11.2). */
export function markRanges(document: Document): readonly MarkRange[] {
  const ranges: MarkRange[] = [];
  for (const issue of issues(document)) {
    const title = TITLES[issue.code];
    if (!isMarked(issue.code) || title === undefined) continue;
    ranges.push({ start: issue.start, end: issue.end, code: issue.code, title });
  }
  return ranges;
}
