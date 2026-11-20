import { describe, expect, it } from "vitest";
import type { Baseline } from "../src/core/types.js";
import { createBaselineCache } from "../src/io/baseline-cache.js";
import { memoryDeps } from "./support/memory-deps.js";
const DIR = "/ws/.kiro/provenance/cache";
const A = "a".repeat(64);
const B = "b".repeat(64);
const AT = "2026-01-01T00:00:00Z";
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
function baselineOf(...digests: string[]): Baseline {
  return {
    version: 1,
    at: AT,
    files: Object.fromEntries(digests.map((d, i) => [`f${String(i)}`, { sha256: d }])),
  };
}
function setup() {
  const deps = memoryDeps();
  return { deps, cache: createBaselineCache(deps, DIR) };
}
describe("baseline cache", () => {
  it("writes cache/<digest> by a temporary file and a rename and reads it back", async () => {
    const { deps, cache } = setup();
    const written = await cache.write(A, bytes("text"));
    expect(written.ok).toBe(true);
    expect(deps.fs.text(`${DIR}/${A}`)).toBe("text");
    expect([...deps.fs.files.keys()].filter((p) => p.includes(".tmp-"))).toEqual([]);
    expect(await cache.read(A)).toEqual(bytes("text"));
    expect(await cache.read(B)).toBeNull();
  });
  it("refuses a name that is not a 64-hex digest, so no path can leave cache/", async () => {
    const { cache } = setup();
    expect((await cache.write("../x", bytes("t"))).ok).toBe(false);
    expect(await cache.read("../x")).toBeNull();
  });
  it("keeps a file while another entry has its digest and deletes it with the last entry", async () => {
    const { deps, cache } = setup();
    await cache.write(A, bytes("same"));
    expect((await cache.release(A, baselineOf(A))).ok).toBe(true);
    expect(deps.fs.files.has(`${DIR}/${A}`)).toBe(true);
    expect((await cache.release(A, baselineOf(B))).ok).toBe(true);
    expect(deps.fs.files.has(`${DIR}/${A}`)).toBe(false);
  });
  it("prunes digest-named files that no entry names and leaves other names alone", async () => {
    const { deps, cache } = setup();
    await cache.write(A, bytes("named"));
    await cache.write(B, bytes("orphan"));
    deps.fs.put(`${DIR}/notes.txt`, "x");
    const pruned = await cache.prune(baselineOf(A));
    expect(pruned.ok && pruned.value).toBe(1);
    expect([...deps.fs.files.keys()].sort()).toEqual([`${DIR}/${A}`, `${DIR}/notes.txt`]);
  });
});
