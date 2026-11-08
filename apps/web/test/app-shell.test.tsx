// @vitest-environment jsdom
import { apply, createDocument, setQuoteCheck } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import type { ManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { offsetToPos } from "../src/editor/offsets";
import { act, fireEvent, renderUi, screen, within } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";

function storedDocument(text: string): Document {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (!applied.ok) throw new Error("fixture rejected");
  return applied.value.document;
}

type Fixture = { services: AppServices; storage: MemoryStorage; timers: ManualTimers };

function fixture(storage: MemoryStorage = createMemoryStorage()): Fixture {
  const timers = createManualTimers();
  const services: AppServices = {
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
  };
  return { services, storage, timers };
}

async function mount(f: Fixture): Promise<void> {
  await act(async () => {
    renderUi(<AppShell services={f.services} />);
    await Promise.resolve();
  });
}

describe("AppShell _Requirements: 6.5, 6.6, 9.3, 10.1, 10.2, 10.15, 25.6_", () => {
  it("lays out the toolbar, main region and Issues region in that order, with no left column", async () => {
    await mount(fixture());
    const app = document.querySelector(".app");
    if (app === null) throw new Error("no .app root");
    const roles = [...app.children].map((c) => c.getAttribute("role") ?? c.tagName.toLowerCase());
    expect(roles).toEqual(["toolbar", "main", "aside"]);
    expect(screen.getByRole("complementary", { name: "Issues" })).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Reveal Codes" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Assistant" })).toBeNull();
  });

  it("renders the toolbar buttons in order with Verify and Export inert and disabled", async () => {
    await mount(fixture());
    const bar = screen.getByRole("toolbar");
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "New",
      "Load demo motion",
      "Verify",
      "Reveal Codes (Alt-F3)",
      "Export",
    ]);
    expect(
      buttons.filter((b) => (b as HTMLButtonElement).disabled).map((b) => b.textContent),
    ).toEqual(["Verify", "Export"]);
  });

  it("exposes the Document textbox and an empty, polite status area", async () => {
    await mount(fixture());
    expect(screen.getByRole("textbox", { name: "Document" })).not.toBeNull();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("installs a stored Document on mount and hides the placeholder", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Stored draft."), []));
    await mount(fixture(storage));
    expect(screen.queryByText(/Paste your draft here/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("Stored draft.");
  });

  it("starts empty when the stored value is corrupt", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, "{not json");
    await mount(fixture(storage));
    expect(screen.getByText("Paste your draft here, or start typing.")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("");
  });

  it("starts empty when reading storage throws", async () => {
    const storage = createMemoryStorage();
    storage.getItem = () => {
      throw new Error("SecurityError");
    };
    await mount(fixture(storage));
    expect(screen.getByText("Paste your draft here, or start typing.")).not.toBeNull();
  });
});

const QUOTE_TEXT =
  'See Roe v. Wade, 410 U.S. 113, 120 (1973) ("the quick brown fox jumps over the lazy dog").';

function mismatchedDocument(): Document {
  const created = createDocument(QUOTE_TEXT, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const quote = created.value.quotes[0];
  if (quote === undefined) throw new Error("fixture has no quote");
  const set = setQuoteCheck(created.value, quote.key, { status: "mismatch", prefixLength: 4 });
  if (!set.ok) throw new Error("fixture quote check rejected");
  return set.value;
}

function editorOf(): Editor {
  const el: HTMLElement & { editor?: Editor } = screen.getByRole("textbox", { name: "Document" });
  if (el.editor === undefined) throw new Error("no editor on the textbox");
  return el.editor;
}

function paneRegion(): HTMLElement | null {
  return screen.queryByRole("region", { name: "Reveal Codes" });
}

function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): boolean {
  let notCancelled = true;
  act(() => {
    notCancelled = fireEvent.keyDown(target, { key, bubbles: true, cancelable: true, ...init });
  });
  return notCancelled;
}

function statusLine(): string {
  return paneRegion()?.lastElementChild?.textContent ?? "";
}

