/**
 * `summarize`: the decision and the plain-text output of `reveal --summary [path] [--top n] [--all]`
 * (Req 10, design "The Reveal_Command"). A pure function of its input: no clock, no file
 * system, so the same input gives the same output. Pure; no `node:`.
 */
import { describeRun, parseRunId } from "./label.js";
import { createLineIndex, positionAt } from "./lines.js";
import { renderSummary, sessionsLines } from "./summary-render.js";
import {
  formatShare,
  ORIGINS,
  type Counts,
  type FileSummary,
  type Stretch,
  type Summary,
  type SummaryInput,
  type SummaryRecord,
  type SummaryResult,
  type SummaryUnchanged,
  type WindowRow,
} from "./summary-types.js";

export { formatShare };
export type {
  Counts,
  FileSummary,
  SessionsCount,
  Stretch,
  Summary,
  SummaryInput,
  SummaryRecord,
  SummaryResult,
  SummaryUnchanged,
  WindowRow,
} from "./summary-types.js";

const DEFAULT_TOP = 10;
const NOTHING_RECORDED = "Nothing is recorded. Run setup_provenance to start recording.";

function emptyCounts(): Counts {
  return { AI: 0, "AI>HUM": 0, HUM: 0, PST: 0 };
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function normalizePath(path: string | null): string | null {
  if (path === null) return null;
  const cleaned = path.replace(/^(\.\/)+/u, "").replace(/\/+$/u, "");
  return cleaned === "" || cleaned === "." ? null : cleaned;
}

function under(path: string, scope: string | null): boolean {
  return scope === null || path === scope || path.startsWith(scope + "/");
}

function windowRunOf(runId: string): string {
  const name = parseRunId(runId);
  return name.n === null ? runId : runId.slice(0, runId.lastIndexOf("."));
}

function recordFile(record: SummaryRecord): FileSummary {
  const counts = emptyCounts();
  for (const span of record.doc.spans) counts[span.provenance.origin] += span.end - span.start;
  return { path: record.path, stale: record.stale, characters: record.doc.text.length, counts };
}

function unchangedFile(file: SummaryUnchanged): FileSummary {
  const counts = { ...emptyCounts(), PST: file.length };
  return { path: file.path, stale: file.stale, characters: file.length, counts };
}

function stretchesOf(record: SummaryRecord): Stretch[] {
  const index = createLineIndex(record.doc.text);
  const out: Stretch[] = [];
  for (const span of record.doc.spans) {
    const run = span.provenance.runId;
    if (span.provenance.origin !== "AI" || span.end <= span.start || run === undefined) continue;
    const name = parseRunId(run);
    out.push({
      path: record.path,
      firstLine: positionAt(index, span.start).line,
      lastLine: positionAt(index, span.end - 1).line,
      offset: span.start,
      length: span.end - span.start,
      run,
      windowRun: windowRunOf(run),
      taskNumber: name.taskNumber,
      title: name.title,
      openedAt: name.time,
      words: describeRun(name.taskNumber, name.title),
    });
  }
  return out;
}

function compareStretches(a: Stretch, b: Stretch): number {
  return b.length - a.length || compareCodeUnits(a.path, b.path) || a.offset - b.offset;
}

type WindowAcc = { row: WindowRow; files: Set<string>; runs: Set<string> };

function windowRows(records: readonly SummaryRecord[]): WindowRow[] {
  const acc = new Map<string, WindowAcc>();
  for (const record of records) {
    for (const span of record.doc.spans) {
      const { origin, runId } = span.provenance;
      if ((origin !== "AI" && origin !== "AI>HUM") || runId === undefined) continue;
      const key = windowRunOf(runId);
      const name = parseRunId(runId);
      const row = {
        windowRun: key,
        taskNumber: name.taskNumber,
        title: name.title,
        openedAt: name.time,
        files: 0,
        runs: 0,
        ai: 0,
        aiHuman: 0,
      };
      const entry = acc.get(key) ?? { row, files: new Set<string>(), runs: new Set<string>() };
      entry.files.add(record.path);
      entry.runs.add(record.path + "\u0000" + runId);
      if (origin === "AI") entry.row.ai += span.end - span.start;
      else entry.row.aiHuman += span.end - span.start;
      acc.set(key, entry);
    }
  }
  return [...acc.values()]
    .map((e) => ({ ...e.row, files: e.files.size, runs: e.runs.size }))
    .sort(compareWindows);
}

function compareWindows(a: WindowRow, b: WindowRow): number {
  if (a.openedAt !== b.openedAt) {
    if (a.openedAt === null) return 1;
    if (b.openedAt === null) return -1;
    return compareCodeUnits(a.openedAt, b.openedAt);
  }
  return compareCodeUnits(a.windowRun, b.windowRun);
}

/** A file the list prints without `--all`: any `AI`, `AI>HUM` or `HUM` text, or stale (Req 10.14). */
function isListed(file: FileSummary): boolean {
  const { AI, "AI>HUM": aiHuman, HUM } = file.counts;
  return file.stale || AI + aiHuman + HUM > 0;
}

function buildSummary(
  records: readonly SummaryRecord[],
  unchanged: readonly SummaryUnchanged[],
  top: number,
  all: boolean,
): Summary {
  const files = [...records.map(recordFile), ...unchanged.map(unchangedFile)].sort((a, b) =>
    compareCodeUnits(a.path, b.path),
  );
  const total = emptyCounts();
  for (const file of files) for (const o of ORIGINS) total[o] += file.counts[o];
  const stretches = records.flatMap(stretchesOf).sort(compareStretches);
  const listed = all ? files : files.filter(isListed);
  return {
    files,
    total,
    totalCharacters: files.reduce((sum, f) => sum + f.characters, 0),
    stretches: stretches.slice(0, Math.max(0, top)),
    omittedAiHuman: total["AI>HUM"],
    windows: windowRows(records),
    listed,
    unchangedCount: files.length - listed.length,
    all,
  };
}

/** Summarize the Records and Unchanged_Files under `input.path` (Req 10.1 to 10.18). */
export function summarize(input: SummaryInput): SummaryResult {
  if (input.records.length === 0 && input.unchanged.length === 0) {
    return { status: 1, lines: [NOTHING_RECORDED], text: NOTHING_RECORDED, summary: null };
  }
  const scope = normalizePath(input.path);
  const records = input.records.filter((r) => under(r.path, scope));
  const unchanged = input.unchanged.filter((u) => under(u.path, scope));
  const summary =
    records.length + unchanged.length === 0
      ? null
      : buildSummary(records, unchanged, input.top ?? DEFAULT_TOP, input.all === true);
  const lines =
    summary === null
      ? [`Nothing recorded under ${scope ?? ""}.`, ...sessionsLines(input.sessions)]
      : renderSummary(summary, input.sessions);
  return { status: 0, lines, text: lines.join("\n"), summary };
}
