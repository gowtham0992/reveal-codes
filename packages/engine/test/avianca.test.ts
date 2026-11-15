import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";

/** The Avianca sample (fixtures/avianca-citations.txt). */
const text = readFileSync(new URL("../fixtures/avianca-citations.txt", import.meta.url), "utf8");

const EXPECTED = [
  {
    line: "Varghese v. China Southern Airlines Co., Ltd., 925 F.3d 1339",
    name: "Varghese v. China Southern Airlines Co., Ltd.",
  },
  { line: "Petersen v. Iran Air, 905 F. Supp. 2d 121", name: "Petersen v. Iran Air" },
  {
    line: "Miller v. United Airlines, Inc., 174 F.3d 366",
    name: "Miller v. United Airlines, Inc.",
  },
  {
    line: "Zicherman v. Korean Air Lines Co., Ltd., 516 F.3d 1237",
    name: "Zicherman v. Korean Air Lines Co., Ltd.",
  },
  {
    line: "Zicherman v. Korean Air Lines Co., 516 U.S. 217",
    name: "Zicherman v. Korean Air Lines Co.",
  },
  { line: "Chambers v. NASCO, Inc., 501 U.S. 32", name: "Chambers v. NASCO, Inc." },
];

describe("Avianca sample extraction _Requirements: 10.5, 10.15_", () => {
  const { citations } = extract(text);

  it("returns exactly six Full_Citations, each with its own caseName, in order", () => {
    expect(citations.map((c) => c.value.kind)).toEqual(Array(6).fill("reporter"));
    expect(citations.map((c) => c.caseName)).toEqual(EXPECTED.map((e) => e.name));
  });

  it("places each citation on its own line, right after its name as written", () => {
    for (const [i, e] of EXPECTED.entries()) {
      const c = citations[i];
      if (c === undefined) throw new Error(`missing citation ${String(i)}`);
      expect(text.slice(c.start - e.name.length - 2, c.start)).toBe(`${e.name}, `);
      expect(text.slice(c.start, c.start + 5)).toBe(
        e.line.slice(e.name.length + 2, e.name.length + 7),
      );
    }
  });

  it("yields no citation from the first paragraph", () => {
    const firstBlank = text.indexOf("\n\n");
    expect(firstBlank).toBeGreaterThan(0);
    expect(text.slice(0, firstBlank)).toContain(
      "Mata v. Avianca, Inc., No. 22-cv-1461 (S.D.N.Y. 2023)",
    );
    expect(text.slice(0, firstBlank)).toContain("ECF 54 at 7");
    expect(citations.every((c) => c.start > firstBlank)).toBe(true);
    expect(citations.some((c) => c.text.includes("22-cv-1461") || c.text.includes("ECF"))).toBe(
      false,
    );
  });

  it("never lets a caseName begin in, or reach back across a blank line into, the explanatory sentences", () => {
    for (const c of citations) {
      const name = c.caseName;
      expect(name).toBeDefined();
      if (name === undefined) continue;
      expect(name).not.toContain("\n");
      const at = text.lastIndexOf(name, c.start);
      expect(at).toBeGreaterThan(text.indexOf("\n\n"));
      expect(text.slice(at, c.start)).not.toContain("\n\n");
      expect(name).not.toMatch(/The (citation|one)|second real decision/u);
    }
  });
});
