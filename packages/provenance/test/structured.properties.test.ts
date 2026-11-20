import fc from "fast-check";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { structuredSpans } from "../src/core/structured.js";
import { KNOWN_WINDOWS, arbBuiltRecord } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

type Pos = { line: number; column: number };

/** Line and column of `offset`, by walking the text one code unit at a time. */
function walk(text: string, offset: number): Pos {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      column = 1;
    } else column++;
  }
  return { line, column };
}

/** The offset that `pos` names, found by walking the text; null if no such position exists. */
function offsetOf(text: string, pos: Pos): number | null {
  for (let i = 0; i <= text.length; i++) {
    const at = walk(text, i);
    if (at.line === pos.line && at.column === pos.column) return i;
  }
  return null;
}

const windowOf = (runId: string): (typeof KNOWN_WINDOWS)[number] | undefined =>
  KNOWN_WINDOWS.find((w) =>
    new RegExp(`^${w.windowRun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+$`).test(runId),
  );

function check(doc: Document): void {
  const out = structuredSpans(doc);
  expect(out).toHaveLength(doc.spans.length);
  expect(out.reduce((n, s) => n + s.length, 0)).toBe(doc.text.length);
  const first = out[0];
  if (first !== undefined) expect([first.startLine, first.startColumn]).toEqual([1, 1]);
  const last = out[out.length - 1];
  const end = walk(doc.text, doc.text.length);
  if (last !== undefined) expect([last.endLine, last.endColumn]).toEqual([end.line, end.column]);
  out.forEach((s, i) => {
    const src = doc.spans[i];
    if (src === undefined) throw new Error("missing span");
    expect(s.length).toBe(src.end - src.start);
    expect(s.origin).toBe(src.provenance.origin);
    expect(offsetOf(doc.text, { line: s.startLine, column: s.startColumn })).toBe(src.start);
    expect(offsetOf(doc.text, { line: s.endLine, column: s.endColumn })).toBe(src.end);
    const prev = out[i - 1];
    if (prev !== undefined) {
      expect([s.startLine, s.startColumn]).toEqual([prev.endLine, prev.endColumn]);
    }
    checkRun(s, src.provenance.origin, src.provenance.runId);
  });
}

function checkRun(
  s: ReturnType<typeof structuredSpans>[number],
  origin: string,
  runId: string | undefined,
): void {
  if (origin === "HUM" || origin === "PST") {
    expect([s.run, s.taskTitle, s.taskNumber]).toEqual([null, null, null]);
    return;
  }
  const w = runId === undefined ? undefined : windowOf(runId);
  expect(w).toBeDefined();
  expect(s.run).toBe(runId);
  expect(s.taskTitle).toBe(w?.title);
  expect(s.taskNumber).toBe(w?.taskNumber);
}

describe("structuredSpans properties _Requirements: 12.4, 12.5, 12.8_", () => {
  // Property 11
  it("covers the file exactly, with positions that convert back to the Document's offsets", () => {
    fc.assert(
      fc.property(arbBuiltRecord, (doc) => {
        check(doc);
      }),
      { numRuns: runs(process.env) },
    );
  });
});
