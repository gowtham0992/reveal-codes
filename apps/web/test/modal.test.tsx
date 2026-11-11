// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Modal } from "../src/components/modal";
import { act, fireEvent, renderUi, screen } from "./support/render";

function Harness() {
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
        <Modal
          title="Sample"
          onClose={() => {
            setOpen(false);
          }}
        >
          <button type="button">First</button>
          <button type="button">Second</button>
        </Modal>
      ) : null}
    </div>
  );
}

function openModal(): HTMLElement {
  const opener = screen.getByRole("button", { name: "Open" });
  opener.focus();
  act(() => {
    fireEvent.click(opener);
  });
  return opener;
}

function tab(shiftKey = false): void {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey });
  });
}

describe("Modal dialog class _Requirements: 8.2_", () => {
  it("has one dialog class and no wide variant", () => {
    renderUi(
      <Modal title="Sample" onClose={() => undefined}>
        <button type="button">First</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Sample" });
    expect(dialog.className.trim().split(/\s+/)).toHaveLength(1);
    expect(dialog.className).not.toContain("Wide");
  });
});

describe("Modal _Requirements: 18.5, 18.9_", () => {
  it("is a labelled modal dialog and moves focus to its first control", () => {
    renderUi(<Harness />);
    openModal();
    const dialog = screen.getByRole("dialog", { name: "Sample" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("renders the title as an h2 labelling the dialog, before the body that holds the children", () => {
    renderUi(<Harness />);
    openModal();
    const dialog = screen.getByRole("dialog", { name: "Sample" });
    const title = screen.getByRole("heading", { level: 2, name: "Sample" });
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(dialog.firstElementChild).toBe(title);
    const body = title.nextElementSibling;
    expect(body).not.toBeNull();
    expect(body?.contains(screen.getByRole("button", { name: "First" }))).toBe(true);
    expect(body?.contains(screen.getByRole("button", { name: "Second" }))).toBe(true);
  });

  it("cycles Tab and Shift-Tab inside the dialog", () => {
    renderUi(<Harness />);
    openModal();
    tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Second" }));
    tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    tab(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Second" }));
  });

  it("sends Tab from the dialog frame to the first control", () => {
    renderUi(<Harness />);
    openModal();
    screen.getByRole("dialog").focus();
    tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("closes on Escape and returns focus to the opener", () => {
    renderUi(<Harness />);
    const opener = openModal();
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
