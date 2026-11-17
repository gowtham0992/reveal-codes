import * as fc from "fast-check";
import type { CallerOperation, Document } from "@reveal-codes/engine";
import { expect, vi } from "vitest";
import { arbCreatedDocument } from "../../../../packages/engine/src/testing/arb-document";
import { arbOpSequence } from "../../../../packages/engine/src/testing/arb-ops";
import { createAutosave } from "../../src/autosave";
import { startAutosave } from "../../src/components/use-autosave";
import { createDraftGate } from "../../src/draft-gate";
import { AUTOSAVE_KEY, deserialise } from "../../src/persist";
import type { AppServices } from "../../src/services";
import { createStore } from "../../src/store-runtime";
import { createManualTimers } from "./clock";
import { createMemoryStorage } from "./memory-storage";
import { modeApi } from "./mode-fetch";
import { createFakeViewport } from "./viewport";
import { fakeBrowserServices } from "./browser-services";

export type UnreadableRun = Readonly<{ start: Document; ops: readonly CallerOperation[] }>;

export const arbUnreadableRun: fc.Arbitrary<UnreadableRun> = arbCreatedDocument.chain((start) =>
  arbOpSequence(start).map((ops) => ({ start, ops })),
);

type Rig = Readonly<{
  storage: ReturnType<typeof createMemoryStorage>;
  timers: ReturnType<typeof createManualTimers>;
  services: AppServices;
}>;

function buildRig(raw: string): Rig {
  const storage = createMemoryStorage();
  (storage.data as Map<string, string>).set(AUTOSAVE_KEY, raw);
  const timers = createManualTimers();
  const services: AppServices = {
    api: modeApi("fixtures").api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(1280),
    ...fakeBrowserServices(),
  };
  return { storage, timers, services };
}

/**
 * Property 20 body: load an unreadable stored value, edit, wait, flush, hide and unmount,
 * then assert the stored value is unchanged, never written, and the gate still blocks.
 * The caller must unstub the globals afterwards.
 */
export function assertUnreadableDraftUntouched(
  raw: string,
  run: UnreadableRun,
  wait: number,
): void {
  const rejected = deserialise(raw);
  expect(!rejected.ok && rejected.error.kind !== "absent").toBe(true);

  const { storage, timers, services } = buildRig(raw);
  const gate = createDraftGate();
  const store = createStore(timers.clock.now);
  const autosave = createAutosave({
    storage,
    setTimer: services.setTimer,
    clearTimer: services.clearTimer,
    onError: () => undefined,
    gate,
  });

  const fakeDocument = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", new EventTarget());
  const stop = startAutosave(services, store, autosave, gate);
  store.dispatch({ type: "replace", document: run.start, runLog: [], verifiedAt: null });
  store.dispatch({ type: "edit", ops: run.ops });
  timers.advance(wait);
  autosave.flush();
  fakeDocument.visibilityState = "hidden";
  fakeDocument.dispatchEvent(new Event("visibilitychange"));
  stop();

  expect(storage.getItem(AUTOSAVE_KEY)).toBe(raw);
  expect(storage.writes()).toBe(0);
  expect(gate.blocked()).toBe(true);
}
