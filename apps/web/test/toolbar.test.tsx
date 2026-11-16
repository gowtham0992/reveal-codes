// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "../src/components/toolbar";
import type { ToolbarProps } from "../src/components/toolbar";
import { renderUi, screen, within, fireEvent } from "./support/render";

const BASE: ToolbarProps = {
  notice: null,
  paneOpen: false,
  verifyDisabled: false,
  step: "none",
};

function primaries(): string[] {
  return screen
    .getAllByRole("button")
    .filter((b) => b.getAttribute("data-primary") === "true")
    .map((b) => b.textContent);
}

describe("Toolbar primary button _Requirements: 4.6, 4.8, 4.10, 4.11_", () => {
  it("marks exactly the button the step names", () => {
    const { rerender } = renderUi(<Toolbar {...BASE} step="load-demo" />);
    expect(primaries()).toEqual(["Load demo motion"]);
    rerender(<Toolbar {...BASE} step="verify" />);
    expect(primaries()).toEqual(["Verify"]);
    rerender(<Toolbar {...BASE} step="export" blockingCount={2} />);
    expect(primaries()).toEqual(["Export (2 blocking)"]);
    rerender(<Toolbar {...BASE} step="none" />);
    expect(primaries()).toEqual([]);
  });

  it("marks no button while Verify runs and keeps Verify in the ordinary disabled style", () => {
    renderUi(<Toolbar {...BASE} step="none" verifyDisabled={true} verifyRunning={true} />);
    expect(primaries()).toEqual([]);
    const running = screen.getByRole("button", { name: "Verifying…" });
    expect(running).toHaveProperty("disabled", true);
    expect(running.hasAttribute("data-primary")).toBe(false);
  });

  it("keeps data-primary on a disabled primary button", () => {
    renderUi(<Toolbar {...BASE} step="verify" verifyDisabled={true} />);
    const verify = screen.getByRole("button", { name: "Verify" });
    expect(verify.getAttribute("data-primary")).toBe("true");
    expect(verify).toHaveProperty("disabled", true);
  });
});

describe("Toolbar _Requirements: 10.1, 10.2, 10.6, 10.7_", () => {
  it("is a toolbar whose buttons appear in the specified order", () => {
    renderUi(<Toolbar {...BASE} />);
    const bar = screen.getByRole("toolbar");
    const names = within(bar)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual([
      "New",
      "Open",
      "Load demo motion",
      "Verify",
      "Show codes (Alt-F3)",
      "Export",
    ]);
  });

  it("contains no Mode_Text", () => {
    renderUi(<Toolbar {...BASE} />);
    const text = screen.getByRole("toolbar").textContent;
    expect(text).not.toMatch(/Demo mode|Live CourtListener|Server unreachable/);
  });

  it("renders the Wordmark first, then three groups in order", () => {
    renderUi(<Toolbar {...BASE} />);
    const bar = screen.getByRole("toolbar");
    expect(bar.firstElementChild?.textContent).toBe("Reveal Codes");
    const groups = within(bar).getAllByRole("group");
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => [...g.querySelectorAll("button")].map((b) => b.textContent))).toEqual([
      ["New", "Open", "Load demo motion"],
      ["Verify"],
      ["Show codes (Alt-F3)", "Export"],
    ]);
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
    const toggle = screen.getByRole("button", { name: "Show codes (Alt-F3)" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    rerender(<Toolbar {...BASE} paneOpen={true} />);
    const open = screen.getByRole("button", { name: "Hide codes (Alt-F3)" });
    expect(open.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Show codes (Alt-F3)" })).toBeNull();
  });

  it("disables Verify from its props and keeps New and Export enabled", () => {
    renderUi(<Toolbar {...BASE} verifyDisabled={true} />);
    expect(screen.getByRole("button", { name: "Verify" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "New" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Export" })).toHaveProperty("disabled", false);
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
describe("Toolbar Export button on a Document with nothing to export", () => {
  it("is enabled by default and disabled when exportDisabled is true", () => {
    const { rerender } = renderUi(<Toolbar {...BASE} step="export" />);
    expect(screen.getByRole("button", { name: "Export" })).toHaveProperty("disabled", false);
    rerender(<Toolbar {...BASE} step="export" exportDisabled={true} />);
    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton).toHaveProperty("disabled", true);
    expect(exportButton.getAttribute("data-primary")).toBe("true");
  });
  it("does not call onExport when disabled", () => {
    const onExport = vi.fn();
    renderUi(<Toolbar {...BASE} step="export" exportDisabled={true} onExport={onExport} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).not.toHaveBeenCalled();
  });
});
