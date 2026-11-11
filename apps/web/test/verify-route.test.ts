import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BODY_BYTES,
  MAX_RECORDS,
  MAX_TEXT_CHARS,
  handleVerify,
} from "../src/server/verify-route";
import {
  fixturesDeps,
  demoRecords,
  postJson,
  recordingLiveDeps,
  SENTINEL,
} from "./support/route-deps";

afterEach(() => {
  vi.restoreAllMocks();
});

const [first] = demoRecords();
if (first === undefined) throw new Error("demo motion has no full citation");
const FULL = first;

function withValue(value: unknown): unknown {
  return { ...FULL, citation: { ...FULL.citation, value } };
}

async function rejected(body: string, status: number): Promise<void> {
  const { deps, calls } = recordingLiveDeps();
  const res = await handleVerify(postJson(body), deps);
  expect(res.status).toBe(status);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(calls).toHaveLength(0);
  expect(await res.text()).not.toContain(SENTINEL);
}

describe("POST /api/verify rejects bad bodies without calling lookup _Requirements: 16.2_", () => {
  const noKey = { kind: FULL.kind, citation: FULL.citation, result: FULL.result };
  const bad: ReadonlyArray<readonly [string, unknown]> = [
    ["invalid JSON", "{nope"],
    ["null", null],
    ["extra property", { records: [], extra: 1 }],
    ["records missing", {}],
    ["non-array", { records: "x" }],
    ["short-form record", { records: [{ kind: "short", key: "k0", citation: FULL.citation }] }],
    ["missing key", { records: [noKey] }],
    ["non-string key", { records: [{ ...FULL, key: 3 }] }],
    ["no citation", { records: [{ kind: "full", key: "k0" }] }],
    ["null citation value", { records: [withValue(null)] }],
    ["unknown value kind", { records: [withValue({ kind: "other" })] }],
    [
      "reporter without page",
      { records: [withValue({ kind: "reporter", volume: 1, reporter: "U.S." })] },
    ],
    ["parallel with null member", { records: [withValue({ kind: "parallel", members: [null] })] }],
    ["parallel members not array", { records: [withValue({ kind: "parallel", members: 1 })] }],
  ];
  for (const [name, body] of bad) {
    it(`${name} gives 400`, async () => {
      await rejected(typeof body === "string" ? body : JSON.stringify(body), 400);
    });
  }
});

describe("POST /api/verify size limits _Requirements: 16.3_", () => {
  it("501 records give 413", async () => {
    const records = Array.from({ length: MAX_RECORDS + 1 }, () => FULL);
    await rejected(JSON.stringify({ records }), 413);
  });

  it("a body over 262144 bytes gives 413", async () => {
    const padding = "x".repeat(MAX_BODY_BYTES);
    await rejected(JSON.stringify({ records: [], padding }), 413);
  });

  it("a request over 200000 characters gives 413 and the fixed sentence, before any lookup", async () => {
    const { deps, calls } = recordingLiveDeps();
    const body = '{"records":[]}' + " ".repeat(MAX_TEXT_CHARS - 13);
    expect(body.length).toBe(MAX_TEXT_CHARS + 1);
    const res = await handleVerify(postJson(body), deps);
    expect(res.status).toBe(413);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "This document is too long to check in one request.",
    });
    expect(calls).toHaveLength(0);
  });
  it("a request of exactly 200000 characters is read", async () => {
    const body = '{"records":[]}' + " ".repeat(MAX_TEXT_CHARS - 14);
    expect(body.length).toBe(MAX_TEXT_CHARS);
    const res = await handleVerify(postJson(body), fixturesDeps());
    expect(res.status).toBe(200);
  });
  it("keeps the smaller caps: 500 records and 262144 bytes both sit under or beside it", () => {
    expect(MAX_TEXT_CHARS).toBe(200_000);
    expect(MAX_RECORDS).toBe(500);
    expect(MAX_BODY_BYTES).toBe(262_144);
    const typical = JSON.stringify({ records: Array.from({ length: MAX_RECORDS }, () => FULL) });
    expect(typical.length).toBeLessThan(MAX_TEXT_CHARS);
  });
  it("exactly 500 valid records are accepted", async () => {
    const records = Array.from({ length: MAX_RECORDS }, (_, i) => ({
      ...FULL,
      key: `k${String(i)}`,
    }));
    const res = await handleVerify(postJson(JSON.stringify({ records })), fixturesDeps());
    expect(res.status).toBe(200);
  });
});

describe("POST /api/verify against the recorded fixtures _Requirements: 16.1, 16.8_", () => {
  it("returns the pairs for the demo motion citations, with no log output and no token", async () => {
    const log = vi.spyOn(console, "log");
    const err = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    const records = demoRecords();
    const res = await handleVerify(postJson(JSON.stringify({ records })), fixturesDeps());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(text).not.toContain(SENTINEL);
    const pairs = JSON.parse(text) as Array<[string, { status: string; clusterId?: string }]>;
    expect(pairs.map(([key]) => key)).toEqual(records.map((r) => r.key));
    expect(pairs.map(([, r]) => r.status)).toEqual([
      "verified",
      "verified",
      "not_found",
      "not_found",
      "not_found",
    ]);
    expect(pairs[0]?.[1].clusterId).toBe("145875");
    expect(pairs[1]?.[1].clusterId).toBe("108432");
    for (const spy of [log, err, warn]) expect(spy).not.toHaveBeenCalled();
  });

  it("passes unchecked results through with 200", async () => {
    const records = [withValue({ kind: "reporter", volume: 576, reporter: "U.S.", page: 644 })];
    const res = await handleVerify(postJson(JSON.stringify({ records })), fixturesDeps());
    expect(res.status).toBe(200);
    const pairs = (await res.json()) as Array<[string, { status: string }]>;
    expect(pairs[0]?.[1].status).toBe("unchecked");
  });

  it("an empty records array gives 200 and []", async () => {
    const res = await handleVerify(postJson('{"records":[]}'), fixturesDeps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
