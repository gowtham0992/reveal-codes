import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileCacheStore, encodeKey, type FileCacheFs } from "../src/cache-file";
import * as nodeFs from "node:fs/promises";
import { createManualClock } from "./support/manual-clock";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "rc-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const EXP = new Date(10_000).toISOString();

describe("createFileCacheStore _Requirements: 10.8, 10.9, 10.10, 10.12_", () => {
  it("keeps hostile keys inside the directory, one distinct file each", async () => {
    const keys = ["../x", "a/b", "opinion:7", ".", "..", "", "A", "a", "\ud800"];
    const store = createFileCacheStore({ dir, now: createManualClock(0).now });
    for (const k of keys) await store.set(k, { k }, EXP);
    expect((await readdir(dir)).sort()).toEqual(keys.map(encodeKey).sort());
    expect(new Set(keys.map(encodeKey)).size).toBe(keys.length);
    for (const k of keys) expect(await store.get(k)).toEqual({ k });
    for (const name of await readdir(dir)) expect(name).toMatch(/^[%A-Za-z0-9_-]+\.json$/);
  });

  it("round trips before expiry and misses at expiry", async () => {
    const clock = createManualClock(0);
    const store = createFileCacheStore({ dir, now: clock.now });
    await store.set("k", { status: "not_found" }, EXP);
    clock.advance(9_999);
    expect(await store.get("k")).toEqual({ status: "not_found" });
    clock.advance(1);
    expect(await store.get("k")).toBeUndefined();
  });

  it("treats a missing or unparseable file as a miss", async () => {
    const store = createFileCacheStore({ dir, now: createManualClock(0).now });
    expect(await store.get("nope")).toBeUndefined();
    await writeFile(path.join(dir, encodeKey("bad")), "{not json", "utf8");
    expect(await store.get("bad")).toBeUndefined();
    await writeFile(path.join(dir, encodeKey("shape")), "[1]", "utf8");
    expect(await store.get("shape")).toBeUndefined();
  });

  it("leaves the old entry and no temp file when the rename fails", async () => {
    const clock = createManualClock(0);
    const good = createFileCacheStore({ dir, now: clock.now });
    await good.set("k", "old", EXP);
    const failing: FileCacheFs = {
      ...nodeFs,
      rename: () => Promise.reject(new Error("rename failed")),
    };
    const bad = createFileCacheStore({ dir, now: clock.now, fs: failing });
    await expect(bad.set("k", "new", EXP)).resolves.toBeUndefined();
    expect(await good.get("k")).toBe("old");
    expect(await readdir(dir)).toEqual([encodeKey("k")]);
  });

  it("does not write a key whose encoded name is over 200 bytes", async () => {
    const store = createFileCacheStore({ dir, now: createManualClock(0).now });
    await store.set("x".repeat(201), 1, EXP);
    expect(await readdir(dir)).toEqual([]);
    expect(await store.get("x".repeat(201))).toBeUndefined();
  });

  it("deletes an entry", async () => {
    const store = createFileCacheStore({ dir, now: createManualClock(0).now });
    await store.set("k", 1, EXP);
    await store.delete("k");
    expect(await store.get("k")).toBeUndefined();
  });

  it("writes only the value and expiry, never a token", async () => {
    const store = createFileCacheStore({ dir, now: createManualClock(0).now });
    await store.set("556 U.S. 662", { status: "verified", clusterId: "1" }, EXP);
    const [file] = await readdir(dir);
    const text = await readFile(path.join(dir, file as string), "utf8");
    const fileName = file as string;
    expect(JSON.parse(text)).toEqual({
      expiresAt: EXP,
      value: { status: "verified", clusterId: "1" },
    });
    expect(`${fileName}${text}`.toLowerCase()).not.toContain("authorization");
  });
});
