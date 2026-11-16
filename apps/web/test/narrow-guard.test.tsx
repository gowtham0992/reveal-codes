// @vitest-environment jsdom
import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { useAutosave } from "../src/components/use-autosave";
import { createAutosave } from "../src/autosave";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { PANE_KEY } from "../src/pane-preference";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { createFakeViewport } from "./support/viewport";
import { modeApi } from "./support/mode-fetch";
import { act, renderUi } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";

function docWith(text: string): Document {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (!applied.ok) throw new Error("fixture rejected");
  return applied.value.document;
}

type Recorded = Readonly<{ storage: MemoryStorage; reads: string[]; writes: string[] }>;

/** A memory storage that records the key of every getItem and setItem. */
function recordingStorage(): Recorded {
  const inner = createMemoryStorage();
  const reads: string[] = [];
  const writes: string[] = [];
  const storage: MemoryStorage = {
    data: inner.data,
    writes: inner.writes,
    getItem: (key) => {
      reads.push(key);
      return inner.getItem(key);
    },
    setItem: (key, value) => {
      writes.push(key);
      inner.setItem(key, value);
    },
    removeItem: (key) => {
      inner.removeItem(key);
    },
  };
  return { storage, reads, writes };
}

function servicesFor(storage: MemoryStorage, width: number): AppServices {
  const timers = createManualTimers();
  return {
    api: modeApi("fixtures").api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(width),
  };
}

const KEYS: readonly string[] = [AUTOSAVE_KEY, PANE_KEY];

describe("narrow guard _Requirements: 10.7, 10.8, 12.9_", () => {
  it("at width 799 neither the Autosave_Key nor the Pane_Key is read or written", async () => {
    const rec = recordingStorage();
    rec.storage.setItem(AUTOSAVE_KEY, serialise(docWith("saved"), [], null, null));
    rec.writes.length = 0;
    await act(async () => {
      renderUi(<AppShell services={servicesFor(rec.storage, 799)} />);
      await Promise.resolve();
    });
    expect(rec.reads.filter((k) => KEYS.includes(k))).toEqual([]);
    expect(rec.writes.filter((k) => KEYS.includes(k))).toEqual([]);
  });

  it("at width 800 the saved draft is read from the Autosave_Key", async () => {
    const rec = recordingStorage();
    rec.storage.setItem(AUTOSAVE_KEY, serialise(docWith("saved"), [], null, null));
    await act(async () => {
      renderUi(<AppShell services={servicesFor(rec.storage, 800)} />);
      await Promise.resolve();
    });
    expect(rec.reads).toContain(AUTOSAVE_KEY);
    expect(rec.reads).toContain(PANE_KEY);
  });
});

describe("useAutosave unmount _Requirements: 10.8_", () => {
  it("flushes a pending save once and writes nothing afterwards", async () => {
    const rec = recordingStorage();
    const svc = servicesFor(rec.storage, 1280);
    const store = createStore(svc.now);
    const autosave = createAutosave({
      storage: svc.storage,
      setTimer: svc.setTimer,
      clearTimer: svc.clearTimer,
      onError: () => undefined,
    });
    function Harness() {
      useAutosave(store, svc, autosave);
      return null;
    }
    const view = renderUi(<Harness />);
    await act(async () => {
      store.dispatch({
        type: "replace",
        document: docWith("pending"),
        runLog: [],
        verifiedAt: null,
      });
      await Promise.resolve();
    });
    expect(rec.writes.filter((k) => k === AUTOSAVE_KEY)).toEqual([]);
    view.unmount();
    expect(rec.writes.filter((k) => k === AUTOSAVE_KEY)).toEqual([AUTOSAVE_KEY]);
    await act(async () => {
      store.dispatch({ type: "replace", document: docWith("later"), runLog: [], verifiedAt: null });
      await Promise.resolve();
    });
    expect(rec.writes.filter((k) => k === AUTOSAVE_KEY)).toEqual([AUTOSAVE_KEY]);
  });
});
