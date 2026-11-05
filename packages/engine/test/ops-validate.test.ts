import { describe, expect, it } from "vitest";
import { DEFAULT_RELABEL_THRESHOLD, validateCallerOp, validateConfig } from "../src/ops/validate";
import type { CallerOperation, Document, EngineConfig, Provenance } from "../src/types";

const TS = "2026-11-03T10:00:00Z";
// "a😀b": the pair occupies offsets 1 and 2, so offset 2 splits it.
const TEXT = "a\u{1F600}b";

const doc: Document = {
  text: TEXT,
  spans: [{ start: 0, end: TEXT.length, provenance: { origin: "PST", timestamp: TS } }],
  runs: [],
  citations: [],
  quotes: [],
  overrides: [],
  keyCounter: 0,
};

const hum: Provenance = { origin: "HUM", timestamp: TS };

/** Builds a deliberately mis-shaped value to exercise runtime checks. */
const looseOp = (value: Record<string, unknown>): CallerOperation =>
  value as unknown as CallerOperation;
const looseProv = (value: Record<string, unknown>): Provenance => value as unknown as Provenance;
const looseConfig = (value: Record<string, unknown>): EngineConfig => value;

const insert = (at: number, text = "x", provenance: Provenance = hum): CallerOperation => ({
  kind: "insert",
  at,
  text,
  provenance,
});
const del = (from: number, to: number, actor: unknown = "HUM"): CallerOperation =>
  looseOp({ kind: "delete", from, to, actor });
const replace = (
  from: number,
  to: number,
  text = "x",
  provenance: unknown = hum,
): CallerOperation => looseOp({ kind: "replace", from, to, text, provenance });

const errorOf = (op: CallerOperation): unknown => {
  const result = validateCallerOp(doc, op);
  return result.ok ? null : result.error;
};

describe("validateConfig _Requirements: 6.5, 6.6, 6.10_", () => {
  it("uses 0.4 when no config or no threshold is supplied", () => {
    expect(DEFAULT_RELABEL_THRESHOLD).toBe(0.4);
    expect(validateConfig()).toEqual({ ok: true, value: 0.4 });
    expect(validateConfig({})).toEqual({ ok: true, value: 0.4 });
  });

  it("returns a supplied threshold in (0, 1], including 1", () => {
    expect(validateConfig({ relabelThreshold: 0.75 })).toEqual({ ok: true, value: 0.75 });
    expect(validateConfig({ relabelThreshold: 1 })).toEqual({ ok: true, value: 1 });
    expect(validateConfig({ relabelThreshold: Number.MIN_VALUE })).toEqual({
      ok: true,
      value: Number.MIN_VALUE,
    });
  });

  it.each([0, -0.1, 1.0001, Number.NaN, Infinity, -Infinity])("rejects %s", (t) => {
    expect(validateConfig({ relabelThreshold: t })).toEqual({
      ok: false,
      error: { kind: "invalid_config", field: "relabelThreshold", value: t },
    });
  });

  it("rejects a non-number and a present-but-undefined threshold", () => {
    const str = looseConfig({ relabelThreshold: "0.5" });
    const undef = looseConfig({ relabelThreshold: undefined });
    expect(validateConfig(str).ok).toBe(false);
    expect(validateConfig(undef)).toEqual({
      ok: false,
      error: { kind: "invalid_config", field: "relabelThreshold", value: undefined },
    });
  });
});

describe("validateCallerOp accepts valid operations _Requirements: 7.1, 7.3, 7.5_", () => {
  it("returns the operation unchanged", () => {
    const ops = [
      insert(0),
      insert(TEXT.length, "\u{1F600}", { origin: "AI", runId: "r1", timestamp: TS }),
      del(1, 3, "AI>HUM"),
      replace(0, 0),
      del(TEXT.length, TEXT.length),
    ];
    for (const op of ops) expect(validateCallerOp(doc, op)).toEqual({ ok: true, value: op });
  });
});

describe("validateCallerOp out_of_range _Requirements: 7.1_", () => {
  it.each([-1, 5, 1.5, Number.NaN, Infinity])("rejects at = %s", (at) => {
    expect(errorOf(insert(at))).toEqual({
      kind: "out_of_range",
      field: "at",
      value: at,
      length: 4,
    });
  });

  it("names from before to, and to when only to is bad", () => {
    expect(errorOf(del(-1, 9))).toMatchObject({ kind: "out_of_range", field: "from", value: -1 });
    expect(errorOf(replace(0, 9))).toMatchObject({ kind: "out_of_range", field: "to", value: 9 });
  });

  it("rejects a non-number offset", () => {
    const op = looseOp({ kind: "insert", at: "0", text: "x", provenance: hum });
    expect(errorOf(op)).toEqual({ kind: "out_of_range", field: "at", value: "0", length: 4 });
  });
});

