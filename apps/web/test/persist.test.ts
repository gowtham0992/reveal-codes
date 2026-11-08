import { render } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { AUTOSAVE_KEY, deserialise, serialise } from "../src/persist";
import type { RunLogEntry } from "../src/store";
import {
  editedDocument,
  freshDocument,
  overriddenDocument,
  verifiedDemoDocument,
} from "./support/persist-fixtures";

const RUN: RunLogEntry = {
  runId: "r1",
  provider: "fixture",
  modelId: null,
  prompt: "Draft a [sentence]",
  timestamp: "2026-11-02T12:00:00.000Z",
};

function roundTrip(document: Document, runLog: readonly RunLogEntry[] = []) {
  const back = deserialise(serialise(document, runLog));
  if (!back.ok) throw new Error(`round trip failed: ${back.error.kind}`);
  return back.value;
}

describe("serialise _Requirements: 9.2, 9.7_", () => {
  it("writes version, the full-mode codes and the run log, and nothing else", () => {
    const doc = editedDocument();
    const json: unknown = JSON.parse(serialise(doc, [RUN]));
    expect(json).toEqual({ version: 1, codes: render(doc, "full").text, runLog: [RUN] });
  });

  it("uses the documented key", () => {
    expect(AUTOSAVE_KEY).toBe("reveal-codes:document:v1");
  });
});

describe("deserialise failures _Requirements: 9.4_", () => {
  const cases: readonly (readonly [string, string | null, string])[] = [
    ["absent", null, "absent"],
    ["not JSON", "{nope", "not_json"],
    ["a JSON array", "[]", "bad_shape"],
    ["null", "null", "bad_shape"],
    ["wrong version", '{"version":2,"codes":"","runLog":[]}', "bad_shape"],
    ["codes not a string", '{"version":1,"codes":5,"runLog":[]}', "bad_shape"],
    ["runLog not an array", '{"version":1,"codes":"","runLog":{}}', "bad_shape"],
    ["malformed run entry", '{"version":1,"codes":"","runLog":[{"runId":1}]}', "bad_shape"],
    ["unparseable codes", '{"version":1,"codes":"[CIT \\u2713]x","runLog":[]}', "bad_codes"],
  ];
  it.each(cases)("%s gives an Err", (_name, raw, kind) => {
    const r = deserialise(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(kind);
  });
});

describe("round trip _Requirements: 9.8_", () => {
  it("fresh document", () => {
    const doc = freshDocument();
    expect(roundTrip(doc).document).toEqual(doc);
  });

  it("edited document with brackets, backslash and an emoji", () => {
    const doc = editedDocument();
    expect(doc.spans.length).toBeGreaterThan(1);
    expect(roundTrip(doc).document).toEqual(doc);
  });

  it("document verified with an override, and the run log", () => {
    const doc = overriddenDocument();
    expect(doc.overrides).toHaveLength(1);
    const back = roundTrip(doc, [RUN]);
    expect(back.document).toEqual(doc);
    expect(back.runLog).toEqual([RUN]);
  });

  it("demo motion after a recorded Verify", async () => {
    const doc = await verifiedDemoDocument();
    const statuses = doc.citations.flatMap((c) => (c.kind === "full" ? [c.result.status] : []));
    expect(statuses).toContain("verified");
    expect(statuses).toContain("not_found");
    expect(doc.quotes.map((q) => q.result.status)).toContain("match");
    expect(doc.quotes.map((q) => q.result.status)).toContain("mismatch");
    expect(roundTrip(doc).document).toEqual(doc);
  });
});
