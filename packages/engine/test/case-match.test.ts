import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { parse, render } from "../src/codes.js";
import { apply, createDocument } from "../src/document.js";
import { structuralEqual } from "../src/equal.js";
import { recordOverride } from "../src/issues.js";
import type { Document } from "../src/types.js";
import { setVerification, verificationOf } from "../src/verification.js";

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

// Examples added by task 1.12. Rule-A cases above and the Avianca names (avianca.test.ts) are not repeated.
const TS = "2026-11-03T10:00:00Z";
const IQBAL = {
  status: "wrong_case",
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
  foundYear: 2009,
} as const;
const HENDERSON = "Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009)";

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`unexpected error: ${r.error.kind}`);
  return r.value;
}
function firstFullKey(doc: Document): string {
  const rec = doc.citations.find((c) => c.kind === "full");
  if (rec === undefined) throw new Error("no full citation");
  return rec.key;
}
function wrongCaseDoc(text: string): Document {
  const d = must(createDocument(text, TS));
  return must(setVerification(d, firstFullKey(d), IQBAL));
}

describe("case-match In_Re_Name and string cites _Requirements: 1.4, 1.5_", () => {
  it("reads an In_Re_Name whose name holds commas", () => {
    expect(nameBefore("", "In re Air Crash Disaster Near New Orleans, LA")).toBe(
      "In re Air Crash Disaster Near New Orleans, LA",
    );
    expect(nameBefore("The court held so. ", "In re Air Crash Disaster Near New Orleans, LA")).toBe(
      "In re Air Crash Disaster Near New Orleans, LA",
    );
  });
  it("sets caseName on the citation that follows a semicolon of a string cite", () => {
    const text =
      "See Roe v. Wade, 410 U.S. 113 (1973); Doe v. Bolton, 410 U.S. 179 (1973); In re Gault, 387 U.S. 1 (1967).";
    expect(extract(text).citations.map((c) => c.caseName)).toEqual([
      "Roe v. Wade",
      "Doe v. Bolton",
      "In re Gault",
    ]);
  });
});

describe("case-match Short_Forms and other references have no caseName _Requirements: 1.6_", () => {
  it("leaves the key absent on Id., Id. at, a named short form and a statute", () => {
    const text =
      "Roe v. Wade, 410 U.S. 113, 116 (1973). Id. at 118. Roe, 410 U.S. at 116. See 42 U.S.C. § 3617.";
    const cites = extract(text).citations;
    expect(cites.map((c) => c.value.kind)).toEqual(["reporter", "short", "short", "other"]);
    expect(cites[0]?.caseName).toBe("Roe v. Wade");
    for (const c of cites.slice(1)) expect("caseName" in c).toBe(false);
  });
});

describe("case-match Tolerant_Read _Requirements: 1.13, 1.14, 1.15_", () => {
  it("keeps the extra word in the first party after a sentence that ends just before the name", () => {
    expect(
      nameBefore("The Court said so in ", "Twombly. Alvarez v. Cascade Residential Mgmt., LLC"),
    ).toBe("Twombly. Alvarez v. Cascade Residential Mgmt., LLC");
    const text =
      "The Court said so in Twombly. Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662, 678 (2009)";
    const name = extract(text).citations[0]?.caseName;
    expect(name?.split(" v. ")[1]).toBe("Cascade Residential Mgmt., LLC");
  });
  it("gives no caseName without a v.", () => {
    expect(nameBefore("", "Cascade Residential Mgmt., LLC")).toBeUndefined();
  });
  it("gives no caseName when nothing lies left of v.", () => {
    expect(nameBefore("and ", "v. Cascade Residential Mgmt., LLC")).toBeUndefined();
    expect(nameBefore("", "(Alvarez v. Cascade Mgmt.")).toBeUndefined();
  });
  it("gives no caseName when a line break cuts the name so that no v. remains", () => {
    expect(nameBefore("", "Alvarez v.\nCascade Residential Mgmt., LLC")).toBeUndefined();
  });
  it("gives no caseName for a run longer than 164 code units", () => {
    const long = `Aaaa v. ${"Bbbbbbbb ".repeat(25)}Mgmt., LLC`;
    expect(long.length).toBeGreaterThan(164);
    expect(nameBefore("", long)).toBeUndefined();
  });
  it("ends the scan at a second v.", () => {
    expect(nameBefore("", "Smith v. Jones v. Brown Mgmt.")).toBe("Jones v. Brown Mgmt.");
  });
  it("reads a name with contractions and connectors after a line break, without the lead-in", () => {
    const name = "Dep't of Homeland Sec. v. Regents of the Univ. of Cal.";
    expect(nameBefore("Prior text.\n", `See ${name}`)).toBe(name);
  });
});

