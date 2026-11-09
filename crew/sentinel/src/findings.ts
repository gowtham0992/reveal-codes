import { issues } from "@reveal-codes/engine";
import type { Document, VerificationResult } from "@reveal-codes/engine";
import { ellipsize, localDateTime } from "@reveal-codes/export";
import { firstDifferingLine, lineAt } from "./lines.js";
import type { ReverifyOutcome } from "./reverify.js";
import { quoteText, statusText } from "./status-text.js";
import type { Finding, SentinelError } from "./types.js";

export type FindingInput = Readonly<{
  file: string;
  recorded: Document;
  bodyText: string;
  outcome: ReverifyOutcome;
}>;

/** A middle-group Finding with its sort key (D3). */
type Tagged = Readonly<{ position: number; rank: number; index: number; finding: Finding }>;

const MAX = 80;

export function unreadable(file: string, kind: SentinelError["kind"]): Finding {
  return { kind: "unreadable", file, line: null, before: "", after: kind };
}

function bodyFinding(input: FindingInput): readonly Finding[] {
  const { file, recorded, bodyText } = input;
  if (bodyText === recorded.text) return [];
  const line = firstDifferingLine(recorded.text, bodyText);
  if (line === null) return [];
  const before = recorded.text.split("\n")[line - 1] ?? "";
  const after = bodyText.split("\n")[line - 1] ?? "";
  return [
    {
      kind: "body_edited",
      file,
      line,
      before: ellipsize(before, MAX),
      after: ellipsize(after, MAX),
    },
  ];
}

/** D16: the status differs, or both are verified with different cluster ids. */
function citationDiffers(old: VerificationResult, now: VerificationResult): boolean {
  if (old.status === "verified" && now.status === "verified") {
    return old.clusterId !== now.clusterId;
  }
  return old.status !== now.status;
}

function citationFindings(input: FindingInput): readonly Tagged[] {
  const { file, recorded, outcome } = input;
  const out: Tagged[] = [];
  for (const old of recorded.citations) {
    if (old.kind !== "full") continue;
    const now = outcome.document.citations.find((c) => c.kind === "full" && c.key === old.key);
    if (now?.kind !== "full" || now.result.status === "unchecked") continue;
    if (!citationDiffers(old.result, now.result)) continue;
    const start = old.citation.start;
    out.push({
      position: start,
      rank: 0,
      index: out.length,
      finding: {
        kind: "citation_changed",
        file,
        line: lineAt(recorded.text, start),
        before: statusText(old.result),
        after: statusText(now.result),
      },
    });
  }
  return out;
}

function quoteFindings(input: FindingInput): readonly Tagged[] {
  const { file, recorded, outcome } = input;
  const out: Tagged[] = [];
  for (const old of recorded.quotes) {
    const now = outcome.document.quotes.find((q) => q.key === old.key);
    if (now === undefined || now.result.status === "unchecked") continue;
    if (now.result.status === old.result.status) continue;
    const start = old.quote.start;
    out.push({
      position: start,
      rank: 1,
      index: out.length,
      finding: {
        kind: "quote_changed",
        file,
        line: lineAt(recorded.text, start),
        before: quoteText(old.result),
        after: quoteText(now.result),
      },
    });
  }
  return out;
}

function recordStart(recorded: Document, key: string): number | null {
  const cit = recorded.citations.find((c) => c.kind === "full" && c.key === key);
  if (cit !== undefined) return cit.citation.start;
  const quote = recorded.quotes.find((q) => q.key === key);
  return quote === undefined ? null : quote.quote.start;
}

function overrideFindings(input: FindingInput): readonly Tagged[] {
  const { file, recorded, outcome } = input;
  const live = new Set(issues(outcome.document).map((i) => i.key));
  const out: Tagged[] = [];
  for (const override of recorded.overrides) {
    if (live.has(override.key)) continue;
    const start = recordStart(recorded, override.key);
    out.push({
      position: start ?? Infinity,
      rank: 2,
      index: out.length,
      finding: {
        kind: "override_stale",
        file,
        line: start === null ? null : lineAt(recorded.text, start),
        before: ellipsize(override.reason, MAX),
        after: "no longer an issue",
      },
    });
  }
  return out;
}

function unavailableFinding(input: FindingInput): readonly Finding[] {
  const { file, outcome } = input;
  if (outcome.unavailable === null) return [];
  const waitUntil = outcome.unavailable.waitUntil;
  const date = waitUntil === null ? null : new Date(waitUntil);
  const valid = date !== null && !Number.isNaN(date.getTime());
  return [
    {
      kind: "recheck_unavailable",
      file,
      line: null,
      before: "",
      after: valid ? `retry after ${localDateTime(date)}` : "unavailable",
      waitUntil,
    },
  ];
}

function compareTagged(a: Tagged, b: Tagged): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.index - b.index;
}

/** Pure function of `input`; order follows D3. */
export function deriveFindings(input: FindingInput): readonly Finding[] {
  const middle = [...citationFindings(input), ...quoteFindings(input), ...overrideFindings(input)]
    .map((t, i) => ({ ...t, index: i }))
    .sort(compareTagged)
    .map((t) => t.finding);
  return [...bodyFinding(input), ...middle, ...unavailableFinding(input)];
}