describe("AppShell Pane wiring _Requirements: 6.7, 13.3, 13.5, 13.6, 14.1, 14.2, 14.3, 14.4, 14.5_", () => {
  it("toggles the Pane with Alt-F3 from the editor, a toolbar button and the body", async () => {
    await mount(fixture());
    const app = document.querySelector(".app");
    const origins = [
      screen.getByRole("textbox", { name: "Document" }),
      screen.getByRole("button", { name: "Verify" }),
      document.body,
    ];
    for (const origin of origins) {
      expect(pressKey(origin, "F3", { altKey: true })).toBe(false);
      expect(paneRegion()).not.toBeNull();
      expect(app?.getAttribute("data-pane")).toBe("open");
      pressKey(origin, "F3", { altKey: true });
      expect(paneRegion()).toBeNull();
      expect(app?.hasAttribute("data-pane")).toBe(false);
    }
  });

  it("ignores Alt-F3 while a modal is open", async () => {
    await mount(fixture());
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    expect(pressKey(document.body, "F3", { altKey: true })).toBe(true);
    expect(paneRegion()).toBeNull();
    modal.remove();
  });

  it("keeps the toolbar button aria-pressed in step with the Pane", async () => {
    await mount(fixture());
    const button = screen.getByRole("button", { name: "Reveal Codes (Alt-F3)" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    act(() => {
      fireEvent.click(button);
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(paneRegion()).not.toBeNull();
    pressKey(document.body, "F3", { altKey: true });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the F7 message for 2000 ms, restarts on a second press, then restores", async () => {
    const f = fixture();
    await mount(f);
    pressKey(document.body, "F3", { altKey: true });
    const before = statusLine();
    expect(before).not.toContain("Save document?");
    pressKey(document.body, "F7");
    expect(statusLine()).toBe("Save document? Yes (No)");
    act(() => {
      f.timers.advance(1500);
    });
    pressKey(document.body, "F7");
    act(() => {
      f.timers.advance(1500);
    });
    expect(statusLine()).toBe("Save document? Yes (No)");
    act(() => {
      f.timers.advance(500);
    });
    expect(statusLine()).toBe(before);
  });

  it("leaves F7 to the browser while the Pane is closed", async () => {
    await mount(fixture());
    expect(pressKey(document.body, "F7")).toBe(true);
    pressKey(document.body, "F3", { altKey: true });
    expect(statusLine()).not.toContain("Save document?");
  });

  it("moves the Editor selection when a Pane item is clicked", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Stored draft."), []));
    await mount(fixture(storage));
    pressKey(document.body, "F3", { altKey: true });
    const item = paneRegion()?.querySelector('span[aria-hidden="true"][data-offset="7"]');
    if (item === null || item === undefined) throw new Error("no Pane item at offset 7");
    act(() => {
      fireEvent.click(item);
    });
    const ed = editorOf();
    expect(ed.state.selection.head).toBe(offsetToPos(ed.state.doc, 7));
    expect(statusLine()).toContain("Pos 8");
  });

  it("shows the divergence words for a mismatched quote under the cursor and updates them on edit", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(mismatchedDocument(), []));
    await mount(fixture(storage));
    pressKey(document.body, "F3", { altKey: true });
    const at = QUOTE_TEXT.indexOf("quick") + 1;
    const item = paneRegion()?.querySelector(
      `span[aria-hidden="true"][data-offset="${String(at)}"]`,
    );
    if (item === null || item === undefined) throw new Error("no Pane item in the quote");
    act(() => {
      fireEvent.click(item);
    });
    const first = statusLine();
    expect(first).toMatch(/ {2}Diverges at: \S/);
    const ed = editorOf();
    const pos = offsetToPos(ed.state.doc, QUOTE_TEXT.indexOf("the quick"));
    act(() => {
      ed.view.dispatch(ed.state.tr.insertText("zzz yyy xxx ", pos ?? 1));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const second = statusLine();
    expect(second).not.toBe(first);
  });
});
