// @vitest-environment jsdom
import { createDocument, issues } from "@reveal-codes/engine";
import type { Document, Issue } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ExportDialog } from "../src/components/export-dialog";
import { IssuesRegion } from "../src/components/issues-region";
import { Toolbar } from "../src/components/toolbar";
import { issueText } from "../src/components/issues-list";
import { OverrideDialog, PRINTED_STATEMENT, REASON_HINT } from "../src/components/override-dialog";
import { createOrderSelectionStore } from "../src/order-selection";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { createMemoryStorage } from "./support/memory-storage";
import { act, fireEvent, renderUi, screen, within } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const now = (): Date => new Date(ISO);

function seededStore(): { store: Store; key: string } {
  const store = createStore(now);
  const created = createDocument("See Roe v. Wade, 410 U.S. 113 (1973).", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  store.dispatch({ type: "replace", document: created.value });
  const first = issues(created.value)[0];
  if (first === undefined) throw new Error("fixture has no issue");
  return { store, key: first.key };
}

function Harness(props: { store: Store; issueKey: string; issueText?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open override dialog
      </button>
      {open ? (
        <OverrideDialog
          issueKey={props.issueKey}
          code="CIT …"
          mismatch={null}
          issueText={props.issueText ?? "410 U.S. 113"}
          store={props.store}
          now={now}
          restoreFocus={null}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function openDialog(): HTMLElement {
  const opener = screen.getByRole("button", { name: "Open override dialog" });
  opener.focus();
  act(() => {
    fireEvent.click(opener);
  });
  return opener;
}

function typeReason(value: string): void {
  act(() => {
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value } });
  });
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Save override" });
}

function tab(shiftKey = false): void {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey });
  });
}

function ListFixture({ doc, store }: { doc: Document; store: Store }) {
  return (
    <IssuesRegion
      document={doc}
      store={store}
      now={now}
      onGo={() => undefined}
      verifiedAt={ISO}
      note={null}
      verify={{ start: () => undefined, disabled: false }}
    />
  );
}

function ExportFixture({ doc, store }: { doc: Document; store: Store }) {
  return (
    <ExportDialog
      document={doc}
      store={store}
      orderStore={createOrderSelectionStore(createMemoryStorage(), ORDERS)}
      now={now}
      notice={null}
      clearNotice={() => undefined}
      busy={false}
      onGo={() => undefined}
      onDownload={() => undefined}
      onPrint={() => undefined}
      onClose={() => undefined}
    />
  );
}

function clickLastOverride(): void {
  const buttons = screen.getAllByRole("button", { name: "Override…" });
  act(() => {
    fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
  });
}

describe("OverrideDialog _Requirements: 18.5, 18.6, 18.7, 18.8, 18.9_", () => {
  it("opens as a modal with a focused reason field and the certification statement", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    openDialog();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Reason"));
    expect(screen.getByText("The reason is printed in the certification.")).not.toBeNull();
  });

  it("rejects fewer than 10 trimmed characters with a message and accepts 10", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    openDialog();
    expect(saveButton().disabled).toBe(true);
    typeReason("   short    ");
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(REASON_HINT)).not.toBeNull();
    typeReason("exactly 10");
    expect(saveButton().disabled).toBe(false);
    expect(screen.queryByText(REASON_HINT)).toBeNull();
  });

  it("records the reason as typed with the injected timestamp, then closes", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    openDialog();
    typeReason("  Filed with a clerk-approved cite.  ");
    act(() => {
      fireEvent.click(saveButton());
    });
    expect(store.getState().document.overrides).toEqual([
      { key, reason: "  Filed with a clerk-approved cite.  ", timestamp: ISO },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open and shows the error kind when the Store rejects", () => {
    const { store } = seededStore();
    renderUi(<Harness store={store} issueKey="k999" />);
    openDialog();
    typeReason("a long enough reason");
    act(() => {
      fireEvent.click(saveButton());
    });
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/^Could not save the override: \w+\.$/);
    expect(store.getState().document.overrides).toEqual([]);
  });

  it("cancels on Escape and on Cancel without an action, and returns focus", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    const opener = openDialog();
    typeReason("a long enough reason");
    act(() => {
      fireEvent.keyDown(screen.getByLabelText("Reason"), { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    openDialog();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(store.getState().document.overrides).toEqual([]);
  });
});

describe("OverrideDialog buttons _Requirements: 8.4, 8.10, 8.11_", () => {
  it("puts Cancel before Save override, which is last and carries data-primary", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    openDialog();
    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    const names = buttons.map((b) => b.textContent);
    expect(names).toEqual(["Cancel", "Save override"]);
    const save = saveButton();
    expect(buttons[buttons.length - 1]).toBe(save);
    expect(save.getAttribute("data-primary")).toBe("true");
    expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("data-primary")).toBe(false);
  });

  it("keeps data-primary on a disabled Save override", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    openDialog();
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().getAttribute("data-primary")).toBe("true");
  });

  it("gives the Reason label the small-label class", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    openDialog();
    const label = document.querySelector("label");
    expect(label?.textContent).toBe("Reason");
    expect(label?.classList.contains("small-label")).toBe(true);
  });

  it("traps Tab between the field, Cancel and Save override", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} />);
    openDialog();
    typeReason("a long enough reason");
    expect(document.activeElement).toBe(screen.getByLabelText("Reason"));
    tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    tab();
    expect(document.activeElement).toBe(saveButton());
    tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Reason"));
    tab(true);
    expect(document.activeElement).toBe(saveButton());
  });

  it("leaves the Toolbar with at most one data-primary while the dialog is open", () => {
    const { store, key } = seededStore();
    renderUi(
      <div>
        <Toolbar notice={null} paneOpen={false} verifyDisabled={false} step="verify" />
        <Harness store={store} issueKey={key} />
      </div>,
    );
    openDialog();
    const marked = (root: HTMLElement): HTMLElement[] =>
      within(root)
        .getAllByRole("button")
        .filter((b) => b.getAttribute("data-primary") === "true");
    const toolbar = screen.getByRole("toolbar", { name: "Document actions" });
    expect(marked(toolbar).map((b) => b.textContent)).toEqual(["Verify"]);
    expect(marked(screen.getByRole("dialog")).map((b) => b.textContent)).toEqual(["Save override"]);
  });
});

