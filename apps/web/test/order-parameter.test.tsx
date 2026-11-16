// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { classifyOrderParameter } from "../src/components/use-order-parameter";
import { optionText } from "../src/order-copy";
import { ORDER_KEY } from "../src/order-selection";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { entryOf } from "./support/order-fixtures";
import { act, renderUi, screen, within } from "./support/render";
import { createFakeViewport } from "./support/viewport";
import { ORDERS } from "@reveal-codes/export";

const VALID = "sdohio-newman";
const SUPERSEDED = "ndtex-starr-2023";
const UNKNOWN = "no-such-order";

function services(storage: MemoryStorage, width: number): AppServices {
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

async function mount(storage: MemoryStorage, width: number): Promise<void> {
  await act(async () => {
    renderUi(<AppShell services={services(storage, width)} />);
    await Promise.resolve();
  });
}

function storedId(storage: MemoryStorage): string | null {
  const raw = storage.getItem(ORDER_KEY);
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  const id = (parsed as { entryId?: unknown }).entryId;
  return typeof id === "string" ? id : null;
}

const toolbarNotice = (): string | null =>
  within(screen.getByRole("toolbar")).getByRole("status").textContent;
const selectionLine = (): HTMLElement | null => screen.queryByText(/^Selected: /);
const address = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("classifyOrderParameter _Requirements: 8.1, 8.3, 8.4_", () => {
  it("separates absent, applied, unknown and superseded values", () => {
    expect(classifyOrderParameter(ORDERS, null)).toEqual({ kind: "none" });
    expect(classifyOrderParameter(ORDERS, VALID)).toEqual({
      kind: "applied",
      entry: entryOf(VALID),
    });
    expect(classifyOrderParameter(ORDERS, UNKNOWN)).toEqual({ kind: "ignored" });
    expect(classifyOrderParameter(ORDERS, SUPERSEDED)).toEqual({ kind: "ignored" });
  });
});

describe("Order_Parameter at 1280px _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 16.5_", () => {
  it("stores a valid id, shows the notice, and removes the parameter without a new history entry", async () => {
    window.history.replaceState(null, "", `/?order=${VALID}&keep=1#top`);
    const length = window.history.length;
    const replace = vi.spyOn(window.history, "replaceState");
    const storage = createMemoryStorage();
    await mount(storage, 1280);
    const entry = entryOf(VALID);
    expect(storedId(storage)).toBe(VALID);
    expect(toolbarNotice()).toBe(
      `Court rule selected: ${entry.court.abbreviation}, ${optionText(entry)}.`,
    );
    expect(replace).toHaveBeenCalledTimes(1);
    expect(address()).toBe("/?keep=1#top");
    expect(window.history.length).toBe(length);
  });

  for (const [label, id] of [
    ["unknown", UNKNOWN],
    ["superseded", SUPERSEDED],
  ] as const) {
    it(`leaves selection and notice alone for a ${label} id, shows no error, removes the parameter`, async () => {
      window.history.replaceState(null, "", `/?order=${id}`);
      const length = window.history.length;
      const storage = createMemoryStorage();
      await mount(storage, 1280);
      expect(storedId(storage)).toBeNull();
      expect(toolbarNotice()).toBe("");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(address()).toBe("/");
      expect(window.history.length).toBe(length);
    });
  }

  it("keeps the selection and applies the notice when replaceState throws a DOMException", async () => {
    window.history.replaceState(null, "", `/?order=${VALID}`);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new DOMException("refused", "SecurityError");
    });
    const storage = createMemoryStorage();
    await mount(storage, 1280);
    expect(storedId(storage)).toBe(VALID);
    expect(toolbarNotice()).toContain("Court rule selected: ");
  });
});

describe("Order_Parameter at 600px _Requirements: 8.7, 8.9, 8.11, 8.12, 16.6_", () => {
  it("stores silently, removes the parameter, and shows the Selection_Line", async () => {
    window.history.replaceState(null, "", `/?order=${VALID}`);
    const storage = createMemoryStorage();
    await mount(storage, 600);
    const entry = entryOf(VALID);
    expect(storedId(storage)).toBe(VALID);
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(address()).toBe("/");
    expect(selectionLine()?.textContent).toBe(
      `Selected: ${entry.court.abbreviation}, ${optionText(entry)}. Open this page on a wider screen to draft under it.`,
    );
  });

  for (const [label, search] of [
    ["unknown", `?order=${UNKNOWN}`],
    ["superseded", `?order=${SUPERSEDED}`],
    ["absent", ""],
  ] as const) {
    it(`shows no Selection_Line for a ${label} parameter`, async () => {
      window.history.replaceState(null, "", `/${search}`);
      const storage = createMemoryStorage();
      await mount(storage, 600);
      expect(selectionLine()).toBeNull();
      expect(storedId(storage)).toBeNull();
      expect(address()).toBe("/");
    });
  }

  it("shows no Selection_Line for a selection made earlier in the Export dialog", async () => {
    const storage = createMemoryStorage();
    storage.setItem(ORDER_KEY, JSON.stringify({ version: 1, entryId: VALID }));
    await mount(storage, 600);
    expect(storedId(storage)).toBe(VALID);
    expect(selectionLine()).toBeNull();
  });
});
