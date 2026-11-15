// @vitest-environment jsdom
import { createDocument, setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type { Document, VerificationResult } from "@reveal-codes/engine";
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

  it("is a region named Reveal Codes whose name appears only in the header (Requirement 2.3)", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    const region = screen.getByRole("region", { name: "Reveal Codes" });
    const body = container.querySelector("section > div:nth-child(2)");
    const status = container.querySelector("section > div:nth-child(3)");
    expect(region.firstElementChild?.textContent).toMatch(/^Reveal Codes/);
    expect(body?.textContent.toLowerCase()).not.toContain("reveal");
    expect(status?.textContent.toLowerCase()).not.toContain("reveal");
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

describe("Pane_Header and Legend _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10_", () => {
  const WORDS = [
    ["[HUM]", "typed"],
    ["[PST]", "pasted"],
    ["[AI]", "assistant"],
    ["[AI>HUM]", "assistant, edited"],
    ["[CIT ✓]", "found"],
    ["[CIT ✘]", "not found"],
    ["[CIT ≠]", "wrong case"],
    ["[QUO ✘]", "not in the opinion"],
  ] as const;

  function headerOf(container: HTMLElement): HTMLElement {
    const header = container.querySelector("section > div");
    if (!(header instanceof HTMLElement)) throw new Error("no header");
    return header;
  }

  it("shows the name at the left and the eight entries joined in order", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    const header = headerOf(container);
    const [name, legend] = Array.from(header.children);
    expect(name?.textContent).toBe("Reveal Codes");
    expect(name?.className).toMatch(/title/);
    expect(legend?.children).toHaveLength(8);
    expect(legend?.textContent).not.toContain("·");
    const items = Array.from(legend?.children ?? []);
    expect(items.map((e) => e.textContent)).toEqual(WORDS.map(([c, w]) => `${c} ${w}`));
    const codes = items.map((e) => e.firstElementChild?.textContent);
    expect(codes).toEqual(WORDS.map(([c]) => c));
  });

  it("draws the failing entries with the failing class and the others without", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    const legend = headerOf(container).children[1];
    const codes = Array.from(legend?.children ?? []).map((e) => e.firstElementChild);
    expect(codes.map((e) => /failing/.test(e?.className ?? ""))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it("wraps the code of the three failing entries in the ring class and no other", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    const legend = headerOf(container).children[1];
    const rings = Array.from(legend?.children ?? []).map(
      (e) => e.firstElementChild?.firstElementChild,
    );
    expect(
      rings.map((e) => e !== null && e !== undefined && /legendBlock/.test(e.className)),
    ).toEqual([false, false, false, false, false, true, true, true]);
    expect(rings.slice(5).map((e) => e?.textContent)).toEqual(["[CIT ✘]", "[CIT ≠]", "[QUO ✘]"]);
  });

  it("carries no aria-hidden, role or aria-label", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    const header = headerOf(container);
    for (const el of [header, ...Array.from(header.querySelectorAll("*"))]) {
      expect(el.hasAttribute("aria-hidden")).toBe(false);
      expect(el.hasAttribute("role")).toBe(false);
      expect(el.hasAttribute("aria-label")).toBe(false);
    }
  });

  it("is a sibling above the scrolling body, not inside it", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    const section = container.querySelector("section");
    const header = headerOf(container);
    const body = section?.children[1];
    expect(section?.children[0]).toBe(header);
    expect(body?.contains(header)).toBe(false);
    expect(body?.className).toMatch(/body/);
  });

  it("prevents the default of mousedown so the Editor selection stays", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    const outside = document.createElement("div");
    outside.contentEditable = "true";
    outside.textContent = "editor";
    document.body.appendChild(outside);
    outside.focus();
    const selection = window.getSelection();
    selection?.selectAllChildren(outside);
    const before = selection?.toString();
    const proceeded = fireEvent.mouseDown(headerOf(container));
    expect(proceeded).toBe(false);
    expect(window.getSelection()?.toString()).toBe(before);
    outside.remove();
  });

  it("renders nothing of the header while the Pane is closed", () => {
    renderUi(<Pane {...props(CITED)} open={false} />);
    expect(screen.queryByText("Reveal Codes")).toBeNull();
    expect(screen.queryByText(/\[HUM\]/)).toBeNull();
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

describe("Pane mode text _Requirements: 5.1, 5.2_", () => {
  it("renders modeText at the right end and nothing when absent or null", () => {
    const { container, rerender } = renderUi(
      <Pane {...props(docOf("ab"), { modeText: "Live CourtListener lookups" })} />,
    );
    const status = container.querySelector("section")?.lastElementChild;
    expect(status?.lastElementChild?.textContent).toBe("Live CourtListener lookups");
    rerender(<Pane {...props(docOf("ab"), { modeText: null })} />);
    expect(container.querySelector("section")?.lastElementChild?.childElementCount).toBe(1);
    rerender(<Pane {...props(docOf("ab"))} />);
    expect(container.querySelector("section")?.lastElementChild?.childElementCount).toBe(1);
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
    const body = container.querySelector("section > div:nth-child(2)") as Element;
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

describe("Pane failing class _Requirements: 3.1, 3.2, 3.3, 3.5, 12.14_", () => {
  function withCitation(result: VerificationResult): Document {
    const base = docOf("See Roe v. Wade, 410 U.S. 113 (1973).");
    const cit = base.citations.find((c) => c.kind === "full");
    if (cit === undefined) throw new Error("fixture has no citation");
    const set = setVerification(base, cit.key, result);
    if (!set.ok) throw new Error("fixture verification rejected");
    return set.value;
  }
  const classOf = (name: string): string[] =>
    screen.getAllByRole("img", { name }).map((e) => e.className);

  it("gives a not-found citation's opening and closing codes the failing class", () => {
    renderUi(<Pane {...props(withCitation({ status: "not_found" }))} />);
    expect(classOf("Citation not found")[0]).toMatch(/failing/);
    expect(classOf("End of citation")[0]).toMatch(/failing/);
  });

  it("gives an ambiguous citation the failing class", () => {
    renderUi(<Pane {...props(withCitation({ status: "ambiguous", candidates: ["1", "2"] }))} />);
    expect(classOf("Citation ambiguous, 2 candidates")[0]).toMatch(/failing/);
  });

  it("does not give a verified citation's closer or an unchecked citation the failing class", () => {
    renderUi(<Pane {...props(withCitation({ status: "verified", clusterId: "1" }))} />);
    expect(classOf("End of citation")[0]).not.toMatch(/failing/);
    expect(classOf("Citation verified")[0]).not.toMatch(/failing/);
    expect(classOf("Pasted or from outside the editor")[0]).not.toMatch(/failing/);
  });

  it("does not give an unchecked citation the failing class", () => {
    renderUi(<Pane {...props(CITED)} />);
    expect(classOf("Citation unchecked")[0]).not.toMatch(/failing/);
    expect(classOf("End of citation")[0]).not.toMatch(/failing/);
  });

  it("gives a mismatched quotation the failing class on both codes", () => {
    const base = docOf('See Roe v. Wade, 410 U.S. 113, 120 (1973) ("the quick brown fox").');
    const q = base.quotes[0];
    if (q === undefined) throw new Error("fixture has no quote");
    const set = setQuoteCheck(base, q.key, { status: "mismatch", prefixLength: 4 });
    if (!set.ok) throw new Error("fixture quote check rejected");
    renderUi(<Pane {...props(set.value)} />);
    expect(classOf("Quote not found in the opinion")[0]).toMatch(/failing/);
    expect(classOf("End of quote")[0]).toMatch(/failing/);
    expect(classOf("End of citation")[0]).not.toMatch(/failing/);
  });
});

describe("Pane Failing_Block wrapper _Requirements: 7.8, 7.16, 7.17_", () => {
  function failedCitation(): Document {
    const base = docOf("See Roe v. Wade, 410 U.S. 113 (1973).");
    const cit = base.citations.find((c) => c.kind === "full");
    if (cit === undefined) throw new Error("fixture has no citation");
    const set = setVerification(base, cit.key, { status: "not_found" });
    if (!set.ok) throw new Error("fixture verification rejected");
    return set.value;
  }
  const blocks = (root: ParentNode): Element[] =>
    [...root.querySelectorAll("span")].filter((e) => /block/.test(e.className));

  it("wraps the failing citation in one block span with no role or data-offset", () => {
    const { container } = renderUi(<Pane {...props(failedCitation())} />);
    const found = blocks(container);
    expect(found).toHaveLength(1);
    const block = found[0] as Element;
    expect(block.hasAttribute("role")).toBe(false);
    expect(block.hasAttribute("data-offset")).toBe(false);
    expect(block.firstElementChild?.getAttribute("aria-label")).toBe("Citation not found");
    expect(block.lastElementChild?.getAttribute("aria-label")).toBe("End of citation");
  });

  it("draws no block for a document without failing codes", () => {
    const { container } = renderUi(<Pane {...props(CITED)} />);
    expect(blocks(container)).toHaveLength(0);
  });

  it("sets the selection to the offset of a text item clicked inside a block", () => {
    const onItemClick = vi.fn();
    const doc = failedCitation();
    const { container } = renderUi(<Pane {...props(doc, { onItemClick })} />);
    const offset = doc.text.indexOf("410") + 1;
    const inside = blocks(container)[0]?.querySelector(`[data-offset='${String(offset)}']`);
    expect(inside).toBeTruthy();
    fireEvent.click(inside as Element);
    expect(onItemClick).toHaveBeenLastCalledWith(offset);
  });

  it("keeps the item count and data-offsets the same as without grouping", () => {
    const doc = failedCitation();
    const { container } = renderUi(<Pane {...props(doc)} />);
    expect(container.querySelectorAll("[data-offset]").length).toBeGreaterThan(doc.text.length);
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
