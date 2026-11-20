/**
 * The structured content of `untouched_agent_text`, `provenance_summary` and `check_records`
 * (Req 12.5 to 12.7), built from the result of `summarize` and `checkWorkspace`, the functions
 * `reveal --summary` and `reveal --check` use, so a tool and its command cannot disagree. Pure.
 */
import type { Document } from "@reveal-codes/engine";
import type { CheckLine, CheckResult } from "../core/check.js";
import { humNotice, noPromptSessionsLine } from "../core/legend.js";
import { structuredSpans } from "../core/structured.js";
import type { StructuredSpan } from "../core/structured.js";
import { formatShare, ORIGINS } from "../core/summary-types.js";
import type { Counts, FileSummary, SessionsCount, Stretch, Summary } from "../core/summary.js";
import type { CheckRecordsJson, ProvenanceSummaryJson, UntouchedAgentTextJson } from "./schemas.js";
type DocParts = Pick<Document, "text" | "spans">;
/** The structured span that starts at each offset of `doc`. */
function spansByOffset(doc: DocParts): Map<number, StructuredSpan> {
  const spans = structuredSpans(doc);
  return new Map(doc.spans.map((span, i) => [span.start, spans[i] as StructuredSpan]));
}
function shares(counts: Counts, whole: number): Counts {
  const out: Counts = { AI: 0, "AI>HUM": 0, HUM: 0, PST: 0 };
  for (const origin of ORIGINS) out[origin] = Number(formatShare(counts[origin], whole));
  return out;
}
function fileCounts(file: FileSummary) {
  const { path, stale, counts } = file;
  return { path, stale, characters: { ...counts }, shares: shares(counts, file.characters) };
}
function totalCounts(summary: Summary) {
  const stale = summary.files.some((file) => file.stale);
  const counts = { ...summary.total };
  return { path: "", stale, characters: counts, shares: shares(counts, summary.totalCharacters) };
}
/** The structured span of a stretch; the offsets of each file are indexed once. */
function spanFinder(
  docs: ReadonlyMap<string, DocParts>,
): (stretch: Stretch) => StructuredSpan | null {
  const cache = new Map<string, Map<number, StructuredSpan>>();
  return (stretch) => {
    const doc = docs.get(stretch.path);
    if (doc === undefined) return null;
    const index = cache.get(stretch.path) ?? spansByOffset(doc);
    cache.set(stretch.path, index);
    return index.get(stretch.offset) ?? null;
  };
}
function stretchLine(stretch: Stretch, withPath: boolean): string {
  const where =
    stretch.firstLine === stretch.lastLine
      ? `line ${String(stretch.firstLine)}`
      : `lines ${String(stretch.firstLine)} to ${String(stretch.lastLine)}`;
  const place = withPath ? `${stretch.path} ${where}` : where;
  return `${place}: ${String(stretch.length)} characters, ${stretch.words}`;
}
/** `untouched_agent_text` for the one file `path` that `summary` describes; null when it is not one file. */
export function untouchedData(
  path: string,
  summary: Summary,
  docs: ReadonlyMap<string, DocParts>,
): UntouchedAgentTextJson | null {
  const [file] = summary.files;
  if (summary.files.length !== 1 || file === undefined || file.path !== path) return null;
  const find = spanFinder(docs);
  const stretches = summary.stretches.flatMap((s) => find(s) ?? []);
  return {
    path,
    stretches,
    countsByOrigin: { ...file.counts },
    omittedAiHumCharacters: summary.omittedAiHuman,
    stale: file.stale,
    notice: humNotice(),
  };
}
export function untouchedLines(data: UntouchedAgentTextJson, summary: Summary): string[] {
  const { AI } = data.countsByOrigin;
  const stale = data.stale ? " (the file changed after the last recorded event)" : "";
  const head = `${data.path}: ${String(AI)} characters of agent text not touched since written${stale}.`;
  return [head, ...summary.stretches.slice(0, 3).map((s) => stretchLine(s, false)), data.notice];
}
/** The `notice` of `provenance_summary`: the `[HUM]` item and, above 0, the no-prompt-sessions line. */
export function summaryNotice(sessions: SessionsCount): string {
  const count = sessions === "unreadable" ? 0 : sessions;
  return count > 0 ? `${humNotice()}\n${noPromptSessionsLine(count)}` : humNotice();
}
export function summaryData(
  summary: Summary,
  docs: ReadonlyMap<string, DocParts>,
  sessions: SessionsCount,
): ProvenanceSummaryJson {
  const find = spanFinder(docs);
  return {
    files: summary.files.map(fileCounts),
    total: totalCounts(summary),
    windows: summary.windows.map((w) => ({
      windowRun: w.windowRun,
      taskNumber: w.taskNumber,
      taskTitle: w.title,
      openedAt: w.openedAt,
      files: w.files,
      runs: w.runs,
      aiCharacters: w.ai,
      aiHumCharacters: w.aiHuman,
    })),
    stretches: summary.stretches.flatMap((s) => {
      const span = find(s);
      return span === null ? [] : [{ ...span, file: s.path }];
    }),
    omittedAiHumCharacters: summary.omittedAiHuman,
    noPromptEventSessions: sessions === "unreadable" ? 0 : sessions,
    notice: summaryNotice(sessions),
  };
}
export function summaryLines(summary: Summary): string[] {
  const t = summary.total;
  const head = `${String(summary.files.length)} files: ${String(t.AI)} AI, ${String(t["AI>HUM"])} AI>HUM, ${String(t.HUM)} HUM, ${String(t.PST)} PST characters.`;
  return [head, ...summary.stretches.slice(0, 3).map((s) => stretchLine(s, true)), humNotice()];
}
function checkItem(item: CheckLine): { path: string; reason: CheckLine["reason"] } {
  return { path: item.path, reason: item.reason };
}
export function checkData(result: CheckResult, filesChecked: number): CheckRecordsJson {
  return {
    ok: result.status === 0,
    filesChecked,
    failures: result.failures.map(checkItem),
    reports: result.reports.map(checkItem),
  };
}
/** The first lines `reveal --check` prints, at most five. */
export function checkLines(result: CheckResult): string[] {
  return result.lines.slice(0, 5);
}
