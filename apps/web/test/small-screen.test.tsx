// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SMALL_SCREEN_SENTENCES, SmallScreenPage } from "../src/components/small-screen-page";
import { renderUi } from "./support/render";

describe("SmallScreenPage _Requirements: 9.4, 9.5, 9.6, 9.7_", () => {
  it("shows the wordmark and exactly the three sentences, in order", () => {
    const { container } = renderUi(<SmallScreenPage />);
    const paragraphs = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(paragraphs).toEqual([
      "Reveal Codes is a drafting editor for court filings that shows where each sentence came from and checks each citation.",
      "It is a desktop editor.",
      "It needs a screen at least 1150 pixels wide.",
    ]);
    expect(paragraphs).toEqual([...SMALL_SCREEN_SENTENCES]);
    expect(container.querySelector("main")?.textContent).toContain("Reveal Codes");
  });

  it("has no button, link, image, icon or input", () => {
    const { container } = renderUi(<SmallScreenPage />);
    expect(container.querySelectorAll("button, a, img, svg, input")).toHaveLength(0);
  });

  it("sets the window title to Reveal Codes", () => {
    const { container } = renderUi(<SmallScreenPage />);
    const title = container.querySelector("title") ?? document.querySelector("title");
    expect(title?.textContent).toBe("Reveal Codes");
  });
});
