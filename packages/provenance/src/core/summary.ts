/**
 * `summarize`: the decision and the plain-text output of `reveal --summary [path] [--top n]`
 * (Req 10, design "The Reveal_Command"). A pure function of its input: no clock, no file
 * system, so the same input gives the same output. Pure; no `node:`.
 */
import type { Document, Origin } from "@reveal-codes/engine";
import { humNotice, noPromptSessionsLine } from "./legend.js";
import { describeRun, parseRunId } from "./label.js";
import { createLineIndex, positionAt } from "./lines.js";

/** A Record as loaded, by workspace-relative path. `stale` when its text differs from the file. */
export type SummaryRecord = {
  path: string;
  doc: Pick<Document, "text" | "spans">;
  stale: boolean;
};

/** An Unchanged_File: a Baseline_Entry with no Record. `length` is the file's length. */
export type SummaryUnchanged = { path: string; length: number; stale: boolean };

/** The count of `sessions.json`, or `"unreadable"` when the file does not parse (Req 10.12). */
export type SessionsCount = number | "unreadable";

export type SummaryInput = {
  records: readonly SummaryRecord[];
  unchanged: readonly SummaryUnchanged[];
  /** The path argument (a file or a directory), or null for the whole workspace. */
  path: string | null;
  /** `--top n`; 10 when absent. */
  top?: number;
  sessions: SessionsCount;
};

export type Counts = Record<Origin, number>;
export type FileSummary = { path: string; stale: boolean; characters: number; counts: Counts };

/** One Untouched_Stretch: an `AI` span (Req 10.3). Lines are 1-based. */
export type Stretch = {
  path: string;
  firstLine: number;
  lastLine: number;
  offset: number;
  length: number;
  run: string;
  windowRun: string;
  taskNumber: string | null;
  title: string;
  words: string;
};

/** One row of the table that groups agent text by Window_Run (Req 10.6). */
export type WindowRow = {
  windowRun: string;
  taskNumber: string | null;
  title: string;
  openedAt: string | null;
  files: number;
  runs: number;
  ai: number;
  aiHuman: number;
  words: string;
};

export type Summary = {
  files: FileSummary[];
  total: Counts;
  totalCharacters: number;
  stretches: Stretch[];
  /** Characters of `AI>HUM` spans, which the stretch list leaves out (Req 10.5). */
  omittedAiHuman: number;
  windows: WindowRow[];
};

export type SummaryResult = {
  /** 1 only when nothing is recorded at all (Req 10.10). */
  status: 0 | 1;
  lines: string[];
  text: string;
  /** Null when nothing is recorded, or nothing under the path. */
  summary: Summary | null;
};

const DEFAULT_TOP = 10;
const ORIGINS: readonly Origin[] = ["AI", "AI>HUM", "HUM", "PST"];
const NOTHING_RECORDED = "Nothing is recorded. Run setup_provenance to start recording.";
const UNREADABLE =
  "Sessions with no prompt events: the count is unreadable (sessions.json does not parse).";

function emptyCounts(): Counts {
  return { AI: 0, "AI>HUM": 0, HUM: 0, PST: 0 };
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** The share of `part` in `whole` to one decimal, from integer tenths so no float is printed. */
export function formatShare(part: number, whole: number): string {
  const tenths = whole === 0 ? 0 : Math.round((part * 1000) / whole);
  return `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`;
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
      const words = describeRun(name.taskNumber, name.title);
      const row = {
        windowRun: key,
        taskNumber: name.taskNumber,
        title: name.title,
        openedAt: name.time,
        files: 0,
        runs: 0,
        ai: 0,
        aiHuman: 0,
        words,
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

function buildSummary(
  records: readonly SummaryRecord[],
  unchanged: readonly SummaryUnchanged[],
  top: number,
): Summary {
  const files = [...records.map(recordFile), ...unchanged.map(unchangedFile)].sort((a, b) =>
    compareCodeUnits(a.path, b.path),
  );
  const total = emptyCounts();
  for (const file of files) for (const o of ORIGINS) total[o] += file.counts[o];
  const stretches = records.flatMap(stretchesOf).sort(compareStretches);
  return {
    files,
    total,
    totalCharacters: files.reduce((sum, f) => sum + f.characters, 0),
    stretches: stretches.slice(0, Math.max(0, top)),
    omittedAiHuman: total["AI>HUM"],
    windows: windowRows(records),
  };
}

function countsLine(counts: Counts, characters: number): string {
  const parts = ORIGINS.map(
    (o) => `${o} ${String(counts[o])} (${formatShare(counts[o], characters)}%)`,
  );
  return `${String(characters)} characters: ${parts.join(", ")}`;
}

function stretchLine(s: Stretch): string {
  const lines =
    s.firstLine === s.lastLine
      ? `line ${String(s.firstLine)}`
      : `lines ${String(s.firstLine)}-${String(s.lastLine)}`;
  return `${s.path} ${lines}, ${String(s.length)} characters, ${s.words}, ${s.windowRun}`;
}

function windowLine(w: WindowRow): string {
  const number = w.taskNumber ?? "-";
  const opened = w.openedAt ?? "-";
  return `${number} | ${w.title} | ${opened} | files ${String(w.files)} | runs ${String(w.runs)} | AI ${String(w.ai)} | AI>HUM ${String(w.aiHuman)} | ${w.words}`;
}

function sessionsLines(sessions: SessionsCount): string[] {
  if (sessions === "unreadable") return [UNREADABLE];
  return sessions > 0 ? [noPromptSessionsLine(sessions)] : [];
}

/** The plain-text lines of a non-empty summary. */
export function renderSummary(summary: Summary, sessions: SessionsCount): string[] {
  const out = [`Total: ${countsLine(summary.total, summary.totalCharacters)}`];
  out.push("Files:");
  for (const f of summary.files)
    out.push(`${f.path}${f.stale ? " (stale)" : ""}: ${countsLine(f.counts, f.characters)}`);
  out.push("Largest untouched agent stretches:");
  if (summary.stretches.length === 0) out.push("none");
  for (const s of summary.stretches) out.push(stretchLine(s));
  out.push(`AI>HUM characters left out of this list: ${String(summary.omittedAiHuman)}`);
  out.push("Agent text by window (task number | label | opened | files | runs | AI | AI>HUM):");
  if (summary.windows.length === 0) out.push("none");
  for (const w of summary.windows) out.push(windowLine(w));
  out.push(humNotice(), ...sessionsLines(sessions));
  return out;
}

/** Summarize the Records and Unchanged_Files under `input.path` (Req 10.1 to 10.12). */
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
      : buildSummary(records, unchanged, input.top ?? DEFAULT_TOP);
  const lines =
    summary === null
      ? [`Nothing recorded under ${scope ?? ""}.`, humNotice(), ...sessionsLines(input.sessions)]
      : renderSummary(summary, input.sessions);
  return { status: 0, lines, text: lines.join("\n"), summary };
}
