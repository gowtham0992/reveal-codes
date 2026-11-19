import { describe, expect, it } from "vitest";
import { decodeBaseline, encodeBaseline } from "../src/core/baseline-codec.js";
import type { Baseline } from "../src/core/types.js";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const BLOB40 = "1".repeat(40);
const AT = "2026-11-19T09:00:00Z";

const withBlob: Baseline = {
  version: 1,
  at: AT,
  files: {
    "b.txt": { sha256: B, blob: BLOB40 },
    "a.txt": { sha256: A, blob: BLOB40 },
    "c/d.ts": { sha256: C, blob: "2".repeat(64) },
  },
};

describe("encodeBaseline", () => {
  it("writes the exact bytes of three entries with blob, sorted by path", () => {
    expect(encodeBaseline(withBlob)).toBe(
      `{\n  "version": 1,\n  "at": "${AT}",\n  "files": {\n` +
        `    "a.txt": { "sha256": "${A}", "blob": "${BLOB40}" },\n` +
        `    "b.txt": { "sha256": "${B}", "blob": "${BLOB40}" },\n` +
        `    "c/d.ts": { "sha256": "${C}", "blob": "${"2".repeat(64)}" }\n  }\n}\n`,
    );
  });

  it("leaves blob out where git is absent", () => {
    const noGit: Baseline = {
      version: 1,
      at: AT,
      files: { y: { sha256: B }, x: { sha256: A }, z: { sha256: C } },
    };
    expect(encodeBaseline(noGit)).toBe(
      `{\n  "version": 1,\n  "at": "${AT}",\n  "files": {\n` +
        `    "x": { "sha256": "${A}" },\n    "y": { "sha256": "${B}" },\n` +
        `    "z": { "sha256": "${C}" }\n  }\n}\n`,
    );
  });

  it("gives the same bytes for the same set in another insertion order", () => {
    const reversed: Baseline = {
      ...withBlob,
      files: Object.fromEntries(Object.entries(withBlob.files).reverse()),
    };
    expect(encodeBaseline(reversed)).toBe(encodeBaseline(withBlob));
  });

  it("round-trips a path with a quote, a backslash and a surrogate pair", () => {
    const path = 'dir/"q"\\b\u{1F600}.txt';
    const baseline: Baseline = { version: 1, at: AT, files: { [path]: { sha256: A } } };
    expect(decodeBaseline(encodeBaseline(baseline))).toEqual({ ok: true, value: baseline });
  });

  it("round-trips an empty file set and keeps a __proto__ path as data", () => {
    const empty: Baseline = { version: 1, at: AT, files: {} };
    expect(decodeBaseline(encodeBaseline(empty))).toEqual({ ok: true, value: empty });
    const decoded = decodeBaseline(
      `{"version":1,"at":"${AT}","files":{"__proto__":{"sha256":"${A}"}}}`,
    );
    expect(decoded.ok && Object.keys(decoded.value.files)).toEqual(["__proto__"]);
  });
});

describe("decodeBaseline errors", () => {
  const good = (files: string): string => `{"version":1,"at":"${AT}","files":${files}}`;
  const entry = (body: string): string => good(`{"p":${body}}`);
  const cases: [string, string][] = [
    ["wrong version", `{"version":2,"at":"${AT}","files":{}}`],
    ["missing at", '{"version":1,"files":{}}'],
    ["invalid at", `{"version":1,"at":"2026-02-30T00:00:00Z","files":{}}`],
    ["uppercase digest", entry(`{"sha256":"${"A".repeat(64)}"}`)],
    ["63-character digest", entry(`{"sha256":"${"a".repeat(63)}"}`)],
    ["41-character blob", entry(`{"sha256":"${A}","blob":"${"1".repeat(41)}"}`)],
    ["uppercase blob", entry(`{"sha256":"${A}","blob":"${"F".repeat(40)}"}`)],
    ["bare string entry", entry(`"${A}"`)],
    ["extra entry key", entry(`{"sha256":"${A}","size":1}`)],
    ["files is an array", good("[]")],
    ["non-JSON", "not json"],
    ["not an object", "[]"],
  ];
  it.each(cases)("returns bad_baseline for %s", (_name, text) => {
    const result = decodeBaseline(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("bad_baseline");
  });
});
