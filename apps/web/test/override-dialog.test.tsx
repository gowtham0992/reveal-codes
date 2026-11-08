// @vitest-environment jsdom
import { createDocument, issues } from "@reveal-codes/engine";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { OverrideDialog, REASON_HINT } from "../src/components/override-dialog";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { act, fireEvent, renderUi, screen } from "./support/render";

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

function Harness(props: { store: Store; issueKey: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      {open ? (
        <OverrideDialog
          issueKey={props.issueKey}
          code="CIT …"
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
  const opener = screen.getByRole("button", { name: "Open" });
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
