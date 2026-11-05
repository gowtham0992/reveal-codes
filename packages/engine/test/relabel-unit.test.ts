import { describe, expect, it } from "vitest";
import { DEFAULT_RELABEL_THRESHOLD } from "../src/ops/validate";
import { addOriginalLength, countDeleted, countInserted, relabelRuns } from "../src/relabel";
import type { Provenance, RunEntry, Span } from "../src/types";

const T1 = "2026-11-03T10:00:00Z";
const T2 = "2026-11-03T10:05:00Z";

const hum = (timestamp = T1): Provenance => ({ origin: "HUM", timestamp });
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

describe("addOriginalLength _Requirements: 4.8, 4.9_", () => {
  it("creates a new entry in sorted position with count 0 and flag false", () => {
    const runs = [run("a", 3), run("c", 4)];
    expect(addOriginalLength(runs, ai("b"), 5)).toEqual([run("a", 3), run("b", 5), run("c", 4)]);
    expect(addOriginalLength([], ai("r1"), 2)).toEqual([run("r1", 2)]);
  });

  it("orders Run_Ids by UTF-16 code unit, not locale", () => {
    const runs = addOriginalLength(addOriginalLength([], ai("a\\b"), 1), ai("Z"), 1);
    expect(runs.map((r) => r.runId)).toEqual(["Z", "a\\b"]);
  });

  it("adds to an existing entry, including a relabelled one, keeping its count and flag", () => {
    const runs = [run("r1", 10, 6, true)];
    expect(addOriginalLength(runs, ai("r1"), 4)).toEqual([run("r1", 14, 6, true)]);
    expect(runs).toEqual([run("r1", 10, 6, true)]);
  });

  it("leaves the table unchanged for non-AI origins and empty text", () => {
    const runs = [run("r1", 10)];
    expect(addOriginalLength(runs, hum(), 4)).toBe(runs);
    expect(addOriginalLength(runs, { origin: "PST", timestamp: T1 }, 4)).toBe(runs);
    expect(addOriginalLength(runs, aiHum("r1"), 4)).toBe(runs);
    expect(addOriginalLength(runs, ai("r1"), 0)).toBe(runs);
  });
});

describe("countDeleted _Requirements: 6.1, 6.7_", () => {
  const runs = [run("r1", 10), run("r2", 10)];
  const pieces = [
    span(0, 3, ai("r1")),
    span(3, 5, hum()),
    span(5, 9, ai("r2")),
    span(9, 11, ai("r1", T2)),
    span(11, 12, aiHum("r2")),
  ];

  it("adds only the AI code units of each Run under a HUM actor", () => {
    expect(countDeleted(runs, "HUM", pieces)).toEqual([run("r1", 10, 5), run("r2", 10, 4)]);
  });

  it("adds nothing for PST and AI actors", () => {
    expect(countDeleted(runs, "PST", pieces)).toBe(runs);
    expect(countDeleted(runs, "AI", pieces)).toBe(runs);
  });

  it("adds nothing when no AI piece was deleted", () => {
    expect(countDeleted(runs, "HUM", [span(0, 4, hum())])).toBe(runs);
  });
});

describe("countInserted _Requirements: 6.2, 6.7_", () => {
  // r1 extent [2, 10) with a HUM span inside; r2 extent [5, 7) nested in it.
  const spans = [
    span(0, 2, hum()),
    span(2, 5, ai("r1")),
    span(5, 7, ai("r2")),
    span(7, 10, ai("r1")),
    span(10, 12, hum()),
  ];
  const runs = [run("r1", 6), run("r2", 2)];

  it("counts every Run whose extent strictly contains the offset", () => {
    expect(countInserted(runs, "HUM", spans, 6, 3)).toEqual([run("r1", 6, 3), run("r2", 2, 3)]);
    expect(countInserted(runs, "HUM", spans, 3, 2)).toEqual([run("r1", 6, 2), run("r2", 2)]);
  });

  it("counts nothing at either end of an extent", () => {
    expect(countInserted(runs, "HUM", spans, 2, 3)).toBe(runs);
    expect(countInserted(runs, "HUM", spans, 10, 3)).toBe(runs);
    expect(countInserted(runs, "HUM", spans, 5, 3)).toEqual([run("r1", 6, 3), run("r2", 2)]);
    expect(countInserted(runs, "HUM", spans, 7, 3)).toEqual([run("r1", 6, 3), run("r2", 2)]);
  });

  it("counts nothing for PST or AI actors or empty text", () => {
    expect(countInserted(runs, "PST", spans, 6, 3)).toBe(runs);
    expect(countInserted(runs, "AI", spans, 6, 3)).toBe(runs);
    expect(countInserted(runs, "HUM", spans, 6, 0)).toBe(runs);
  });
});

