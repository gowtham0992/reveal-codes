// @vitest-environment jsdom
import { createDocument, issues, recordOverride, setQuoteCheck } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { IssuesList, shorten } from "../src/components/issues-list";
import { IssuesRegion } from "../src/components/issues-region";
import { createStore } from "../src/store-runtime";
import { act, fireEvent, renderUi, screen, within } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const CITE = "Roe v. Wade, 410 U.S. 113, 120 (1973)";
const QUOTE = "the quick brown fox jumps over the lazy dog";
const TEXT = `See ${CITE} ("${QUOTE}"). Also see 999 U.S. 999 (2001).`;

function build(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

function withMismatch(doc: Document): Document {
  const quote = doc.quotes[0];
  if (quote === undefined) throw new Error("fixture has no quote");
  const set = setQuoteCheck(doc, quote.key, { status: "mismatch", prefixLength: 4 });
  if (!set.ok) throw new Error("quote check rejected");
  return set.value;
}

const noop = (): void => undefined;

describe("IssuesList _Requirements: 10.17, 18.1, 18.3, 18.4, 18.10, 18.11_", () => {
  it("shows No issues. for a document without issues", () => {
    renderUi(<IssuesList document={build("Plain text.")} onGo={noop} onOverride={noop} />);
    expect(screen.getByText("No issues.")).not.toBeNull();
    expect(screen.queryAllByRole("listitem")).toEqual([]);
  });

  it("shows one row per Engine issue, in Engine order, with code, severity words and controls", () => {
    const doc = withMismatch(build(TEXT));
    const expected = issues(doc);
    expect(expected.map((i) => i.code)).toContain("QUO ✘");
    renderUi(<IssuesList document={doc} onGo={noop} onOverride={noop} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(expected.length);
    rows.forEach((row, i) => {
      const issue = expected[i];
      if (issue === undefined) throw new Error("row without issue");
      expect(row.textContent).toContain(issue.code);
      expect(row.textContent).toContain("blocking, ");
      expect(within(row).getByRole("button", { name: "Go" })).not.toBeNull();
      expect(within(row).getByRole("button", { name: "Override…" })).not.toBeNull();
    });
  });

  it("uses words, not colour: no inline style or background on any row", () => {
    renderUi(<IssuesList document={build(TEXT)} onGo={noop} onOverride={noop} />);
    for (const el of document.querySelectorAll("li, li *")) {
      expect(el.getAttribute("style")).toBeNull();
    }
    expect(
      screen.getAllByText(/^blocking, not found$|^blocking, unchecked$/).length,
    ).toBeGreaterThan(0);
  });

  it("shows divergence words only on the QUO ✘ row", () => {
    renderUi(<IssuesList document={withMismatch(build(TEXT))} onGo={noop} onOverride={noop} />);
    const rows = screen.getAllByRole("listitem");
    const diverging = rows.filter((r) => r.textContent.includes("Diverges at: "));
    expect(diverging).toHaveLength(1);
    expect(diverging[0]?.textContent).toContain("QUO ✘");
    expect(diverging[0]?.textContent).toContain("Diverges at: quick brown fox jumps over the…");
  });

  it("shows Overridden and the reason, with no Override… control, for an overridden issue", () => {
    const doc0 = build(TEXT);
    const first = issues(doc0)[0];
    if (first === undefined) throw new Error("no issue");
    const r = recordOverride(doc0, first.key, "Reviewed by counsel.", ISO);
    if (!r.ok) throw new Error("override rejected");
    renderUi(<IssuesList document={r.value} onGo={noop} onOverride={noop} />);
    const row = screen.getAllByRole("listitem")[0];
    if (row === undefined) throw new Error("no row");
    expect(row.textContent).toContain("Overridden: Reviewed by counsel.");
    expect(within(row).queryByRole("button", { name: "Override…" })).toBeNull();
    expect(within(row).getByRole("button", { name: "Go" })).not.toBeNull();
  });

  it("calls onGo with the issue start", () => {
    const doc = build(TEXT);
    const offsets: number[] = [];
    renderUi(
      <IssuesList
        document={doc}
        onGo={(o) => {
          offsets.push(o);
        }}
        onOverride={noop}
      />,
    );
    const row = screen.getAllByRole("listitem")[0];
    if (row === undefined) throw new Error("no row");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Go" }));
    });
    expect(offsets).toEqual([issues(doc)[0]?.start]);
  });
});

describe("shorten _Requirements: 18.1_", () => {
  it("keeps 80 characters and shortens longer text to 80 including the ellipsis", () => {
    expect(shorten("a".repeat(80))).toBe("a".repeat(80));
    const long = shorten("b".repeat(81));
    expect(Array.from(long)).toHaveLength(80);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("IssuesRegion _Requirements: 15.7_", () => {
  it("keeps the demo-mode line beside the list", () => {
    const store = createStore(() => new Date(ISO));
    renderUi(
      <IssuesRegion
        document={build("x")}
        store={store}
        now={() => new Date(ISO)}
        onGo={noop}
        demoMode
      />,
    );
    expect(screen.getByText(/^Demo mode checks only the recorded demo citations/)).not.toBeNull();
    expect(screen.getByText("No issues.")).not.toBeNull();
  });

  it("reads Issues with no blocking issue and Issues — 4 blocking with four citations", () => {
    const store = createStore(() => new Date(ISO));
    const props = { store, now: () => new Date(ISO), onGo: noop };
    const view = renderUi(<IssuesRegion {...props} document={build("Plain text.")} />);
    expect(screen.getByRole("heading", { name: "Issues" })).not.toBeNull();
    const four = build(
      "A 1 U.S. 1 (1900). B 2 U.S. 2 (1901). C 3 U.S. 3 (1902). D 4 U.S. 4 (1903).",
    );
    view.rerender(<IssuesRegion {...props} document={four} />);
    expect(screen.getByRole("heading", { name: "Issues \u2014 4 blocking" })).not.toBeNull();
    expect(screen.getByRole("complementary", { name: "Issues \u2014 4 blocking" })).not.toBeNull();
  });
});
