import { readFileSync } from "node:fs";
import { createDocument, setVerification, verificationOf } from "@reveal-codes/engine";
import type { Document, VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createMemoryCacheStore } from "../src/cache-memory";
import { createDeps } from "../src/create-deps";
import { createFixtureFetch } from "../src/fixtures";
import { lookupWithInfo } from "../src/lookup";
import { namesMatch } from "../src/name-match";
import { createManualClock } from "./support/manual-clock";
import { TEST_BASE_URL } from "./support/make-deps";

const NOW = "2026-11-02T12:00:00.000Z";
const FIXTURES = "../../engine/fixtures/";
const MOTION = readFileSync(new URL(`${FIXTURES}demo-motion.txt`, import.meta.url), "utf8");
const AVIANCA = readFileSync(new URL(`${FIXTURES}avianca-citations.txt`, import.meta.url), "utf8");

type Row = Readonly<{
  kind: "full" | "short";
  text: string;
  caseName: string | undefined;
  result: VerificationResult;
}>;

function fixtureDeps() {
  const clock = createManualClock(Date.parse(NOW));
  return createDeps({
    fetch: createFixtureFetch(),
    now: clock.now,
    sleep: clock.sleep,
    cache: createMemoryCacheStore({ now: clock.now }),
    baseUrl: TEST_BASE_URL,
  });
}

/** Verifies `text` against the recorded fixtures only and reads every keyed citation back. */
async function run(text: string): Promise<readonly Row[]> {
  const created = createDocument(text, NOW);
  if (!created.ok) throw new Error("createDocument failed");
  let doc: Document = created.value;
  const { results } = await lookupWithInfo(doc.citations, fixtureDeps());
  for (const [key, result] of results) {
    const next = setVerification(doc, key, result);
    if (!next.ok) throw new Error(`setVerification failed for ${key}`);
    doc = next.value;
  }
  const rows: Row[] = [];
  for (const r of doc.citations) {
    if (r.kind === "other") continue;
    const result = verificationOf(doc, r.key);
    if (result === null) throw new Error("keyed citation without a result");
    rows.push({
      kind: r.kind,
      text: text.slice(r.citation.start, r.citation.end),
      caseName: r.citation.caseName,
      result,
    });
  }
  return rows;
}

const ASHCROFT = { status: "verified", clusterId: "145875" } as const;
const NOT_FOUND = { status: "not_found" } as const;
const WRONG_ASHCROFT = {
  status: "wrong_case",
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
  foundYear: 2009,
} as const;
const PETERSEN = { status: "wrong_case", clusterId: "2661490" } as const;
const MILLER = { status: "wrong_case", clusterId: "3011108" } as const;

describe("Worked outcomes: Introduction rows _Requirements: 12.1, 12.2, 12.3_", () => {
  it("Henderson v. Pacific Housing Authority, 556 U.S. 662 gives wrong_case against Ashcroft v. Iqbal", async () => {
    const [row] = await run("Henderson v. Pacific Housing Authority, 556 U.S. 662 (2009).");
    expect(row?.caseName).toBe("Henderson v. Pacific Housing Authority");
    expect(row?.result).toEqual(WRONG_ASHCROFT);
  });

  it("Ashcroft v. Iqbal on the same line is verified", async () => {
    const [row] = await run("Ashcroft v. Iqbal, 556 U.S. 662 (2009).");
    expect(row?.caseName).toBe("Ashcroft v. Iqbal");
    expect(row?.result).toEqual(ASHCROFT);
  });

  it("Haines v. Kerner, 404 U.S. 519 is verified", async () => {
    const [row] = await run("Haines v. Kerner, 404 U.S. 519 (1972).");
    expect(row?.result).toEqual({ status: "verified", clusterId: "108432" });
  });

  it("Varghese 925 F.3d 1339 is not_found", async () => {
    const [row] = await run(
      "Varghese v. China Southern Airlines Co., Ltd., 925 F.3d 1339 (11th Cir. 2019)",
    );
    expect(row?.result).toEqual(NOT_FOUND);
  });

  it("Petersen 905 F. Supp. 2d 121 is wrong_case", async () => {
    const [row] = await run("Petersen v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)");
    expect(row?.result).toMatchObject(PETERSEN);
  });

  it("Miller 174 F.3d 366 is wrong_case", async () => {
    const [row] = await run("Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999)");
    expect(row?.text).toBe("174 F.3d 366, 371-72 (2d Cir. 1999)");
    expect(row?.result).toMatchObject(MILLER);
  });

  it("Zicherman 516 F.3d 1237 is not_found", async () => {
    const [row] = await run(
      "Zicherman v. Korean Air Lines Co., Ltd., 516 F.3d 1237, 1254 (11th Cir. 2008)",
    );
    expect(row?.result).toEqual(NOT_FOUND);
  });
});

