// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  REPO_LINK_TEXT,
  SMALL_SCREEN_SENTENCES,
  SmallScreenPage,
  VIDEO_LINK_TEXT,
} from "../src/components/small-screen-page";
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

const VIDEO = "https://example.org/demo";
const REPO = "https://example.org/repo";

describe("SmallScreenPage links", () => {
  it("shows no link when neither address is set", () => {
    const { container } = renderUi(<SmallScreenPage links={{ video: null, repo: null }} />);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
  it("shows both links under the sentences, opening in a new tab with rel noreferrer", () => {
    const { container } = renderUi(<SmallScreenPage links={{ video: VIDEO, repo: REPO }} />);
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [VIDEO_LINK_TEXT, VIDEO],
      [REPO_LINK_TEXT, REPO],
    ]);
    expect(VIDEO_LINK_TEXT).toBe("Watch the two-minute demo");
    expect(REPO_LINK_TEXT).toBe("Source code");
    for (const a of anchors) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noreferrer");
    }
    const main = container.querySelector("main");
    const lastParagraph = [...container.querySelectorAll("p")].at(-1);
    expect(lastParagraph?.compareDocumentPosition(anchors[0] as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(main?.querySelectorAll("button, img, svg, input")).toHaveLength(0);
  });
  it("shows only the link whose address is set", () => {
    const only = renderUi(<SmallScreenPage links={{ video: null, repo: REPO }} />);
    expect([...only.container.querySelectorAll("a")].map((a) => a.textContent)).toEqual([
      REPO_LINK_TEXT,
    ]);
  });
});
