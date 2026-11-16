// @vitest-environment jsdom
// _Requirements: 3.1, 3.2, 3.3, 3.4, 5.4, 6.1, 6.3, 6.6, 6.7, 6.9, 16.4_
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { CLEARED_FILTER, courtGroups, filterOrders, ORDERS } from "@reveal-codes/export";
import type { FilterState } from "@reveal-codes/export";
import { CourtsBrowser } from "../src/courts/courts-browser";
import { buildCourtsModel } from "../src/courts/view-model";
import { fireEvent, renderUi, screen } from "./support/render";

const entries = ORDERS.entries;
const model = buildCourtsModel(ORDERS, null);
const total = entries.length;

const browser = <CourtsBrowser entries={entries} model={model} />;

afterEach(() => {
  window.location.hash = "";
});

function expectedGroups(state: FilterState) {
  return courtGroups(filterOrders(entries, state));
}

function headingsAndIds(root: ParentNode): { headings: string[]; ids: string[] } {
  return {
    headings: Array.from(root.querySelectorAll("h2")).map((h) => h.textContent),
    ids: Array.from(root.querySelectorAll("article")).map((a) => a.id),
  };
}

function expectedOrder(state: FilterState) {
  const groups = expectedGroups(state);
  return {
    headings: groups.map((g) => `${g.court.name} (${g.court.abbreviation})`),
    ids: groups.flatMap((g) => g.entries.map((e) => e.id)),
  };
}

describe("CourtsBrowser before mount", () => {
  it("renders every instrument and no control and no Count_Line", () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderToString(browser);
    expect(holder.querySelector("form")).toBeNull();
    expect(holder.querySelector("input")).toBeNull();
    expect(holder.querySelector("select")).toBeNull();
    expect(holder.querySelector('[role="status"]')).toBeNull();
    expect(holder.querySelectorAll("article")).toHaveLength(total);
  });

  it("lists courts and instruments in the order courtGroups gives, in-force or not", () => {
    const holder = document.createElement("div");
    holder.innerHTML = renderToString(browser);
    const all: FilterState = { ...CLEARED_FILTER, showInactive: true };
    expect(headingsAndIds(holder)).toEqual(expectedOrder(all));
  });
});

describe("CourtsBrowser after mount", () => {
  it("shows the controls in their initial state", () => {
    renderUi(browser);
    expect(screen.getByRole("search")).toBeTruthy();
    const text = screen.getByRole<HTMLInputElement>("textbox");
    expect(text.value).toBe("");
    const select = screen.getByRole<HTMLSelectElement>("combobox");
    expect(select.value).toBe("all");
    expect(select.selectedOptions[0]?.textContent).toBe("All kinds");
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  });

  it("ticks the checkbox when the hash names a superseded instrument", () => {
    const superseded = entries.find((e) => e.status === "superseded");
    expect(superseded).toBeDefined();
    window.location.hash = `#${encodeURIComponent(superseded?.id ?? "")}`;
    renderUi(browser);
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(true);
    const all: FilterState = { ...CLEARED_FILTER, showInactive: true };
    expect(document.getElementById(superseded?.id ?? "")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      `Showing ${String(filterOrders(entries, all).length)} of ${String(total)}`,
    );
  });

  it("leaves the checkbox unticked when the hash names an in-force instrument", () => {
    const current = entries.find((e) => e.status === "current");
    window.location.hash = `#${current?.id ?? ""}`;
    renderUi(browser);
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
  });

  it("states the count as Showing n of m in a status region", () => {
    renderUi(browser);
    const status = screen.getByRole("status");
    expect(status.tagName).toBe("P");
    expect(status.textContent).toBe(
      `Showing ${String(filterOrders(entries, CLEARED_FILTER).length)} of ${String(total)}`,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("status").textContent).toBe(
      `Showing ${String(total)} of ${String(total)}`,
    );
  });

  it("matches the rendered order to courtGroups for the cleared filter", () => {
    renderUi(browser);
    expect(headingsAndIds(document.body)).toEqual(expectedOrder(CLEARED_FILTER));
  });

  it("matches the rendered order to courtGroups with not-in-force instruments shown", () => {
    renderUi(browser);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(headingsAndIds(document.body)).toEqual(
      expectedOrder({ ...CLEARED_FILTER, showInactive: true }),
    );
  });

  it("omits a court group that has no matching instrument", () => {
    const first = entries.find((e) => e.status === "current");
    const query = first?.court.abbreviation ?? "";
    renderUi(browser);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: query } });
    const expected = expectedOrder({ ...CLEARED_FILTER, query });
    expect(expected.headings.length).toBeGreaterThan(0);
    expect(expected.headings.length).toBeLessThan(expectedOrder(CLEARED_FILTER).headings.length);
    const rendered = headingsAndIds(document.body);
    expect(rendered).toEqual(expected);
    for (const section of document.querySelectorAll("section")) {
      expect(section.querySelectorAll("article").length).toBeGreaterThan(0);
    }
  });

  it("says so when nothing matches, and shows no group", () => {
    renderUi(browser);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "qqqqzzzz" } });
    expect(screen.getByRole("status").textContent).toBe(`Showing 0 of ${String(total)}`);
    expect(
      screen.getByText("No rule matches. Clear the filter to see every rule in force."),
    ).toBeTruthy();
    expect(document.querySelectorAll("h2")).toHaveLength(0);
    expect(document.querySelectorAll("article")).toHaveLength(0);
  });

  it("does not show the empty-result sentence when something matches", () => {
    renderUi(browser);
    expect(screen.queryByText(/No rule matches/)).toBeNull();
  });
});
