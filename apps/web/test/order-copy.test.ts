import { APPLIES_TO, ORDERS, ORDER_KINDS, selectableOrders } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import {
  CONFIDENTIALITY_LABEL,
  NO_ORDER_LABEL,
  appliesWords,
  kindWords,
  OPTION_TEXT_MAX,
  optionText,
  quoted,
  summaryLine,
} from "../src/order-copy";

const SELECTABLE: readonly OrderEntry[] = selectableOrders(ORDERS).flatMap((g) => g.entries);

/** The template, written out here rather than imported. */
function short(text: string): string {
  return text.length <= 80 ? text : `${text.slice(0, 79)}\u2026`;
}

function expectedOption(entry: OrderEntry): string {
  const year = entry.date.slice(0, 4);
  if (entry.judge === null) return `Court-wide \u2014 ${short(entry.instrument)} (${year})`;
  const surname = entry.judge.name.trim().split(/\s+/).pop() ?? "";
  return `Judge ${surname} \u2014 ${short(entry.title)} (${year})`;
}

describe("optionText _Requirements: 2.2, 2.3, 2.4_", () => {
  it.each(SELECTABLE.map((e) => [e.id, e] as const))(
    "matches the template for %s",
    (_id, entry) => {
      expect(optionText(entry)).toBe(expectedOption(entry));
    },
  );

  it("covers both court-wide and judge entries", () => {
    expect(SELECTABLE.some((e) => e.judge === null)).toBe(true);
    expect(SELECTABLE.some((e) => e.judge !== null)).toBe(true);
  });

  it("names an example of each form", () => {
    const wide = SELECTABLE.find((e) => e.id === "ndtex-lr-7-2-f");
    const judge = SELECTABLE.find((e) => e.id === "edtex-love-2025");
    expect(wide && optionText(wide)).toBe(
      "Court-wide \u2014 Local Civil Rule 7.2(f); Local Criminal Rule 47.2(e) (2024)",
    );
    expect(judge && optionText(judge)).toBe(
      "Judge Love \u2014 Standing Order on Disclosure and Certification Requirements for Use of Generati\u2026 (2025)",
    );
  });
});

describe("optionText ellipsis _Requirements: 3.2_", () => {
  const base = SELECTABLE.find((e) => e.judge !== null) as OrderEntry;
  const wide = SELECTABLE.find((e) => e.judge === null) as OrderEntry;
  const long = "A".repeat(81);

  it("limits the title of a judge entry to 80 characters and keeps the year", () => {
    const text = optionText({ ...base, title: long });
    expect(text.endsWith(`${"A".repeat(79)}\u2026 (${base.date.slice(0, 4)})`)).toBe(true);
    expect(OPTION_TEXT_MAX).toBe(80);
  });

  it("limits the instrument of a court-wide entry to 80 characters", () => {
    const text = optionText({ ...wide, instrument: long });
    expect(text).toBe(`Court-wide \u2014 ${"A".repeat(79)}\u2026 (${wide.date.slice(0, 4)})`);
  });

  it("leaves a title of exactly 80 characters and a short title unchanged", () => {
    const sixty = "B".repeat(80);
    expect(optionText({ ...base, title: sixty })).toContain(` \u2014 ${sixty} (`);
    expect(optionText({ ...base, title: "B".repeat(81) })).toContain(`${"B".repeat(79)}\u2026 (`);
    expect(optionText({ ...base, title: "Short" })).toContain(" \u2014 Short (");
  });
});

describe("kindWords and appliesWords _Requirements: 3.5, 3.9_", () => {
  it.each(ORDER_KINDS.map((k) => [k] as const))("kindWords has plain words for %s", (kind) => {
    expect(kindWords[kind].length).toBeGreaterThan(0);
    expect(kindWords[kind]).not.toMatch(/_|!/);
  });

  it("kindWords has exactly the kinds and distinct words", () => {
    expect(Object.keys(kindWords).sort()).toEqual([...ORDER_KINDS].sort());
    expect(new Set(Object.values(kindWords)).size).toBe(ORDER_KINDS.length);
  });

  it.each(APPLIES_TO.map((a) => [a] as const))("appliesWords has plain words for %s", (applies) => {
    expect(appliesWords[applies].length).toBeGreaterThan(0);
    expect(appliesWords[applies]).not.toMatch(/_|!/);
  });

  it("appliesWords has exactly the audiences and distinct words", () => {
    expect(Object.keys(appliesWords).sort()).toEqual([...APPLIES_TO].sort());
    expect(new Set(Object.values(appliesWords)).size).toBe(APPLIES_TO.length);
  });
});

describe("summaryLine and quoted _Requirements: 3.5, 3.10_", () => {
  it.each(SELECTABLE.map((e) => [e.id, e] as const))(
    "joins kind, audience and date for %s",
    (_id, entry) => {
      expect(summaryLine(entry)).toBe(
        `${kindWords[entry.kind]} \u00B7 ${appliesWords[entry.applies_to]} \u00B7 ${entry.date}`,
      );
    },
  );

  it("quotes text with straight double quotes and changes nothing inside", () => {
    expect(quoted("a b")).toBe('"a b"');
    expect(quoted("")).toBe('""');
    expect(quoted('say "x"')).toBe('"say "x""');
  });
});

describe("fixed labels _Requirements: 3.9_", () => {
  it("has the no-order option and confidentiality label without exclamation marks", () => {
    expect(NO_ORDER_LABEL).toBe("No specific order \u2014 general statement");
    expect(CONFIDENTIALITY_LABEL).not.toContain("!");
  });
});
