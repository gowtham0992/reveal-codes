import { declareAi, declareNone, render } from "@reveal-codes/engine";
import type { Declaration, Document, IssueKey } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { describe, expect, it, vi } from "vitest";
import { AUTOSAVE_KEY, deserialise, serialise } from "../src/persist";
import type { RunLogEntry } from "../src/store";
import { exportDocx } from "../src/client/export-docx";
import { keysOf, withResults } from "./support/case-match-region";
import {
  EXPORT_NOW,
  EXPORT_VERIFIED_AT,
  gateClearDocument,
  storeWith,
} from "./support/export-fixtures";
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

const CITED = "Roe v. Wade, 410 U.S. 113 (1973). Ashcroft v. Iqbal, 556 U.S. 662 (2009).";
const ROE: DisplayInfo = { clusterId: "108713", foundName: "Roe v. Wade", foundYear: 1973 };
const IQBAL: DisplayInfo = {
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
  foundYear: 2009,
  absoluteUrl: "/opinion/145875/ashcroft-v-iqbal/",
};
function citedDocument(): Document {
  return withResults(CITED, [
    { status: "verified", clusterId: "108713" },
    { status: "wrong_case", clusterId: "145875", foundName: "Ashcroft v. Iqbal" },
  ]);
}
function infoFor(doc: Document): ReadonlyMap<IssueKey, DisplayInfo> {
  const [a, b] = keysOf(doc);
  if (a === undefined || b === undefined) throw new Error("fixture lacks two citations");
  return new Map([
    [a, ROE],
    [b, IQBAL],
  ]);
}
function loaded(raw: string) {
  const back = deserialise(raw);
  if (!back.ok) throw new Error(`load failed: ${back.error.kind}`);
  return back.value;
}
describe("resolved field _Requirements: 25.1, 25.2, 25.8, 25.9, 25.10, 25.16_", () => {
  it("writes the entries in key order and round-trips them with version 1", () => {
    const doc = citedDocument();
    const info = infoFor(doc);
    const raw = serialise(doc, [], STAMP, null, info);
    const json = JSON.parse(raw) as Record<string, unknown>;
    expect(json["version"]).toBe(1);
    expect((json["resolved"] as { key: string }[]).map((e) => e.key)).toEqual(keysOf(doc));
    const back = loaded(raw);
    expect(back.document).toEqual(doc);
    expect([...back.resolved]).toEqual([...info]);
  });
  it("writes no field for null or empty info, and holds no draft text beyond codes", () => {
    const doc = citedDocument();
    for (const info of [null, new Map<IssueKey, DisplayInfo>()]) {
      const json = JSON.parse(serialise(doc, [], STAMP, null, info)) as Record<string, unknown>;
      expect("resolved" in json).toBe(false);
    }
    const stored = serialise(doc, [], STAMP, null, infoFor(doc));
    const without = serialise(doc, [], STAMP, null, null);
    const field = (JSON.parse(stored) as { resolved: unknown }).resolved;
    expect(stored).toBe(`${without.slice(0, -1)},"resolved":${JSON.stringify(field)}}`);
    expect(JSON.stringify(field)).not.toContain("Roe v. Wade, 410");
  });
  it("restores the same Document and codes whether or not entries are stored", () => {
    const doc = citedDocument();
    const a = loaded(serialise(doc, [RUN], STAMP, null, infoFor(doc)));
    const b = loaded(serialise(doc, [RUN], STAMP, null, null));
    expect(a.document).toEqual(b.document);
    expect(render(a.document, "full").text).toBe(render(b.document, "full").text);
    expect(b.resolved.size).toBe(0);
  });
  it("does not store an entry for a changed result, a stale clusterId or an unknown key", () => {
    const doc = citedDocument();
    const [a, b] = keysOf(doc);
    if (a === undefined || b === undefined) throw new Error("no keys");
    const info = new Map<IssueKey, DisplayInfo>([
      [a, { ...ROE, clusterId: "1" }],
      [b, IQBAL],
      ["not-a-key", ROE],
    ]);
    const stored = loaded(serialise(doc, [], null, null, info));
    expect([...stored.resolved.keys()]).toEqual([b]);
    const edited = withResults(CITED, [{ status: "not_found" }, { status: "not_found" }]);
    expect("resolved" in (JSON.parse(serialise(edited, [], null, null, info)) as object)).toBe(
      false,
    );
  });
  it("loads a value with no resolved field, with an empty map", () => {
    const base = JSON.parse(serialise(citedDocument(), [], STAMP, null)) as Record<string, unknown>;
    expect("resolved" in base).toBe(false);
    expect(loaded(JSON.stringify(base)).resolved.size).toBe(0);
  });
  it("ignores a non-array field and keeps the rest of the draft", () => {
    const doc = citedDocument();
    const base = JSON.parse(serialise(doc, [RUN], STAMP, null)) as Record<string, unknown>;
    for (const bad of [5, "x", null, { key: "a" }, true]) {
      const back = loaded(JSON.stringify({ ...base, resolved: bad }));
      expect(back.resolved.size).toBe(0);
      expect(back.document).toEqual(doc);
      expect(back.runLog).toEqual([RUN]);
    }
  });
  it("drops each bad entry and keeps the others", () => {
    const doc = citedDocument();
    const [a, b] = keysOf(doc);
    const base = JSON.parse(serialise(doc, [], null, null)) as Record<string, unknown>;
    const good = { key: b, ...IQBAL };
    const bad = [
      null,
      5,
      "x",
      { key: a },
      { key: a, clusterId: 7, foundName: "x" },
      { clusterId: "1", foundName: "x" },
      { key: a, clusterId: "108713", foundName: "x", foundYear: "1973" },
    ];
    const back = loaded(JSON.stringify({ ...base, resolved: [...bad, good] }));
    expect([...back.resolved.keys()]).toEqual([b]);
    expect(back.resolved.get(b as IssueKey)).toEqual(IQBAL);
  });
});
describe("export is unchanged by stored entries _Requirements: 25.16_", () => {
  it("exports the same DOCX bytes whether or not entries are stored", async () => {
    const doc = await gateClearDocument();
    const info = new Map<IssueKey, DisplayInfo>();
    for (const c of doc.citations) {
      if (c.kind === "full" && c.result.status === "verified") {
        info.set(c.key, { clusterId: c.result.clusterId, foundName: "Some v. Case" });
      }
    }
    expect(info.size).toBeGreaterThan(0);
    const bytes: Uint8Array[] = [];
    // The docx package stamps the wall clock into its metadata; fix it so only the input varies.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(EXPORT_NOW);
    for (const withInfo of [info, null]) {
      const back = loaded(serialise(doc, [], EXPORT_VERIFIED_AT, null, withInfo));
      expect(back.resolved.size).toBe(withInfo === null ? 0 : info.size);
      const out = await exportDocx(storeWith(back.document, EXPORT_VERIFIED_AT), {
        now: () => EXPORT_NOW,
        download: (b) => {
          bytes.push(b);
        },
        orderContext: null,
      });
      expect(out.status).toBe("exported");
    }
    vi.useRealTimers();
    expect(Array.from(bytes[0] ?? [])).toEqual(Array.from(bytes[1] ?? [1]));
  });
});
