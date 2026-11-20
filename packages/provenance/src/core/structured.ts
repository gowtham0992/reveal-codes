/**
 * `structuredSpans`: the Structured_Span list of a Document (Req 12.4, 12.5, 12.8).
 * Lines and columns are 1-based, in UTF-16 code units, end exclusive. Pure; no `node:`.
 */
import type { Document, Origin } from "@reveal-codes/engine";
import { parseRunId } from "./label.js";
import { createLineIndex, positionAt, type LineIndex } from "./lines.js";
/** One span of a Document with its positions and the run it was written in. */
export type StructuredSpan = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  length: number;
  origin: Origin;
  run: string | null;
  taskNumber: string | null;
  taskTitle: string | null;
};
type SpanOf = Document["spans"][number];
function runFields(
  runId: string | undefined,
): Pick<StructuredSpan, "run" | "taskNumber" | "taskTitle"> {
  if (runId === undefined) return { run: null, taskNumber: null, taskTitle: null };
  const name = parseRunId(runId);
  return { run: runId, taskNumber: name.taskNumber, taskTitle: name.title };
}
function toStructured(index: LineIndex, span: SpanOf): StructuredSpan {
  const from = positionAt(index, span.start);
  const to = positionAt(index, span.end);
  const origin = span.provenance.origin;
  const hasRun = origin === "AI" || origin === "AI>HUM";
  return {
    startLine: from.line,
    startColumn: from.column,
    endLine: to.line,
    endColumn: to.column,
    length: span.end - span.start,
    origin,
    ...runFields(hasRun ? span.provenance.runId : undefined),
  };
}
/** The spans of `doc` in file order, each with 1-based start and end positions. */
export function structuredSpans(doc: Pick<Document, "text" | "spans">): StructuredSpan[] {
  const index = createLineIndex(doc.text);
  return doc.spans.map((span) => toStructured(index, span));
}
