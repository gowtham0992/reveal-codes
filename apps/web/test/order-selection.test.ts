import { ORDERS, selectableOrders } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import {
  ORDER_KEY,
  createOrderSelectionStore,
  readOrderSelection,
  writeOrderSelection,
} from "../src/order-selection";
import type { OrderSelection } from "../src/order-selection";
import { AUTOSAVE_KEY } from "../src/persist";
import { createMemoryStorage } from "./support/memory-storage";
import type { StorageLike } from "./support/memory-storage";

const SELECTABLE_IDS = selectableOrders(ORDERS).flatMap((g) => g.entries.map((e) => e.id));
const SELECTIONS: readonly OrderSelection[] = [
  null,
  ...SELECTABLE_IDS.map((entryId) => ({ entryId })),
];

function storageWith(value: string): StorageLike {
  const storage = createMemoryStorage();
  storage.setItem(ORDER_KEY, value);
  return storage;
}

const throwingGet: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => undefined,
  removeItem: () => undefined,
};

describe("Selection_Store _Requirements: 2.2, 2.3, 2.4_", () => {
  it("has selectable entries to test and leaves out the superseded one", () => {
    expect(SELECTABLE_IDS.length).toBeGreaterThan(5);
    expect(SELECTABLE_IDS).not.toContain("ndtex-starr-2023");
  });

  it.each(SELECTIONS.map((s) => [s?.entryId ?? "null", s] as const))(
    "reads back what it wrote with working storage: %s",
    (_name, selection) => {
      const storage = createMemoryStorage();
      expect(writeOrderSelection(storage, selection)).toBe(true);
      expect(readOrderSelection(storage, ORDERS)).toEqual(selection);
      const store = createOrderSelectionStore(storage, ORDERS);
      store.set(selection);
      expect(store.get()).toEqual(selection);
    },
  );

  it.each(SELECTIONS.map((s) => [s?.entryId ?? "null", s] as const))(
    "keeps the selection in memory when the write fails: %s",
    (_name, selection) => {
      const storage = createMemoryStorage({ throwOnSet: true });
      const store = createOrderSelectionStore(storage, ORDERS);
      store.set(selection);
      expect(store.get()).toEqual(selection);
      expect(storage.data.size).toBe(0);
    },
  );

  it("reports a failed write as false", () => {
    const storage = createMemoryStorage({ throwOnSet: true });
    expect(writeOrderSelection(storage, { entryId: "ndtex-lr-7-2-f" })).toBe(false);
  });

  it("removes the key when the selection is null", () => {
    const storage = createMemoryStorage();
    writeOrderSelection(storage, { entryId: "ndtex-lr-7-2-f" });
    writeOrderSelection(storage, null);
    expect(storage.data.has(ORDER_KEY)).toBe(false);
  });

  it("returns to storage after a later successful write", () => {
    const storage = createMemoryStorage();
    const store = createOrderSelectionStore(storage, ORDERS);
    store.set({ entryId: "ndtex-lr-7-2-f" });
    storage.removeItem(ORDER_KEY);
    expect(store.get()).toBeNull();
  });
});

describe("Selection_Store unreadable values _Requirements: 2.5, 2.6, 2.9_", () => {
  const known = SELECTABLE_IDS[0] ?? "";
  const table: ReadonlyArray<readonly [string, StorageLike]> = [
    ["missing", createMemoryStorage()],
    ["invalid JSON", storageWith("{not json")],
    ["a JSON string, not an object", storageWith(JSON.stringify("ndtex-lr-7-2-f"))],
    ["JSON null", storageWith("null")],
    ["other version", storageWith(JSON.stringify({ version: 2, entryId: known }))],
    ["missing version", storageWith(JSON.stringify({ entryId: known }))],
    ["non-string id", storageWith(JSON.stringify({ version: 1, entryId: 7 }))],
    ["unknown id", storageWith(JSON.stringify({ version: 1, entryId: "no-such-entry" }))],
    ["superseded id", storageWith(JSON.stringify({ version: 1, entryId: "ndtex-starr-2023" }))],
    ["throwing getItem", throwingGet],
  ];

  it.each(table)("reads null for %s", (_name, storage) => {
    expect(readOrderSelection(storage, ORDERS)).toBeNull();
    expect(createOrderSelectionStore(storage, ORDERS).get()).toBeNull();
  });

  it("reads a well-formed stored value for a current entry", () => {
    const storage = storageWith(JSON.stringify({ version: 1, entryId: known }));
    expect(readOrderSelection(storage, ORDERS)).toEqual({ entryId: known });
  });
});

describe("Selection_Store and the autosave key _Requirements: 6.1_", () => {
  it("uses its own key and leaves the autosave value unchanged", () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, "autosaved-document");
    expect(ORDER_KEY).not.toBe(AUTOSAVE_KEY);
    for (const selection of SELECTIONS) {
      writeOrderSelection(storage, selection);
      expect(storage.getItem(AUTOSAVE_KEY)).toBe("autosaved-document");
    }
    writeOrderSelection(storage, { entryId: "ndtex-lr-7-2-f" });
    expect([...storage.data.keys()].sort()).toEqual([AUTOSAVE_KEY, ORDER_KEY].sort());
  });
});
