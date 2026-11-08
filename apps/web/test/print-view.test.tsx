// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintView } from "../src/components/print-view";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { createDocument, setVerification } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { EXPORT_NOW, EXPORT_VERIFIED_AT } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { ISO, overriddenDocument } from "./support/persist-fixtures";
import { fireEvent, renderUi, screen } from "./support/render";

const NOTHING = "Nothing to print. Open the editor and resolve the blocking items first.";
const UNREADABLE = "The saved document could not be read.";
const THROW = "\u0000throw";

afterEach(() => {
  vi.restoreAllMocks();
});

function view(raw: string | null) {
  const storage = createMemoryStorage();
  if (typeof raw === "string") storage.setItem(AUTOSAVE_KEY, raw);
  const services = {
    now: () => EXPORT_NOW,
    storage: {
      ...storage,
      getItem: (key: string) => {
        if (raw === THROW) throw new Error("denied");
        return storage.getItem(key);
      },
    },
  };
  return renderUi(<PrintView services={services} />);
}

/** One citation recorded not found and no override: one blocking item. */
function blockedDocument(): Document {
  const created = createDocument("See Foo v. Bar, 999 U.S. 999 (2020).", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const full = created.value.citations.find((c) => c.kind === "full");
  if (full === undefined) throw new Error("no citation");
  const marked = setVerification(created.value, full.key, { status: "not_found" });
  if (!marked.ok) throw new Error("fixture rejected");
  return marked.value;
}

const printButton = () => screen.queryByRole("button", { name: "Print" });

describe("PrintView non-ready states _Requirements: 8.6, 8.7, 8.8, 8.9_", () => {
  it("shows the absent text and no Print button", () => {
    const { container } = view(null);
    expect(container.textContent).toBe(NOTHING);
    expect(printButton()).toBeNull();
  });

  it("shows the unreadable text for a throwing read and for bad JSON", () => {
    expect(view(THROW).container.textContent).toBe(UNREADABLE);
    expect(view("{oops").container.textContent).toBe(UNREADABLE);
    expect(printButton()).toBeNull();
  });

  it("shows only the count sentence and the code and text list when blocked", () => {
    const { container } = view(serialise(blockedDocument(), [], EXPORT_VERIFIED_AT));
    const message = container.querySelector("p");
    expect(message?.textContent).toBe("This filing cannot be exported: 1 unresolved items remain.");
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain("CIT ✘");
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(printButton()).toBeNull();
    expect(container.textContent).not.toContain("Provenance Appendix");
    expect(container.textContent).not.toContain("!");
  });
});

describe("PrintView ready state _Requirements: 8.2, 8.3, 8.4, 8.5, 8.9_", () => {
  function ready() {
    return view(serialise(overriddenDocument(), [], EXPORT_VERIFIED_AT));
  }

  it("renders filing, statement and appendix sections with titles first", () => {
    const { container } = ready();
    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(3);
    const statementTitle = sections[1]?.firstElementChild;
    expect(statementTitle?.tagName).toBe("P");
    expect(statementTitle?.textContent).toBe("AI-Use and Verification Statement");
    const appendixTitle = sections[2]?.firstElementChild;
    expect(appendixTitle?.textContent).toBe("Provenance Appendix");
    expect(sections[1]?.querySelector("table thead th")).not.toBeNull();
    expect(sections[1]?.textContent).toContain("/s/ ________________");
    expect(sections[2]?.querySelector("pre")).not.toBeNull();
  });

  it("calls window.print once per click", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    ready();
    const button = printButton();
    expect(button).not.toBeNull();
    if (button === null) return;
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(2);
  });

  it("contains no exclamation marks in the statement or appendix chrome", () => {
    const { container } = ready();
    const sections = container.querySelectorAll("section");
    expect(sections[1]?.textContent).not.toContain("!");
    expect(sections[2]?.firstElementChild?.textContent).not.toContain("!");
  });
});
