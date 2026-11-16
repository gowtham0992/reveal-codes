// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { declareNone } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import { ORDERS, buildStatement, firstPageHeading, renderStatement } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { ExportDialog } from "../src/components/export-dialog";
import { PrintView, StatementBlocks } from "../src/components/print-view";
import {
  CONFIDENTIALITY_LABEL,
  CONFIDENTIALITY_REQUIRED,
  quoted,
  summaryLine,
} from "../src/order-copy";
import { ORDER_KEY, createOrderSelectionStore } from "../src/order-selection";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { createStore } from "../src/store-runtime";
import { parseCss } from "./support/css";
import { EXPORT_NOW, EXPORT_VERIFIED_AT } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { printAiDocument, printEntry, printHumanDocument } from "./support/print-fixtures";
import { fireEvent, renderUi, screen } from "./support/render";

function seeded(
  document: Document,
  entryId: string | null,
  declaration: Declaration | null = null,
): MemoryStorage {
  const storage = createMemoryStorage();
  storage.setItem(AUTOSAVE_KEY, serialise(document, [], EXPORT_VERIFIED_AT, declaration));
  if (entryId !== null) {
    storage.setItem(ORDER_KEY, JSON.stringify({ version: 1, entryId }));
  }
  return storage;
}

function print(storage: MemoryStorage) {
  return renderUi(<PrintView services={{ storage, now: () => EXPORT_NOW }} />);
}

const printButton = (): HTMLElement => screen.getByRole("button", { name: "Print" });
const checkbox = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>("checkbox", { name: CONFIDENTIALITY_LABEL });

function expectedHtml(document: Document, id: string, certified: boolean): string {
  const built = buildStatement(
    document,
    [],
    { now: EXPORT_NOW, verifiedAt: EXPORT_VERIFIED_AT },
    { entry: printEntry(id), confidentialityCertified: certified },
  );
  if (!built.ok) throw new Error("statement rejected");
  const holder = renderUi(<StatementBlocks blocks={renderStatement(built.value)} />);
  const html = holder.container.innerHTML;
  holder.unmount();
  return html;
}

