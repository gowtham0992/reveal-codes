// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EXPORT_PLACEHOLDER, ExportDialog } from "../src/components/export-dialog";
import { act, fireEvent, renderUi, screen } from "./support/render";

describe("ExportDialog _Requirements: 19.3, 19.4_", () => {
  it("is a modal dialog with the placeholder text and a Close button focused first", () => {
    renderUi(<ExportDialog onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Export" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("export-certification spec");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("closes on the Close button and on Escape", () => {
    const onClose = vi.fn();
    renderUi(<ExportDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("uses copy without exclamation marks", () => {
    renderUi(<ExportDialog onClose={() => undefined} />);
    expect(EXPORT_PLACEHOLDER).not.toContain("!");
    expect(screen.getByRole("dialog").textContent).not.toContain("!");
  });
});
