// @vitest-environment jsdom
import { blockingIssues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import type { OrderEntry, OrderSet } from "@reveal-codes/export";
import { useMemo, useSyncExternalStore } from "react";
import { describe, expect, it, vi } from "vitest";
import { createAutosave } from "../src/autosave";
import { createDraftGate } from "../src/draft-gate";
import { Toolbar } from "../src/components/toolbar";
import { useExport } from "../src/components/use-export";
import { CONFIDENTIALITY_LABEL, curlyQuoted, quoted } from "../src/order-copy";
import { ORDER_KEY, createOrderSelectionStore } from "../src/order-selection";
import type { AppServices } from "../src/services";
import type { Store } from "../src/store-runtime";
import { createManualTimers } from "./support/clock";
import { readDocxParagraphs } from "./support/docx-text";
import { EXPORT_NOW, storeWith } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { createFakeViewport } from "./support/viewport";
import { fakeBrowserServices } from "./support/browser-services";
import type { MemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import {
  aiDocument,
  aiDocumentWithCitation,
  entryOf,
  humanDocument,
} from "./support/order-fixtures";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./support/render";

const SYNTHETIC_ID = vi.hoisted(() => "synthetic-courtwide-ban");

// Data only: the shipped set gains one Court_Wide_Entry that prohibits AI (none ships).
vi.mock("@reveal-codes/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@reveal-codes/export")>();
  const base = actual.ORDERS.entries.find((e) => e.id === "sdohio-newman");
  if (base === undefined) throw new Error("sdohio-newman missing");
  const synthetic: OrderEntry = {
    ...base,
    id: SYNTHETIC_ID,
    judge: null,
    instrument: "Local Rule 99",
    title: "No generative AI",
  };
  const orders: OrderSet = { ...actual.ORDERS, entries: [...actual.ORDERS.entries, synthetic] };
  return { ...actual, ORDERS: orders };
});

const CHOE = "cit-choe-groves-2025";
const SENTENCE =
  "The author certifies that no confidential or business proprietary information was entered into the program.";

type Downloaded = { bytes: Uint8Array; fileName: string };

function useDoc(store: Store): Document {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getState().document,
    () => store.getState().document,
  );
}

type Rig = Readonly<{ storage: MemoryStorage; downloads: Downloaded[]; store: Store }>;

function services(storage: MemoryStorage, downloads: Downloaded[]): AppServices {
  const timers = createManualTimers();
  return {
    api: modeApi("fixtures").api,
    now: () => EXPORT_NOW,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: (bytes, fileName) => {
      downloads.push({ bytes, fileName });
    },
    openPrint: () => true,
    viewport: createFakeViewport(),
    ...fakeBrowserServices(),
  };
}

function mount(document: Document, storage = createMemoryStorage()): Rig {
  const downloads: Downloaded[] = [];
  const svc = services(storage, downloads);
  const store = storeWith(document, null);
  const autosave = createAutosave({
    storage,
    setTimer: svc.setTimer,
    clearTimer: svc.clearTimer,
    onError: () => undefined,
  });
  function Harness() {
    const doc = useDoc(store);
    const notice = useSyncExternalStore(
      store.subscribe,
      () => store.getState().notice,
      () => store.getState().notice,
    );
    const orderStore = useMemo(() => createOrderSelectionStore(storage, ORDERS), []);
    const x = useExport({
      svc,
      store,
      autosave,
      gate: createDraftGate(),
      doc,
      notice,
      orderStore,
      onGo: () => undefined,
    });
    return (
      <>
        <Toolbar notice={null} step="none" paneOpen={false} verifyDisabled={false} {...x.toolbar} />
        {x.dialog}
      </>
    );
  }
  renderUi(<Harness />);
  return { storage, downloads, store };
}

const button = (name: string | RegExp): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>("button", { name });
const openDialog = (): void => {
  act(() => {
    fireEvent.click(button(/^Export/));
  });
};
const closeDialog = (): void => {
  act(() => {
    fireEvent.click(button("Close"));
  });
};
const choose = (id: string): void => {
  act(() => {
    fireEvent.change(screen.getByRole("combobox", { name: "Court or judge" }), {
      target: { value: id },
    });
  });
};
const tickbox = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("checkbox");
const dialog = (): HTMLElement => screen.getByRole("dialog", { name: "Export" });

