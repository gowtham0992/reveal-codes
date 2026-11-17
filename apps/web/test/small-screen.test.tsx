// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  REPO_LINK_TEXT,
  CHECK_LINK_TEXT,
  SMALL_SCREEN_EDITOR_NOTE,
  SMALL_SCREEN_INTRO,
  SmallScreenPage,
  VIDEO_LINK_TEXT,
} from "../src/components/small-screen-page";
import { ORDERS } from "@reveal-codes/export";
import { renderUi } from "./support/render";

describe("SmallScreenPage _Requirements: 9.4, 9.5, 9.6, 9.7_", () => {
  it("shows the wordmark and exactly the two sentences, in order", () => {
    const { container } = renderUi(<SmallScreenPage />);
    const paragraphs = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(paragraphs).toEqual([
      "Reveal Codes is a drafting editor for court filings that shows where each sentence came from and checks each citation.",
      "The drafting editor, with the codes pane and export, needs a screen at least 1150 pixels wide.",
    ]);
    expect(paragraphs).toEqual([SMALL_SCREEN_INTRO, SMALL_SCREEN_EDITOR_NOTE]);
    expect(container.querySelector("main")?.textContent).toContain("Reveal Codes");
  });

  it("orders intro, Check link, court rules, video, source, editor note, selection _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_", () => {
    const { container } = renderUi(
      <SmallScreenPage
        links={{ video: "https://example.org/v", repo: "https://example.org/r" }}
        selection={ORDERS.entries[0] ?? null}
      />,
    );
    const nodes = [...container.querySelectorAll("main > p, main a")];
    expect(nodes.map((n, i) => n.textContent?.slice(0, i === 6 ? 10 : 24))).toEqual([
      SMALL_SCREEN_INTRO.slice(0, 24),
      CHECK_LINK_TEXT.slice(0, 24),
      "See all court rules",
      VIDEO_LINK_TEXT.slice(0, 24),
      REPO_LINK_TEXT,
      SMALL_SCREEN_EDITOR_NOTE.slice(0, 24),
      "Selected: ",
    ]);
    const check = container.querySelector("a[href='/check']");
    expect(check?.textContent).toBe("Check the citations in a draft");
    expect(check?.hasAttribute("data-primary")).toBe(false);
    expect(check?.hasAttribute("target")).toBe(false);
  });

  it("has no button, icon or input, only the Court_Rules_Link, and no picture but the hidden mark", () => {
    const { container } = renderUi(<SmallScreenPage />);
    expect(container.querySelectorAll("button, svg, input")).toHaveLength(0);
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/check",
      "/courts",
    ]);
    const pictures = [...container.querySelectorAll("img")];
    expect(pictures.map((i) => i.getAttribute("src"))).toEqual(["/icon.svg"]);
    expect(pictures[0]?.getAttribute("aria-hidden")).toBe("true");
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
  it("shows only the Check and court rules links when neither address is set", () => {
    const { container } = renderUi(<SmallScreenPage links={{ video: null, repo: null }} />);
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/check",
      "/courts",
    ]);
  });
  it("shows both links under the sentences, opening in a new tab with rel noreferrer", () => {
    const { container } = renderUi(<SmallScreenPage links={{ video: VIDEO, repo: REPO }} />);
    const [, courts, ...anchors] = [...container.querySelectorAll("a")];
    expect(courts?.getAttribute("href")).toBe("/courts");
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
    const firstParagraph = container.querySelector("p");
    expect(firstParagraph?.compareDocumentPosition(anchors[0] as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(main?.querySelectorAll("button, svg, input")).toHaveLength(0);
    expect(main?.querySelectorAll("img")).toHaveLength(1);
  });
  it("shows only the link whose address is set", () => {
    const only = renderUi(<SmallScreenPage links={{ video: null, repo: REPO }} />);
    expect([...only.container.querySelectorAll("a")].map((a) => a.textContent)).toEqual([
      CHECK_LINK_TEXT,
      "See all court rules",
      REPO_LINK_TEXT,
    ]);
  });
});
