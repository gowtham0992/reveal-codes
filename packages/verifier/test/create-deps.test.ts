import { describe, expect, it } from "vitest";
import { createDeps } from "../src/create-deps";
import { makeDeps } from "./support/make-deps";

describe("createDeps _Requirements: 11.8, 11.9_", () => {
  it("gives two Deps no shared state", () => {
    const a = makeDeps().deps;
    const b = createDeps({ ...a });
    expect(b.state).not.toBe(a.state);
    expect(b.state.bucket).not.toBe(a.state.bucket);
    expect(b.state.counters).not.toBe(a.state.counters);
    expect(b.state.gateTail).not.toBe(a.state.gateTail);
    a.state.counters.value = { hits: 1, misses: 2, writes: 3 };
    expect(b.state.counters.value).toEqual({ hits: 0, misses: 0, writes: 0 });
  });

  it("starts with a full bucket, empty Window_Log and zero counters", () => {
    const t = makeDeps([], { startMs: 5_000 });
    expect(t.deps.state.bucket.value).toEqual({
      tokens: 60,
      partialMs: 0,
      lastMs: 5_000,
      sent: [],
    });
    expect(t.deps.state.counters.value).toEqual({ hits: 0, misses: 0, writes: 0 });
  });

  it("starts with a resolved gate tail", async () => {
    await expect(makeDeps().deps.state.gateTail.value).resolves.toBeUndefined();
  });

  it("trims a trailing slash from baseUrl and keeps the token only when given", () => {
    const base = makeDeps().deps;
    const slashed = createDeps({ ...base, baseUrl: "https://cl.test/api/rest/v4/" });
    expect(slashed.baseUrl).toBe("https://cl.test/api/rest/v4");
    expect("token" in slashed).toBe(false);
    expect(createDeps({ ...base, token: "t" }).token).toBe("t");
  });
});
