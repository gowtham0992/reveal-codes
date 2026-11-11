// @vitest-environment jsdom
import { createDocument, issues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { offsetToPos } from "../src/editor/offsets";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { createFakeViewport } from "./support/viewport";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen, within } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const TEXT = "Intro sentence. See Roe v. Wade, 410 U.S. 113 (1973).";

function stored(): Document {
  const created = createDocument(TEXT, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

type Mounted = Readonly<{ verifyRequests: () => number }>;
async function mount(verifiedAt: string | null = ISO): Promise<Mounted> {
  const timers = createManualTimers();
  const storage = createMemoryStorage();
  storage.setItem(AUTOSAVE_KEY, serialise(stored(), [], verifiedAt));
  const mode = modeApi("fixtures");
  const services: AppServices = {
    api: mode.api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
  return {
    verifyRequests: () => mode.routes.requests.filter((r) => r.url === "/api/verify").length,
  };
}

function editorOf(): Editor {
  const el: HTMLElement & { editor?: Editor } = screen.getByRole("textbox", { name: "Document" });
  if (el.editor === undefined) throw new Error("no editor on the textbox");
  return el.editor;
}

describe("Issues region in the shell _Requirements: 14.1, 18.2, 18.5, 18.7_", () => {
  it("lists the stored document's issues and moves the Editor selection on Go", async () => {
    await mount();
    const issue = issues(stored())[0];
    if (issue === undefined) throw new Error("fixture has no issue");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Go" }));
    });
    const ed = editorOf();
    expect(ed.state.selection.head).toBe(offsetToPos(ed.state.doc, issue.start));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Document" }));
  });

  it("records an override through the dialog and then shows Overridden", async () => {
    await mount();
    const opener = screen.getByRole("button", { name: "Override…" });
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Reason"), {
        target: { value: "Cite checked by hand" },
      });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Save override" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Overridden: Cite checked by hand")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Override…" })).toBeNull();
  });

  it("shows the three-line row with Go and Override… in the first line", async () => {
    await mount();
    const row = within(screen.getByRole("complementary", { name: /^Issues/ })).getAllByRole(
      "listitem",
    )[0];
    const [lineA, words, text] = Array.from(row?.children ?? []);
    expect(within(lineA as HTMLElement).getByRole("button", { name: "Go" })).not.toBeNull();
    expect(within(lineA as HTMLElement).getByRole("button", { name: "Override…" })).not.toBeNull();
    expect(words?.textContent).toMatch(/^blocking, /);
    expect(text?.textContent).toContain("410 U.S. 113");
  });
  it("ignores Alt-F3 while the Override dialog is open", async () => {
    await mount();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Override…" }));
    });
    let notCancelled = true;
    act(() => {
      notCancelled = fireEvent.keyDown(document.body, {
        key: "F3",
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
    });
    expect(notCancelled).toBe(true);
    expect(screen.queryByRole("region", { name: "Reveal Codes" })).toBeNull();
  });
});

describe("Unchecked_Row in the shell _Requirements: 6.1, 6.6, 6.7, 6.8, 6.9, 6.10, 12.6_", () => {
  const issuesRegion = (): HTMLElement => screen.getByRole("complementary", { name: /^Issues/ });

  it("shows the row before any run and hides it after a run", async () => {
    const m = await mount(null);
    expect(
      within(issuesRegion()).getByText("1 citation or quotation has not been checked."),
    ).not.toBeNull();
    expect(within(issuesRegion()).queryByRole("button", { name: "Go" })).toBeNull();
    const verify = within(issuesRegion()).getByRole("button", { name: "Verify" });
    expect(verify.hasAttribute("data-primary")).toBe(false);
    const row = verify.closest("li");
    expect(row?.firstElementChild?.contains(verify)).toBe(true);
    expect(row?.querySelector("[class*='chip'], [class*='words']")).toBeNull();
    await act(async () => {
      fireEvent.click(verify);
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(m.verifyRequests()).toBe(1);
    expect(within(issuesRegion()).queryByText(/have not been checked/)).toBeNull();
  });

  it("disables the row's button together with the Toolbar's", async () => {
    await mount(null);
    const toolbar = screen.getByRole("toolbar");
    const rowButton = within(issuesRegion()).getByRole("button", { name: "Verify" });
    const barButton = within(toolbar).getByRole("button", { name: "Verify" });
    expect(rowButton.hasAttribute("disabled")).toBe(barButton.hasAttribute("disabled"));
  });

  it("lists individual rows once a run has been recorded", async () => {
    await mount(ISO);
    expect(within(issuesRegion()).queryByText(/have not been checked/)).toBeNull();
    expect(within(issuesRegion()).getByRole("button", { name: "Go" })).not.toBeNull();
  });
});
