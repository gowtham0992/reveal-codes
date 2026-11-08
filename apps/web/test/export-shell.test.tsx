// @vitest-environment jsdom
import { blockingIssues, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const ONE = "See Roe v. Wade, 410 U.S. 113 (1973).";
const TWO = `${ONE} Also Miranda v. Arizona, 384 U.S. 436 (1966).`;

function docOf(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

async function mount(text: string): Promise<void> {
  const timers = createManualTimers();
  const storage = createMemoryStorage();
  storage.setItem(AUTOSAVE_KEY, serialise(docOf(text), [], null));
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
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
}

describe("Export gate in the shell _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_", () => {
  it("reads 'Export' and is enabled when nothing blocks", async () => {
    await mount("Plain text with no citation.");
    const button = screen.getByRole("button", { name: "Export" });
    expect(button).toHaveProperty("disabled", false);
  });

  it("counts one blocking issue and disables the button", async () => {
    expect(blockingIssues(docOf(ONE))).toHaveLength(1);
    await mount(ONE);
    const button = screen.getByRole("button", { name: "Export (1 blocking)" });
    expect(button).toHaveProperty("disabled", true);
  });

  it("counts several blocking issues", async () => {
    const n = blockingIssues(docOf(TWO)).length;
    expect(n).toBeGreaterThan(1);
    await mount(TWO);
    expect(screen.getByRole("button", { name: `Export (${String(n)} blocking)` })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("updates the label after an override is saved through the Store", async () => {
    await mount(ONE);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Override…" }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Checked by hand" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Save override" }));
    });
    expect(screen.getByRole("button", { name: "Export" })).toHaveProperty("disabled", false);
  });

  it("opens the placeholder dialog and returns focus to Export on close", async () => {
    await mount("Plain text with no citation.");
    const button = screen.getByRole("button", { name: "Export" });
    button.focus();
    act(() => {
      fireEvent.click(button);
    });
    expect(screen.getByRole("dialog", { name: "Export" }).textContent).not.toContain("!");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
