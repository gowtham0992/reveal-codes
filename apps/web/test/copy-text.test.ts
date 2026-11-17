import { describe, expect, it } from "vitest";
import type { CheckRow } from "../src/client/check-rows";
import { copyText } from "../src/check/copy-text";
import { localDate } from "../src/client/verify-summary";

const LINK = "https://www.courtlistener.com/opinion/1/roe-v-wade/";

function row(over: Partial<CheckRow>): CheckRow {
  return {
    key: "k",
    kind: "citation",
    start: 0,
    end: 1,
    code: "CIT ✓",
    words: "found",
    text: "410 U.S. 113",
    found: null,
    mismatch: [],
    divergence: null,
    href: null,
    next: null,
    ...over,
  };
}

const CITATIONS = "Citations: 1 found · 1 not found";
const found = row({ found: "Roe v. Wade, 1973", href: LINK });
const quote = row({
  kind: "quote",
  code: "QUO ✘",
  words: "quote not found in opinion",
  text: "\u201Cthe right to be let alone\u201D",
});
const wrong = row({
  code: "CIT ≠",
  words: "wrong case",
  text: "598 F.3d 1",
  mismatch: ["Cited as Smith v. Jones", "This citation is Doe v. Roe, 2010"],
  href: LINK,
});

describe("copyText", () => {
  it("starts with the Citations line", () => {
    expect(copyText([found], CITATIONS, "2026-11-07").split("\n")[0]).toBe(CITATIONS);
  });

  it("writes one line per row between the first and last lines, in order", () => {
    const lines = copyText([found, quote, wrong], CITATIONS, "2026-11-07").split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[1]?.startsWith("Found: 410 U.S. 113.")).toBe(true);
    expect(lines[2]?.startsWith("Quote not found in opinion: ")).toBe(true);
    expect(lines[3]?.startsWith("Wrong case: 598 F.3d 1.")).toBe(true);
  });

  it("adds the case on record and the address on the same line", () => {
    const lines = copyText([found], CITATIONS, "2026-11-07").split("\n");
    expect(lines[1]).toBe(`Found: 410 U.S. 113. On record: Roe v. Wade, 1973. ${LINK}`);
  });

  it("takes the case of a wrong-case row from the last mismatch line", () => {
    const lines = copyText([wrong], CITATIONS, "2026-11-07").split("\n");
    expect(lines[1]).toBe(`Wrong case: 598 F.3d 1. On record: Doe v. Roe, 2010. ${LINK}`);
  });

  it("ends a quotation line after the first sentence, with no address", () => {
    const lines = copyText([quote], CITATIONS, "2026-11-07").split("\n");
    expect(lines[1]).toBe("Quote not found in opinion: \u201Cthe right to be let alone\u201D.");
    expect(lines[1]).not.toContain("On record");
    expect(lines[1]).not.toContain("http");
  });

  it("contains no pipe character, even when the text has one", () => {
    const piped = row({ text: "a | b", found: "X | Y, 1999" });
    expect(copyText([piped], "Citations: 1 found | x", "2026-11-07")).not.toContain("|");
  });

  it("does not double a period at the end of the text", () => {
    const lines = copyText([row({ text: "Id." })], CITATIONS, null).split("\n");
    expect(lines[1]).toBe("Found: Id.");
  });

  it("ends with the date line", () => {
    const lines = copyText([found], CITATIONS, "2026-11-07").split("\n");
    expect(lines[lines.length - 1]).toBe(
      "Checked on 2026-11-07 with Reveal Codes against CourtListener.",
    );
  });

  it("uses the date-free closing line when the date is null", () => {
    const lines = copyText([found], CITATIONS, null).split("\n");
    expect(lines[lines.length - 1]).toBe("Checked with Reveal Codes against CourtListener.");
  });

  it("takes its date from localDate", () => {
    const iso = new Date(2026, 10, 7, 12, 0, 0).toISOString();
    expect(localDate(iso)).toBe("2026-11-07");
    expect(localDate("not a date")).toBeNull();
    const text = copyText([found], CITATIONS, localDate(iso));
    expect(text.endsWith("Checked on 2026-11-07 with Reveal Codes against CourtListener.")).toBe(
      true,
    );
  });
});
