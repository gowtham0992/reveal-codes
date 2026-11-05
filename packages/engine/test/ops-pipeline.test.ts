import { describe, expect, it } from "vitest";
import { applyDelete } from "../src/ops/delete";
import { applyInsert } from "../src/ops/insert";
import { applyInverse } from "../src/ops/inverse";
import { applyReplace } from "../src/ops/replace";
import { DEFAULT_RELABEL_THRESHOLD } from "../src/ops/validate";
import type { Result } from "../src/result";
import type { Document, Provenance, RunEntry, Span } from "../src/types";

const T1 = "2026-11-03T10:00:00Z";
const T2 = "2026-11-03T10:05:00Z";
const T3 = "2026-11-03T10:09:00Z";
const TH = DEFAULT_RELABEL_THRESHOLD;

const pst = (timestamp = T1): Provenance => ({ origin: "PST", timestamp });
const hum = (timestamp = T2): Provenance => ({ origin: "HUM", timestamp });
const ai = (runId: string, timestamp = T1): Provenance => ({ origin: "AI", runId, timestamp });
const aiHum = (runId: string, timestamp = T1): Provenance => ({
  origin: "AI>HUM",
  runId,
  timestamp,
});
const span = (start: number, end: number, provenance: Provenance): Span => ({
  start,
  end,
  provenance,
});
const run = (
  runId: string,
  originalLength: number,
  editedCount = 0,
  relabelled = false,
): RunEntry => ({
  runId,
  originalLength,
  editedCount,
  relabelled,
});
const doc = (text: string, spans: Span[], runs: RunEntry[] = []): Document => ({
  text,
  spans,
  runs,
  citations: [],
  quotes: [],
  overrides: [],
  keyCounter: 0,
});

function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`unexpected error ${JSON.stringify(result.error)}`);
  return result.value;
}

/** "See 0123456789": four pasted code units, then ten from assistant run r1. */
const mixed = doc("See 0123456789", [span(0, 4, pst()), span(4, 14, ai("r1"))], [run("r1", 10)]);

describe("applyInsert _Requirements: 4.1, 4.8, 6.11_", () => {
  it("splits a PST span around typed text and keeps the pasted Timestamps", () => {
    const pasted = doc("Hello world", [span(0, 11, pst())]);
    const { document, inverse } = unwrap(
      applyInsert(pasted, { kind: "insert", at: 6, text: "big ", provenance: hum() }, TH),
    );
    expect(document.text).toBe("Hello big world");
    expect(document.spans).toEqual([span(0, 6, pst()), span(6, 10, hum()), span(10, 15, pst())]);
    expect(document.runs).toEqual([]);
    expect(unwrap(applyInverse(document, inverse)).document).toEqual(pasted);
  });

  it("creates a Run table entry for an AI insert", () => {
    const pasted = doc("Hi", [span(0, 2, pst())]);
    const op = { kind: "insert", at: 2, text: " there", provenance: ai("r7", T2) } as const;
    const { document } = unwrap(applyInsert(pasted, op, TH));
    expect(document.spans).toEqual([span(0, 2, pst()), span(2, 8, ai("r7", T2))]);
    expect(document.runs).toEqual([run("r7", 6)]);
  });

  it("gives an AI insert into a relabelled Run origin AI>HUM and still adds its length", () => {
    const relabelled = doc("abcd", [span(0, 4, aiHum("r1"))], [run("r1", 4, 3, true)]);
    const op = { kind: "insert", at: 4, text: "ef", provenance: ai("r1", T2) } as const;
    const { document } = unwrap(applyInsert(relabelled, op, TH));
    expect(document.spans).toEqual([span(0, 6, aiHum("r1"))]);
    expect(document.runs).toEqual([run("r1", 6, 3, true)]);
  });

  it("counts a HUM insert strictly inside a Run_Extent", () => {
    const op = { kind: "insert", at: 6, text: "ab", provenance: hum() } as const;
    const { document } = unwrap(applyInsert(mixed, op, TH));
    expect(document.runs).toEqual([run("r1", 10, 2)]);
    expect(document.spans).toEqual([
      span(0, 4, pst()),
      span(4, 6, ai("r1")),
      span(6, 8, hum()),
      span(8, 16, ai("r1")),
    ]);
  });
});

