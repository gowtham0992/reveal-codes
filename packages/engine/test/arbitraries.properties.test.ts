import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isCaseName, isGapCaseName } from "../src/citations/case-name";
import { extract } from "../src/citations/extract";
import { REPORTERS } from "../src/citations/reporters";
import { arbCaseName } from "../src/testing/arbitraries";
import { runs } from "./support/fc";

/*
 * Test-local Glossary checker for Case_Name (requirements Glossary
 * Party_Name, Case_Name, Entity_Suffix, Legal_Abbreviation,
 * Single_Capital_Initial, Signal; design D9, D10). It shares no code with
 * `src/citations/case-name.ts`: the word lists are typed from the Glossary,
 * and only the Reporter_List data table is read from the Engine, because the
 * Glossary defines the reporter abbreviations as that list.
 */

/** Glossary Legal_Abbreviation, non-reporter entries, then every reporter. */
const GLOSSARY_ABBREVIATIONS: readonly string[] = [
  ...["Id.", "v.", "Inc.", "Corp.", "Ltd.", "Co.", "L.P.", "N.A.", "L.L.C."],
  ...["No.", "Cir.", "Dist.", "Ct.", "Fed.", "Supp.", "et al."],
  ...REPORTERS,
];

/** Glossary Signal: the ten capitalised Gap_Signals plus four more. */
const GLOSSARY_SIGNALS: readonly string[] = [
  ...["See", "See also", "See, e.g.,", "E.g.,", "Accord", "Cf.", "But see", "Compare"],
  ...["Citing", "Quoting", "But cf.", "Contra", "E.g.", "See generally"],
];

/** Glossary Entity_Suffix words, after the two code units `, `. */
const GLOSSARY_SUFFIX_WORDS: readonly string[] = [
  ...["Inc.", "LLC", "L.L.C.", "Ltd.", "Co.", "Corp.", "L.P.", "N.A."],
];

