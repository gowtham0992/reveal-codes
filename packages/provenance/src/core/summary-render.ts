/**
 * The plain-text lines of `reveal --summary` (Req 10.13 to 10.17): the order of the sections,
 * the aligned columns, the file list and its unchanged-files line. Pure; no `node:`.
 */
import { humNotice, noPromptSessionsLine } from "./legend.js";
import {
  formatShare,
  ORIGINS,
  type Counts,
  type FileSummary,
  type SessionsCount,
  type Stretch,
  type Summary,
  type WindowRow,
} from "./summary-types.js";

const UNREADABLE =
  "Sessions with no prompt events: the count is unreadable (sessions.json does not parse).";

type Column = { head: string; right: boolean };
const width = (text: string): number => Array.from(text).length;

/** Pads each column to its widest cell, text left and numbers right; no tab, no trailing space. */
export function alignTable(columns: readonly Column[], rows: readonly string[][]): string[] {
  const all = [columns.map((c) => c.head), ...rows];
  const widths = columns.map((_, i) => Math.max(...all.map((r) => width(r[i] ?? ""))));
  return all.map((row) =>
    columns
      .map((c, i) => {
        const cell = row[i] ?? "";
        const pad = " ".repeat((widths[i] ?? 0) - width(cell));
        return c.right ? pad + cell : cell + pad;
      })
      .join("  ")
      .trimEnd(),
  );
}

export function countsLine(counts: Counts, characters: number): string {
  const parts = ORIGINS.map(
    (o) => `${o} ${String(counts[o])} (${formatShare(counts[o], characters)}%)`,
  );
  return `${String(characters)} characters: ${parts.join(", ")}`;
}

function stretchLine(s: Stretch): string {
  const where = `${s.path}:${String(s.firstLine)}-${String(s.lastLine)}`;
  return `${where}  ${String(s.length)} chars  ${s.words}  opened ${s.openedAt ?? "-"}`;
}

function windowTable(windows: readonly WindowRow[]): string[] {
  const columns: Column[] = [
    { head: "Task", right: false },
    { head: "Label", right: false },
    { head: "Opened", right: false },
    { head: "Files", right: true },
    { head: "Runs", right: true },
    { head: "AI", right: true },
    { head: "AI>HUM", right: true },
  ];
  const rows = windows.map((w) => [
    w.taskNumber ?? "-",
    w.title,
    w.openedAt ?? "-",
    String(w.files),
    String(w.runs),
    String(w.ai),
    String(w.aiHuman),
  ]);
  return alignTable(columns, rows);
}

function fileTable(files: readonly FileSummary[]): string[] {
  const columns: Column[] = [
    { head: "File", right: false },
    { head: "Characters", right: true },
    ...ORIGINS.map((o) => ({ head: o, right: true })),
    { head: "", right: false },
  ];
  const rows = files.map((f) => [
    f.path,
    String(f.characters),
    ...ORIGINS.map((o) => `${String(f.counts[o])} (${formatShare(f.counts[o], f.characters)}%)`),
    f.stale ? "stale" : "",
  ]);
  return alignTable(columns, rows);
}

function unchangedLine(n: number): string {
  const files = n === 1 ? "1 file" : `${String(n)} files`;
  return `${files} unchanged since recording started, all [PST].`;
}

export function sessionsLines(sessions: SessionsCount): string[] {
  if (sessions === "unreadable") return [UNREADABLE];
  return sessions > 0 ? [noPromptSessionsLine(sessions)] : [];
}

/** The notice and the sessions line that close every summary (Req 10.9, 10.12). */
export function closingLines(sessions: SessionsCount): string[] {
  return [humNotice(), ...sessionsLines(sessions)];
}

/** The plain-text lines of a non-empty summary, in the order of Req 10.13. */
export function renderSummary(summary: Summary, sessions: SessionsCount): string[] {
  const out = [`Total: ${countsLine(summary.total, summary.totalCharacters)}`];
  out.push("Largest untouched agent stretches:");
  if (summary.stretches.length === 0) out.push("none");
  for (const s of summary.stretches) out.push(stretchLine(s));
  out.push(`AI>HUM characters left out of this list: ${String(summary.omittedAiHuman)}`);
  out.push("Agent text by window:");
  if (summary.windows.length === 0) out.push("none");
  else out.push(...windowTable(summary.windows));
  out.push("Files:", ...fileTable(summary.listed));
  if (!summary.all) out.push(unchangedLine(summary.unchangedCount));
  out.push(...closingLines(sessions));
  return out;
}
