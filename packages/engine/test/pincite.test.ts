import { describe, expect, it } from "vitest";
import { parse, render } from "../src/codes.js";
import { createDocument } from "../src/document.js";
import { extract } from "../src/citations/extract";
import { rescan } from "../src/citations/incremental";
import { MAX_MATCH, scanRange } from "../src/citations/scan";
import type { Match } from "../src/citations/scan";
import type { CitationValue, ExtractedCitation } from "../src/types.js";

const TS = "2026-11-03T10:00:00Z";
const never = (): boolean => false;
const scan = (text: string): readonly Match[] => scanRange(text, 0, never);

const textsOf = (text: string): string[] => extract(text).citations.map((c) => c.text);

function only(text: string): ExtractedCitation {
  const { citations } = extract(text);
  expect(citations).toHaveLength(1);
  const [c] = citations;
  if (c === undefined) throw new Error("no citation");
  return c;
}

function docOf(text: string) {
  const d = createDocument(text, TS);
  if (!d.ok) throw new Error(`createDocument failed: ${d.error.kind}`);
  return d.value;
}

const pinciteOf = (v: CitationValue): number | undefined =>
  "pincite" in v ? v.pincite : undefined;

describe("pincite ranges: the user's three cases _Requirements: 18.1, 18.2_", () => {
  const cases: readonly (readonly [string, string, number])[] = [
    [
      "Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999) held so.",
      "174 F.3d 366, 371-72 (2d Cir. 1999)",
      371,
    ],
    [
      "Chambers v. NASCO, Inc., 501 U.S. 32, 45-46 (1991) held so.",
      "501 U.S. 32, 45-46 (1991)",
      45,
    ],
    [
      "Zicherman v. Korean Air Lines Co., 516 U.S. 217, 220-21 (1996) held so.",
      "516 U.S. 217, 220-21 (1996)",
      220,
    ],
  ];

  it.each(cases)("%s is one citation ending after the parenthetical", (text, cited, pincite) => {
    const c = only(text);
    expect(c.text).toBe(cited);
    expect(pinciteOf(c.value)).toBe(pincite);
  });

  it.each(cases)("%s closes [/CIT] after the parenthetical in both forms", (text, cited) => {
    const doc = docOf(text);
    expect(doc.citations).toHaveLength(1);
    const display = render(doc, "display").text;
    const full = render(doc, "full").text;
    expect(display).toContain(`${cited}[/CIT]`);
    expect(full).toContain(`${cited}[/CIT]`);
    expect(display).not.toMatch(/\d\[\/CIT\]-\d/);
    expect(full).not.toMatch(/\d\[\/CIT\]-\d/);
  });

  it("the full form round-trips through parse", () => {
    const doc = docOf(cases[0]?.[0] ?? "");
    const back = parse(render(doc, "full").text);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.text).toBe(doc.text);
  });
});

describe("pincite ranges: dash, list and short forms _Requirements: 18.3, 18.4, 18.5_", () => {
  it("reads an en dash with a full second number", () => {
    const c = only("See 174 F.3d 366, 371–372 (2d Cir. 1999).");
    expect(c.text).toBe("174 F.3d 366, 371–372 (2d Cir. 1999)");
    expect(pinciteOf(c.value)).toBe(371);
  });
  it("reads a list", () => {
    const c = only("See 556 U.S. 662, 678, 680-81 (2009).");
    expect(c.text).toBe("556 U.S. 662, 678, 680-81 (2009)");
    expect(pinciteOf(c.value)).toBe(678);
  });
  it("reads a range in Roe, 556 U.S. at 678-79", () => {
    const c = only("Roe, 556 U.S. at 678-79.");
    expect(c.text).toBe("Roe, 556 U.S. at 678-79");
    expect(pinciteOf(c.value)).toBe(678);
  });
  it("reads a range in Id. at 678-79", () => {
    const text = "See 556 U.S. 662, 670 (2009). Id. at 678-79.";
    const cs = extract(text).citations;
    expect(cs.map((c) => c.text)).toEqual(["556 U.S. 662, 670 (2009)", "Id. at 678-79"]);
    expect(pinciteOf(cs[1]?.value ?? ({} as CitationValue))).toBe(678);
  });
  it("reads a range in two members of a parallel citation", () => {
    const text = "Roe v. Wade, 410 U.S. 113, 116-17, 93 S. Ct. 705, 708-09 (1973).";
    const c = only(text);
    expect(c.value.kind).toBe("parallel");
    expect(c.text).toBe("410 U.S. 113, 116-17, 93 S. Ct. 705, 708-09 (1973)");
  });
});