const PARTY_CHARS = /^[\p{L}0-9 .,'’&-]*$/u;
const LETTER_OR_DIGIT = /^[\p{L}0-9]/u;
/** D10: a digit, a space, at least one code unit, a space, a digit. */
const DIGIT_TOKEN_DIGIT = /[0-9] [\s\S]+ [0-9]/;

/** Offsets of the `.`s covered by a Legal_Abbreviation or a Single_Capital_Initial. */
function coveredPeriods(p: string): ReadonlySet<number> {
  const covered = new Set<number>();
  for (let j = 0; j < p.length; j++) {
    if (j > 0 && p[j - 1] !== " ") continue; // D9: occurrences start at a word start
    for (const a of GLOSSARY_ABBREVIATIONS) {
      if (!p.startsWith(a, j)) continue;
      for (let k = 0; k < a.length; k++) if (a[k] === ".") covered.add(j + k);
    }
    if (/^[A-Z]\./.test(p.slice(j, j + 2))) covered.add(j + 1);
  }
  return covered;
}

function everyPeriodCovered(p: string): boolean {
  const covered = coveredPeriods(p);
  for (let i = 0; i < p.length; i++) if (p[i] === "." && !covered.has(i)) return false;
  return true;
}

function startsWithGlossarySignal(p: string): boolean {
  return GLOSSARY_SIGNALS.some((s) => {
    if (!p.startsWith(s)) return false;
    const next = p[s.length];
    return next === undefined || next === " " || next === ",";
  });
}

/** Glossary Party_Name, checked clause by clause. */
function glossaryIsPartyName(p: string): boolean {
  const last = p[p.length - 1];
  return (
    p.length >= 1 &&
    p.length <= 80 &&
    PARTY_CHARS.test(p) &&
    LETTER_OR_DIGIT.test(p) &&
    last !== " " &&
    last !== "," &&
    !p.includes("  ") &&
    everyPeriodCovered(p) &&
    !p.includes(" v. ") &&
    !startsWithGlossarySignal(p) &&
    !DIGIT_TOKEN_DIGIT.test(p)
  );
}

/** Every split `[left, right]` of a Case_Name body at an occurrence of ` v. `. */
function splits(body: string): readonly (readonly [string, string])[] {
  const out: (readonly [string, string])[] = [];
  for (let i = body.indexOf(" v. "); i >= 0; i = body.indexOf(" v. ", i + 1)) {
    out.push([body.slice(0, i), body.slice(i + 4)]);
  }
  return out;
}

/** Glossary Case_Name: Party_Name + ` v. ` + Party_Name + `,`. */
function glossaryIsCaseName(n: string): boolean {
  if (!n.endsWith(",")) return false;
  return splits(n.slice(0, -1)).some(([a, b]) => glossaryIsPartyName(a) && glossaryIsPartyName(b));
}

/** The two Party_Names of a generated Case_Name (it has exactly one ` v. `). */
function parties(n: string): readonly [string, string] {
  const [split] = splits(n.slice(0, -1));
  if (split === undefined) throw new Error(`no " v. " in ${n}`);
  return split;
}

describe("arbitraries: arbCaseName _Requirements: 22.1, 22.4_", () => {
  // Property 48
  it("arbCaseName generates only Case_Names", () => {
    fc.assert(
      fc.property(arbCaseName, (n) => {
        expect(glossaryIsCaseName(n)).toBe(true);
        expect(isCaseName(n, 0, n.length)).toBe(true);
        expect(isGapCaseName(n, 0, n.length)).toBe(true);
        // Arbitraries table: at most one of the two Party_Names holds a digit run.
        expect(parties(n).filter((p) => /[0-9]/.test(p)).length).toBeLessThanOrEqual(1);
        expect(extract(n).citations).toEqual([]);
      }),
      runs(),
    );
  });

  it("the Glossary checker rejects near-Case_Names", () => {
    for (const bad of [
      "Roe v. Wade",
      "Roe Wade,",
      "See v. Wade,",
      "AcmeL.L.C. v. Smith,",
      "Roe  Jr v. Wade,",
      "Smith 5 U.S. 9 v. Doe,",
      "Roe v. Wade v. Doe x,",
      "Roe. v. Wade,",
    ]) {
      expect(glossaryIsCaseName(bad)).toBe(false);
    }
    expect(glossaryIsCaseName("Acme, L.L.C. v. Smith,")).toBe(true);
    expect(glossaryIsCaseName("J. Smith & Co. v. O’Neil-Jones, N.A.,")).toBe(true);
  });
});

/** Regex alternation of the suffix words (periods escaped). */
const SUFFIX_ALT = GLOSSARY_SUFFIX_WORDS.map((w) => w.replace(/\./g, "\\.")).join("|");

/** The features the design requires on each side across generated values. */
const FEATURES: readonly (readonly [string, (p: string) => boolean])[] = [
  ["Legal_Abbreviation", (p) => p.split(/[ ,]/).some((w) => GLOSSARY_ABBREVIATIONS.includes(w))],
  ...["Ltd.", "Co.", "L.P.", "N.A.", "L.L.C."].map(
    (a) => [a, (p: string) => p.split(/[ ,]/).includes(a)] as const,
  ),
  ["Single_Capital_Initial", (p) => /(^| )[A-Z]\./.test(p)],
  ...["&", "'", "’", "-"].map((c) => [c, (p: string) => p.includes(c)] as const),
  ["internal comma", (p) => p.replace(new RegExp(`, (${SUFFIX_ALT})$`), "").includes(",")],
  ...GLOSSARY_SUFFIX_WORDS.map(
    (w) => [`Entity_Suffix ${w}`, (p: string) => p.endsWith(`, ${w}`)] as const,
  ),
];

describe("arbitraries: arbCaseName coverage _Requirements: 22.1_", () => {
  it("both parties show every required feature across 2,000 values (seed 48)", () => {
    const sample = fc.sample(arbCaseName, { seed: 48, numRuns: 2000 });
    const missing: string[] = [];
    for (const side of [0, 1] as const) {
      for (const [label, has] of FEATURES) {
        const count = sample.filter((n) => has(parties(n)[side])).length;
        if (count === 0) missing.push(`${side === 0 ? "left" : "right"}: ${label}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
