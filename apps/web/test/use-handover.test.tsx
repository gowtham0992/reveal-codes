// @vitest-environment jsdom
import { createDocument } from "@reveal-codes/engine";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { textOutcome } from "../src/client/open-outcome";
import { useHandover } from "../src/components/use-handover";
import { HANDOVER_KEY, writeHandover } from "../src/handover";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { fakeBrowserServices } from "./support/browser-services";
import { createManualTimers } from "./support/clock";
import { EXPORT_NOW } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { ISO } from "./support/persist-fixtures";
import { act, fireEvent, renderUi, screen } from "./support/render";
import { createFakeViewport } from "./support/viewport";

const CHECKED = "Smith v. Jones, 410 U.S. 113 (1973), held otherwise.";

function services(): AppServices {
  const timers = createManualTimers();
  return {
    api: modeApi("fixtures").api,
    now: () => EXPORT_NOW,
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
}

function Harness({ store, svc }: Readonly<{ store: Store; svc: AppServices }>) {
  return <div>{useHandover(store, svc)}</div>;
}

function storeWithDraft(text: string | null): Store {
  const store = createStore(() => EXPORT_NOW);
  if (text !== null) {
    const created = createDocument(text, ISO);
    if (!created.ok) throw new Error("fixture rejected");
    store.dispatch({ type: "replace", document: created.value });
  }
  return store;
}

async function mount(store: Store, svc: AppServices, strict = false): Promise<void> {
  const ui = <Harness store={store} svc={svc} />;
  await act(async () => {
    renderUi(strict ? <StrictMode>{ui}</StrictMode> : ui);
    await Promise.resolve();
  });
}

const dialogs = () => screen.queryAllByRole("dialog");

describe("useHandover", () => {
  it("installs at once on an empty draft, as one PST span, and clears the key", async () => {
    const svc = services();
    writeHandover(svc.session, CHECKED);
    const store = storeWithDraft(null);
    await mount(store, svc);
    const s = store.getState();
    expect(s.document.text).toBe(CHECKED);
    expect(s.document.spans).toHaveLength(1);
    expect(s.document.spans[0]?.provenance.origin).toBe("PST");
    expect(dialogs()).toHaveLength(0);
    expect(svc.session.getItem(HANDOVER_KEY)).toBeNull();
  });

  it("does nothing when there is no hand-over", async () => {
    const store = storeWithDraft("My own draft.");
    await mount(store, services());
    expect(store.getState().document.text).toBe("My own draft.");
    expect(dialogs()).toHaveLength(0);
  });

  it("asks with the checker wording on a non-empty draft and keeps the draft until confirmed", async () => {
    const svc = services();
    writeHandover(svc.session, CHECKED);
    const store = storeWithDraft("My own draft.");
    await mount(store, svc);
    expect(screen.getByText("Open a draft")).toBeTruthy();
    expect(
      screen.getByText("Discard the current draft and open the draft from the checker?"),
    ).toBeTruthy();
    expect(store.getState().document.text).toBe("My own draft.");
    expect(svc.session.getItem(HANDOVER_KEY)).toBeNull();
  });

  it("installs the text as pasted when the author confirms", async () => {
    const svc = services();
    writeHandover(svc.session, CHECKED);
    const store = storeWithDraft("My own draft.");
    await mount(store, svc);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard and open" }));
      await Promise.resolve();
    });
    const s = store.getState();
    expect(s.document.text).toBe(CHECKED);
    expect(s.document.spans.every((sp) => sp.provenance.origin === "PST")).toBe(true);
    expect(dialogs()).toHaveLength(0);
  });

  it("keeps the draft on cancel and the key stays cleared", async () => {
    const svc = services();
    writeHandover(svc.session, CHECKED);
    const store = storeWithDraft("My own draft.");
    await mount(store, svc);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await Promise.resolve();
    });
    expect(store.getState().document.text).toBe("My own draft.");
    expect(dialogs()).toHaveLength(0);
    expect(svc.session.getItem(HANDOVER_KEY)).toBeNull();
  });

  it("shows one dialog under Strict Mode's double effect", async () => {
    const svc = services();
    writeHandover(svc.session, CHECKED);
    const store = storeWithDraft("My own draft.");
    await mount(store, svc, true);
    expect(screen.getAllByText("Open a draft")).toHaveLength(1);
    expect(dialogs()).toHaveLength(1);
  });

  it("installs once under Strict Mode on an empty draft", async () => {
    const svc = services();
    writeHandover(svc.session, CHECKED);
    const store = storeWithDraft(null);
    await mount(store, svc, true);
    expect(store.getState().document.text).toBe(CHECKED);
    expect(dialogs()).toHaveLength(0);
  });

  it("shows the success notice with a lower-case 'the' after 'Opened'", async () => {
    const svc = services();
    writeHandover(svc.session, "a".repeat(807));
    const store = storeWithDraft(null);
    await mount(store, svc);
    expect(store.getState().notice).toBe(
      "Opened the draft from the checker: 807 characters, marked as pasted.",
    );
  });

  it("starts a refusal's notice and note with a capital letter", async () => {
    const svc = services();
    svc.session.setItem(HANDOVER_KEY, "   \n  ");
    const store = storeWithDraft("My own draft.");
    await mount(store, svc);
    const { notice, openNote } = store.getState();
    expect(notice).toBe("Could not open the draft from the checker.");
    expect(openNote?.startsWith("The draft from the checker is empty.")).toBe(true);
  });

  it("keeps the case of a file name opened through the Open flow", () => {
    const outcome = textOutcome("Motion.docx", "Some text.", { notes: false, note: null });
    expect(outcome.kind === "text" ? outcome.notice : null).toBe(
      "Opened Motion.docx: 10 characters, marked as pasted.",
    );
    const refused = textOutcome("Motion.docx", "  ", { notes: false, note: null });
    expect(refused.kind === "refused" ? refused.notice : null).toBe("Could not open Motion.docx.");
  });

  it("refuses a blank hand-over with the Open flow's refusal and leaves the draft", async () => {
    const svc = services();
    svc.session.setItem(HANDOVER_KEY, "   \n  ");
    const store = storeWithDraft("My own draft.");
    await mount(store, svc);
    expect(store.getState().document.text).toBe("My own draft.");
    expect(dialogs()).toHaveLength(0);
    expect(store.getState().notice).not.toBeNull();
  });
});
