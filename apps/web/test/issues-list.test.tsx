// @vitest-environment jsdom
import {
  createDocument,
  issues,
  recordOverride,
  setQuoteCheck,
  setVerification,
} from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { IssuesList, issueText, shorten } from "../src/components/issues-list";
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

function withCitationResults(doc: Document): Document {
  const keys = issues(doc)
    .filter((i) => i.code === "CIT …")
    .map((i) => i.key);
  const [first, second] = keys;
  if (first === undefined || second === undefined) throw new Error("fixture needs two citations");
  const a = setVerification(doc, first, { status: "not_found" });
  if (!a.ok) throw new Error("verification rejected");
  const b = setVerification(a.value, second, { status: "ambiguous", candidates: ["1", "2"] });
  if (!b.ok) throw new Error("verification rejected");
  return b.value;
}
const noop = (): void => undefined;
const VERIFY = { start: noop, disabled: false };

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

  it("lays each row out as three lines: chip with Go and Override…, status words, text", () => {
    renderUi(<IssuesList document={withMismatch(build(TEXT))} onGo={noop} onOverride={noop} />);
    const expected = issues(withMismatch(build(TEXT)));
    screen.getAllByRole("listitem").forEach((row, i) => {
      const [lineA, words, text] = Array.from(row.children);
      expect(lineA?.className).toMatch(/lineA/);
      expect(lineA?.firstElementChild?.textContent).toBe(expected[i]?.code);
      const actions = lineA?.lastElementChild;
      expect(actions?.className).toMatch(/actions/);
      expect(Array.from(actions?.children ?? []).map((b) => b.textContent)).toEqual([
        "Go",
        "Override…",
      ]);
      expect(words?.className).toMatch(/small-label/);
      expect(words?.className).toMatch(/words/);
      expect(words?.textContent).toMatch(/^blocking, /);
      expect(text?.className).toMatch(/text/);
      expect(text?.textContent).toBe(
        issueText(withMismatch(build(TEXT)), expected[i] as (typeof expected)[number]),
      );
    });
  });
  it("puts the Diverges at: line after the text, in the style of the text", () => {
    renderUi(<IssuesList document={withMismatch(build(TEXT))} onGo={noop} onOverride={noop} />);
    const row = screen.getByText(/^Diverges at: /).parentElement;
    const kids = Array.from(row?.children ?? []);
    expect(kids).toHaveLength(4);
    expect(kids[3]?.className).toBe(kids[2]?.className);
  });
  it("uses the failing chip for CIT ✘, CIT ? and QUO ✘ and the outline chip for CIT … and QUO …", () => {
    const failing = withMismatch(withCitationResults(build(TEXT)));
    const view = renderUi(<IssuesList document={failing} onGo={noop} onOverride={noop} />);
    const chipOf = (code: string): string => {
      const chip = screen
        .getAllByRole("listitem")
        .map((r) => r.firstElementChild?.firstElementChild)
        .find((e) => e?.textContent === code);
      if (chip === undefined || chip === null) throw new Error(`no chip ${code}`);
      return chip.className;
    };
    for (const code of ["CIT ✘", "CIT ?", "QUO ✘"]) expect(chipOf(code)).toMatch(/chipFail/);
    view.unmount();
    renderUi(<IssuesList document={build(TEXT)} onGo={noop} onOverride={noop} />);
    for (const code of ["CIT …", "QUO …"]) {
      expect(chipOf(code)).toMatch(/chip/);
      expect(chipOf(code)).not.toMatch(/chipFail/);
    }
  });
  it("keeps the failing chip on an overridden QUO ✘ and reads overridden in line (b)", () => {
    const mismatch = withMismatch(build(TEXT));
    const quo = issues(mismatch).find((i) => i.code === "QUO ✘");
    if (quo === undefined) throw new Error("no QUO ✘");
    const r = recordOverride(mismatch, quo.key, "Reviewed.", ISO);
    if (!r.ok) throw new Error("override rejected");
    renderUi(<IssuesList document={r.value} onGo={noop} onOverride={noop} />);
    const row = screen.getByText("Overridden: Reviewed.").parentElement;
    expect(row?.firstElementChild?.firstElementChild?.className).toMatch(/chipFail/);
    expect(row?.children[1]?.textContent).toBe("overridden, quote not found in opinion");
    expect(within(row as HTMLElement).queryByRole("button", { name: "Override…" })).toBeNull();
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
        verifiedAt={null}
        note={null}
        verify={VERIFY}
      />,
    );
    expect(screen.getByText(/^Demo mode checks only the recorded demo citations/)).not.toBeNull();
    expect(screen.getByText("No issues.")).not.toBeNull();
  });

  it("reads Issues with no blocking issue and Issues — 4 blocking with four citations", () => {
    const store = createStore(() => new Date(ISO));
    const props = {
      store,
      now: () => new Date(ISO),
      onGo: noop,
      verifiedAt: null,
      note: null,
      verify: VERIFY,
    };
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

describe("Unchecked_Row _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 12.6_", () => {
  const FOUR = "A 1 U.S. 1 (1900). B 2 U.S. 2 (1901). C 3 U.S. 3 (1902). D 4 U.S. 4 (1903).";

  it("shows the plural row first with a plain Verify button", () => {
    renderUi(
      <IssuesList
        document={build(FOUR)}
        collapseUnchecked
        verify={VERIFY}
        onGo={noop}
        onOverride={noop}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("4 citations and quotations have not been checked.");
    const button = within(rows[0] as HTMLElement).getByRole("button", { name: "Verify" });
    expect(button.hasAttribute("data-primary")).toBe(false);
    const [first, second, ...rest] = Array.from(rows[0]?.children ?? []);
    expect(rest).toEqual([]);
    expect(first?.className).toMatch(/lineA/);
    expect(first?.className).toMatch(/lineEnd/);
    expect(first?.textContent).toBe("Verify");
    expect(second?.className).toMatch(/text/);
    expect(rows[0]?.querySelector("[class*='chip'], [class*='words']")).toBeNull();
  });

  it("uses the singular text for one item", () => {
    renderUi(
      <IssuesList
        document={build("A 1 U.S. 1 (1900).")}
        collapseUnchecked
        verify={VERIFY}
        onGo={noop}
        onOverride={noop}
      />,
    );
    expect(screen.getByText("1 citation or quotation has not been checked.")).not.toBeNull();
  });

  it("puts the row before the individual rows of other issues", () => {
    const doc = withMismatch(build(TEXT));
    renderUi(
      <IssuesList document={doc} collapseUnchecked verify={VERIFY} onGo={noop} onOverride={noop} />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]?.textContent).toContain("have not been checked");
    expect(rows.slice(1).some((r) => r.textContent.includes("QUO ✘"))).toBe(true);
    expect(rows.some((r) => r.textContent.includes("CIT …"))).toBe(false);
  });

  it("lists every item individually when not collapsed", () => {
    renderUi(
      <IssuesList
        document={build(FOUR)}
        collapseUnchecked={false}
        verify={VERIFY}
        onGo={noop}
        onOverride={noop}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText(/have not been checked/)).toBeNull();
  });

  it("calls verify.start once and honours verify.disabled", () => {
    let calls = 0;
    const start = (): void => {
      calls += 1;
    };
    const view = renderUi(
      <IssuesList
        document={build(FOUR)}
        collapseUnchecked
        verify={{ start, disabled: false }}
        onGo={noop}
        onOverride={noop}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    });
    expect(calls).toBe(1);
    view.rerender(
      <IssuesList
        document={build(FOUR)}
        collapseUnchecked
        verify={{ start, disabled: true }}
        onGo={noop}
        onOverride={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Verify" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows No issues. and no row at zero unchecked", () => {
    renderUi(
      <IssuesList
        document={build("Plain text.")}
        collapseUnchecked
        verify={VERIFY}
        onGo={noop}
        onOverride={noop}
      />,
    );
    expect(screen.getByText("No issues.")).not.toBeNull();
    expect(screen.queryByText(/have not been checked/)).toBeNull();
  });

  it("issueText shortens like the rows", () => {
    const doc = build(FOUR);
    const issue = issues(doc)[0];
    if (issue === undefined) throw new Error("no issue");
    expect(issueText(doc, issue)).toBe(shorten(doc.text.slice(issue.start, issue.end)));
  });
});
