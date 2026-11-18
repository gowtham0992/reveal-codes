// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PRINT_BLOCKED, SAVE_COPY_FAILED, UNREADABLE_DRAFT } from "../src/notices";
import { AUTOSAVE_KEY, deserialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { act, screen, within } from "./support/render";
import {
  AUTOSAVE_FAILED,
  KINDS,
  aside,
  click,
  draftButton,
  mount,
  oldDraft,
  toolbar,
  toolbarNotice,
  type,
  wait300,
} from "./support/unreadable-draft";

describe.each(KINDS)("an unreadable draft: $kind _Requirements: 23.1, 23.3, 23.4, 23.5_", (k) => {
  it("is classified by deserialise as the named kind", () => {
    const r = deserialise(k.raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe(k.kind);
  });

  it("survives the load, typing and a 300 ms wait, with no write", async () => {
    const m = await mount({ raw: k.raw });
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(k.raw);
    expect(m.state.keyWrites).toBe(0);
    await type("Typed after load.");
    await wait300(m);
    await wait300(m);
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(k.raw);
    expect(m.state.keyWrites).toBe(0);
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("Typed after load.");
  });

  it("shows the notice in a polite status region and two buttons outside it", async () => {
    await mount({ raw: k.raw });
    const status = within(aside()).getByText(UNREADABLE_DRAFT);
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe(UNREADABLE_DRAFT);
    expect(status.getAttribute("aria-live") ?? "polite").toBe("polite");
    const buttons = within(aside()).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Save a copy", "Start a new document"]);
    for (const b of buttons) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
      expect(status.contains(b)).toBe(false);
    }
  });
});

describe("the notice changes nothing else _Requirements: 23.8_", () => {
  it("keeps the heading, Export, primary button and `No issues.` as without a notice", async () => {
    await mount({ raw: KINDS[0].raw });
    expect(screen.getByRole("heading", { name: "Issues" })).not.toBeNull();
    expect(
      within(toolbar()).getByRole<HTMLButtonElement>("button", { name: "Export" }).disabled,
    ).toBe(true);
    const primary = [...toolbar().querySelectorAll('[data-primary="true"]')];
    expect(primary.map((b) => b.textContent)).toEqual(["Load Mata v. Avianca"]);
    expect(within(aside()).getByText("No issues.")).not.toBeNull();
    expect(toolbarNotice()).toBe("");
  });
});

describe("the gate stays open _Requirements: 23.2_", () => {
  it("does not block when the value is absent, and the next edit is saved", async () => {
    const m = await mount();
    expect(within(aside()).queryByText(UNREADABLE_DRAFT)).toBeNull();
    await type("First.");
    await wait300(m);
    expect(m.inner.getItem(AUTOSAVE_KEY)).not.toBeNull();
  });

  it("does not block when getItem throws", async () => {
    const m = await mount({ raw: KINDS[0].raw, throwOnRead: true });
    expect(within(aside()).queryByText(UNREADABLE_DRAFT)).toBeNull();
    expect(within(aside()).queryByRole("button", { name: "Save a copy" })).toBeNull();
    expect(m.state.autosaveReads).toBeGreaterThan(0);
  });
});

describe("Save a copy _Requirements: 23.9, 23.10, 23.11_", () => {
  const VALUES = [
    { label: "ASCII", raw: "plain ascii {" },
    { label: "non-ASCII", raw: "not json \u00e9\u2014\u00fc \u65e5\u672c" },
    { label: "old pincite draft", raw: oldDraft() },
  ] as const;

  it.each(VALUES)("passes the stored $label value as UTF-8, unchanged", async (v) => {
    const download = vi.fn<AppServices["download"]>();
    const m = await mount({ raw: v.raw, download });
    await click(draftButton("Save a copy"));
    expect(download).toHaveBeenCalledTimes(1);
    const [bytes, name, mime] = download.mock.calls[0] ?? [];
    expect(Array.from(bytes ?? [])).toEqual(Array.from(new TextEncoder().encode(v.raw)));
    expect(new TextDecoder().decode(bytes)).toBe(v.raw);
    expect(name).toBe("reveal-codes-saved-draft.txt");
    expect(mime).toBe("text/plain;charset=utf-8");
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(v.raw);
    expect(within(aside()).getByText(UNREADABLE_DRAFT)).not.toBeNull();
  });

  it("shows SAVE_COPY_FAILED when the stored value cannot be read now", async () => {
    const download = vi.fn<AppServices["download"]>();
    const m = await mount({ raw: KINDS[0].raw, download });
    m.state.hideReads = true;
    await click(draftButton("Save a copy"));
    expect(download).not.toHaveBeenCalled();
    expect(toolbarNotice()).toBe(SAVE_COPY_FAILED);
    expect(within(aside()).getByText(UNREADABLE_DRAFT)).not.toBeNull();
  });

  it("shows SAVE_COPY_FAILED when download throws, and keeps value and notice", async () => {
    const download = vi.fn<AppServices["download"]>(() => {
      throw new Error("blocked");
    });
    const m = await mount({ raw: KINDS[0].raw, download });
    await click(draftButton("Save a copy"));
    expect(toolbarNotice()).toBe(SAVE_COPY_FAILED);
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(KINDS[0].raw);
    expect(within(aside()).getByText(UNREADABLE_DRAFT)).not.toBeNull();
  });
});

describe("Start a new document _Requirements: 23.12, 23.13, 23.14, 23.15, 23.16_", () => {
  const CONFIRM_MESSAGE =
    "Delete the saved draft that could not be read and start a new document? Anything on the page is discarded too.";

  function dialog(): HTMLElement {
    return screen.getByRole("dialog", { name: "Start a new document" });
  }

  it("shows the title, message and label; cancel changes nothing", async () => {
    const m = await mount({ raw: KINDS[1].raw });
    await click(draftButton("Start a new document"));
    expect(dialog().textContent).toContain(CONFIRM_MESSAGE);
    expect(within(dialog()).getByRole("button", { name: "Delete and start new" })).not.toBeNull();
    await click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(KINDS[1].raw);
    expect(within(aside()).getByText(UNREADABLE_DRAFT)).not.toBeNull();
  });

  it("confirming clears the value, drops the notice and resumes autosave", async () => {
    const m = await mount({ raw: KINDS[1].raw });
    await type("Typed over the unreadable draft.");
    await click(draftButton("Start a new document"));
    await click(within(dialog()).getByRole("button", { name: "Delete and start new" }));
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("");
    expect(within(aside()).queryByText(UNREADABLE_DRAFT)).toBeNull();
    await wait300(m);
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBeNull();
    await type("A later edit.");
    await wait300(m);
    const saved = deserialise(m.inner.getItem(AUTOSAVE_KEY));
    expect(saved.ok && saved.value.document.text).toBe("A later edit.");
  });

  it("a failed removal keeps the gate, shows AUTOSAVE_FAILED and writes nothing", async () => {
    const m = await mount({ raw: KINDS[2].raw, throwOnRemove: true });
    await click(draftButton("Start a new document"));
    await click(within(dialog()).getByRole("button", { name: "Delete and start new" }));
    expect(toolbarNotice()).toBe(AUTOSAVE_FAILED);
    expect(within(aside()).getByText(UNREADABLE_DRAFT)).not.toBeNull();
    await type("After the failure.");
    await wait300(m);
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(KINDS[2].raw);
    expect(m.state.keyWrites).toBe(0);
  });

  it("Toolbar New while blocked opens the same dialog and has the same effect", async () => {
    const m = await mount({ raw: KINDS[0].raw });
    await click(within(toolbar()).getByRole("button", { name: "New" }));
    expect(dialog().textContent).toContain(CONFIRM_MESSAGE);
    expect(screen.queryByRole("dialog", { name: "New document" })).toBeNull();
    await click(within(dialog()).getByRole("button", { name: "Delete and start new" }));
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBeNull();
    expect(within(aside()).queryByText(UNREADABLE_DRAFT)).toBeNull();
  });
});

describe("sample loads, print and width _Requirements: 23.17, 23.18, 23.19_", () => {
  it("a sample load leaves the notice, the gate and the stored value", async () => {
    const m = await mount({ raw: KINDS[0].raw });
    await click(within(toolbar()).getByRole("button", { name: "Load demo motion" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("Demo sample text.");
    await wait300(m);
    expect(within(aside()).getByText(UNREADABLE_DRAFT)).not.toBeNull();
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(KINDS[0].raw);
    expect(m.state.keyWrites).toBe(0);
  });

  it("Open print view shows PRINT_BLOCKED, opens no tab and writes nothing", async () => {
    const m = await mount({ raw: KINDS[0].raw });
    await type("Plain text.");
    await click(within(toolbar()).getByRole("button", { name: /^Export/ }));
    const exportDialog = screen.getByRole("dialog", { name: "Export" });
    await click(within(exportDialog).getByRole("button", { name: "Open print view" }));
    expect(within(exportDialog).getByRole("status").textContent).toBe(PRINT_BLOCKED);
    expect(m.openPrint).not.toHaveBeenCalled();
    expect(m.state.keyWrites).toBe(0);
    expect(m.inner.getItem(AUTOSAVE_KEY)).toBe(KINDS[0].raw);
  });

  it("at width 799 the stored draft is neither read nor blocked", async () => {
    const m = await mount({ raw: KINDS[0].raw, width: 799 });
    expect(m.state.autosaveReads).toBe(0);
    expect(screen.queryByText(UNREADABLE_DRAFT)).toBeNull();
  });
});
