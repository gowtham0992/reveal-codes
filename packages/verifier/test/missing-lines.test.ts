import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDocument } from "@reveal-codes/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileCacheStore } from "../src/cache-file";
import { createDeps } from "../src/create-deps";
import type { CacheStore, Deps } from "../src/deps";
import { missingLines } from "../src/lookup";
import { makeDeps } from "./support/make-deps";
import { createManualClock } from "./support/manual-clock";
import { scriptedFetch } from "./support/scripted-fetch";

function recordsOf(text: string) {
  const doc = createDocument(text, "2026-11-02T12:00:00.000Z");
  if (!doc.ok) throw new Error("createDocument failed");
  return doc.value.citations;
}

const EXP = new Date(10 ** 13).toISOString();
const GOOD = { status: "not_found" } as const;
const TEXT = "410 U.S. 113. 598 F.3d 1. 100 U.S. 7.";

describe("missingLines _Requirements: 24.7, 24.8, 24.14_", () => {
  it("gives [] when every line is cached", async () => {
    const { deps, cache } = makeDeps();
    for (const line of ["410 U.S. 113", "598 F.3d 1", "100 U.S. 7"]) {
      await cache.set(line, GOOD, EXP);
    }
    expect(await missingLines(recordsOf(TEXT), deps)).toEqual([]);
  });

  it("lists only the lines with no cached entry, in first-occurrence order", async () => {
    const { deps, cache } = makeDeps();
    await cache.set("598 F.3d 1", GOOD, EXP);
    expect(await missingLines(recordsOf(TEXT), deps)).toEqual(["410 U.S. 113", "100 U.S. 7"]);
  });

  it("gives [] for no records and for short-form-only records", async () => {
    const { deps } = makeDeps();
    expect(await missingLines([], deps)).toEqual([]);
    expect(await missingLines(recordsOf("Id. at 5."), deps)).toEqual([]);
  });

  it("lists an unchecked line, since unchecked is never a valid cached entry", async () => {
    const { deps, cache } = makeDeps();
    await cache.set("410 U.S. 113", { status: "unchecked" }, EXP);
    expect(await missingLines(recordsOf("410 U.S. 113."), deps)).toEqual(["410 U.S. 113"]);
  });

  it("lists a line as missing when the store get rejects", async () => {
    const clock = createManualClock(0);
    const cache: CacheStore = {
      get: () => Promise.reject(new Error("store down")),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    const deps = createDeps({
      fetch: scriptedFetch([]).fetch,
      now: clock.now,
      sleep: clock.sleep,
      cache,
      baseUrl: "https://cl.test/api/rest/v4",
    });
    expect(await missingLines(recordsOf("410 U.S. 113."), deps)).toEqual(["410 U.S. 113"]);
  });
});

describe("missingLines over the file store _Requirements: 24.7, 24.14_", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "rc-missing-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("gives the same answer as the memory store for the same contents", async () => {
    const clock = createManualClock(0);
    const file = createFileCacheStore({ dir, now: clock.now });
    const memory = makeDeps();
    const seed = async (store: CacheStore) => {
      await store.set("598 F.3d 1", GOOD, EXP);
      await store.set("100 U.S. 7", { status: "unchecked" }, EXP);
    };
    await seed(file);
    await seed(memory.cache);
    const fileDeps: Deps = createDeps({
      fetch: scriptedFetch([]).fetch,
      now: clock.now,
      sleep: clock.sleep,
      cache: file,
      baseUrl: "https://cl.test/api/rest/v4",
    });
    const records = recordsOf(TEXT);
    const fromFile = await missingLines(records, fileDeps);
    expect(fromFile).toEqual(["410 U.S. 113", "100 U.S. 7"]);
    expect(fromFile).toEqual(await missingLines(records, memory.deps));
  });
});
