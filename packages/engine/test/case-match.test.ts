import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";

const CITE = "410 U.S. 113 (1973)";

function nameBefore(prefix: string, name: string): string | undefined {
  const text = `${prefix}${name}, ${CITE}`;
  const start = text.length - CITE.length;
  return extract(text).citations.find((c) => c.start === start)?.caseName;
}

describe("case-match cited name, rule A _Requirements: 1.13, 1.15_", () => {
  it("keeps the shorter name when the added words include a period-ending word", () => {
    expect(nameBefore("", "Aaaa. Aaaa v. Dep't")).toBe("Aaaa v. Dep't");
  });

  it("takes the longer name when the added words end in no period", () => {
    expect(nameBefore("", "Nnnn de Bbbb v. Nnnn")).toBe("Nnnn de Bbbb v. Nnnn");
  });

  it("keeps the name when a prior sentence is inserted before it", () => {
    expect(nameBefore("", "Roe v. Wade")).toBe("Roe v. Wade");
    expect(nameBefore("Intro. ", "Roe v. Wade")).toBe("Roe v. Wade");
    expect(nameBefore("New. Intro. ", "Roe v. Wade")).toBe("Roe v. Wade");
  });

  it("reads the Demo_Motion names with abbreviations the Strict_Read does not know", () => {
    const text = readFileSync(new URL("../fixtures/demo-motion.txt", import.meta.url), "utf8");
    const names = extract(text).citations.map((c) => c.caseName);
    expect(names).toContain("Alvarez v. Cascade Residential Mgmt., LLC");
    expect(names).toContain("Okafor v. Lindqvist Props.");
  });
});