describe("Print_View Order_Summary _Requirements: 3.12_", () => {
  it("shows the Order_Summary inside the controls block, with the Print button", () => {
    const entry = printEntry("ndtex-lr-7-2-f");
    print(seeded(printAiDocument(), entry.id));
    const controls = printButton().parentElement;
    expect(controls).not.toBeNull();
    expect(controls?.textContent).toContain(summaryLine(entry));
    expect(controls?.textContent).toContain(quoted(entry.key_language));
    expect(controls?.textContent).not.toMatch(/[\u201C\u201D]/u);
    const link = controls?.querySelector("a");
    expect(link?.getAttribute("href")).toBe(entry.source_url);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
  });

  it("shows no Order_Summary without a selection", () => {
    const { container } = print(seeded(printAiDocument(), null));
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("Print_View first-page block _Requirements: 7.6, 7.7_", () => {
  const cssText = readFileSync(
    join(__dirname, "..", "src/components/print-view.module.css"),
    "utf8",
  );

  it("css gives .firstPage break-after: avoid and hides .controls in print", () => {
    const css = parseCss(cssText);
    const avoid = css.declarations.find(
      (d) => d.selector === ".firstPage" && d.prop === "break-after",
    );
    expect(avoid?.value).toBe("avoid");
    const hidden = css.declarations.find(
      (d) =>
        d.selector === ".controls" && d.prop === "display" && d.atRules.includes("@media print"),
    );
    expect(hidden?.value).toBe("none");
  });

  it("renders the two-line block outside the controls block, with the firstPage class", () => {
    const entry = printEntry("ndtex-lr-7-2-f");
    const doc = printAiDocument();
    const { container } = print(seeded(doc, entry.id));
    const built = buildStatement(
      doc,
      [],
      { now: EXPORT_NOW, verifiedAt: EXPORT_VERIFIED_AT },
      { entry, confidentialityCertified: false },
    );
    if (!built.ok) throw new Error("statement rejected");
    const heading = firstPageHeading(built.value);
    if (heading === null) throw new Error("expected a heading");
    const block = Array.from(container.querySelectorAll("section")).find(
      (s) => s.firstElementChild?.textContent === heading.heading,
    );
    expect(block).toBeDefined();
    expect(block?.className).toContain("firstPage");
    expect(block?.querySelectorAll("p")).toHaveLength(2);
    expect(block?.children[1]?.textContent).toBe(heading.pointer);
    expect(printButton().parentElement?.contains(block ?? null)).toBe(false);
    expect(container.querySelectorAll("section")).toHaveLength(4);
  });

  it("renders no first-page block without a selection, without AI, or under another placement", () => {
    expect(
      print(seeded(printAiDocument(), null)).container.querySelectorAll("section"),
    ).toHaveLength(3);
    const noAi = print(seeded(printHumanDocument(), "ndtex-lr-7-2-f", declareNone("this_filing")));
    expect(noAi.container.querySelectorAll("section")).toHaveLength(3);
    expect(noAi.container.innerHTML).not.toContain("firstPage");
    noAi.unmount();
    const other = print(seeded(printAiDocument(), "edtex-love-2025"));
    expect(other.container.querySelectorAll("section")).toHaveLength(3);
  });
});

describe("Print_View confidentiality checkbox _Requirements: 6.9, 6.10, 6.11, 9.8_", () => {
  const ID = "cit-choe-groves-2025";

  it("is unticked on load and shows one stand-in line instead of the Statement_Text", () => {
    const { container } = print(seeded(printAiDocument(), ID));
    expect(checkbox().checked).toBe(false);
    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(3);
    expect(sections[1]?.textContent).toBe(CONFIDENTIALITY_REQUIRED);
    expect(sections[1]?.querySelectorAll("p")).toHaveLength(1);
    expect(printButton().parentElement?.contains(checkbox())).toBe(true);
  });

  it("renders the same blocks as buildStatement with the tick, and the stand-in again without", () => {
    const doc = printAiDocument();
    const { container } = print(seeded(doc, ID));
    fireEvent.click(checkbox());
    expect(checkbox().checked).toBe(true);
    const ticked = container.querySelectorAll("section")[1];
    expect(ticked?.innerHTML).toBe(expectedHtml(doc, ID, true));
    expect(ticked?.textContent).not.toContain(CONFIDENTIALITY_REQUIRED);
    fireEvent.click(checkbox());
    expect(container.querySelectorAll("section")[1]?.textContent).toBe(CONFIDENTIALITY_REQUIRED);
  });

  it("shows no checkbox and the plain statement when the document has no AI text", () => {
    const doc = printHumanDocument();
    const { container } = print(seeded(doc, ID));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.querySelectorAll("section")[1]?.innerHTML).toBe(expectedHtml(doc, ID, false));
  });

  it("is unticked again on a fresh load", () => {
    const storage = seeded(printAiDocument(), ID);
    const first = print(storage);
    fireEvent.click(checkbox());
    first.unmount();
    print(storage);
    expect(checkbox().checked).toBe(false);
  });

  it("passes no tick and stores nothing new: after ticking in the dialog, only two keys exist", () => {
    const doc = printAiDocument();
    const storage = seeded(doc, null);
    const dialog = renderUi(
      <ExportDialog
        document={doc}
        store={createStore(() => EXPORT_NOW)}
        orderStore={createOrderSelectionStore(storage, ORDERS)}
        now={() => EXPORT_NOW}
        notice={null}
        clearNotice={() => undefined}
        busy={false}
        onGo={() => undefined}
        onDownload={() => undefined}
        onPrint={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Court or judge" }), {
      target: { value: ID },
    });
    fireEvent.click(checkbox());
    const open = screen.getByRole<HTMLButtonElement>("button", { name: "Open print view" });
    expect(open.disabled).toBe(false);
    fireEvent.click(open);
    dialog.unmount();
    const { container } = print(storage);
    expect(checkbox().checked).toBe(false);
    expect(container.querySelectorAll("section")[1]?.textContent).toBe(CONFIDENTIALITY_REQUIRED);
    expect([...storage.data.keys()].sort()).toEqual([AUTOSAVE_KEY, ORDER_KEY].sort());
  });
});

describe("Print_View prohibition _Requirements: 5.11_", () => {
  it("shows the prohibition line and key language in place of the Statement_Text", () => {
    const entry = printEntry("sdohio-newman");
    const { container } = print(seeded(printAiDocument(), entry.id));
    expect(container.textContent).toContain(entry.key_language);
    expect(container.textContent).toContain("Judge Newman's order prohibits AI-drafted text.");
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent).not.toContain("AI-Use and Verification Statement");
    expect(container.textContent).not.toContain("Provenance Appendix");
    expect(screen.queryByRole("button", { name: "Print" })).toBeNull();
  });
});
