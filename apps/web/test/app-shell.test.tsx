// @vitest-environment jsdom
import { apply, createDocument, setQuoteCheck } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { EDITOR_PLACEHOLDER } from "../src/components/editor-surface";
import { SMALL_SCREEN_EDITOR_NOTE } from "../src/components/small-screen-page";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { PANE_KEY, encodePreference } from "../src/pane-preference";
import type { AppServices } from "../src/services";
import type { ApiClient } from "../src/client/api";
import { modeApi } from "./support/mode-fetch";
import type { ModeSetting } from "./support/mode-fetch";
import { createManualTimers } from "./support/clock";
import type { ManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { createFakeViewport } from "./support/viewport";
import { fakeBrowserServices } from "./support/browser-services";
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

/** Storage holding a stored Pane_Preference, so tests that predate the first-visit rule see a closed Pane. */
function storageWithPane(open: boolean): MemoryStorage {
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(open));
  return storage;
}

function fixture(
  storage: MemoryStorage = storageWithPane(false),
  api: ApiClient = modeApi("fixtures").api,
): Fixture {
  const timers = createManualTimers();
  const services: AppServices = {
    api,
    now: timers.clock.now,
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
    const base = modeApi("fixtures").api;
    const noAssistant: ApiClient = {
      ...base,
      mode: () => Promise.resolve({ ok: true, value: { mode: "fixtures" } }),
    };
    await mount(fixture(storageWithPane(false), noAssistant));
    const app = document.querySelector(".app");
    if (app === null) throw new Error("no .app root");
    const roles = [...app.children].map((c) => c.getAttribute("role") ?? c.tagName.toLowerCase());
    expect(roles).toEqual(["toolbar", "main", "aside", "region"]);
    expect(screen.getByRole("complementary", { name: "Issues" })).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Reveal Codes" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Assistant" })).toBeNull();
  });

  it("renders the toolbar buttons in order with Verify and Export disabled when empty", async () => {
    await mount(fixture());
    const bar = screen.getByRole("toolbar");
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "New",
      "Open",
      "Load Mata v. Avianca",
      "Load demo motion",
      "Verify",
      "Show codes (Alt-F3)",
      "Export",
    ]);
    expect(
      buttons.filter((b) => (b as HTMLButtonElement).disabled).map((b) => b.textContent),
    ).toEqual(["Verify", "Export"]);
    expect(
      buttons.filter((b) => b.getAttribute("data-primary") === "true").map((b) => b.textContent),
    ).toEqual(["Load Mata v. Avianca"]);
  });

  it("exposes the Document textbox and an empty, polite status area", async () => {
    await mount(fixture());
    expect(screen.getByRole("textbox", { name: "Document" })).not.toBeNull();
    const status = within(screen.getByRole("toolbar")).getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("installs a stored Document on mount and hides the placeholder", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Stored draft."), [], null, null));
    await mount(fixture(storage));
    expect(screen.queryByText(/Type or paste your filing here/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("Stored draft.");
  });

  it("starts empty when the stored value is corrupt", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, "{not json");
    await mount(fixture(storage));
    expect(screen.getByText(EDITOR_PLACEHOLDER)).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("");
  });

  it("starts empty when reading storage throws", async () => {
    const storage = createMemoryStorage();
    storage.getItem = () => {
      throw new Error("SecurityError");
    };
    await mount(fixture(storage));
    expect(screen.getByText(EDITOR_PLACEHOLDER)).not.toBeNull();
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
  return paneRegion()?.lastElementChild?.firstElementChild?.textContent ?? "";
}

describe("AppShell Pane wiring _Requirements: 6.7, 13.3, 13.5, 13.6, 14.1, 14.2, 14.3, 14.4, 14.5_", () => {
  it("toggles the Pane with Alt-F3 from the editor, a toolbar button and the body", async () => {
    await mount(fixture());
    const app = document.querySelector(".app");
    const origins = [
      screen.getByRole("textbox", { name: "Document" }),
      within(screen.getByRole("toolbar")).getByRole("button", { name: "Verify" }),
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
    const button = screen.getByRole("button", { name: "Show codes (Alt-F3)" });
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
    storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Stored draft."), [], null, null));
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
    storage.setItem(AUTOSAVE_KEY, serialise(mismatchedDocument(), [], null, null));
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
    expect(first).toMatch(
      / {2}(Matches the opinion up to "[^"]+", then differs|Differs from the opinion from the first word): "/u,
    );
    expect(first).not.toContain("Diverges at");
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

const STORED = encodePreference;

function draftStorage(pane: boolean | null): MemoryStorage {
  const storage = pane === null ? createMemoryStorage() : storageWithPane(pane);
  storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Stored draft."), [], null, null));
  return storage;
}

describe("AppShell Pane_Preference _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.10, 12.1_", () => {
  it("opens the Pane on a first visit with no draft", async () => {
    await mount(fixture(createMemoryStorage()));
    expect(paneRegion()).not.toBeNull();
  });

  it("starts closed on a first visit with a draft", async () => {
    await mount(fixture(draftStorage(null)));
    expect(paneRegion()).toBeNull();
  });

  it("writes the first-visit choice", async () => {
    const f = fixture(createMemoryStorage());
    await mount(f);
    expect(f.storage.getItem(PANE_KEY)).toBe(STORED(true));
    const g = fixture(draftStorage(null));
    await mount(g);
    expect(g.storage.getItem(PANE_KEY)).toBe(STORED(false));
  });

  it("keeps a stored closed preference with no draft", async () => {
    await mount(fixture(storageWithPane(false)));
    expect(paneRegion()).toBeNull();
  });

  it.each([null, "draft"] as const)("opens for a stored open preference (%s)", async (kind) => {
    const storage = kind === null ? storageWithPane(true) : draftStorage(true);
    await mount(fixture(storage));
    expect(paneRegion()).not.toBeNull();
  });

  it("writes the new state on Alt-F3 and on the Toolbar button", async () => {
    const f = fixture(storageWithPane(false));
    await mount(f);
    pressKey(document.body, "F3", { altKey: true });
    expect(f.storage.getItem(PANE_KEY)).toBe(STORED(true));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Hide codes (Alt-F3)" }));
    });
    expect(f.storage.getItem(PANE_KEY)).toBe(STORED(false));
  });

  it("keeps the state across a reload", async () => {
    const f = fixture(storageWithPane(false));
    let view: ReturnType<typeof renderUi> | null = null;
    await act(async () => {
      view = renderUi(<AppShell services={f.services} />);
      await Promise.resolve();
    });
    pressKey(document.body, "F3", { altKey: true });
    expect(paneRegion()).not.toBeNull();
    act(() => {
      view?.unmount();
    });
    await mount(f);
    expect(paneRegion()).not.toBeNull();
  });

  it("keeps the in-memory state and sets no Notice when setItem throws", async () => {
    const storage = storageWithPane(false);
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    await mount(fixture(storage));
    pressKey(document.body, "F3", { altKey: true });
    expect(paneRegion()).not.toBeNull();
    expect(within(screen.getByRole("toolbar")).getByRole("status").textContent).toBe("");
  });
});

const CITING = "See Roe v. Wade, 410 U.S. 113 (1973).";

function citingStorage(): MemoryStorage {
  const storage = createMemoryStorage();
  storage.setItem(AUTOSAVE_KEY, serialise(storedDocument(CITING), [], null, null));
  return storage;
}

function verifyButton(): HTMLButtonElement {
  return within(screen.getByRole("toolbar")).getByRole("button", { name: /^Verify/ });
}

function result(): HTMLElement {
  return screen.getByRole("status", { name: "Verify result" });
}
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function mountWith(setting: ModeSetting, storage?: MemoryStorage) {
  const mode = modeApi(setting);
  await mount(fixture(storage, mode.api));
  await settle();
  return mode;
}

describe("AppShell mode badge and Verify _Requirements: 15.7, 15.8, 17.1, 17.12, 17.13_", () => {
  it("shows the fixtures Mode_Text and the Issues line only in fixtures mode", async () => {
    await mountWith("fixtures");
    const line = screen.getByRole("region", { name: "Status line" });
    expect(within(line).getByText("Demo mode: recorded CourtListener responses")).not.toBeNull();
    expect(screen.getByText(/^Demo mode checks only the recorded demo citations/)).not.toBeNull();
  });

  it("shows the live Mode_Text without the Issues line", async () => {
    await mountWith("live");
    expect(screen.getByText("Live CourtListener lookups")).not.toBeNull();
    expect(screen.queryByText(/Demo mode checks only/)).toBeNull();
  });

  it.each([
    ["fixtures", "Demo mode: recorded CourtListener responses"],
    ["live", "Live CourtListener lookups"],
    ["down", "Server unreachable"],
  ] as const)(
    "shows the %s Mode_Text in the Status_Line and not in the toolbar",
    async (setting, text) => {
      await mountWith(setting);
      const line = screen.getByRole("region", { name: "Status line" });
      expect(within(line).getByText(text)).not.toBeNull();
      expect(within(screen.getByRole("toolbar")).queryByText(text)).toBeNull();
    },
  );
  it("shows the Status_Line while the Pane is closed and removes it when the Pane opens", async () => {
    await mountWith("live");
    const line = screen.getByRole("region", { name: "Status line" });
    expect(line.hasAttribute("aria-live")).toBe(false);
    expect(within(line).getByText("Doc 1 Pg 1 Ln 1 Pos 1")).not.toBeNull();
    expect(line.textContent).toContain("Alt-F3 Codes   F7 Exit");
    for (const key of ["Alt-F3", "F7"]) {
      expect(within(line).getByText(key).tagName).toBe("STRONG");
    }
    pressKey(document.body, "F3", { altKey: true });
    expect(screen.queryByRole("region", { name: "Status line" })).toBeNull();
    expect(paneRegion()).not.toBeNull();
  });
  it.each([
    ["fixtures", "Demo mode: recorded CourtListener responses"],
    ["live", "Live CourtListener lookups"],
    ["down", "Server unreachable"],
  ] as const)("shows the %s Mode_Text in the Pane status line", async (setting, text) => {
    await mountWith(setting);
    pressKey(document.body, "F3", { altKey: true });
    const status = paneRegion()?.lastElementChild;
    expect(status?.lastElementChild?.textContent).toBe(text);
    expect(status?.firstElementChild?.textContent).toMatch(/^Doc 1/);
  });

  it("shows no Mode_Text in the Pane status line while the mode is loading", async () => {
    const api = { ...modeApi("live").api, mode: () => new Promise<never>(() => undefined) };
    await mount(fixture(undefined, api));
    pressKey(document.body, "F3", { altKey: true });
    expect(paneRegion()?.lastElementChild?.childElementCount).toBe(1);
  });

  it("keeps Verify enabled when the server is unreachable", async () => {
    await mountWith("down", citingStorage());
    expect(screen.getByText("Server unreachable")).not.toBeNull();
    expect(verifyButton().disabled).toBe(false);
  });

  it("disables Verify with no citation and enables it after a reporter citation is typed", async () => {
    await mountWith("fixtures");
    expect(verifyButton().disabled).toBe(true);
    const ed = editorOf();
    act(() => {
      ed.view.dispatch(ed.state.tr.insertText("See 410 U.S. 113 (1973).", 1));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(verifyButton().disabled).toBe(false);
    const marked = [...document.querySelectorAll('[data-primary="true"]')];
    expect(marked.map((b) => b.textContent)).toEqual(["Verify"]);
  });

  it("reads Verifying… and is disabled during a flow, then shows the summary in the Issues region", async () => {
    const mode = modeApi("fixtures");
    let release: () => void = () => undefined;
    mode.gate.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mount(fixture(citingStorage(), mode.api));
    await settle();
    act(() => {
      fireEvent.click(verifyButton());
    });
    expect(verifyButton().textContent).toBe("Verifying…");
    expect(verifyButton().disabled).toBe(true);
    expect(document.querySelector('[data-primary="true"]')).toBeNull();
    expect(result().textContent).toBe("");
    release();
    await settle();
    expect(verifyButton().textContent).toBe("Verify");
    expect(result().textContent).toContain("Citations:");
    expect(result().textContent).toContain("Checked ");
    expect(within(screen.getByRole("toolbar")).queryByText(/Citations:/)).toBeNull();
  });
});

/** Text of the rendered <title> element React hoisted into the head. */
function titleElement(): string | undefined {
  return document.head.querySelector("title")?.textContent ?? undefined;
}

function narrowFixture(width: number, storage: MemoryStorage = storageWithPane(false)) {
  const f = fixture(storage);
  const viewport = createFakeViewport(width);
  return { ...f, viewport, services: { ...f.services, viewport } };
}

describe("AppShell small screen _Requirements: 10.4, 10.5, 10.6, 10.8, 10.9, 10.10, 12.9_", () => {
  it("shows the page with two sentences, the Check and court rules links, no button or icon, only the hidden mark, at 799", async () => {
    await mount(narrowFixture(799));
    expect(document.querySelector(".app")).toBeNull();
    expect(document.querySelectorAll("main p")).toHaveLength(2);
    expect(document.querySelectorAll("button, svg")).toHaveLength(0);
    expect([...document.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/check",
      "/courts",
    ]);
    const pictures = [...document.querySelectorAll("img")];
    expect(pictures.map((i) => i.getAttribute("aria-hidden"))).toEqual(["true"]);
    expect(titleElement()).toBe("Reveal Codes");
  });

  it("shows the Shell at 800", async () => {
    await mount(narrowFixture(800));
    expect(document.querySelector(".app")).not.toBeNull();
    expect(screen.queryByText(SMALL_SCREEN_EDITOR_NOTE)).toBeNull();
  });

  it("replaces the Shell when the width falls below 800", async () => {
    const f = narrowFixture(1280);
    await mount(f);
    expect(document.querySelector(".app")).not.toBeNull();
    act(() => {
      f.viewport.setWidth(799);
    });
    expect(document.querySelector(".app")).toBeNull();
    expect(screen.getByText(SMALL_SCREEN_EDITOR_NOTE)).not.toBeNull();
  });

  it("mounts the Shell and loads the saved draft when the width reaches 800", async () => {
    const storage = storageWithPane(false);
    storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Saved Motion\nBody."), [], null, null));
    const f = narrowFixture(799, storage);
    await mount(f);
    expect(titleElement()).toBe("Reveal Codes");
    await act(async () => {
      f.viewport.setWidth(800);
      await Promise.resolve();
    });
    expect(document.querySelector(".app")).not.toBeNull();
    expect(titleElement()).toBe("Saved Motion \u2014 Reveal Codes");
  });
});

describe("AppShell Window_Title _Requirements: 10.1, 10.2, 10.3, 10.4, 14.4_", () => {
  const LONG = "A".repeat(70);
  it.each([
    ["an empty Document", "", "Reveal Codes"],
    ["a blank first line", "\n  \nText", "Text \u2014 Reveal Codes"],
    ["a plain Caption", "  Motion to Dismiss  \nBody.", "Motion to Dismiss \u2014 Reveal Codes"],
    ["a first line over 60 characters", LONG, `${"A".repeat(60)} \u2014 Reveal Codes`],
  ])("sets the title for %s", async (_name, text, expected) => {
    const storage = createMemoryStorage();
    if (text !== "") storage.setItem(AUTOSAVE_KEY, serialise(storedDocument(text), [], null, null));
    await mount(fixture(storage));
    expect(titleElement()).toBe(expected);
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
  });

  it("yields the Caption title for a saved Document loaded from storage on mount", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Saved Motion\nBody."), [], null, null));
    await mount(fixture(storage));
    expect(titleElement()).toBe("Saved Motion \u2014 Reveal Codes");
  });

  it("updates the rendered title after an edit", async () => {
    await mount(fixture());
    expect(titleElement()).toBe("Reveal Codes");
    const ed = editorOf();
    act(() => {
      ed.view.dispatch(ed.state.tr.insertText("Edited Caption", 1));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(titleElement()).toBe("Edited Caption \u2014 Reveal Codes");
  });
});
