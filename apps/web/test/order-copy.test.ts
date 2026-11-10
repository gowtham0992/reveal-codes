import { APPLIES_TO, ORDERS, ORDER_KINDS, selectableOrders } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import {
  CONFIDENTIALITY_LABEL,
  NO_ORDER_LABEL,
  appliesWords,
  kindWords,
  optionText,
  quoted,
  summaryLine,
} from "../src/order-copy";

const SELECTABLE: readonly OrderEntry[] = selectableOrders(ORDERS).flatMap((g) => g.entries);

/** The template, written out here rather than imported. */
function expectedOption(entry: OrderEntry): string {
  const year = entry.date.slice(0, 4);
  if (entry.judge === null) return `Court-wide \u2014 ${entry.instrument} (${year})`;
  const surname = entry.judge.name.trim().split(/\s+/).pop() ?? "";
  return `Judge ${surname} \u2014 ${entry.title} (${year})`;
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
      "Judge Love \u2014 Standing Order on Disclosure and Certification Requirements for Use of Generative Artificial Intelligence (2025)",
    );
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