describe("case-match CIT ≠ in the Reveal Codes form _Requirements: 3.1, 3.6, 3.7_", () => {
  const text = `${HENDERSON}. Id. at 680.`;
  const full = render(wrongCaseDoc(text), "full").text;
  it("renders the exact full and display strings for the Ashcroft payload", () => {
    expect(full).toContain(
      "[CIT ≠{k=k0;cl=145875;nm=Ashcroft v. Iqbal;yr=2009}]556 U.S. 662, 678 (2009)[/CIT]",
    );
    expect(full).toContain("[CIT ≠{k=k1}]Id. at 680[/CIT]");
    const display = render(wrongCaseDoc(text), "display").text;
    expect(display).toContain("[CIT ≠]556 U.S. 662, 678 (2009)[/CIT]");
    expect(display).not.toContain("145875");
  });
  it("omits yr when foundYear is absent and parses it back", () => {
    const d = must(createDocument(HENDERSON, TS));
    const noYear = must(
      setVerification(d, firstFullKey(d), {
        status: "wrong_case",
        clusterId: "145875",
        foundName: "Ashcroft v. Iqbal",
      }),
    );
    const out = render(noYear, "full").text;
    expect(out).toContain("[CIT ≠{k=k0;cl=145875;nm=Ashcroft v. Iqbal}]");
    expect(structuralEqual(must(parse(out)), noYear)).toBe(true);
  });
  it("round-trips CIT ≠ with its found name, as the Appendix is parsed", () => {
    const doc = wrongCaseDoc(text);
    const parsed = must(parse(full));
    expect(structuralEqual(parsed, doc)).toBe(true);
    const rec = parsed.citations.find((c) => c.kind === "full");
    expect(rec?.kind === "full" ? rec.result : undefined).toEqual(IQBAL);
  });
  it("round-trips a found name holding brackets, braces, semicolons, quotes and a backslash", () => {
    const foundName = 'Re [A];{B}: "C" \\n é v. D';
    const d = must(createDocument(HENDERSON, TS));
    const doc = must(setVerification(d, firstFullKey(d), { ...IQBAL, foundName }));
    const rec = must(parse(render(doc, "full").text)).citations.find((c) => c.kind === "full");
    expect(rec?.kind === "full" ? rec.result : undefined).toMatchObject({ foundName });
  });
  it("rejects a missing clusterId, an empty foundName and a bad foundYear with bad_field", () => {
    const index = full.indexOf("[CIT ≠{k=k0");
    const bad = (from: string, to: string) => parse(full.replace(from, to));
    for (const r of [
      bad("cl=145875;", ""),
      bad("nm=Ashcroft v. Iqbal;", ""),
      bad("nm=Ashcroft v. Iqbal;", "nm=;"),
      bad("yr=2009", "yr=999"),
      bad("yr=2009", "yr=10000"),
      bad("yr=2009", "yr=abc"),
    ]) {
      expect(r.ok ? undefined : r.error).toEqual({
        kind: "malformed_codes",
        index,
        rule: "bad_field",
      });
    }
  });
  it("rejects a Short_Form whose status differs from its target or that carries a payload", () => {
    const index = full.indexOf("[CIT ≠{k=k1}]");
    const differs = parse(full.replace("[CIT ≠{k=k1}]", "[CIT ✘{k=k1}]"));
    expect(differs.ok ? undefined : differs.error).toEqual({
      kind: "malformed_codes",
      index,
      rule: "short_form_code",
    });
    const payload = parse(
      full.replace("[CIT ≠{k=k1}]", "[CIT ≠{k=k1;cl=145875;nm=Ashcroft v. Iqbal}]"),
    );
    expect(payload.ok ? undefined : payload.error).toMatchObject({ rule: "short_form_code" });
  });
});

describe("case-match a caseName change resets the result _Requirements: 1.11_", () => {
  const withOverride = (): Document => {
    const doc = wrongCaseDoc(HENDERSON);
    return must(recordOverride(doc, firstFullKey(doc), "Reporter typo in my notes", TS));
  };
  const edit = (doc: Document, from: number, to: number, text: string): Document =>
    must(
      apply(doc, { kind: "replace", from, to, text, provenance: { origin: "HUM", timestamp: TS } }),
    ).document;
  it("gives a fresh key, status unchecked and no Override when the name is edited", () => {
    const doc = withOverride();
    const key = firstFullKey(doc);
    expect(doc.overrides).toHaveLength(1);
    const next = edit(doc, 0, "Henderson".length, "Ashcroft");
    const nextKey = firstFullKey(next);
    expect(nextKey).not.toBe(key);
    expect(verificationOf(next, nextKey)).toEqual({ status: "unchecked" });
    expect(next.overrides).toEqual([]);
    expect(next.citations.find((c) => c.kind === "full")?.citation.caseName).toBe(
      "Ashcroft v. Pacific Housing Authority",
    );
  });
  it("keeps key, result and Override when the edit leaves the name alone", () => {
    const doc = withOverride();
    const key = firstFullKey(doc);
    const next = edit(doc, 0, 0, "Intro text. ");
    expect(firstFullKey(next)).toBe(key);
    expect(verificationOf(next, key)).toEqual(IQBAL);
    expect(next.overrides).toHaveLength(1);
  });
});