function docOf(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

function quoteIssue(doc: Document): Issue {
  const found = issues(doc).find((i) => i.code === "QUO …");
  if (found === undefined) throw new Error("fixture has no quote issue");
  return found;
}

function longQuoteDoc(filler: string): Document {
  return docOf(`See Roe v. Wade, 410 U.S. 113 (1973) ("${filler}").`);
}

describe("OverrideDialog issue text _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 12.8, 12.14_", () => {
  it("shows short issue text directly under the title and above the statement", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} issueText="410 U.S. 113" />);
    openDialog();
    const text = screen.getByText("410 U.S. 113");
    const statement = screen.getByText(PRINTED_STATEMENT);
    const title = screen.getByRole("heading", { name: "Override CIT …" });
    expect(title.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text.compareDocumentPosition(statement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("cuts 120 characters to 79 plus an ellipsis", () => {
    const doc = longQuoteDoc("x".repeat(120));
    const issue = quoteIssue(doc);
    expect(issue.end - issue.start).toBe(120);
    const shown = issueText(doc, issue);
    const { store } = seededStore();
    renderUi(<Harness store={store} issueKey={issue.key} issueText={shown} />);
    openDialog();
    const points = Array.from(screen.getByText(shown).textContent);
    expect(points).toHaveLength(80);
    expect(points[79]).toBe("…");
    expect(points.slice(0, 79).join("")).toBe(
      Array.from(doc.text.slice(issue.start, issue.end)).slice(0, 79).join(""),
    );
  });

  it("does not split an emoji at the cut", () => {
    const slice = (d: Document, i: Issue): string[] => Array.from(d.text.slice(i.start, i.end));
    const probe = longQuoteDoc("y".repeat(120));
    const offset = slice(probe, quoteIssue(probe)).indexOf("y");
    const filler = `${"y".repeat(78 - offset)}😀${"z".repeat(60)}`;
    const doc = longQuoteDoc(filler);
    const shown = issueText(doc, quoteIssue(doc));
    const points = Array.from(shown);
    expect(points[78]).toBe("😀");
    expect(points).toHaveLength(80);
    expect(shown).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(shown).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it("shows the same text from the Issues list and from the Export dialog", () => {
    const doc = longQuoteDoc("w".repeat(120));
    const expected = issueText(doc, quoteIssue(doc));
    const store = createStore(now);
    store.dispatch({ type: "replace", document: doc });
    const region = renderUi(<ListFixture doc={doc} store={store} />);
    clickLastOverride();
    expect(
      screen.getByRole("dialog", { name: /^Override/ }).getAttribute("aria-describedby"),
    ).not.toBeNull();
    expect(screen.getByRole("dialog", { name: /^Override/ }).textContent).toContain(expected);
    region.unmount();
    renderUi(<ExportFixture doc={doc} store={store} />);
    clickLastOverride();
    expect(screen.getByRole("dialog", { name: /^Override/ }).textContent).toContain(expected);
  });

  it("points aria-describedby at an element that contains the text", () => {
    const { store, key } = seededStore();
    renderUi(<Harness store={store} issueKey={key} issueText="410 U.S. 113" />);
    openDialog();
    const id = screen.getByRole("dialog").getAttribute("aria-describedby");
    expect(id).not.toBeNull();
    const target = document.getElementById(id ?? "");
    expect(target?.textContent).toContain("410 U.S. 113");
    expect(target?.textContent).toContain(PRINTED_STATEMENT);
  });
});