describe("validateCallerOp inverted_range _Requirements: 7.2_", () => {
  it("rejects from > to on Delete and Replace", () => {
    expect(errorOf(del(3, 1))).toEqual({ kind: "inverted_range", from: 3, to: 1 });
    expect(errorOf(replace(4, 0))).toEqual({ kind: "inverted_range", from: 4, to: 0 });
  });
});

describe("validateCallerOp split_surrogate _Requirements: 7.3_", () => {
  it("reports a boundary inside a Surrogate_Pair as a document Offset", () => {
    expect(errorOf(insert(2))).toEqual({ kind: "split_surrogate", offset: 2, where: "document" });
    expect(errorOf(del(0, 2))).toEqual({ kind: "split_surrogate", offset: 2, where: "document" });
  });

  it("reports an unpaired surrogate in the inserted text as a text Offset", () => {
    expect(errorOf(insert(0, "ab\uDC00"))).toEqual({
      kind: "split_surrogate",
      offset: 2,
      where: "text",
    });
    expect(errorOf(replace(0, 1, "\uD83D"))).toMatchObject({ offset: 0, where: "text" });
  });

  it("reports a boundary fault before a text fault", () => {
    expect(errorOf(replace(2, 2, "\uD83D"))).toMatchObject({ offset: 2, where: "document" });
  });
});

describe("validateCallerOp invalid_provenance _Requirements: 7.4, 7.5_", () => {
  it("rejects an unknown Origin", () => {
    expect(errorOf(replace(0, 1, "x", { origin: "BOT", timestamp: TS }))).toEqual({
      kind: "invalid_provenance",
      field: "origin",
      value: "BOT",
    });
  });

  it("rejects AI>HUM on Insert and Replace, even with a Run_Id", () => {
    const p: Provenance = { origin: "AI>HUM", runId: "r1", timestamp: TS };
    const expected = { kind: "invalid_provenance", field: "origin", value: "AI>HUM" };
    expect(errorOf(insert(0, "x", p))).toEqual(expected);
    expect(errorOf(replace(0, 1, "x", p))).toEqual(expected);
  });

  it("rejects AI>HUM before the Run_Id rule", () => {
    const p = looseProv({ origin: "AI>HUM", timestamp: TS });
    expect(errorOf(insert(0, "x", p))).toMatchObject({ field: "origin" });
  });

  it("enforces the Run_Id rule", () => {
    const noRun = looseProv({ origin: "AI", timestamp: TS });
    const emptyRun: Provenance = { origin: "AI", runId: "", timestamp: TS };
    const humRun: Provenance = { origin: "HUM", runId: "r1", timestamp: TS };
    expect(errorOf(insert(0, "x", noRun))).toMatchObject({ field: "runId" });
    expect(errorOf(insert(0, "x", emptyRun))).toMatchObject({ field: "runId", value: "" });
    expect(errorOf(replace(0, 1, "x", humRun))).toMatchObject({ field: "runId", value: "r1" });
  });

  it("rejects a Delete Actor outside the four Origins", () => {
    expect(errorOf(del(0, 1, "ROBOT"))).toEqual({
      kind: "invalid_provenance",
      field: "actor",
      value: "ROBOT",
    });
  });
});

describe("validateCallerOp invalid_timestamp _Requirements: 7.4_", () => {
  it("rejects a bad provenance Timestamp", () => {
    const bad: Provenance = { origin: "HUM", timestamp: "2023-02-29T00:00:00Z" };
    expect(errorOf(insert(0, "x", bad))).toEqual({
      kind: "invalid_timestamp",
      value: "2023-02-29T00:00:00Z",
    });
  });
});

describe("validateCallerOp precedence _Requirements: 7.6_", () => {
  const bad = looseProv({ origin: "BOT", timestamp: "never" });

  it("checks out_of_range, inverted_range, split_surrogate, invalid_provenance, invalid_timestamp", () => {
    expect(errorOf(replace(9, 0, "\uD83D", bad))).toMatchObject({ kind: "out_of_range" });
    expect(errorOf(replace(4, 2, "\uD83D", bad))).toMatchObject({ kind: "inverted_range" });
    expect(errorOf(replace(2, 2, "x", bad))).toMatchObject({ kind: "split_surrogate" });
    expect(errorOf(replace(0, 0, "\uD83D", bad))).toMatchObject({ kind: "split_surrogate" });
    expect(errorOf(replace(0, 0, "x", bad))).toMatchObject({ kind: "invalid_provenance" });
    const badTime = looseProv({ origin: "HUM", timestamp: "never" });
    expect(errorOf(replace(0, 0, "x", badTime))).toMatchObject({ kind: "invalid_timestamp" });
  });

  it("reports out_of_range before inverted_range when both apply", () => {
    expect(errorOf(del(4, -1))).toMatchObject({ kind: "out_of_range", field: "to", value: -1 });
  });
});
