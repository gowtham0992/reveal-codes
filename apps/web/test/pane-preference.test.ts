import { describe, expect, it } from "vitest";
import {
  PANE_KEY,
  decodePreference,
  encodePreference,
  initialPaneOpen,
  readPreference,
  writePreference,
} from "../src/pane-preference";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { createMemoryStorage } from "./support/memory-storage";
import type { StorageLike } from "./support/memory-storage";
import { editedDocument, freshDocument } from "./support/persist-fixtures";

const REQ = "_Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 1.8, 1.11, 12.1_";

function withPane(value: string): StorageLike {
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, value);
  return storage;
}

const throwingGet: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => undefined,
  removeItem: () => undefined,
};

describe(`Pane_Preference ${REQ}`, () => {
  it.each([true, false])("round-trips open=%s through encode and decode", (open) => {
    expect(decodePreference(encodePreference(open))).toBe(open);
    const storage = createMemoryStorage();
    expect(writePreference(storage, open).ok).toBe(true);
    expect(readPreference(storage)).toBe(open);
  });

  it("writes under the versioned key", () => {
    expect(PANE_KEY).toBe("reveal-codes:pane:v1");
    expect(JSON.parse(encodePreference(true))).toEqual({ version: 1, open: true });
  });

  it("allows extra fields in a valid value", () => {
    expect(decodePreference('{"version":1,"open":false,"extra":1}')).toBe(false);
  });

  it.each([
    ["x"],
    ["{}"],
    ['{"version":2,"open":true}'],
    ['{"version":1,"open":"yes"}'],
    ["null"],
    ["[]"],
  ])("reads %s as First_Visit", (raw) => {
    expect(decodePreference(raw)).toBeNull();
    expect(readPreference(withPane(raw))).toBeNull();
  });

  it("reads a missing value as First_Visit", () => {
    expect(decodePreference(null)).toBeNull();
    expect(readPreference(createMemoryStorage())).toBeNull();
  });

  it("reads as First_Visit when getItem throws", () => {
    expect(readPreference(throwingGet)).toBeNull();
  });

  it("returns an error value when setItem throws", () => {
    const storage = createMemoryStorage({ throwOnSet: true });
    const result = writePreference(storage, true);
    expect(result.ok).toBe(false);
    expect(storage.data.has(PANE_KEY)).toBe(false);
  });
});

describe(`initialPaneOpen ${REQ}`, () => {
  it("opens for a stored true, even with a draft", () => {
    const storage = withPane(encodePreference(true));
    storage.setItem(AUTOSAVE_KEY, serialise(editedDocument(), [], null, null));
    expect(initialPaneOpen(storage)).toBe(true);
  });

  it("stays closed for a stored false, even without a draft", () => {
    expect(initialPaneOpen(withPane(encodePreference(false)))).toBe(false);
  });

  it("opens on first visit with no draft", () => {
    expect(initialPaneOpen(createMemoryStorage())).toBe(true);
  });

  it("starts closed on first visit with a saved draft", () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(editedDocument(), [], null, null));
    expect(initialPaneOpen(storage)).toBe(false);
  });

  it("opens when the draft restores to empty text", () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(freshDocument(), [], null, null));
    expect(initialPaneOpen(storage)).toBe(true);
  });

  it("treats a malformed preference as First_Visit", () => {
    expect(initialPaneOpen(withPane("x"))).toBe(true);
  });
});
