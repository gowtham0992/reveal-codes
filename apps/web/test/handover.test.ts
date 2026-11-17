import { describe, expect, it } from "vitest";
import type { StorageLike } from "../src/autosave";
import { HANDOVER_KEY, takeHandover, writeHandover } from "../src/handover";
import { createMemoryStorage } from "./support/memory-storage";

/** A storage whose chosen methods throw, as a disabled or full browser store does. */
function throwing(
  base: StorageLike,
  which: Readonly<{ get?: boolean; remove?: boolean; set?: boolean }>,
): StorageLike {
  return {
    getItem: (key) => {
      if (which.get === true) throw new Error("SecurityError");
      return base.getItem(key);
    },
    setItem: (key, value) => {
      if (which.set === true) throw new Error("QuotaExceededError");
      base.setItem(key, value);
    },
    removeItem: (key) => {
      if (which.remove === true) throw new Error("SecurityError");
      base.removeItem(key);
    },
  };
}

describe("Hand_Over storage", () => {
  it("uses the documented key", () => {
    expect(HANDOVER_KEY).toBe("reveal-codes:check-handover:v1");
  });

  it("returns the written text once and nothing the second time", () => {
    const session = createMemoryStorage();
    expect(writeHandover(session, "Roe v. Wade, 410 U.S. 113.")).toBe(true);
    expect(session.data.get(HANDOVER_KEY)).toBe("Roe v. Wade, 410 U.S. 113.");
    expect(takeHandover(session)).toBe("Roe v. Wade, 410 U.S. 113.");
    expect(session.data.has(HANDOVER_KEY)).toBe(false);
    expect(takeHandover(session)).toBeNull();
  });

  it("returns null for a missing key", () => {
    expect(takeHandover(createMemoryStorage())).toBeNull();
  });

  it("returns null for an empty value and still removes the key", () => {
    const session = createMemoryStorage();
    session.setItem(HANDOVER_KEY, "");
    expect(takeHandover(session)).toBeNull();
    expect(session.data.has(HANDOVER_KEY)).toBe(false);
  });

  it("reports a failed write as false and stores nothing", () => {
    const session = createMemoryStorage({ throwOnSet: true });
    expect(writeHandover(session, "text")).toBe(false);
    expect(session.data.size).toBe(0);
  });

  it("returns null when the read throws, and still tries to remove the key", () => {
    const base = createMemoryStorage();
    base.setItem(HANDOVER_KEY, "text");
    const session = throwing(base, { get: true });
    expect(takeHandover(session)).toBeNull();
    expect(base.data.has(HANDOVER_KEY)).toBe(false);
  });

  it("returns the text when only the remove throws", () => {
    const base = createMemoryStorage();
    base.setItem(HANDOVER_KEY, "kept text");
    expect(takeHandover(throwing(base, { remove: true }))).toBe("kept text");
  });

  it("overwrites an earlier hand-over with the latest write", () => {
    const session = createMemoryStorage();
    writeHandover(session, "first");
    writeHandover(session, "second");
    expect(takeHandover(session)).toBe("second");
  });
});
