import { issues } from "@reveal-codes/engine";
import type { Document, Issue, IssueCode, IssueKey } from "@reveal-codes/engine";
import { courtListenerLink } from "@reveal-codes/verifier/link";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { divergenceWords } from "./divergence";
import { mismatchLines, mismatchOf } from "./mismatch";

export const MAX_ISSUE_TEXT = 80;

export type RowCode = "CIT ✓" | "CIT ✘" | "CIT ≠" | "CIT ?" | "CIT …" | "QUO ✓" | "QUO ✘" | "QUO …";

/** The editor's words for each status (the failing words are the Issues row words). */
export const STATUS_WORDS: Readonly<Record<RowCode, string>> = {
  "CIT ✓": "found",
  "CIT ✘": "not found",
  "CIT ≠": "wrong case",
  "CIT ?": "ambiguous",
  "CIT …": "unchecked",
  "QUO ✓": "match",
  "QUO ✘": "quote not found in opinion",
  "QUO …": "quote unchecked",
};

/** The words of the Verify result's tally lines. */
export const TALLY_WORDS = {
  found: STATUS_WORDS["CIT ✓"],
  wrongCase: STATUS_WORDS["CIT ≠"],
  notFound: STATUS_WORDS["CIT ✘"],
  ambiguous: STATUS_WORDS["CIT ?"],
  notChecked: "not checked",
  match: STATUS_WORDS["QUO ✓"],
  notInOpinion: "not in the opinion",
} as const;

/** The one plain sentence of what to do next, per failing status. */
export const NEXT_SENTENCES: Readonly<Record<IssueCode, string>> = {
  "CIT ✘":
    "Look for this case yourself before you rely on it; CourtListener may not hold it, or the citation may be wrong.",
  "CIT ≠":
    "Open the opinion at the link and check that it is the case you meant; if it is not, correct the name or the citation.",
  "CIT ?":
    "More than one case matches this citation, so look it up yourself to find the one you mean.",
  "CIT …":
    "This citation was not checked; check again in a moment, or look it up yourself before you rely on it.",
  "QUO ✘":
    "Compare this quotation with the opinion itself, and correct the wording or the citation before you rely on it.",
  "QUO …":
    "This quotation was not checked; read it against the opinion yourself before you rely on it.",
};

/** Text shortened to at most 80 characters (code points), the last being an ellipsis. */
export function shorten(text: string): string {
  const points = Array.from(text);
  if (points.length <= MAX_ISSUE_TEXT) return text;
  return `${points.slice(0, MAX_ISSUE_TEXT - 1).join("")}…`;
}

/** Divergence_Words for a `QUO ✘` row, computed from the current Document. */
export function divergenceFor(document: Document, issue: Issue): string | null {
  if (issue.code !== "QUO ✘") return null;
  const rec = document.quotes.find((q) => q.key === issue.key);
  if (rec === undefined || rec.result.status !== "mismatch") return null;
  return divergenceWords(document.text.slice(issue.start, issue.end), rec.result.prefixLength);
}

export type WrongCase = Readonly<{ lines: readonly string[]; href: string | null }>;

/** The mismatch lines and link of a `wrong_case` Issue, from the Document and session Display_Info. */
export function wrongCaseFor(
  document: Document,
  issue: Issue,
  info: ReadonlyMap<IssueKey, DisplayInfo> | undefined,
): WrongCase | null {
  if (issue.code !== "CIT ≠") return null;
  const m = mismatchOf(document, issue.key);
  if (m === null) return null;
  const shown = info?.get(issue.key);
  const url = shown?.clusterId === m.clusterId ? shown.absoluteUrl : undefined;
  return { lines: mismatchLines(m), href: courtListenerLink(m.clusterId, url) };
}

/** The case name and year on record: `Name (Year)`, or the name alone. */
export function foundText(info: DisplayInfo): string {
  return info.foundYear === undefined
    ? info.foundName
    : `${info.foundName} (${String(info.foundYear)})`;
}

