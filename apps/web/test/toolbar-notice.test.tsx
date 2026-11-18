// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Toolbar } from "../src/components/toolbar";
import type { ToolbarProps } from "../src/components/toolbar";
import { renderUi, screen } from "./support/render";

const BASE: ToolbarProps = {
  notice: null,
  empty: false,
  paneOpen: false,
  verifyDisabled: false,
  step: "none",
};

describe("Toolbar notice _Requirements: 32.2, 32.3, 32.4, 32.11_", () => {
  it("puts the whole text and the same title in the DOM", () => {
    renderUi(<Toolbar {...BASE} notice="Opened draft.docx." />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Opened draft.docx.");
    expect(status.getAttribute("title")).toBe("Opened draft.docx.");
  });

  it("keeps the whole text and the title of a notice of 200 characters or more", () => {
    const long = `Could not open ${"a-very-long-file-name-".repeat(10)}.docx: the file is not a Word document.`;
    expect(long.length).toBeGreaterThanOrEqual(200);
    renderUi(<Toolbar {...BASE} notice={long} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(long);
    expect(status.getAttribute("title")).toBe(long);
  });

  it("gives no title when there is no notice", () => {
    renderUi(<Toolbar {...BASE} notice={null} />);
    const status = screen.getByRole("status");
    expect(status.hasAttribute("title")).toBe(false);
    expect(status.textContent).toBe("");
  });
});
