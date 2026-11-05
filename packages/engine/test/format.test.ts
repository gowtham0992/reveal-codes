import { describe, expect, it } from "vitest";
import { format, validateFullValue } from "../src/citations/format";
import { matchDatabaseAt } from "../src/citations/grammar-db";
import { matchReporterAt } from "../src/citations/grammar";
import type { CitationValue, DatabaseValue, FullValue, ParallelValue } from "../src/types";

const roe: FullValue = {
  kind: "reporter",
  volume: 410,
  reporter: "U.S.",
  page: 113,
  pincite: 116,
  year: 1973,
};
const circuit: FullValue = {
  kind: "reporter",
  volume: 598,
  reporter: "F.3d",
  page: 1,
  pincite: 7,
  court: "2d Cir.",
  year: 2010,
};
const parallel: ParallelValue = {
  kind: "parallel",
  members: [
    { volume: 410, reporter: "U.S.", page: 113, pincite: 116 },
    { volume: 93, reporter: "S. Ct.", page: 705, pincite: 708 },
    { volume: 35, reporter: "L. Ed. 2d", page: 147 },
  ],
  year: 1973,
};
const westlaw: DatabaseValue = {
  kind: "database",
  year: 2024,
  designator: "WL",
  number: 123456,
  pincite: 3,
};
const lexis: DatabaseValue = {
  kind: "database",
  year: 2023,
  designator: "LEXIS",
  lexisCourt: "U.S. Dist.",
  number: 98765,
};

const EXAMPLES: ReadonlyArray<readonly [FullValue, string]> = [
  [roe, "410 U.S. 113, 116 (1973)"],
  [circuit, "598 F.3d 1, 7 (2d Cir. 2010)"],
  [parallel, "410 U.S. 113, 116, 93 S. Ct. 705, 708, 35 L. Ed. 2d 147 (1973)"],
  [westlaw, "2024 WL 123456, at *3"],
  [lexis, "2023 U.S. Dist. LEXIS 98765"],
  [{ kind: "reporter", volume: 1, reporter: "F.3d", page: 2 }, "1 F.3d 2"],
  [
    { kind: "reporter", volume: 1, reporter: "F.3d", page: 2, court: "9th Cir." },
    "1 F.3d 2 (9th Cir.)",
  ],
];

const expectField = (v: CitationValue, field: string): void => {
  expect(format(v)).toEqual({ ok: false, error: { kind: "invalid_citation", field } });
};

describe("format canonical layout _Requirements: 10.1, 10.2_", () => {
  it.each(EXAMPLES)("lays out %j", (value, expected) => {
    expect(format(value)).toEqual({ ok: true, value: expected });
  });

  it("joins parallel members with no parenthetical when court and year are absent (D2)", () => {
    const v: ParallelValue = {
      kind: "parallel",
      members: [
        { volume: 1, reporter: "F.3d", page: 2 },
        { volume: 3, reporter: "F.3d", page: 4 },
      ],
    };
    expect(format(v)).toEqual({ ok: true, value: "1 F.3d 2, 3 F.3d 4" });
  });
});

describe("format output reads back through the grammars _Requirements: 10.3_", () => {
  it.each(EXAMPLES)("matchers return the value for %j", (value) => {
    const r = format(value);
    if (!r.ok) throw new Error("expected ok");
    const m = value.kind === "database" ? matchDatabaseAt(r.value, 0) : matchReporterAt(r.value, 0);
    expect(m).toEqual({ start: 0, end: r.value.length, value });
  });
});

describe("validateFullValue rejections in A13 order _Requirements: 10.5_", () => {
  it("rejects Short_Form and Other_Reference values at kind", () => {
    expectField({ kind: "short", form: "id", targetStart: null }, "kind");
    expectField(
      {
        kind: "short",
        form: "party",
        party: "Roe",
        volume: 410,
        reporter: "U.S.",
        pincite: 116,
        targetStart: 0,
      },
      "kind",
    );
    expectField({ kind: "other", form: "usc", title: 42, section: "1983" }, "kind");
  });

  it("names volume, reporter, page, and pincite", () => {
    expectField({ ...circuit, volume: 0 }, "volume");
    expectField({ ...circuit, volume: 100_000, reporter: "F.3" }, "volume");
    expectField({ ...circuit, reporter: "F. 3d", page: 0 }, "reporter");
    expectField({ ...circuit, page: 1.5, pincite: 0 }, "page");
    expectField({ ...circuit, pincite: 100_000, court: "(x)" }, "pincite");
  });

  it("names court, lexisCourt, and year", () => {
    expectField({ ...circuit, court: "x 2001", year: 1599 }, "court");
    expectField({ ...lexis, lexisCourt: "U.S. LEXIS Dist.", year: 3000 }, "lexisCourt");
    expectField({ ...lexis, lexisCourt: "WL Dist." }, "lexisCourt");
    expectField({ kind: "database", year: 2023, designator: "LEXIS", number: 98765 }, "lexisCourt");
    expectField({ ...westlaw, lexisCourt: "U.S." }, "lexisCourt");
    expectField({ ...circuit, year: 3000 }, "year");
    expectField({ ...westlaw, year: 999, number: 0 }, "year");
  });

  it("names members, then number", () => {
    expectField({ ...parallel, members: parallel.members.slice(0, 1) }, "members");
    expectField({ ...parallel, members: [...parallel.members, ...parallel.members] }, "members");
    expectField({ ...westlaw, number: 10_000_000 }, "number");
  });

  it("checks a parallel step across every member before the next step", () => {
    const [a, b] = parallel.members;
    if (a === undefined || b === undefined) throw new Error("fixture");
    expectField(
      {
        ...parallel,
        members: [
          { ...a, page: 0 },
          { ...b, reporter: "Q.Z." },
        ],
      },
      "reporter",
    );
  });

  it("returns the value itself when valid", () => {
    expect(validateFullValue(parallel)).toEqual({ ok: true, value: parallel });
  });
});
