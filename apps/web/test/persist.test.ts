import { declareAi, declareNone, render } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
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

const STAMP = "2026-11-07T14:03:11.000Z";
function roundTrip(
  document: Document,
  runLog: readonly RunLogEntry[] = [],
  verifiedAt: string | null = null,
  declaration: Declaration | null = null,
) {
  const back = deserialise(serialise(document, runLog, verifiedAt, declaration));
  if (!back.ok) throw new Error(`round trip failed: ${back.error.kind}`);
  return back.value;
}

describe("serialise _Requirements: 9.2, 9.7_", () => {
  it("writes version, the full-mode codes and the run log, and nothing else", () => {
    const doc = editedDocument();
    const json: unknown = JSON.parse(serialise(doc, [RUN], STAMP, null));
    expect(json).toEqual({
      version: 1,
      codes: render(doc, "full").text,
      runLog: [RUN],
      verifiedAt: STAMP,
    });
    expect(Object.keys(json as object)).toEqual(["version", "codes", "runLog", "verifiedAt"]);
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
    ["verifiedAt numeric", '{"version":1,"codes":"","runLog":[],"verifiedAt":5}', "bad_shape"],
    ["verifiedAt object", '{"version":1,"codes":"","runLog":[],"verifiedAt":{}}', "bad_shape"],
    ["verifiedAt boolean", '{"version":1,"codes":"","runLog":[],"verifiedAt":true}', "bad_shape"],
    ["unparseable codes", '{"version":1,"codes":"[CIT \\u2713]x","runLog":[]}', "bad_codes"],
  ];
  it.each(cases)("%s gives an Err", (_name, raw, kind) => {
    const r = deserialise(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(kind);
  });
});

describe("verifiedAt _Requirements: 12.4, 12.5, 12.6_", () => {
  it("an old value without the field loads with null", () => {
    const codes = render(freshDocument(), "full").text;
    const r = deserialise(JSON.stringify({ version: 1, codes, runLog: [] }));
    expect(r.ok && r.value.verifiedAt).toBeNull();
  });
});
describe("round trip _Requirements: 9.8_", () => {
  it("carries verifiedAt, string or null", () => {
    const doc = freshDocument();
    expect(roundTrip(doc, [], STAMP).verifiedAt).toBe(STAMP);
    expect(roundTrip(doc, [], null).verifiedAt).toBeNull();
  });
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

function declared(): Declaration {
  const made = declareAi("pasted_text", "ChatGPT (GPT-4o)");
  if (!made.ok) throw new Error("declareAi failed");
  return made.value;
}

describe("declaration _Requirements: 5.1, 5.9, 5.10, 5.11_", () => {
  it("writes the key only when non-null and keeps version 1", () => {
    const doc = freshDocument();
    const without = JSON.parse(serialise(doc, [], null, null)) as Record<string, unknown>;
    expect("declaration" in without).toBe(false);
    const withIt = JSON.parse(serialise(doc, [], null, declared())) as Record<string, unknown>;
    expect(withIt["version"]).toBe(1);
    expect(withIt["declaration"]).toEqual(declared());
  });

  it("round-trips both choices", () => {
    const doc = editedDocument();
    expect(roundTrip(doc, [], null, declared()).declaration).toEqual(declared());
    const none = declareNone("this_filing");
    expect(roundTrip(doc, [], null, none).declaration).toEqual(none);
    expect(roundTrip(doc).declaration).toBeNull();
  });

  it("an unreadable declaration loads as null and the draft loads unchanged", () => {
    const doc = editedDocument();
    const base = JSON.parse(serialise(doc, [RUN], STAMP, null)) as Record<string, unknown>;
    for (const bad of [5, "x", [], { subject: "pasted_text", choice: "declared_ai" }]) {
      const r = deserialise(JSON.stringify({ ...base, declaration: bad }));
      if (!r.ok) throw new Error(`load failed: ${r.error.kind}`);
      expect(r.value.declaration).toBeNull();
      expect(r.value.document).toEqual(doc);
      expect(r.value.runLog).toEqual([RUN]);
    }
  });
});
