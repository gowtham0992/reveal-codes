// @vitest-environment jsdom
// End to end: load demo, Verify, blocked Export dialog, four overrides, Download, read the .docx bytes.
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { readDocxParagraphs } from "./support/docx-text";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./support/render";

const REASONS = [
  "Reporter page confirmed on the court's own docket.",
  "Second authority relied on in the same sentence.",
  "Quoted from the slip opinion, pagination differs.",
  "Citation to be corrected by the clerk's office.",
] as const;

type Downloaded = { bytes: Uint8Array; fileName: string };

async function mountDemo(downloads: Downloaded[]): Promise<void> {
  const timers = createManualTimers();
  const services: AppServices = {
    api: modeApi("fixtures").api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: createMemoryStorage(),
    download: (bytes, fileName) => {
      downloads.push({ bytes, fileName });
    },
    openPrint: () => true,
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
}

const button = (name: RegExp | string): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>("button", { name });

async function loadAndVerify(): Promise<void> {
  await act(async () => {
    fireEvent.click(button("Load demo motion"));
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(button("Verify"));
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(button(/^Export/).textContent).toBe("Export (4 blocking)");
  });
}

function overrideAllInDialog(): void {
  const dialog = (): HTMLElement => screen.getByRole("dialog", { name: "Export" });
  for (const reason of REASONS) {
    act(() => {
      fireEvent.click(within(dialog()).getAllByRole("button", { name: "Override…" })[0] as Element);
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: reason } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Save override" }));
    });
  }
}
function expectBlockedDialog(): void {
  act(() => {
    button(/^Export/).focus();
    fireEvent.click(button(/^Export/));
  });
  const dialog = screen.getByRole("dialog", { name: "Export" });
  expect(within(dialog).getAllByRole("listitem")).toHaveLength(4);
  expect(
    within(dialog).getByRole("button", { name: "Download .docx (4 blocking)" }),
  ).toHaveProperty("disabled", true);
  expect(within(dialog).getByRole("button", { name: /^Open print view/ })).toHaveProperty(
    "disabled",
    true,
  );
}

async function downloadFromClearDialog(downloads: Downloaded[]): Promise<Downloaded> {
  const open = screen.getByRole("dialog", { name: "Export" });
  expect(within(open).queryByRole("listitem")).toBeNull();
  const download = within(open).getByRole<HTMLButtonElement>("button", {
    name: "Download .docx",
  });
  expect(download.disabled).toBe(false);
  await act(async () => {
    fireEvent.click(download);
    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
  });
  expect(downloads).toHaveLength(1);
  return downloads[0] as Downloaded;
}

function statementOf(bytes: Uint8Array): string[] {
  const paras = readDocxParagraphs(bytes);
  const marks = paras.flatMap((p, i) => (p === "\f" ? [i] : []));
  expect(marks).toHaveLength(2);
  const [first, second] = marks as [number, number];
  expect(paras[first + 1]).toBe("AI-Use and Verification Statement");
  expect(paras[second + 1]).toBe("Provenance Appendix");
  return paras.slice(first + 1, second);
}

function expectStatementWording(statement: readonly string[]): void {
  const three = statement.find((p) => p.startsWith("3. ")) ?? "";
  expect(three).toMatch(
    /^3\. Every legal citation in this filing was checked against the CourtListener database on \d{4}-\d{2}-\d{2}\. /,
  );
  expect(three).toContain(
    "2 resolved to a single reported decision, 3 could not be found, 0 matched more than one decision, and 0 were not checked.",
  );
  expect(statement).toContain(
    "4. Quotations attributed to a cited decision were compared with the text of that decision. 1 matched, 1 did not, 0 were not checked.",
  );
  expect(statement).toContain(
    "5. The author chose to file despite the following unresolved items, for the reasons stated:",
  );
  for (const reason of REASONS) expect(statement).toContain(reason);
  expect(statement).toContain(
    "6. The author has read the filing in full and takes responsibility for its contents.",
  );
}

describe("Export flow end to end _Requirements: 2.2, 2.4, 6.1, 7.1, 10.3_", () => {
  it("blocks on 4, clears after four overrides, downloads a Statement that counts them", async () => {
    const downloads: Downloaded[] = [];
    await mountDemo(downloads);
    await loadAndVerify();
    expectBlockedDialog();
    overrideAllInDialog();
    const file = await downloadFromClearDialog(downloads);
    expect(file.fileName).toMatch(/^united-states-district-court-\d{4}-\d{2}-\d{2}\.docx$/);
    expectStatementWording(statementOf(file.bytes));
    expect(screen.queryByRole("dialog")).toBeNull();
  }, 30_000);
});
