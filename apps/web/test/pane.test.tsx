// @vitest-environment jsdom
import { createDocument, setQuoteCheck } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it, vi } from "vitest";
import { Pane } from "../src/pane/pane";
import type { PaneProps } from "../src/pane/pane";
import { statusText } from "../src/pane/layout";
import { renderUi, screen, fireEvent } from "./support/render";

const ISO = "2026-01-01T00:00:00.000Z";

function docOf(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture document rejected");
  return created.value;
}

function props(document: Document, over: Partial<PaneProps> = {}): PaneProps {
  return {
    document,
    cursorOffset: 0,
    statusOverride: null,
    onItemClick: () => undefined,
    onBackgroundClick: () => undefined,
    ...over,
  };
}

const CITED = docOf("abc\nSee Roe v. Wade, 410 U.S. 113 (1973).");

describe("Pane structure _Requirements: 12.1, 12.7, 12.8, 12.9_", () => {
  it("renders nothing while hidden", () => {
    renderUi(<Pane {...props(CITED)} open={false} />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.body.textContent).toBe("");
  });

  it("is a region named Reveal Codes with no product name", () => {
    renderUi(<Pane {...props(CITED)} />);
    const region = screen.getByRole("region", { name: "Reveal Codes" });
    expect(region.textContent.toLowerCase()).not.toContain("reveal");
  });

  it("names Code_Items by meaning and hides Text_Items", () => {
    renderUi(<Pane {...props(CITED)} />);
    expect(screen.getAllByRole("img", { name: "Citation unchecked" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: "Pasted or from outside the editor" })).toHaveLength(
      1,
    );
    const texts = document.querySelectorAll("[aria-hidden='true'][data-offset]");
    expect(texts.length).toBeGreaterThan(CITED.text.length - 1);
  });

  it("splits lines at newline items", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    expect(container.querySelectorAll("section > div > div")).toHaveLength(2);
  });

  it("re-renders when the Document changes", () => {
    const view = renderUi(<Pane {...props(docOf("one"))} />);
    expect(document.querySelector("[data-offset='2']")?.textContent).toBe("e");
    view.rerender(<Pane {...props(docOf("two words"))} />);
    expect(document.querySelector("[data-offset='2']")?.textContent).toBe("o");
    expect(document.querySelector("[data-offset='8']")?.textContent).toBe("s");
  });
});

describe("Pane status line _Requirements: 12.6, 13.6_", () => {
  it("reads statusText when there is no override", () => {
    renderUi(<Pane {...props(docOf("ab\ncd"), { cursorOffset: 4 })} />);
    expect(screen.getByText(statusText("ab\ncd", 4))).toBeTruthy();
  });

  it("shows the override instead", () => {
    renderUi(<Pane {...props(docOf("ab"), { statusOverride: "Nothing to verify." })} />);
    expect(screen.getByText("Nothing to verify.")).toBeTruthy();
    expect(screen.queryByText(/^Doc 1/)).toBeNull();
  });
});

describe("Pane clicks and cursor _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_", () => {
  it("reports the offset of a clicked Text_Item and Code_Item", () => {
    const onItemClick = vi.fn();
    renderUi(<Pane {...props(CITED, { onItemClick })} />);
    fireEvent.click(document.querySelector("[data-offset='1']") as Element);
    expect(onItemClick).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getAllByRole("img", { name: "Citation unchecked" })[0] as Element);
    const offset = CITED.text.indexOf("410");
    expect(onItemClick).toHaveBeenLastCalledWith(offset);
  });

  it("calls onBackgroundClick outside every item", () => {
    const onItemClick = vi.fn();
    const onBackgroundClick = vi.fn();
    const { container } = renderUi(<Pane {...props(CITED, { onItemClick, onBackgroundClick })} />);
    const body = container.querySelector("section > div") as Element;
    fireEvent.click(body);
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it("highlights only the item at the cursor and moves with it", () => {
    const view = renderUi(<Pane {...props(docOf("abc"), { cursorOffset: 1 })} />);
    const marked = (): string[] =>
      [...document.querySelectorAll("[data-offset]")]
        .filter((e) => /cursor/.test(e.className))
        .map((e) => e.getAttribute("data-offset") ?? "");
    expect(marked()).toEqual(["1"]);
    view.rerender(<Pane {...props(docOf("abc"), { cursorOffset: 2 })} />);
    expect(marked()).toEqual(["2"]);
  });

  it("shows an empty block after the last item when the cursor is at the end", () => {
    renderUi(<Pane {...props(docOf("abc"), { cursorOffset: 3 })} />);
    const block = [...document.querySelectorAll("[data-offset]")].filter((e) =>
      /cursor/.test(e.className),
    );
    expect(block.map((e) => e.getAttribute("data-offset"))).toEqual(["3"]);
    expect(block[0]?.textContent.trim()).toBe("");
  });

  it("scrolls the highlighted item into view", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    renderUi(<Pane {...props(docOf("abc"), { cursorOffset: 1 })} />);
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    spy.mockRestore();
  });

  it("marks the mismatched-quote document without error", () => {
    const base = docOf('See Roe v. Wade, 410 U.S. 113, 120 (1973) ("the quick brown fox").');
    const q = base.quotes[0];
    if (q === undefined) throw new Error("fixture has no quote");
    const set = setQuoteCheck(base, q.key, { status: "mismatch", prefixLength: 4 });
    if (!set.ok) throw new Error("fixture quote check rejected");
    renderUi(<Pane {...props(set.value)} />);
    expect(screen.getAllByRole("img", { name: "Quote not found in the opinion" })).toHaveLength(1);
  });
});

describe("Pane classes _Requirements: 12.4_", () => {
  it("gives each rendered Code_Item the class of its family", () => {
    renderUi(<Pane {...props(CITED)} />);
    const pst = screen.getByRole("img", { name: "Pasted or from outside the editor" });
    expect(pst.className).toMatch(/pst/);
    const cit = screen.getAllByRole("img", { name: "Citation unchecked" })[0];
    expect(cit?.className).toMatch(/pending/);
  });
});