describe("applyDelete _Requirements: 4.4, 6.1, 6.3_", () => {
  it("counts the AI code units a HUM delete removes, and not for actor PST", () => {
    const humDelete = unwrap(
      applyDelete(mixed, { kind: "delete", from: 2, to: 6, actor: "HUM" }, TH),
    );
    expect(humDelete.document.text).toBe("Se23456789");
    expect(humDelete.document.spans).toEqual([span(0, 2, pst()), span(2, 10, ai("r1"))]);
    expect(humDelete.document.runs).toEqual([run("r1", 10, 2)]);
    const pstDelete = unwrap(
      applyDelete(mixed, { kind: "delete", from: 2, to: 6, actor: "PST" }, TH),
    );
    expect(pstDelete.document.runs).toEqual([run("r1", 10)]);
  });

  it("relabels only when the Edited_Proportion is strictly above the threshold", () => {
    const atThreshold = unwrap(
      applyDelete(mixed, { kind: "delete", from: 4, to: 8, actor: "HUM" }, TH),
    );
    expect(atThreshold.document.runs).toEqual([run("r1", 10, 4)]);
    expect(atThreshold.document.spans).toEqual([span(0, 4, pst()), span(4, 10, ai("r1"))]);
    const above = unwrap(applyDelete(mixed, { kind: "delete", from: 4, to: 9, actor: "HUM" }, TH));
    expect(above.document.runs).toEqual([run("r1", 10, 5, true)]);
    expect(above.document.spans).toEqual([span(0, 4, pst()), span(4, 9, aiHum("r1"))]);
    expect(unwrap(applyInverse(above.document, above.inverse)).document).toEqual(mixed);
  });
});

describe("applyReplace _Requirements: 4.6, 6.9_", () => {
  const op = { kind: "replace", from: 6, to: 9, text: "xyz", provenance: hum(T3) } as const;

  it("counts the delete, then the insert against post-delete extents, and relabels once", () => {
    const { document } = unwrap(applyReplace(mixed, op, TH));
    expect(document.text).toBe("See 01xyz56789");
    expect(document.runs).toEqual([run("r1", 10, 6, true)]);
    expect(document.spans).toEqual([
      span(0, 4, pst()),
      span(4, 6, aiHum("r1")),
      span(6, 9, hum(T3)),
      span(9, 14, aiHum("r1")),
    ]);
  });

  it("equals Delete followed by Insert", () => {
    const replaced = unwrap(applyReplace(mixed, op, TH)).document;
    const deleted = unwrap(
      applyDelete(mixed, { kind: "delete", from: 6, to: 9, actor: "HUM" }, TH),
    );
    const ins = { kind: "insert", at: 6, text: "xyz", provenance: hum(T3) } as const;
    expect(replaced).toEqual(unwrap(applyInsert(deleted.document, ins, TH)).document);
  });

  it("returns one Inverse that restores the original Document", () => {
    const { document, inverse } = unwrap(applyReplace(mixed, op, TH));
    expect(inverse.expect).toBe(document);
    expect(unwrap(applyInverse(document, inverse)).document).toEqual(mixed);
  });

  it("is the Delete alone for empty text and the Insert alone for an empty range", () => {
    const asDelete = { kind: "replace", from: 4, to: 9, text: "", provenance: hum() } as const;
    const del = { kind: "delete", from: 4, to: 9, actor: "HUM" } as const;
    expect(unwrap(applyReplace(mixed, asDelete, TH))).toEqual(unwrap(applyDelete(mixed, del, TH)));
    const asInsert = { kind: "replace", from: 6, to: 6, text: "ab", provenance: hum() } as const;
    const ins = { kind: "insert", at: 6, text: "ab", provenance: hum() } as const;
    expect(unwrap(applyReplace(mixed, asInsert, TH))).toEqual(unwrap(applyInsert(mixed, ins, TH)));
  });
});
