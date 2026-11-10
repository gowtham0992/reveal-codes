import { describe, expect, it } from "vitest";
import { ORDERS, STATEMENT_TITLE, STATEMENT_TITLES } from "../src/index.js";
import { statementTitles } from "../src/orders.js";
import type { OrderEntry, OrderSet } from "../src/orders-types.js";

// _Requirements: 9.13, 12.11, 12.14_
describe("STATEMENT_TITLES _Requirements: 9.13, 12.11, 12.14_", () => {
  it("holds the standard title and each distinct statement-title caption, in dataset order", () => {
    expect(STATEMENT_TITLES).toEqual([
      STATEMENT_TITLE,
      "Certificate Regarding Judge-Specific Requirements",
      "Certificate of Generative Artificial Intelligence Usage",
      "Reliance on Unverified Source",
      "Disclosure of the Use of Generative AI",
      "AI Certification",
      "Disclosure and Certification on Generative Artificial Intelligence Use",
    ]);
  });

  it("includes the superseded entry's caption", () => {
    const starr = ORDERS.entries.find((e) => e.id === "ndtex-starr-2023");
    expect(starr?.status).toBe("superseded");
    expect(STATEMENT_TITLES).toContain(starr?.caption?.text);
  });

  it("holds no first-page heading caption and no other caption text", () => {
    const headings = ORDERS.entries.flatMap((e) =>
      e.caption?.placement === "first_page_heading" ? [e.caption.text] : [],
    );
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) expect(STATEMENT_TITLES).not.toContain(h);
    const allowed = new Set(
      ORDERS.entries.flatMap((e) =>
        e.caption !== null && e.caption.placement !== "first_page_heading" ? [e.caption.text] : [],
      ),
    );
    for (const t of STATEMENT_TITLES) expect(t === STATEMENT_TITLE || allowed.has(t)).toBe(true);
  });
});

function withCaption(base: OrderEntry, caption: OrderEntry["caption"]): OrderEntry {
  return { ...base, caption };
}

describe("statementTitles on a synthetic set _Requirements: 12.14_", () => {
  const base = ORDERS.entries[0] as OrderEntry;
  const set: OrderSet = {
    version: 1,
    entries: [
      withCaption(base, { placement: "statement_title", text: "Title A" }),
      withCaption(base, { placement: "first_page_heading", text: "Heading B" }),
      withCaption(base, null),
      withCaption(base, { placement: "separate_declaration", text: "Title C" }),
      withCaption(base, { placement: "statement_title", text: "Title A" }),
    ],
  };

  it("starts with the standard title, drops headings and nulls, and de-duplicates", () => {
    expect(statementTitles(set, "Standard")).toEqual(["Standard", "Title A", "Title C"]);
  });

  it("returns only the standard title for an empty set", () => {
    expect(statementTitles({ version: 1, entries: [] }, "Standard")).toEqual(["Standard"]);
  });
});
