// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Mark } from "../src/components/mark";
import { SmallScreenPage } from "../src/components/small-screen-page";
import { Toolbar } from "../src/components/toolbar";
import type { ToolbarProps } from "../src/components/toolbar";
import { renderUi, screen } from "./support/render";

const BASE: ToolbarProps = {
  notice: null,
  empty: true,
  paneOpen: false,
  verifyDisabled: false,
  step: "none",
};

describe("Mark", () => {
  it("is the favicon file, 24px, hidden from assistive technology", () => {
    const { container } = renderUi(<Mark />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/icon.svg");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("aria-hidden")).toBe("true");
    expect(img?.getAttribute("width")).toBe("24");
    expect(img?.getAttribute("height")).toBe("24");
  });
});

describe("the lockup", () => {
  it("puts the mark first inside the Toolbar's wordmark, which still reads Reveal Codes", () => {
    renderUi(<Toolbar {...BASE} />);
    const wordmark = screen.getByRole("toolbar").firstElementChild;
    expect(wordmark?.firstElementChild?.tagName).toBe("IMG");
    expect(wordmark?.querySelectorAll("img")).toHaveLength(1);
    expect(wordmark?.textContent).toBe("Reveal Codes");
  });
  it("puts the mark first inside the small-screen wordmark", () => {
    const { container } = renderUi(<SmallScreenPage />);
    const wordmark = container.querySelector("main > div");
    expect(wordmark?.firstElementChild?.tagName).toBe("IMG");
    expect(wordmark?.textContent).toBe("Reveal Codes");
  });
  it("gives no control an icon: no img inside a button, input or label", () => {
    renderUi(<Toolbar {...BASE} />);
    expect(screen.getByRole("toolbar").querySelectorAll("button img, label img")).toHaveLength(0);
  });
});
