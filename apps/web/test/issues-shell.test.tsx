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
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const TEXT = "Intro sentence. See Roe v. Wade, 410 U.S. 113 (1973).";

function stored(): Document {
  const created = createDocument(TEXT, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

async function mount(): Promise<void> {
  const timers = createManualTimers();
  const storage = createMemoryStorage();
  storage.setItem(AUTOSAVE_KEY, serialise(stored(), [], null));
  const services: AppServices = {
    api: modeApi("fixtures").api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
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
