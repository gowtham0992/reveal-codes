// @vitest-environment jsdom
import { apply, createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { WAITING_AFTER_MS, WAITING_TEXT } from "../src/components/use-verify";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { PANE_KEY, encodePreference } from "../src/pane-preference";
import type { ApiClient } from "../src/client/api";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import type { ManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen, within } from "./support/render";
import { createFakeViewport } from "./support/viewport";
const ISO = "2026-11-02T12:00:00.000Z";
const CITING = "See Roe v. Wade, 410 U.S. 113 (1973).";
function citingStorage() {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text: CITING,
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (!applied.ok) throw new Error("fixture rejected");
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(false));
  storage.setItem(AUTOSAVE_KEY, serialise(applied.value.document, [], null, null));
  return storage;
}
const toolbar = (): HTMLElement => screen.getByRole("toolbar");
const status = (): string => within(toolbar()).getByRole("status").textContent;
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}
function servicesOf(timers: ManualTimers, api: ApiClient): AppServices {
  return {
    api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: citingStorage(),
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
  };
}
async function mountAndVerify(timers: ManualTimers, api: ApiClient): Promise<void> {
  await act(async () => {
    renderUi(<AppShell services={servicesOf(timers, api)} />);
    await Promise.resolve();
  });
  await settle();
  act(() => {
    fireEvent.click(within(toolbar()).getByRole("button", { name: "Verify" }));
  });
}
describe("Verify waiting text _Requirements: 5.4_", () => {
  it("explains the wait after 5 seconds in flight and returns to normal when the run ends", async () => {
    const timers = createManualTimers();
    const mode = modeApi("fixtures");
    let release: () => void = () => undefined;
    mode.gate.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mountAndVerify(timers, mode.api);
    expect(status()).toBe("");
    act(() => {
      timers.advance(WAITING_AFTER_MS - 1);
    });
    expect(status()).toBe("");
    act(() => {
      timers.advance(1);
    });
    expect(WAITING_TEXT).toBe(
      "Verifying… waiting for the citation service's rate limit. This can take up to a minute.",
    );
    expect(status()).toBe(WAITING_TEXT);
    expect(within(toolbar()).getByRole("button", { name: "Verifying…" })).not.toBeNull();
    release();
    await settle();
    expect(status()).toBe("");
    expect(within(toolbar()).getByRole("button", { name: "Verify" })).not.toBeNull();
  });
  it("never shows the text when the run ends before 5 seconds", async () => {
    const timers = createManualTimers();
    await mountAndVerify(timers, modeApi("fixtures").api);
    await settle();
    act(() => {
      timers.advance(WAITING_AFTER_MS * 2);
    });
    expect(status()).not.toBe(WAITING_TEXT);
  });
});
