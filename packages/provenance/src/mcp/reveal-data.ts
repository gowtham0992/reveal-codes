/**
 * The structured content of `reveal_file` (Req 12.4), decided from the same facts and the same
 * rules as `decideReveal` (io/reveal-file.ts), so the tool and `reveal <file>` cannot disagree.
 * Pure over loaded facts.
 */
import { legendLines } from "../core/legend.js";
import { structuredSpans } from "../core/structured.js";
import type { StructuredSpan } from "../core/structured.js";
import { unchangedDocument } from "../io/load.js";
import type { FileFacts } from "../io/load.js";
import { reasonOf, unrecordedCharacters } from "../io/reveal-file.js";
import type { NotShown } from "../io/reveal-file.js";
import type { RevealFileJson } from "./schemas.js";
type Reason = NotShown | "tampered_record";
type Shown = Pick<RevealFileJson, "status" | "unrecordedCharacters"> & {
  spans: StructuredSpan[];
};
function unrecorded(file: string, reason: Reason): RevealFileJson {
  const status = "unrecorded";
  return { file, status, reason, unrecordedCharacters: 0, spans: [], legend: legendLines("run") };
}
function shown(file: string, how: Shown): RevealFileJson {
  return { file, reason: null, legend: legendLines("run"), ...how };
}
/** A file with no Record whose Baseline_Entry decides: unchanged, stale or not shown. */
function entryData(facts: FileFacts, file: string, text: string): RevealFileJson {
  const { entry, baselineAt, baselineText } = facts;
  if (entry === null || baselineAt === null) return unrecorded(file, "no_record");
  if (facts.read.kind === "text" && facts.read.sha256 === entry.sha256) {
    const doc = unchangedDocument(text, baselineAt);
    if (doc === null) return unrecorded(file, "no_record");
    const spans = structuredSpans(doc);
    return shown(file, { status: "unchanged_baseline", unrecordedCharacters: 0, spans });
  }
  const count = baselineText === null ? text.length : unrecordedCharacters(baselineText, text);
  const doc = baselineText === null ? null : unchangedDocument(baselineText, baselineAt);
  const spans = doc === null ? [] : structuredSpans(doc);
  return shown(file, { status: "stale", unrecordedCharacters: count, spans });
}
/** The `reveal_file` output for `path` (workspace-relative) from its loaded facts. */
export function revealData(facts: FileFacts, path: string): RevealFileJson {
  const { record, read } = facts;
  if (record !== null && !record.ok) return unrecorded(path, "tampered_record");
  const reason = reasonOf(facts);
  if (reason !== null || read.kind !== "text") return unrecorded(path, reason ?? "not_tracked");
  if (record === null) return entryData(facts, path, read.text);
  const spans = structuredSpans(record.doc);
  if (record.text === read.text) {
    return shown(path, { status: "current", unrecordedCharacters: 0, spans });
  }
  const count = unrecordedCharacters(record.text, read.text);
  return shown(path, { status: "stale", unrecordedCharacters: count, spans });
}
/** The text summary: the state of the file and, for a stale file, the line `reveal` prints. */
export function revealLines(data: RevealFileJson): string[] {
  const head = `${data.file}: ${data.status}${data.reason === null ? "" : ` (${data.reason})`}`;
  const counts = `${String(data.spans.length)} spans; ${String(data.unrecordedCharacters)} characters not yet recorded.`;
  return data.status === "unrecorded" ? [head] : [head, counts];
}