describe("pincite lists stop at the next member or database citation _Requirements: 18.6_", () => {
  it("stops before `, 93 S. Ct. 705`", () => {
    const c = only("Roe v. Wade, 410 U.S. 113, 116, 118-19, 93 S. Ct. 705 (1973).");
    expect(c.value.kind).toBe("parallel");
    expect(c.text).toBe("410 U.S. 113, 116, 118-19, 93 S. Ct. 705 (1973)");
  });
  it("stops before `, 2010 WL 123456`", () => {
    const cs = extract("See 598 F.3d 1, 7, 9-10, 2010 WL 123456 (2d Cir. 2010).").citations;
    expect(cs.map((c) => c.text)).toEqual(["598 F.3d 1, 7, 9-10", "2010 WL 123456 (2d Cir. 2010)"]);
  });
});

describe("pincite edge reads _Requirements: 18.7, 18.8_", () => {
  it("`371-A` ends at 371", () => {
    expect(textsOf("See 174 F.3d 366, 371-A here.")).toEqual(["174 F.3d 366, 371"]);
  });
  it("`371-` ends at 371", () => {
    expect(textsOf("See 174 F.3d 366, 371- here.")).toEqual(["174 F.3d 366, 371"]);
  });
  it("`371-72a` ends at 371", () => {
    expect(textsOf("See 174 F.3d 366, 371-72a here.")).toEqual(["174 F.3d 366, 371"]);
  });
  it("a database `, at *5-6` is read whole", () => {
    const c = only("See 2010 WL 123456, at *5-6.");
    expect(c.text).toBe("2010 WL 123456, at *5-6");
    expect(pinciteOf(c.value)).toBe(5);
  });
  it("a database `, at *5, 7` is read as `, at *5` only", () => {
    expect(only("See 2010 WL 123456, at *5, 7.").text).toBe("2010 WL 123456, at *5");
  });
});

describe("pincite Normalised_Form and rescan _Requirements: 18.9, 18.11_", () => {
  it("records the First_Page form as normalised for a range", () => {
    const c = only("See 174 F.3d 366, 371-72 (2d Cir. 1999).");
    expect(c.normalised).toBe("174 F.3d 366, 371 (2d Cir. 1999)");
  });
  it("the incremental rescan equals a full scan on a ranged text", () => {
    const filler = "lorem ipsum dolor ".repeat(90);
    const before = `${filler}See 174 F.3d 366, 371-72 (2d Cir. 1999). ${filler}`;
    const at = before.indexOf("371-72") + 3;
    const edits = [
      { from: at, oldTo: at + 1, inserted: "" },
      { from: at, oldTo: at, inserted: "5" },
      { from: at - 1, oldTo: at, inserted: "A" },
      { from: at + 2, oldTo: at + 3, inserted: "a" },
    ];
    for (const e of edits) {
      const next = before.slice(0, e.from) + e.inserted + before.slice(e.oldTo);
      const edit = { from: e.from, oldTo: e.oldTo, newTo: e.from + e.inserted.length };
      expect(rescan(scan(before), edit, next)).toEqual(scan(next));
    }
  });
});

describe("pincite maximal citation under MAX_MATCH _Requirements: 18.12_", () => {
  const REPORTER = "Cox. Manual Trade-Mark Cas."; // longest entry of the Reporter_List, 27 units
  const EXPR = "10-11, 20-21, 3, 4, 5"; // five items, 21 code units (cap 24)
  const member = (volume: number): string => `${String(volume)} ${REPORTER} 99999, ${EXPR}`;
  const court = "Court of Appeals for the Federal Circuit"; // 40 code units
  const text = `${[999, 998, 997, 996].map(member).join(", ")} (${court} 1999)`;

  it("is extracted whole and shorter than MAX_MATCH", () => {
    expect(court).toHaveLength(40);
    const c = only(`Foo v. Bar, ${text}.`);
    expect(c.value.kind).toBe("parallel");
    expect(c.text).toBe(text);
    expect(c.text.length).toBeLessThan(MAX_MATCH);
  });
});

describe("Reveal Codes written before the pincite change _Requirements: 18.16_", () => {
  it("a [/CIT] closed inside a range fails parse with extractor_mismatch", () => {
    const doc = docOf("See 174 F.3d 366, 371-72 (2d Cir. 1999).");
    const full = render(doc, "full").text;
    expect(full).toContain("174 F.3d 366, 371-72 (2d Cir. 1999)[/CIT]");
    const old = full.replace(
      "174 F.3d 366, 371-72 (2d Cir. 1999)[/CIT]",
      "174 F.3d 366, 371[/CIT]-72 (2d Cir. 1999)",
    );
    const r = parse(old);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("malformed_codes");
    if (r.error.kind === "malformed_codes") expect(r.error.rule).toBe("extractor_mismatch");
  });
});
