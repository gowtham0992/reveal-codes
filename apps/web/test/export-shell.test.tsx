// @vitest-environment jsdom
import { blockingIssues, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen, within } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const ONE = "See Roe v. Wade, 410 U.S. 113 (1973).";
const TWO = `${ONE} Also Miranda v. Arizona, 384 U.S. 436 (1966).`;

function docOf(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

type MountOptions = Readonly<{
  download?: AppServices["download"];
  openPrint?: AppServices["openPrint"];
  throwOnSet?: boolean;
}>;

async function mount(text: string, options: MountOptions = {}) {
  const timers = createManualTimers();
  const storage = createMemoryStorage();
  storage.setItem(AUTOSAVE_KEY, serialise(docOf(text), [], null));
  let failWrites = false;
  const services: AppServices = {
    api: modeApi("fixtures").api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: {
      getItem: (k) => storage.getItem(k),
      removeItem: (k) => {
        storage.removeItem(k);
      },
      setItem: (k, v) => {
        if (failWrites) throw new Error("QuotaExceededError");
        storage.setItem(k, v);
      },
    },
    download: options.download ?? (() => undefined),
    openPrint: options.openPrint ?? (() => true),
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
  failWrites = options.throwOnSet === true;
  return { storage };
}

const exportButton = (name: string | RegExp = /^Export/): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>("button", { name });

function openExport(): HTMLButtonElement {
  const button = exportButton();
  button.focus();
  act(() => {
    fireEvent.click(button);
  });
  return button;
}

function saveOverride(reason: string, scope: HTMLElement | null = null): void {
  const root = scope ?? document.body;
  act(() => {
    fireEvent.click(within(root).getAllByRole("button", { name: "Override…" })[0] as HTMLElement);
  });
  act(() => {
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: reason } });
  });
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Save override" }));
  });
}

describe("Export button in the shell _Requirements: 2.1, 13.1_", () => {
  it("reads 'Export' and is enabled when nothing blocks", async () => {
    await mount("Plain text with no citation.");
    expect(exportButton("Export").disabled).toBe(false);
  });

  it("counts one blocking issue and stays enabled", async () => {
    expect(blockingIssues(docOf(ONE))).toHaveLength(1);
    await mount(ONE);
    expect(exportButton("Export (1 blocking)").disabled).toBe(false);
  });

  it("counts several blocking issues", async () => {
    const n = blockingIssues(docOf(TWO)).length;
    expect(n).toBeGreaterThan(1);
    await mount(TWO);
    expect(exportButton(`Export (${String(n)} blocking)`).disabled).toBe(false);
  });

  it("updates the label after an override is saved through the Store", async () => {
    await mount(ONE);
    saveOverride("Checked by hand");
    expect(exportButton("Export").disabled).toBe(false);
  });
});

describe("Export dialog in the shell _Requirements: 2.2, 2.4, 2.5, 2.8, 2.10, 2.11_", () => {
  it("opens with nothing blocking and returns focus to Export on close", async () => {
    await mount("Plain text with no citation.");
    const button = openExport();
    const dialog = screen.getByRole("dialog", { name: "Export" });
    expect(dialog.textContent).not.toContain("!");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("opens while issues block, with both export buttons disabled", async () => {
    await mount(TWO);
    openExport();
    const dialog = screen.getByRole("dialog", { name: "Export" });
    const n = blockingIssues(docOf(TWO)).length;
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(n);
    expect(within(dialog).getByRole("button", { name: /^Download .docx \(/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("updates list, count and buttons after an override without advancing timers", async () => {
    await mount(ONE);
    openExport();
    const dialog = (): HTMLElement => screen.getByRole("dialog", { name: "Export" });
    expect(within(dialog()).getByRole("button", { name: "Download .docx (1 blocking)" })).not.toBe(
      null,
    );
    saveOverride("Checked by hand", dialog());
    expect(within(dialog()).queryByRole("listitem")).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "Download .docx" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(within(dialog()).getByRole("button", { name: "Open print view" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("Go closes the dialog and focuses the Editor", async () => {
    await mount(ONE);
    openExport();
    act(() => {
      const dialog = screen.getByRole("dialog", { name: "Export" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Go" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(exportButton());
    expect(document.activeElement?.closest("[contenteditable]")).not.toBeNull();
  });

  it("print: schedules and flushes storage before opening the tab", async () => {
    const order: string[] = [];
    const { storage } = await mount("Plain text with no citation.", {
      openPrint: () => {
        order.push(`open:${String(storage.writes())}`);
        return true;
      },
    });
    const before = storage.writes();
    openExport();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open print view" }));
    });
    expect(storage.writes()).toBe(before + 1);
    expect(order).toEqual([`open:${String(before + 1)}`]);
  });

  it("print: a throwing setItem keeps the dialog open and does not open the tab", async () => {
    const openPrint = vi.fn(() => true);
    await mount("Plain text with no citation.", { openPrint, throwOnSet: true });
    openExport();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open print view" }));
    });
    expect(openPrint).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Export" });
    expect(within(dialog).getByRole("status").textContent).toBe("The print view did not open.");
  });

  it("print: openPrint returning false keeps the dialog open with the notice", async () => {
    await mount("Plain text with no citation.", { openPrint: () => false });
    openExport();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open print view" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Export" });
    expect(within(dialog).getByRole("status").textContent).toBe("The print view did not open.");
  });

  it("download success closes the dialog", async () => {
    const download = vi.fn();
    await mount("Plain text with no citation.", { download });
    openExport();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download .docx" }));
      await vi.waitFor(() => {
        expect(download).toHaveBeenCalledTimes(1);
      });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    const call = download.mock.calls[0] as [Uint8Array, string];
    expect(call[0]).toBeInstanceOf(Uint8Array);
    expect(call[1]).toMatch(/\.docx$/);
  });

  it("download failure keeps the dialog open with a notice", async () => {
    const download = vi.fn(() => {
      throw new Error("blocked by browser");
    });
    await mount("Plain text with no citation.", { download });
    openExport();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download .docx" }));
      await vi.waitFor(() => {
        expect(download).toHaveBeenCalledTimes(1);
      });
    });
    const dialog = screen.getByRole("dialog", { name: "Export" });
    expect(within(dialog).getByRole("status").textContent).toBe(
      "Export failed. Your document is unchanged.",
    );
  });
});
