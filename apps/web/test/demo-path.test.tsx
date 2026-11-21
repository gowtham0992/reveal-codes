// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { createFakeViewport } from "./support/viewport";
import { fakeBrowserServices } from "./support/browser-services";
import { modeApi } from "./support/mode-fetch";
import type { ModeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./support/render";

async function mountDemo(): Promise<ModeApi> {
  const timers = createManualTimers();
  const mode = modeApi("fixtures");
  const services: AppServices = {
    api: mode.api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: createMemoryStorage(),
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
    ...fakeBrowserServices(),
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
  return mode;
}

function button(name: RegExp | string): HTMLButtonElement {
  const isVerify = typeof name === "string" ? name === "Verify" : name.source === "^Verify";
  const scope = isVerify ? within(screen.getByRole("toolbar")) : screen;
  const b = scope.getByRole("button", { name });
  if (!(b instanceof HTMLButtonElement)) throw new Error("not a button");
  return b;
}

function pane(): HTMLElement {
  return screen.getByRole("region", { name: "Reveal Codes" });
}

/** Text of every Code_Item in the Pane, in order. */
function codes(): string[] {
  return [...pane().querySelectorAll('[role="img"]')].map((e) => e.textContent);
}

function count(all: readonly string[], code: string): number {
  return all.filter((c) => c === code).length;
}

function rows(): HTMLElement[] {
  // The Resolved citations list (a section) is not an Issues row.
  return [...document.querySelectorAll("aside li")].filter(
    (e): e is HTMLElement => e instanceof HTMLElement && e.closest("section") === null,
  );
}

function rowWith(code: string): HTMLElement {
  const row = rows().find((r) => r.textContent.includes(code));
  if (row === undefined) throw new Error(`no Issues row with ${code}`);
  return row;
}

function statusLine(): string {
  return pane().lastElementChild?.textContent ?? "";
}

async function loadAndOpenPane(): Promise<void> {
  await act(async () => {
    fireEvent.click(button("Load demo motion"));
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(button(/^Export/).textContent).toBe("Export (4 blocking)");
  });
  // The Pane opens on first visit; toggle it only when it is not already open.
  if (screen.queryByRole("region", { name: "Reveal Codes" }) === null) {
    act(() => {
      fireEvent.keyDown(document.body, { key: "F3", altKey: true, bubbles: true });
    });
  }
  // The recorded draft arrives checked, with every origin.
  const before = codes();
  expect(count(before, "[PST]")).toBeGreaterThan(0);
  expect(before.some((c) => c.startsWith("[AI:"))).toBe(true);
  expect(before.some((c) => c.startsWith("[AI>HUM:"))).toBe(true);
  expect(count(before, "[CIT ✘]")).toBe(4);
  expect(count(before, "[CIT …]")).toBe(0);
}

async function verifyAndWait(): Promise<void> {
  const started = Date.now();
  await act(async () => {
    fireEvent.click(button("Verify"));
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(button(/^Verify/).textContent).toBe("Verify");
    const result = screen.getByRole("status", { name: "Verify result" });
    expect(result.textContent).toContain("Citations: 2 found · 3 not found");
    expect(result.textContent).toContain("Quotations: 1 match · 1 not in the opinion");
    expect(within(screen.getByRole("toolbar")).queryByText(/Citations:/)).toBeNull();
  });
  expect(Date.now() - started).toBeLessThan(10_000);
}

function expectRedAndGreenCodes(): void {
  const after = codes();
  expect(count(after, "[CIT ✘]")).toBe(4);
  expect(count(after, "[CIT ✓]")).toBe(3);
  expect(count(after, "[QUO ✘]")).toBe(1);
  expect(count(after, "[QUO ✓]")).toBe(1);
  expect(button(/^Export/).textContent).toBe("Export (4 blocking)");
  expect(button(/^Export/).disabled).toBe(false);
  expectExportDialogLine();
}
function expectExportDialogLine(): void {
  act(() => {
    fireEvent.click(button(/^Export/));
  });
  const dialog = screen.getByRole("dialog", { name: "Export" });
  expect(within(dialog).getByText("4 blocking items remain")).not.toBe(null);
  expect(within(dialog).getByRole("button", { name: "Download .docx" })).toHaveProperty(
    "disabled",
    true,
  );
  act(() => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  });
}

function expectIssuesAndGo(): void {
  expect(rows()).toHaveLength(4);
  expect(rows().filter((r) => r.textContent.includes("not found"))).toHaveLength(4);
  const sentence =
    /(Matches the opinion up to "[^"]+", then differs|Differs from the opinion from the first word): "[^"]+"/u;
  expect(rowWith("QUO ✘").textContent).toMatch(sentence);
  expect(rowWith("QUO ✘").textContent).not.toContain("Diverges at");
  act(() => {
    fireEvent.click(within(rowWith("QUO ✘")).getByRole("button", { name: "Go" }));
  });
  expect(statusLine()).toMatch(/ {2}(Matches the opinion up to|Differs from the opinion from)/u);
  expect(statusLine()).not.toContain("Diverges at");
}

function overrideOne(): void {
  act(() => {
    fireEvent.click(within(rowWith("CIT ✘")).getByRole("button", { name: "Override…" }));
  });
  act(() => {
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Cite checked by hand" },
    });
  });
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Save override" }));
  });
  expect(codes().some((c) => c.startsWith("[OVR:"))).toBe(true);
  expect(button(/^Export/).textContent).toBe("Export (3 blocking)");
  expect(button(/^Export/).disabled).toBe(false);
}

function expectOnlyCitationsLeft(mode: ModeApi): void {
  const verifies = mode.routes.requests.filter((r) => r.url === "/api/verify");
  expect(verifies).toHaveLength(1);
  for (const r of mode.routes.requests) {
    expect(r.body === null || r.url === "/api/verify").toBe(true);
  }
  const body = verifies[0]?.body ?? "";
  expect(body).not.toContain("less stringent standards");
  expect(body).not.toContain("entitled to discovery");
}

describe("Demo path _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.7, 20.7_", () => {
  it("walks Load, Alt-F3, Verify, Go, Override with 4, 4, 3 blocking and no quote text on the wire", async () => {
    const mode = await mountDemo();
    expect(button("Verify").disabled).toBe(true);
    await loadAndOpenPane();
    // The recorded results show before any Verify (recorded-sample Requirement 3.5).
    expect(screen.getByRole("status", { name: "Verify result" }).textContent).toContain(
      "Citations: 2 found · 3 not found",
    );
    await verifyAndWait();
    expectRedAndGreenCodes();
    expectIssuesAndGo();
    overrideOne();
    expectOnlyCitationsLeft(mode);
    // The 10 s Verify bound is asserted above; the full jsdom walk needs more than vitest's 5 s default on a cold run.
  }, 30_000);
});
