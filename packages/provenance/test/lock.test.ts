import { describe, expect, it } from "vitest";
import { LOCK_STALE_MS, LOCK_WAIT_MS } from "../src/core/limits.js";
import { acquireLock } from "../src/io/lock.js";
import { memoryDeps } from "./support/memory-deps.js";

const LOCK = "/ws/.kiro/provenance/lock";

function setup() {
  const deps = memoryDeps();
  deps.fs.put("/ws/.kiro/provenance/keep", "x");
  return deps;
}

describe("acquireLock", () => {
  it("creates the lock with the process id and the time, and release removes it", async () => {
    const deps = setup();
    const lock = await acquireLock(deps, LOCK);
    expect(lock.ok).toBe(true);
    expect(deps.fs.text(LOCK)).toBe("4242 2026-01-01T00:00:00.000Z\n");
    if (lock.ok) await lock.value.release();
    expect(deps.fs.files.has(LOCK)).toBe(false);
  });

  it("makes the second taker wait 5 s, then give up with lock_timeout and change nothing", async () => {
    const deps = setup();
    await acquireLock(deps, LOCK);
    const before = deps.fs.text(LOCK);
    const started = deps.clock.nowMs();
    const second = await acquireLock(deps, LOCK);
    expect(second).toEqual({ ok: false, error: { kind: "lock_timeout" } });
    expect(deps.clock.nowMs() - started).toBe(LOCK_WAIT_MS);
    expect(deps.fs.text(LOCK)).toBe(before);
    expect([...deps.fs.files.keys()].filter((k) => k.includes("stale"))).toEqual([]);
  });

  it("takes the lock when the holder releases during the wait", async () => {
    const deps = setup();
    const first = await acquireLock(deps, LOCK);
    let waits = 0;
    const original = deps.clock.timer;
    deps.clock.timer = (ms) => {
      waits += 1;
      if (waits === 3 && first.ok) void first.value.release();
      return original(ms);
    };
    const second = await acquireLock(deps, LOCK);
    expect(second.ok).toBe(true);
    expect(waits).toBe(3);
  });

  it("breaks a lock that is 31 seconds old", async () => {
    const deps = setup();
    deps.fs.put(LOCK, "999 old\n", deps.clock.nowMs() - 31_000);
    const lock = await acquireLock(deps, LOCK);
    expect(lock.ok).toBe(true);
    expect(deps.fs.text(LOCK)).toBe("4242 2026-01-01T00:00:00.000Z\n");
    expect([...deps.fs.files.keys()].filter((k) => k.includes("stale"))).toEqual([]);
  });

  it("does not break a lock that is 29 seconds old before it turns 30 seconds old", async () => {
    const deps = setup();
    deps.fs.put(LOCK, "999 old\n", deps.clock.nowMs() - (LOCK_STALE_MS - 1000));
    const started = deps.clock.nowMs();
    const lock = await acquireLock(deps, LOCK);
    expect(lock.ok).toBe(true);
    expect(deps.clock.nowMs() - started).toBeGreaterThanOrEqual(1000);
  });

  it("reports write_failed when the lock cannot be created for another reason", async () => {
    const deps = memoryDeps();
    const lock = await acquireLock(deps, "/missing/lock");
    expect(lock).toEqual({ ok: false, error: { kind: "write_failed", detail: "ENOENT" } });
  });
});