describe("Worked outcomes: Demo_Motion _Requirements: 12.4_", () => {
  it("gives one outcome per Full_Citation and Short_Form, in order", async () => {
    const rows = await run(MOTION);
    expect(rows.map((r) => [r.kind, r.caseName, r.result])).toEqual([
      ["full", "Ashcroft v. Iqbal", ASHCROFT],
      ["full", "Haines v. Kerner", { status: "verified", clusterId: "108432" }],
      ["full", "Alvarez v. Cascade Residential Mgmt., LLC", NOT_FOUND],
      ["short", undefined, NOT_FOUND],
      ["full", "Brennan v. Harbor Point Apartments", NOT_FOUND],
      ["full", "Okafor v. Lindqvist Props.", NOT_FOUND],
      ["short", undefined, ASHCROFT],
    ]);
  });
});

describe("Worked outcomes: Avianca sample in demo mode _Requirements: 12.3, 12.6_", () => {
  it("reads six Full_Citations and gives the recorded outcomes", async () => {
    const rows = await run(AVIANCA);
    expect(rows.map((r) => [r.kind, r.caseName, r.result.status])).toEqual([
      ["full", "Varghese v. China Southern Airlines Co., Ltd.", "not_found"],
      ["full", "Petersen v. Iran Air", "wrong_case"],
      ["full", "Miller v. United Airlines, Inc.", "wrong_case"],
      ["full", "Zicherman v. Korean Air Lines Co., Ltd.", "not_found"],
      ["full", "Zicherman v. Korean Air Lines Co.", "verified"],
      ["full", "Chambers v. NASCO, Inc.", "verified"],
    ]);
    expect(rows[1]?.result).toMatchObject(PETERSEN);
    expect(rows[2]?.text).toBe("174 F.3d 366, 371-72 (2d Cir. 1999)");
    expect(rows[3]?.text).toBe("516 F.3d 1237, 1254 (11th Cir. 2008)");
    expect(rows[2]?.result).toMatchObject(MILLER);
    expect(rows[4]?.result).toEqual({ status: "verified", clusterId: "117990" });
    expect(rows[5]?.result).toEqual({ status: "verified", clusterId: "112616" });
  });
});

describe("Worked outcomes: Tolerant_Read cases _Requirements: 12.3, 12.7, 13.5_", () => {
  it("Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662 gives wrong_case", async () => {
    const [row] = await run("Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662, 678 (2009)");
    expect(row?.caseName).toBe("Alvarez v. Cascade Residential Mgmt., LLC");
    expect(row?.result).toEqual(WRONG_ASHCROFT);
  });

  it("a name that follows a sentence stop still gives wrong_case", async () => {
    const [row] = await run(
      "The Court said so in Twombly. Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662, 678 (2009)",
    );
    expect(row?.caseName).toBe("Twombly. Alvarez v. Cascade Residential Mgmt., LLC");
    expect(row?.result).toEqual(WRONG_ASHCROFT);
  });

  it("Dep't of Homeland Sec. v. Regents matches its found name", () => {
    expect(
      namesMatch("Dep't of Homeland Sec. v. Regents of the Univ. of Cal.", [
        "Department of Homeland Security v. Regents of Univ. of Cal.",
      ]),
    ).toBe(true);
  });
});

describe("Worked outcomes: initialism pairs _Requirements: 12.7_", () => {
  it.each([
    [
      "NLRB v. Jones & Laughlin Steel Corp.",
      "National Labor Relations Board v. Jones & Laughlin Steel Corp.",
    ],
    ["SEC v. Chenery Corp.", "Securities and Exchange Commission v. Chenery Corporation"],
    ["U.S. v. Lopez", "United States v. Lopez"],
    ["U. S. v. Lopez", "United States v. Lopez"],
  ])("%s matches %s", (cited, found) => {
    expect(namesMatch(cited, [found])).toBe(true);
  });
});

describe("Worked outcomes: every existing fixture line, no name written _Requirements: 12.4_", () => {
  it.each([
    ["556 U.S. 662", ASHCROFT],
    ["404 U.S. 519", { status: "verified", clusterId: "108432" }],
    ["1047 F.3d 212", NOT_FOUND],
    ["1012 F. Supp. 2d 88", NOT_FOUND],
    ["912 F.4th 33", NOT_FOUND],
    ["1 Hill 150", { status: "ambiguous", candidates: ["999000003", "999000004"] }],
    ["576 U.S. 644", { status: "unchecked", waitUntil: "2026-11-02T12:00:30.000Z" }],
    ["925 F.3d 1339", NOT_FOUND],
    ["516 F.3d 1237", NOT_FOUND],
    ["516 U.S. 217", { status: "verified", clusterId: "117990" }],
    ["501 U.S. 32", { status: "verified", clusterId: "112616" }],
  ] as const)("%s keeps its recorded result", async (line, expected) => {
    const [row] = await run(`${line}.`);
    expect(row?.caseName).toBeUndefined();
    expect(row?.result).toEqual(expected);
  });

  it("905 F. Supp. 2d 121 and 174 F.3d 366 are verified when no name is written", async () => {
    const rows = await run("905 F. Supp. 2d 121. 174 F.3d 366.");
    expect(rows.map((r) => r.result)).toEqual([
      { status: "verified", clusterId: "2661490" },
      { status: "verified", clusterId: "3011108" },
    ]);
  });
});
