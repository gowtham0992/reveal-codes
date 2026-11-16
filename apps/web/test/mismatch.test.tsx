// @vitest-environment jsdom
import { issues } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { mismatchLines, mismatchOf, overrideMismatch } from "../src/client/mismatch";
import { ExportDialog } from "../src/components/export-dialog";
import { createOrderSelectionStore } from "../src/order-selection";
import { createStore } from "../src/store-runtime";
import { createMemoryStorage } from "./support/memory-storage";
import { act, fireEvent, renderUi, screen, within } from "./support/render";
import {
  LINK,
  NOW,
  TEXT,
  WRONG,
  WRONG_NO_YEAR,
  build,
  keysOf,
  noop,
  region,
  withResults,
} from "./support/case-match-region";

const CITED = "Cited as Henderson v. Pacific Housing Authority";
const FOUND = "This citation is Ashcroft v. Iqbal (2009)";
const NO_NAME = "See 556 U.S. 662, 678 (2009).";

function firstKey(text: string): string {
  const key = keysOf(build(text))[0];
  if (key === undefined) throw new Error("no citation");
  return key;
}

function follows(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function openOverride(): HTMLElement {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Override…" }));
  });
  return screen.getByRole("dialog", { name: /^Override/ });
}

describe("mismatchOf and mismatchLines _Requirements: 19.1, 19.4, 19.5, 19.6, 19.7_", () => {
  it("builds both lines in order, with the year, and no full stop", () => {
    const doc = withResults(TEXT, [WRONG]);
    const m = mismatchOf(doc, firstKey(TEXT));
    if (m === null) throw new Error("expected a mismatch");
    const lines = mismatchLines(m);
    expect(lines).toEqual([CITED, FOUND]);
    expect(lines.every((l) => !l.endsWith("."))).toBe(true);
  });

  it("drops the year when foundYear is absent and the first line when caseName is absent", () => {
    const noYear = mismatchOf(withResults(TEXT, [WRONG_NO_YEAR]), firstKey(TEXT));
    expect(noYear && mismatchLines(noYear)).toEqual([CITED, "This citation is Ashcroft v. Iqbal"]);
    const noName = mismatchOf(withResults(NO_NAME, [WRONG]), firstKey(NO_NAME));
    expect(noName && mismatchLines(noName)).toEqual([FOUND]);
  });

  it("reads caseName from the Document passed in, so an edited name shows at once", () => {
    const edited = "See Smith v. Jones, 556 U.S. 662, 678 (2009).";
    const before = mismatchOf(withResults(TEXT, [WRONG]), firstKey(TEXT));
    const after = mismatchOf(withResults(edited, [WRONG]), firstKey(edited));
    expect(before?.cited).toBe("Henderson v. Pacific Housing Authority");
    expect(after?.cited).toBe("Smith v. Jones");
    const rec = withResults(edited, [WRONG]).citations.find((c) => c.kind === "full");
    expect(rec?.kind === "full" ? Object.keys(rec.result) : []).not.toContain("caseName");
  });

  it("returns null for a key that is not wrong_case, and for an unknown key", () => {
    const verified = withResults(TEXT, [{ status: "verified", clusterId: "145875" }]);
    expect(mismatchOf(verified, firstKey(TEXT))).toBeNull();
    expect(mismatchOf(build(TEXT), firstKey(TEXT))).toBeNull();
    expect(mismatchOf(withResults(TEXT, [WRONG]), "k999")).toBeNull();
  });

  it("gives overrideMismatch lines only for a CIT ≠ code", () => {
    const doc = withResults(TEXT, [WRONG]);
    const key = firstKey(TEXT);
    expect(overrideMismatch(doc, { code: "CIT ≠", key })).toEqual([CITED, FOUND]);
    for (const code of ["CIT ✘", "CIT ?", "CIT …", "QUO ✘", "QUO …"]) {
      expect(overrideMismatch(doc, { code, key })).toBeNull();
    }
  });
});

describe("Issues row mismatch lines _Requirements: 19.1, 19.5, 19.6, 19.8_", () => {
  it("shows Cited as, then This citation is, directly under the citation text", () => {
    region(withResults(TEXT, [WRONG]));
    const row = screen.getByRole("listitem");
    const cited = within(row).getByText(CITED);
    const found = within(row).getByText(FOUND);
    expect(within(row).getByText("556 U.S. 662, 678 (2009)").nextElementSibling).toBe(cited);
    expect(cited.nextElementSibling).toBe(found);
    expect(cited.tagName).toBe("P");
    expect(row.textContent).not.toMatch(/[!.]\s*$/u);
  });

  it("omits Cited as when the citation has no caseName", () => {
    region(withResults(NO_NAME, [WRONG]));
    const row = screen.getByRole("listitem");
    expect(within(row).queryByText(/^Cited as/u)).toBeNull();
    expect(within(row).getByText(FOUND)).not.toBeNull();
  });
});

describe("Export dialog row mismatch lines _Requirements: 19.2, 19.7_", () => {
  it("shows both lines and the CourtListener link in the wrong_case row", () => {
    renderUi(
      <ExportDialog
        document={withResults(TEXT, [WRONG])}
        store={createStore(NOW)}
        orderStore={createOrderSelectionStore(createMemoryStorage(), ORDERS)}
        now={NOW}
        notice={null}
        clearNotice={noop}
        busy={false}
        onGo={noop}
        onDownload={noop}
        onPrint={noop}
        onClose={noop}
      />,
    );
    const row = within(screen.getByRole("list", { name: "Blocking items" })).getByRole("listitem");
    const cited = within(row).getByText(CITED);
    const found = within(row).getByText(FOUND);
    const link = within(row).getByRole("link", { name: LINK });
    const go = within(row).getByRole("button", { name: "Go" });
    expect(follows(cited, found)).toBe(true);
    expect(follows(found, link)).toBe(true);
    expect(follows(link, go)).toBe(true);
    expect(link.getAttribute("href")).toBe("https://www.courtlistener.com/opinion/145875/x/");
  });
});

describe("Override dialog mismatch lines _Requirements: 19.3, 19.4, 19.7_", () => {
  it("shows both lines for CIT ≠ after the issue text and before the reason box", () => {
    const doc = withResults(TEXT, [WRONG]);
    expect(issues(doc)[0]?.code).toBe("CIT ≠");
    region(doc);
    const dialog = openOverride();
    const cited = within(dialog).getByText(CITED);
    const found = within(dialog).getByText(FOUND);
    const reason = within(dialog).getByLabelText("Reason");
    expect(follows(within(dialog).getByText("556 U.S. 662, 678 (2009)"), cited)).toBe(true);
    expect(follows(cited, found)).toBe(true);
    expect(follows(found, reason)).toBe(true);
    expect(follows(found, within(dialog).getByText(/printed in the certification/u))).toBe(true);
  });

  it("shows no mismatch line for a code other than CIT ≠", () => {
    region(withResults(TEXT, [{ status: "not_found" }]));
    const dialog = openOverride();
    expect(within(dialog).queryByText(/^Cited as/u)).toBeNull();
    expect(within(dialog).queryByText(/^This citation is/u)).toBeNull();
  });
});