describe("relabelRuns _Requirements: 6.3, 6.4, 6.8, 6.12_", () => {
  it("does not relabel at exactly the threshold, and does just above it", () => {
    const spans = [span(0, 5, ai("r1"))];
    const at = relabelRuns(spans, [run("r1", 5, 2)], DEFAULT_RELABEL_THRESHOLD);
    expect(at.ok && at.value.spans === spans && at.value.relabelled.length === 0).toBe(true);
    const above = relabelRuns(spans, [run("r1", 5, 3)], DEFAULT_RELABEL_THRESHOLD);
    expect(above).toEqual({
      ok: true,
      value: {
        spans: [span(0, 5, aiHum("r1"))],
        runs: [run("r1", 5, 3, true)],
        relabelled: ["r1"],
      },
    });
  });

  it("relabels every span of the Run, merges newly Mergeable neighbours, and leaves other Runs", () => {
    const spans = [
      span(0, 2, ai("r1")),
      span(2, 4, hum()),
      span(4, 6, ai("r1", T2)),
      span(6, 8, ai("r2")),
    ];
    const result = relabelRuns(spans, [run("r1", 4, 2), run("r2", 2)], 0.4);
    expect(result).toEqual({
      ok: true,
      value: {
        spans: [
          span(0, 2, aiHum("r1")),
          span(2, 4, hum()),
          span(4, 6, aiHum("r1", T2)),
          span(6, 8, ai("r2")),
        ],
        runs: [run("r1", 4, 2, true), run("r2", 2)],
        relabelled: ["r1"],
      },
    });
    // Unmerged pieces of one Run are merged by the full normalisation, keeping the
    // lowest-start member's Timestamp (Req 3.3).
    const pieces = [span(0, 3, ai("r1")), span(3, 6, ai("r1", T2))];
    const merged = relabelRuns(pieces, [run("r1", 6, 3)], 0.4);
    expect(merged.ok && merged.value.spans).toEqual([span(0, 6, aiHum("r1"))]);
  });

  it("keeps a relabelled flag sticky when the proportion later falls", () => {
    const spans = [span(0, 20, aiHum("r1"))];
    const runs = [run("r1", 20, 1, true)];
    const result = relabelRuns(spans, runs, 0.4);
    expect(result).toEqual({ ok: true, value: { spans, runs, relabelled: [] } });
    expect(result.ok && result.value.runs).toBe(runs);
  });

  it("relabels a fully deleted Run's entry without touching spans of other Runs", () => {
    const spans = [span(0, 3, hum())];
    const result = relabelRuns(spans, [run("r1", 4, 4)], 0.4);
    expect(result).toEqual({
      ok: true,
      value: { spans, runs: [run("r1", 4, 4, true)], relabelled: ["r1"] },
    });
  });

  it("supports a Replace-style flow: both counts, then one relabel", () => {
    // Doc [AI r1 0..4][HUM 4..8], Replace(1, 2, "xy", HUM): the delete counts 1 (25%),
    // the insert counts 2 strictly inside the post-delete extent [0, 3), total 75%.
    const runs = [run("r1", 4)];
    const deleted = countDeleted(runs, "HUM", [span(1, 2, ai("r1"))]);
    expect(deleted).toEqual([run("r1", 4, 1)]);
    const afterDelete = [span(0, 3, ai("r1")), span(3, 7, hum())];
    const counted = countInserted(deleted, "HUM", afterDelete, 1, 2);
    expect(counted).toEqual([run("r1", 4, 3)]);
    const spliced = [
      span(0, 1, ai("r1")),
      span(1, 3, hum()),
      span(3, 5, ai("r1")),
      span(5, 9, hum()),
    ];
    const result = relabelRuns(spliced, counted, 0.4);
    expect(result.ok && result.value.spans.map((s) => s.provenance.origin)).toEqual([
      "AI>HUM",
      "HUM",
      "AI>HUM",
      "HUM",
    ]);
  });

  it("returns invalid_spans for a non-canonical span list on the relabel path", () => {
    const result = relabelRuns([span(1, 3, ai("r1"))], [run("r1", 2, 2)], 0.4);
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_spans", offset: 0, violation: "gap" },
    });
  });
});
