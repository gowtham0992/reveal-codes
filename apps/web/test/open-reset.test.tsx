// @vitest-environment jsdom
import { createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { PANE_KEY, encodePreference } from "../src/pane-preference";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { EXPORT_NOW } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { ISO } from "./support/persist-fixtures";
import { act, fireEvent, renderUi, screen, within } from "./support/render";
import { createFakeViewport } from "./support/viewport";
import { fakeBrowserServices } from "./support/browser-services";

function services(storage: MemoryStorage): AppServices {
  const timers = createManualTimers();
  return {
    api: modeApi("fixtures").api,
    now: () => EXPORT_NOW,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
    ...fakeBrowserServices(),
  };
}

function storedDraft(): MemoryStorage {
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(false));
  const created = createDocument("Stored draft.", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  storage.setItem(AUTOSAVE_KEY, serialise(created.value, [], null, null));
  return storage;
}

async function pick(file: File): Promise<void> {
  const input = screen.getByLabelText<HTMLInputElement>("Open a draft file");
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("Open clears the previous message _Requirements: 13.2, 13.3_", () => {
  it("shows no 'Could not open' message while the second file's confirm dialog is open", async () => {
    await act(async () => {
      renderUi(<AppShell services={services(storedDraft())} />);
      await Promise.resolve();
    });
    await pick(new File([new Uint8Array([120])], "scan.pdf"));
    // The refusal is shown first, so the later absence is a change and not a missing message.
    expect(within(screen.getByRole("toolbar")).getByRole("status").textContent).toBe(
      "Could not open scan.pdf.",
    );

    await pick(new File([new TextEncoder().encode("Replacement.")], "motion.txt"));

    expect(screen.getByRole("dialog")).not.toBeNull();
    const toolbar = within(screen.getByRole("toolbar")).getByRole("status").textContent;
    expect(toolbar).not.toContain("Could not open");
    const notes = screen
      .getAllByRole("status")
      .filter((el) => el.tagName === "P")
      .map((el) => el.textContent);
    for (const text of notes) expect(text).not.toContain("Could not open");
    expect(document.body.textContent).not.toContain("Could not open scan.pdf.");
  });
});
