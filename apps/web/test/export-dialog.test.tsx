// @vitest-environment jsdom
import { blockingIssues, createDocument, setVerification } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import { useSyncExternalStore } from "react";
import { describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../src/components/export-dialog";
import type { ExportDialogProps } from "../src/components/export-dialog";
import { ExportIssues } from "../src/components/export-issues";
import { createOrderSelectionStore } from "../src/order-selection";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { pastedAiDeclaration } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { act, fireEvent, renderUi, screen } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const ONE = "See Roe v. Wade, 410 U.S. 113 (1973).";
const TWO = `${ONE} Also Miranda v. Arizona, 384 U.S. 436 (1966).`;
const NONE = "Plain text with no citation.";

function docOf(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

const dialogText = (): string => screen.getByRole("dialog", { name: "Export" }).textContent;

function props(document: Document, extra: Partial<ExportDialogProps> = {}): ExportDialogProps {
  const store = createStore(() => new Date(ISO));
  // The fixture documents are pasted text, so the author has already made the declaration.
  store.dispatch({ type: "declaration", declaration: pastedAiDeclaration() });
  return {
    document,
    store,
    orderStore: createOrderSelectionStore(createMemoryStorage(), ORDERS),
    now: () => new Date(ISO),
    notice: null,
    clearNotice: () => undefined,
    busy: false,
    onGo: () => undefined,
    onDownload: () => undefined,
    onPrint: () => undefined,
    onClose: () => undefined,
    ...extra,
  };
}

const button = (name: string | RegExp): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>("button", { name });

describe("ExportDialog states _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 2.9_", () => {
  it("is a modal dialog titled Export with enabled, unlabelled buttons when nothing blocks", () => {
    renderUi(<ExportDialog {...props(docOf(NONE))} />);
    const dialog = screen.getByRole("dialog", { name: "Export" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(button("Download .docx").disabled).toBe(false);
    expect(button("Open print view").disabled).toBe(false);
    expect(screen.queryByRole("list")).toBeNull();
    expect(dialog.textContent).not.toContain("!");
  });

  it("lists each blocking issue and disables both buttons with the count", () => {
    const doc = docOf(TWO);
    const n = blockingIssues(doc).length;
    expect(n).toBe(2);
    renderUi(<ExportDialog {...props(doc)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(n);
    expect(screen.getAllByRole("button", { name: "Go" })).toHaveLength(n);
    expect(screen.getAllByRole("button", { name: "Override…" })).toHaveLength(n);
    expect(button("Download .docx").disabled).toBe(true);
    expect(button("Open print view").disabled).toBe(true);
    expect(screen.getByText(`${String(n)} blocking items remain`)).toBeTruthy();
  });
  it.each([
    [TWO, "2 blocking items remain"],
    [ONE, "1 blocking item remains"],
  ])("shows the blocking line directly above the buttons for %#", (text, line) => {
    renderUi(<ExportDialog {...props(docOf(text))} />);
    const el = screen.getByText(line);
    expect(el.tagName).toBe("P");
    expect(el.nextElementSibling?.contains(button("Download .docx"))).toBe(true);
    const chip = el.firstElementChild;
    expect(chip?.textContent).toBe("\u2718");
    expect(chip?.getAttribute("aria-hidden")).toBe("true");
    expect(el.textContent).toBe(`\u2718${line}`);
  });
  it("shows no blocking line and plain labels when nothing blocks", () => {
    renderUi(<ExportDialog {...props(docOf(NONE))} />);
    expect(screen.queryByText(/blocking item/)).toBeNull();
    expect(dialogText()).not.toContain("\u2718");
    expect(button("Download .docx")).toBeTruthy();
  });
  it("shows Nothing to export as plain text with no chip", () => {
    renderUi(<ExportDialog {...props(docOf(""))} />);
    const el = screen.getByText("There is nothing to export yet.");
    expect(el.tagName).toBe("P");
    expect(el.children).toHaveLength(0);
    expect(dialogText()).not.toContain("\u2718");
  });
  it("gives the Export dialog the single shared dialog class", () => {
    renderUi(<ExportDialog {...props(docOf(NONE))} />);
    const cls = screen.getByRole("dialog", { name: "Export" }).className;
    expect(cls).not.toContain("Wide");
  });

  it("does not call the handlers of disabled buttons", () => {
    const onDownload = vi.fn();
    const onPrint = vi.fn();
    renderUi(<ExportDialog {...props(docOf(ONE), { onDownload, onPrint })} />);
    fireEvent.click(button("Download .docx"));
    fireEvent.click(button("Open print view"));
    expect(onDownload).not.toHaveBeenCalled();
    expect(onPrint).not.toHaveBeenCalled();
  });

  it("calls the handlers when clear, and disables Download while busy", () => {
    const onDownload = vi.fn();
    const onPrint = vi.fn();
    const { rerender } = renderUi(
      <ExportDialog {...props(docOf(NONE), { onDownload, onPrint })} />,
    );
    fireEvent.click(button("Download .docx"));
    fireEvent.click(button("Open print view"));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledTimes(1);
    rerender(<ExportDialog {...props(docOf(NONE), { busy: true })} />);
    expect(button("Download .docx").disabled).toBe(true);
    expect(button("Open print view").disabled).toBe(false);
  });

  it("shows the notice in a status line", () => {
    renderUi(<ExportDialog {...props(docOf(NONE), { notice: "The print view did not open." })} />);
    expect(screen.getByRole("status").textContent).toBe("The print view did not open.");
  });

  it("closes on Close and on Escape", () => {
    const onClose = vi.fn();
    renderUi(<ExportDialog {...props(docOf(NONE), { onClose })} />);
    fireEvent.click(button("Close"));
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ExportIssues text _Requirements: 2.3_", () => {
  function rowText(length: number): string {
    const text = "x".repeat(length);
    const document = docOf(text);
    const base = blockingIssues(docOf(ONE))[0];
    if (base === undefined) throw new Error("fixture has no issue");
    const issue = { ...base, start: 0, end: length };
    renderUi(
      <ExportIssues
        document={document}
        issues={[issue]}
        onGo={() => undefined}
        onOverride={() => undefined}
      />,
    );
    return screen.getByRole("listitem").querySelector("p")?.textContent ?? "";
  }

  it("shows 79 characters unchanged", () => {
    expect(rowText(79)).toBe("x".repeat(79));
  });

  it("shows 80 characters unchanged", () => {
    expect(rowText(80)).toBe("x".repeat(80));
  });

  it("cuts 81 characters to 79 plus an ellipsis", () => {
    const shown = rowText(81);
    expect(shown).toBe(`${"x".repeat(79)}…`);
    expect(shown).toHaveLength(80);
  });
});

describe("ExportIssues code chips", () => {
  function chipClasses(document: Document): readonly (readonly [string, string])[] {
    renderUi(
      <ExportIssues
        document={document}
        issues={blockingIssues(document)}
        onGo={() => undefined}
        onOverride={() => undefined}
      />,
    );
    return screen
      .getAllByRole("listitem")
      .map((li) => li.firstElementChild)
      .map((chip) => [chip?.textContent.trim() ?? "", chip?.className ?? ""] as const);
  }
  it("draws an unchecked code as the outline chip", () => {
    expect(chipClasses(docOf(ONE))).toEqual([["CIT …", expect.stringMatching(/codeChip(?!Fail)/)]]);
  });
  it("draws a failing code as the fail chip, the same two the Issues list uses", () => {
    const base = docOf(ONE);
    const first = base.citations[0];
    if (first?.kind !== "full") throw new Error("fixture has no full citation");
    const key = first.key;
    const marked = setVerification(base, key, { status: "not_found" });
    if (!marked.ok) throw new Error("fixture rejected");
    expect(chipClasses(marked.value)).toEqual([["CIT ✘", expect.stringContaining("codeChipFail")]]);
  });
});

describe("ExportDialog actions _Requirements: 2.4, 2.5_", () => {
  it("Go passes the issue start to onGo and then closes", () => {
    const doc = docOf(ONE);
    const issue = blockingIssues(doc)[0];
    const calls: string[] = [];
    const onGo = vi.fn((offset: number) => calls.push(`go:${String(offset)}`));
    const onClose = vi.fn(() => calls.push("close"));
    renderUi(<ExportDialog {...props(doc, { onGo, onClose })} />);
    fireEvent.click(button("Go"));
    expect(calls).toEqual([`go:${String(issue?.start)}`, "close"]);
  });

  it("Override… opens the Override_Dialog beside the dialog and returns focus to its opener on cancel", () => {
    renderUi(<ExportDialog {...props(docOf(TWO))} />);
    const opener = screen.getAllByRole("button", { name: "Override…" })[0] as HTMLElement;
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    expect(screen.getByRole("dialog", { name: /^Override / })).not.toBeNull();
    act(() => {
      fireEvent.click(button("Cancel"));
    });
    expect(screen.queryByRole("dialog", { name: /^Override / })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("moves focus into the dialog when the override removes the opener row", () => {
    const doc = docOf(ONE);
    const store = createStore(() => new Date(ISO));
    store.dispatch({
      type: "replace",
      document: doc,
      runLog: [],
      declaration: pastedAiDeclaration(),
    });
    function Live() {
      const d = useStoreDoc(store);
      return <ExportDialog {...props(d, { store })} />;
    }
    renderUi(<Live />);
    const opener = screen.getByRole("button", { name: "Override…" });
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Checked by hand" } });
    });
    act(() => {
      fireEvent.click(button("Save override"));
    });
    expect(screen.queryByRole("button", { name: "Override…" })).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Export" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(button("Download .docx").disabled).toBe(false);
  });
});

function useStoreDoc(store: Store): Document {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getState().document,
    () => store.getState().document,
  );
}
describe("ExportDialog with nothing to export", () => {
  it.each([
    ["an empty document", ""],
    ["a whitespace-only document", "  \n\t \u00a0\n"],
  ])("disables both actions and says so for %s", (_label, text) => {
    renderUi(<ExportDialog {...props(docOf(text))} />);
    expect(button("Download .docx").disabled).toBe(true);
    expect(button("Open print view").disabled).toBe(true);
    expect(button("Close").disabled).toBe(false);
    expect(screen.getAllByText("There is nothing to export yet.")).toHaveLength(1);
  });
  it("shows no such line for a document with text", () => {
    renderUi(<ExportDialog {...props(docOf(NONE))} />);
    expect(screen.queryByText("There is nothing to export yet.")).toBeNull();
    expect(button("Download .docx").disabled).toBe(false);
  });
});
