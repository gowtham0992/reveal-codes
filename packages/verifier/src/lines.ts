import { format } from "@reveal-codes/engine";
import type { CitationRecord, IssueKey, ReporterMember } from "@reveal-codes/engine";

/** A Full_Record's lines, or why it has none. */
export type Members = readonly string[] | "database" | "invalid";

export type LineIndex = Readonly<{
  /** Unique Citation_Lines in first-occurrence order (Req 2.3, 2.4). */
  lines: readonly string[];
  /** Per Full_Record key: its member lines in member order, or "database" / "invalid". */
  members: ReadonlyMap<IssueKey, Members>;
}>;

type FullRecord = Extract<CitationRecord, { kind: "full" }>;

/** Citation_Line of one member: the engine's canonical text for a pincite-free reporter value. */
function lineOf(m: ReporterMember): string | null {
  const r = format({ kind: "reporter", volume: m.volume, reporter: m.reporter, page: m.page });
  return r.ok ? r.value : null;
}

function linesOf(members: readonly ReporterMember[]): Members {
  if (members.length === 0) return "invalid";
  const out: string[] = [];
  for (const m of members) {
    const line = lineOf(m);
    if (line === null) return "invalid";
    out.push(line);
  }
  return out;
}

/** Citation_Lines for one Full_Record, in member order (Req 2.5, 5.1, 6.7). */
export function memberLines(record: FullRecord): Members {
  const value = record.citation.value;
  if (value.kind === "database") return "database";
  if (value.kind === "reporter") return linesOf([value]);
  if (value.kind === "parallel") return linesOf(value.members);
  return "invalid";
}

/** Lines and the record-to-lines index for the Full_Records of `records`. Short and other are skipped. */
export function buildLines(records: readonly CitationRecord[]): LineIndex {
  const lines: string[] = [];
  const seen = new Set<string>();
  const members = new Map<IssueKey, Members>();
  for (const rec of records) {
    if (rec.kind !== "full") continue;
    const m = memberLines(rec);
    members.set(rec.key, m);
    if (typeof m === "string") continue;
    for (const line of m) {
      if (seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
    }
  }
  return { lines, members };
}
