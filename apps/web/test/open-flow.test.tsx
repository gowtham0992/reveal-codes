// @vitest-environment jsdom
import { createDocument } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportDocx } from "../src/client/export-docx";
import { pastedDocument } from "../src/client/pasted-document";
import { AppShell } from "../src/components/app-shell";
import { useOpenDraft } from "../src/components/use-open-draft";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { PANE_KEY, encodePreference } from "../src/pane-preference";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { createManualTimers } from "./support/clock";
import {
  EXPORT_NOW,
  EXPORT_VERIFIED_AT,
  pastedAiDeclaration,
  storeWith,
} from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { ISO } from "./support/persist-fixtures";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./support/render";
import { createFakeViewport } from "./support/viewport";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

type Fake = Readonly<{ file: File; reads: () => number }>;
/** A File whose byte reads are counted. */
function fakeFile(name: string, bytes: Uint8Array): Fake {
  let reads = 0;
  const copy = bytes.slice();
  const file = new File([copy], name);
  Object.defineProperty(file, "arrayBuffer", {
    value: () => {
      reads += 1;
      return Promise.resolve(copy.slice().buffer);
    },
  });
  return { file, reads: () => reads };
}

function services(storage: MemoryStorage = createMemoryStorage()): AppServices {
  const timers = createManualTimers();
  return {
    api: modeApi("fixtures").api,
    now: () => EXPORT_NOW,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
  };
}

