// @vitest-environment jsdom
import { apply, createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { PANE_KEY, encodePreference } from "../src/pane-preference";
import type { ApiClient } from "../src/client/api";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen, within } from "./support/render";
import { createFakeViewport } from "./support/viewport";

const ISO = "2026-11-02T12:00:00.000Z";
const SENTENCE = "Too many checks from this address. Try again in a moment.";

function citingStorage() {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text: "See Roe v. Wade, 410 U.S. 113 (1973).",
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (!applied.ok) throw new Error("fixture rejected");
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(false));
  storage.setItem(AUTOSAVE_KEY, serialise(applied.value.document, [], null));
  return storage;
}
function services(api: ApiClient): AppServices {
  const timers = createManualTimers();
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
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

describe("a verify request over the limit", () => {
  it("shows the sentence in the Issues region and the toolbar, and marks nothing", async () => {
    const limited: ApiClient = {
      ...modeApi("live").api,
      verify: () => Promise.resolve({ ok: false, error: { kind: "status", status: 429 } }),
    };
    await act(async () => {
      renderUi(<AppShell services={services(limited)} />);
      await Promise.resolve();
    });
    await settle();
    act(() => {
      fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Verify" }));
    });
    await settle();
    const result = screen.getByRole("status", { name: "Verify result" });
    expect(within(result).getByText(SENTENCE)).not.toBeNull();
    expect(within(screen.getByRole("toolbar")).getByRole("status").textContent).toBe(SENTENCE);
    // Nothing was checked: the Verify button is back and the citation is still unchecked.
    expect(
      within(screen.getByRole("toolbar")).getByRole("button", { name: "Verify" }),
    ).not.toBeNull();
    expect(screen.queryByText(/not found/)).toBeNull();
  });
});