/** `info` only when it belongs to `clusterId`; otherwise undefined. */
export function displayFor(
  clusterId: string,
  info: DisplayInfo | undefined,
): DisplayInfo | undefined {
  return info !== undefined && info.clusterId === clusterId ? info : undefined;
}

export type CheckRow = Readonly<{
  key: IssueKey;
  kind: "citation" | "orphan" | "quote";
  start: number;
  end: number;
  code: RowCode;
  /** Status words, without a "blocking, " prefix. */
  words: string;
  /** The text as written, unshortened. */
  text: string;
  /** Case name and year on record; null when unknown. */
  found: string | null;
  /** Mismatch lines of a wrong-case citation; empty otherwise. */
  mismatch: readonly string[];
  /** Divergence words of a quotation not in the opinion; null otherwise. */
  divergence: string | null;
  href: string | null;
  /** The Next_Sentence of a failing row; null otherwise. */
  next: string | null;
}>;

function failingRow(
  document: Document,
  issue: Issue,
  info: ReadonlyMap<IssueKey, DisplayInfo> | undefined,
): CheckRow {
  const wrong = wrongCaseFor(document, issue, info);
  return {
    key: issue.key,
    kind: issue.kind,
    start: issue.start,
    end: issue.end,
    code: issue.code,
    words: STATUS_WORDS[issue.code],
    text: document.text.slice(issue.start, issue.end),
    found: null,
    mismatch: wrong?.lines ?? [],
    divergence: divergenceFor(document, issue),
    href: wrong?.href ?? null,
    next: NEXT_SENTENCES[issue.code],
  };
}

function citationRow(
  document: Document,
  c: Extract<Document["citations"][number], { kind: "full" }>,
  clusterId: string,
  info: ReadonlyMap<IssueKey, DisplayInfo> | undefined,
): CheckRow {
  const shown = displayFor(clusterId, info?.get(c.key));
  return {
    key: c.key,
    kind: "citation",
    start: c.citation.start,
    end: c.citation.end,
    code: "CIT ✓",
    words: STATUS_WORDS["CIT ✓"],
    text: document.text.slice(c.citation.start, c.citation.end),
    found: shown === undefined ? null : foundText(shown),
    mismatch: [],
    divergence: null,
    href: courtListenerLink(clusterId, shown?.absoluteUrl),
    next: null,
  };
}

function quoteRow(document: Document, q: Document["quotes"][number]): CheckRow {
  return {
    key: q.key,
    kind: "quote",
    start: q.quote.start,
    end: q.quote.end,
    code: "QUO ✓",
    words: STATUS_WORDS["QUO ✓"],
    text: document.text.slice(q.quote.start, q.quote.end),
    found: null,
    mismatch: [],
    divergence: null,
    href: null,
    next: null,
  };
}

function passingRows(
  document: Document,
  info: ReadonlyMap<IssueKey, DisplayInfo> | undefined,
): CheckRow[] {
  const rows: CheckRow[] = [];
  for (const c of document.citations) {
    if (c.kind === "full" && c.result.status === "verified")
      rows.push(citationRow(document, c, c.result.clusterId, info));
  }
  for (const q of document.quotes)
    if (q.result.status === "match") rows.push(quoteRow(document, q));
  return rows;
}

/**
 * One row per full citation, orphan short form and quotation, sorted by `(start, kind)` with a
 * citation before a quotation at an equal start. Failing rows are exactly `issues(document)`.
 */
export function checkRows(
  document: Document,
  info: ReadonlyMap<IssueKey, DisplayInfo> | undefined,
): readonly CheckRow[] {
  const failing = issues(document).map((i) => failingRow(document, i, info));
  const rank = (r: CheckRow): number => (r.kind === "quote" ? 1 : 0);
  return [...failing, ...passingRows(document, info)].sort(
    (a, b) => a.start - b.start || rank(a) - rank(b),
  );
}