function docWith(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

/** The Picker input, the drop listeners and the dialog, over a real Store. */
function Harness({ store, svc }: Readonly<{ store: Store; svc: AppServices }>) {
  const open = useOpenDraft(store, svc);
  return (
    <div>
      <input type="file" aria-label="Picker" {...open.api.openInput} />
      {open.dialog}
    </div>
  );
}

function mountHarness(seed?: (store: Store) => void) {
  const store = createStore(() => EXPORT_NOW);
  seed?.(store);
  const svc = services();
  renderUi(<Harness store={store} svc={svc} />);
  return store;
}

const picker = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>("Picker");
async function pick(file: File | null): Promise<void> {
  await act(async () => {
    fireEvent.change(picker(), { target: { files: file === null ? [] : [file] } });
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function drop(files: readonly File[], types: readonly string[] = ["Files"]) {
  let event: Event | null = null;
  await act(async () => {
    const e = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "dataTransfer", { value: { types, files } });
    document.body.dispatchEvent(e);
    event = e;
    await new Promise((r) => setTimeout(r, 0));
  });
  return event as unknown as Event;
}

/** The part of the Store an Open outcome decides, without timestamps that differ per clock. */
function installed(store: Store) {
  const s = store.getState();
  return {
    text: s.document.text,
    spans: s.document.spans,
    declaration: s.declaration,
    runLog: s.runLog,
    verifiedAt: s.verifiedAt,
    notice: s.notice,
    openNote: s.openNote,
  };
}

async function exportBytes(declaration: Declaration | null): Promise<Uint8Array> {
  const pasted = pastedDocument("Plain filing text. A second sentence follows.", ISO);
  if (typeof pasted === "string") throw new Error(pasted);
  const store = storeWith(pasted, EXPORT_VERIFIED_AT, declaration);
  const got: { bytes: Uint8Array | null } = { bytes: null };
  const outcome = await exportDocx(store, {
    now: () => EXPORT_NOW,
    download: (b) => {
      got.bytes = b;
    },
    orderContext: null,
  });
  if (outcome.status !== "exported" || got.bytes === null) {
    throw new Error("export fixture failed");
  }
  return got.bytes;
}

function rewriteBody(bytes: Uint8Array, edit: (xml: string) => string): Uint8Array {
  const parts = unzipSync(bytes);
  const part = parts["word/document.xml"];
  if (part === undefined) throw new Error("no document part");
  return zipSync({ ...parts, "word/document.xml": strToU8(edit(strFromU8(part))) });
}
const DATE_PARAGRAPH =
  /<w:p(?=[\s>])(?:(?!<\/w:p>)[\s\S])*>2026-11-20<(?:(?!<\/w:p>)[\s\S])*<\/w:p>/;
const withoutDate = (bytes: Uint8Array): Uint8Array =>
  rewriteBody(bytes, (xml) => xml.replace(DATE_PARAGRAPH, ""));
const changedBody = (bytes: Uint8Array): Uint8Array =>
  rewriteBody(bytes, (xml) => xml.replace(/(<w:t(?:\s[^>]*)?>)/, "$1ALTERED "));

describe("Picker and drop _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 4.1_", () => {
  it("reach the same function: the same file gives the same Store result", async () => {
    const bytes = utf8("A short filing paragraph.");
    const viaPicker = mountHarness();
    await pick(fakeFile("a.txt", bytes).file);
    const picked = installed(viaPicker);
    document.body.innerHTML = "";
    const viaDrop = mountHarness();
    await drop([fakeFile("a.txt", bytes).file]);
    expect(installed(viaDrop)).toEqual(picked);
    expect(picked.text).toBe("A short filing paragraph.");
    expect(picked.notice).toBe("Opened a.txt: 25 characters, marked as pasted.");
    expect(picked.declaration).toBeNull();
  });

  it("opens the same file twice: the input is cleared and each choice reads the file", async () => {
    const store = mountHarness();
    const fake = fakeFile("again.txt", utf8("Same text."));
    await pick(fake.file);
    expect(picker().value).toBe("");
    expect(store.getState().document.text).toBe("Same text.");
    await pick(fake.file);
    expect(fake.reads()).toBe(2);
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("changes nothing when the Picker is cancelled", async () => {
    const store = mountHarness((s) => {
      s.dispatch({ type: "replace", document: docWith("Kept text.") });
    });
    const before = store.getState();
    await pick(null);
    expect(store.getState()).toBe(before);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refuses a drop of several files, opens none and shows the two messages", async () => {
    const store = mountHarness();
    const a = fakeFile("a.txt", utf8("one"));
    const b = fakeFile("b.txt", utf8("two"));
    const event = await drop([a.file, b.file]);
    expect(event.defaultPrevented).toBe(true);
    expect(a.reads() + b.reads()).toBe(0);
    const s = store.getState();
    expect(s.document.text).toBe("");
    expect(s.notice).toBe("Open one file at a time.");
    expect(s.openNote).toBe("Open one file at a time. Drop a single file.");
  });

  it("leaves a drop with no file to the existing text drop", async () => {
    const store = mountHarness();
    const before = store.getState();
    const event = await drop([], ["text/plain"]);
    expect(event.defaultPrevented).toBe(false);
    expect(store.getState()).toBe(before);
  });

  it("draws no overlay on dragover and stops the browser navigating", () => {
    mountHarness();
    const html = document.body.innerHTML;
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(over, "dataTransfer", { value: { types: ["Files"], files: [] } });
    act(() => {
      document.body.dispatchEvent(over);
    });
    expect(over.defaultPrevented).toBe(true);
    expect(document.body.innerHTML).toBe(html);
  });
});

describe("opening installs the right Declaration _Requirements: 8.4, 8.5, 9.5, 9.6, 12.1, 12.2, 12.4, 12.5_", () => {
  it("clears a stored Declaration for text, and keeps run log and check date empty", async () => {
    const store = mountHarness((s) => {
      s.dispatch({
        type: "replace",
        document: docWith("Old."),
        verifiedAt: EXPORT_VERIFIED_AT,
        declaration: pastedAiDeclaration(),
      });
    });
    await pick(fakeFile("new.md", utf8("New text.")).file);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard and open" }));
      await Promise.resolve();
    });
    const s = store.getState();
    expect(s.document.text).toBe("New text.");
    expect(s.declaration).toBeNull();
    expect(s.verifiedAt).toBeNull();
    expect(s.runLog).toEqual([]);
  });

  it("restores the recorded Declaration and the Reopened message with the export date", async () => {
    const bytes = await exportBytes(pastedAiDeclaration());
    const store = mountHarness();
    await pick(fakeFile("filing.docx", bytes).file);
    const s = store.getState();
    expect(s.notice).toBe("Reopened filing.docx with its provenance record (exported 2026-11-20).");
    expect(s.declaration).toEqual(pastedAiDeclaration());
    expect(s.verifiedAt).toBeNull();
    expect(s.runLog).toEqual([]);
  });

  it("drops the parenthetical when the export has no date line", async () => {
    const bytes = withoutDate(await exportBytes(pastedAiDeclaration()));
    const store = mountHarness();
    await pick(fakeFile("filing.docx", bytes).file);
    expect(store.getState().notice).toBe("Reopened filing.docx with its provenance record.");
    expect(store.getState().declaration).toEqual(pastedAiDeclaration());
  });

  it("imports the body of a changed export as pasted text with no Declaration", async () => {
    const bytes = changedBody(await exportBytes(pastedAiDeclaration()));
    const store = mountHarness();
    await pick(fakeFile("filing.docx", bytes).file);
    const s = store.getState();
    expect(s.notice).toMatch(/^Opened filing\.docx: \d+ characters, marked as pasted\./);
    expect(s.openNote).toBe(
      "This file was changed after it was exported, so its provenance record was not restored. The text is marked as pasted.",
    );
    expect(s.declaration).toBeNull();
    expect(s.document.spans.every((sp) => sp.provenance.origin === "PST")).toBe(true);
  });

  it("names removed characters and notes in the opened message", async () => {
    const store = mountHarness();
    await pick(fakeFile("c.txt", utf8("Ab\u0001c\u0002d")).file);
    expect(store.getState().notice).toBe(
      "Opened c.txt: 4 characters, marked as pasted. 2 characters that Word files cannot store were removed.",
    );
  });
});

const PANE_CLOSED = (): MemoryStorage => {
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(false));
  return storage;
};

async function mountShell(storage: MemoryStorage): Promise<void> {
  await act(async () => {
    renderUi(<AppShell services={services(storage)} />);
    await Promise.resolve();
  });
}
const shellInput = (): HTMLInputElement =>
  screen.getByLabelText<HTMLInputElement>("Open a draft file");
const toolbarStatus = (): string =>
  within(screen.getByRole("toolbar")).getByRole("status").textContent;
const editorText = (): string => screen.getByRole("textbox", { name: "Document" }).textContent;
const primaryLabel = (): string | null =>
  within(screen.getByRole("toolbar"))
    .getAllByRole("button")
    .find((b) => b.getAttribute("data-primary") === "true")?.textContent ?? null;
async function shellPick(file: File): Promise<void> {
  await act(async () => {
    fireEvent.change(shellInput(), { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 0));
  });
}

function storedDraft(): MemoryStorage {
  const storage = PANE_CLOSED();
  storage.setItem(AUTOSAVE_KEY, serialise(docWith("Stored draft."), [], null, null));
  return storage;
}

describe("confirm before replace _Requirements: 2.4, 2.5, 4.2, 4.3, 4.4, 4.5_", () => {
  it("shows the exact dialog for a non-empty draft, focused on Cancel", async () => {
    await mountShell(storedDraft());
    await shellPick(fakeFile("motion.txt", utf8("Replacement.")).file);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Open a draft")).not.toBeNull();
    expect(
      within(dialog).getByText("Discard the current draft and open motion.txt?"),
    ).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Discard and open" })).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    });
  });

  it("leaves Document, stored draft, messages and undo untouched on Cancel", async () => {
    const storage = storedDraft();
    const stored = storage.getItem(AUTOSAVE_KEY);
    await mountShell(storage);
    const status = toolbarStatus();
    await shellPick(fakeFile("motion.txt", utf8("Replacement.")).file);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editorText()).toBe("Stored draft.");
    expect(storage.getItem(AUTOSAVE_KEY)).toBe(stored);
    expect(toolbarStatus()).toBe(status);
  });

  it("installs on Confirm and posts the Opened message in the Toolbar", async () => {
    await mountShell(storedDraft());
    await shellPick(fakeFile("motion.txt", utf8("Replacement.")).file);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard and open" }));
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editorText()).toBe("Replacement.");
    expect(toolbarStatus()).toBe("Opened motion.txt: 12 characters, marked as pasted.");
  });

  it("installs an empty document with no dialog", async () => {
    await mountShell(PANE_CLOSED());
    await shellPick(fakeFile("motion.txt", utf8("Replacement.")).file);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editorText()).toBe("Replacement.");
  });

  it("shows no dialog for a refusal and leaves everything unchanged", async () => {
    const storage = storedDraft();
    const stored = storage.getItem(AUTOSAVE_KEY);
    await mountShell(storage);
    await shellPick(fakeFile("scan.pdf", utf8("x")).file);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editorText()).toBe("Stored draft.");
    expect(storage.getItem(AUTOSAVE_KEY)).toBe(stored);
    expect(toolbarStatus()).toBe("Could not open scan.pdf.");
  });

  it("opens through the Toolbar Open button and the same hidden input", async () => {
    await mountShell(PANE_CLOSED());
    const click = shellInput().click.bind(shellInput());
    let clicked = 0;
    shellInput().click = () => {
      clicked += 1;
      click();
    };
    fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Open" }));
    expect(clicked).toBe(1);
  });
});

describe("Next_Step after opening text _Requirements: 19.4, 19.5, 19.6, 19.9_", () => {
  it("is Verify for text with a citation and Export for text with none", async () => {
    await mountShell(PANE_CLOSED());
    await shellPick(fakeFile("c.txt", utf8("See Roe v. Wade, 410 U.S. 113 (1973).")).file);
    expect(primaryLabel()).toBe("Verify");
    await shellPick(fakeFile("d.txt", utf8("No citations here.")).file);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard and open" }));
      await Promise.resolve();
    });
    expect(primaryLabel()).toBe("Export");
  });
});