describe("prohibition block _Requirements: 5.5, 5.6, 5.7, 5.8, 9.7, 9.12_", () => {
  it("under sdohio-newman with one AI span shows the line and the quoted key language", () => {
    mount(aiDocument());
    openDialog();
    choose("sdohio-newman");
    const entry = entryOf("sdohio-newman");
    const text = dialog().textContent;
    expect(text).toContain(
      'Judge Newman\'s order prohibits AI-drafted text. 1 AI-origin passage remains: paragraph 2, beginning "The movant relies on the record.\u2026".',
    );
    expect(text).toContain(curlyQuoted(entry.key_language));
    expect(text).not.toContain(quoted(entry.key_language));
    expect(text.split(entry.key_language)).toHaveLength(2);
    expect(button("Download .docx").disabled).toBe(true);
    expect(button("Open print view").disabled).toBe(true);
  });

  it("offers no override control and leaves the Issues list and toolbar label unchanged", () => {
    const doc = aiDocument();
    expect(blockingIssues(doc)).toHaveLength(0);
    mount(doc);
    expect(button(/^Export/).textContent).toBe("Export");
    openDialog();
    choose("sdohio-newman");
    expect(screen.queryByRole("button", { name: /Override/ })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(button(/^Export/).textContent).toBe("Export");
    expect(button("Download .docx")).toBeTruthy();
  });

  it("keeps Blocking_Issues in the list and labels, and adds the block on top", () => {
    const doc = aiDocumentWithCitation();
    expect(blockingIssues(doc)).toHaveLength(1);
    mount(doc);
    expect(button(/^Export/).textContent).toBe("Export (1 blocking)");
    openDialog();
    choose("sdohio-newman");
    expect(within(dialog()).getAllByRole("listitem")).toHaveLength(1);
    expect(dialog().textContent).toContain("prohibits AI-drafted text.");
    expect(screen.getAllByRole("button", { name: "Override\u2026" })).toHaveLength(1);
    expect(button("Download .docx").disabled).toBe(true);
    expect(button("Open print view").disabled).toBe(true);
    expect(button(/^Export \(/).textContent).toBe("Export (1 blocking)");
  });

  it("shows no block without AI text, and none for a non-prohibition entry with AI text", () => {
    mount(humanDocument());
    openDialog();
    choose("sdohio-newman");
    expect(dialog().textContent).not.toContain("prohibits");
    expect(button("Download .docx").disabled).toBe(false);
    closeDialog();
  });

  it("shows the instrument form for a Court_Wide_Entry, by paragraph and never lines", () => {
    mount(aiDocument());
    openDialog();
    choose(SYNTHETIC_ID);
    const text = screen.getByText(/prohibits AI-drafted text/).textContent;
    expect(text).toBe(
      'Local Rule 99 prohibits AI-drafted text. 1 AI-origin passage remains: paragraph 2, beginning "The movant relies on the record.\u2026".',
    );
    expect(text).not.toContain("Judge");
    expect(text).toContain("paragraph 2");
    expect(text).not.toMatch(/\blines?\b/i);
    expect(button("Download .docx").disabled).toBe(true);
  });

  it("uses the word paragraph, never lines, under the judge entry too", () => {
    mount(aiDocument());
    openDialog();
    choose("sdohio-newman");
    const text = screen.getByText(/prohibits AI-drafted text/).textContent;
    expect(text).toContain("paragraph 2, beginning");
    expect(text).not.toMatch(/\blines?\b/i);
  });
});

describe("Confidentiality_Checkbox _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 9.8_", () => {
  it("is shown only when AI text is used", () => {
    mount(humanDocument());
    openDialog();
    choose(CHOE);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(button("Download .docx").disabled).toBe(false);
  });

  it("is not shown for an entry without the confidentiality element", () => {
    mount(aiDocument());
    openDialog();
    choose("edtex-love-2025");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(button("Download .docx").disabled).toBe(false);
  });

  it("gates both buttons until ticked", () => {
    mount(aiDocument());
    openDialog();
    choose(CHOE);
    expect(screen.getByLabelText(CONFIDENTIALITY_LABEL)).toBe(tickbox());
    expect(tickbox().checked).toBe(false);
    expect(button("Download .docx").disabled).toBe(true);
    expect(button("Open print view").disabled).toBe(true);
    act(() => {
      fireEvent.click(tickbox());
    });
    expect(button("Download .docx").disabled).toBe(false);
    expect(button("Open print view").disabled).toBe(false);
  });

  it("is cleared when the selection changes", () => {
    mount(aiDocument());
    openDialog();
    choose(CHOE);
    act(() => {
      fireEvent.click(tickbox());
    });
    expect(tickbox().checked).toBe(true);
    choose("cit-restani-2025");
    expect(tickbox().checked).toBe(false);
    expect(button("Download .docx").disabled).toBe(true);
  });

  it("is cleared on reopen and never persisted", () => {
    const { storage } = mount(aiDocument());
    openDialog();
    choose(CHOE);
    act(() => {
      fireEvent.click(tickbox());
    });
    expect(Array.from(storage.data.keys())).toEqual([ORDER_KEY]);
    expect(Array.from(storage.data.values()).join("")).not.toMatch(/confiden|tick|certif/i);
    closeDialog();
    openDialog();
    expect(tickbox().checked).toBe(false);
    expect(button("Download .docx").disabled).toBe(true);
  });

  it("is cleared when the Document changes so that the box is no longer needed", () => {
    const { store } = mount(aiDocument());
    openDialog();
    choose(CHOE);
    act(() => {
      fireEvent.click(tickbox());
    });
    act(() => {
      store.dispatch({ type: "replace", document: humanDocument() });
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
    act(() => {
      store.dispatch({ type: "replace", document: aiDocument() });
    });
    expect(tickbox().checked).toBe(false);
  });

  async function tickedDownload(): Promise<string[]> {
    const { downloads } = mount(aiDocument());
    openDialog();
    choose(CHOE);
    act(() => {
      fireEvent.click(tickbox());
    });
    await act(async () => {
      fireEvent.click(button("Download .docx"));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    const first = downloads[0];
    if (first === undefined) throw new Error("no download");
    return readDocxParagraphs(first.bytes);
  }

  it("puts the confidentiality sentence in the downloaded Statement when ticked", async () => {
    const paragraphs = await tickedDownload();
    expect(paragraphs.some((p) => p.includes(SENTENCE))).toBe(true);
  });

  it("downloads nothing and has no sentence to show while the box is unticked", () => {
    const { downloads } = mount(aiDocument());
    openDialog();
    choose(CHOE);
    fireEvent.click(button("Download .docx"));
    expect(downloads).toHaveLength(0);
    expect(button("Download .docx").disabled).toBe(true);
  });
});

describe("export result notice _Requirements: 3.5, 5.11_", () => {
  async function exportOnce(): Promise<Rig> {
    const rig = mount(humanDocument());
    openDialog();
    await act(async () => {
      fireEvent.click(button("Download .docx"));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(rig.downloads).toHaveLength(1);
    });
    return rig;
  }

  it("is gone when the dialog is closed and opened again", async () => {
    const { store } = await exportOnce();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Export" })).toBeNull();
    });
    expect(store.getState().notice).toMatch(/^Exported .*\.docx\.$/);
    openDialog();
    expect(store.getState().notice).toBeNull();
    expect(within(dialog()).getByRole("status").textContent).toBe("");
  });

  it("is cleared when the court is changed in the Picker", async () => {
    const { store } = await exportOnce();
    openDialog();
    act(() => {
      store.dispatch({ type: "notice", text: "Exported example.docx." });
    });
    expect(within(dialog()).getByRole("status").textContent).toBe("Exported example.docx.");
    choose("sdohio-newman");
    expect(store.getState().notice).toBeNull();
    expect(within(dialog()).getByRole("status").textContent).toBe("");
  });
});
