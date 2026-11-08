// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "../src/components/toolbar";
import type { ToolbarProps } from "../src/components/toolbar";
import { renderUi, screen, within, fireEvent } from "./support/render";

const BASE: ToolbarProps = {
  notice: null,
  paneOpen: false,
  verifyDisabled: false,
  exportDisabled: false,
};

describe("Toolbar _Requirements: 10.1, 10.2, 10.6, 10.7_", () => {
  it("is a toolbar whose buttons appear in the specified order", () => {
    renderUi(<Toolbar {...BASE} />);
    const bar = screen.getByRole("toolbar");
    const names = within(bar)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["New", "Load demo motion", "Verify", "Reveal Codes (Alt-F3)", "Export"]);
  });

  it("puts the badge after the buttons and before the status area", () => {
    renderUi(<Toolbar {...BASE} badge="Demo mode" />);
    const bar = screen.getByRole("toolbar");
    const children = [...bar.children].map((c) => c.textContent);
    expect(children.slice(-2)).toEqual(["Demo mode", ""]);
  });

  it("shows the Notice only in a polite status region", () => {
    renderUi(<Toolbar {...BASE} notice="Autosave failed." />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Autosave failed.");
    expect(screen.queryAllByText("Autosave failed.")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reflects the Pane state in aria-pressed", () => {
    const { rerender } = renderUi(<Toolbar {...BASE} />);
    const toggle = screen.getByRole("button", { name: "Reveal Codes (Alt-F3)" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    rerender(<Toolbar {...BASE} paneOpen={true} />);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("disables Verify and Export from its props and keeps New enabled", () => {
    renderUi(<Toolbar {...BASE} verifyDisabled={true} exportDisabled={true} />);
    expect(screen.getByRole("button", { name: "Verify" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Export" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "New" })).toHaveProperty("disabled", false);
  });

  it("labels Verify 'Verifying…' while running and calls onVerify when enabled", () => {
    const onVerify = vi.fn();
    const { rerender } = renderUi(<Toolbar {...BASE} onVerify={onVerify} />);
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(onVerify).toHaveBeenCalledTimes(1);
    rerender(<Toolbar {...BASE} verifyDisabled={true} verifyRunning={true} onVerify={onVerify} />);
    const running = screen.getByRole("button", { name: "Verifying…" });
    expect(running).toHaveProperty("disabled", true);
    fireEvent.click(running);
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it("calls the handler of the button that is clicked", () => {
    const onNew = vi.fn();
    const onTogglePane = vi.fn();
    renderUi(<Toolbar {...BASE} onNew={onNew} onTogglePane={onTogglePane} />);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onTogglePane).not.toHaveBeenCalled();
  });
});
