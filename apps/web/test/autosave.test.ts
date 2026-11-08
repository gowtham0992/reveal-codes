import { describe, expect, it } from "vitest";
import { AUTOSAVE_FAILED, createAutosave } from "../src/autosave";
import { AUTOSAVE_KEY, deserialise } from "../src/persist";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { editedDocument, freshDocument } from "./support/persist-fixtures";

function setup(storage: MemoryStorage = createMemoryStorage()) {
  const timers = createManualTimers();
  const errors: string[] = [];
  const autosave = createAutosave({
    storage,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    onError: (m) => {
      errors.push(m);
    },
  });
  return { timers, errors, autosave, storage };
}

describe("debounce and flush _Requirements: 9.1, 9.5_", () => {
  it("writes nothing before 300 ms and once after", () => {
    const { timers, autosave, storage } = setup();
    autosave.schedule(freshDocument(), []);
    timers.advance(299);
    expect(storage.writes()).toBe(0);
    timers.advance(1);
    expect(storage.writes()).toBe(1);
    expect(storage.data.has(AUTOSAVE_KEY)).toBe(true);
  });

  it("restarts the interval and writes only the latest value", () => {
    const { timers, autosave, storage } = setup();
    const edited = editedDocument();
    autosave.schedule(freshDocument(), []);
    timers.advance(200);
    autosave.schedule(edited, []);
    timers.advance(200);
    expect(storage.writes()).toBe(0);
    timers.advance(100);
    expect(storage.writes()).toBe(1);
    const back = deserialise(storage.getItem(AUTOSAVE_KEY));
    expect(back.ok && back.value.document).toEqual(edited);
  });

  it("flush writes a pending value now and cancels the timer", () => {
    const { timers, autosave, storage } = setup();
    autosave.schedule(editedDocument(), []);
    autosave.flush();
    expect(storage.writes()).toBe(1);
    expect(timers.pending()).toBe(0);
    timers.advance(1000);
    expect(storage.writes()).toBe(1);
  });

  it("flush with nothing pending writes nothing", () => {
    const { autosave, storage } = setup();
    autosave.flush();
    expect(storage.writes()).toBe(0);
  });
});

describe("clear and failure _Requirements: 9.6_", () => {
  it("clear cancels a pending write and removes the key", () => {
    const { timers, autosave, storage } = setup();
    autosave.schedule(freshDocument(), []);
    autosave.flush();
    autosave.schedule(editedDocument(), []);
    autosave.clear();
    timers.advance(1000);
    expect(storage.writes()).toBe(1);
    expect(storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it("a throwing setItem reports the error message and does not throw", () => {
    const { timers, errors, autosave } = setup(createMemoryStorage({ throwOnSet: true }));
    autosave.schedule(editedDocument(), []);
    timers.advance(300);
    expect(errors).toEqual([AUTOSAVE_FAILED]);
    expect(AUTOSAVE_FAILED).toBe("Autosave failed. Your draft is kept in this tab only.");
  });

  it("a later successful write after a failure still works", () => {
    const flaky = createMemoryStorage();
    let fail = true;
    const wrapped = {
      ...flaky,
      setItem: (k: string, v: string) => {
        if (fail) throw new Error("quota");
        flaky.setItem(k, v);
      },
    };
    const { timers, errors, autosave } = setup(wrapped);
    autosave.schedule(editedDocument(), []);
    timers.advance(300);
    fail = false;
    autosave.schedule(editedDocument(), []);
    timers.advance(300);
    expect(errors).toHaveLength(1);
    expect(flaky.data.has(AUTOSAVE_KEY)).toBe(true);
  });
});

describe("what is stored _Requirements: 9.7_", () => {
  it("holds only version, codes and runLog", () => {
    const { autosave, storage } = setup();
    autosave.schedule(editedDocument(), []);
    autosave.flush();
    const stored = JSON.parse(storage.getItem(AUTOSAVE_KEY) ?? "null") as object;
    expect(Object.keys(stored).sort()).toEqual(["codes", "runLog", "version"]);
  });
});
