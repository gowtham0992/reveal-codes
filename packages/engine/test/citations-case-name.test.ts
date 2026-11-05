import { describe, expect, it } from "vitest";
import {
  MAX_CASE_NAME,
  MIN_CASE_NAME,
  isCaseName,
  isGapCaseName,
  isPartyName,
  matchPrecedingGap,
} from "../src/citations/case-name";
import { MAX_PARTY } from "../src/citations/party";

const party = (s: string): boolean => isPartyName(s, 0, s.length);
const caseName = (s: string): boolean => isCaseName(s, 0, s.length);
const gapCase = (s: string): boolean => isGapCaseName(s, 0, s.length);
const gap = (s: string): boolean => matchPrecedingGap(s, 0, s.length);

describe("isPartyName _Requirements: 13.1_", () => {
  it("accepts Glossary Party_Names with Entity_Suffixes and initials", () => {
    for (const p of ["Roe", "Acme, Inc.", "Smith, L.L.C.", "Bank of America, N.A.", "J. Smith"]) {
      expect(party(p)).toBe(true);
    }
    expect(party("Acme, L.P.")).toBe(true);
    expect(party("O’Brien & Sons, LLC")).toBe(true);
  });

  it("rejects periods outside an abbreviation at a word start (D9)", () => {
    expect(party("AcmeL.L.C.")).toBe(false);
    expect(party("Smith.")).toBe(false);
    expect(party("JS. Smith")).toBe(false);
  });

  it("rejects a leading Signal, an inner v., bad shape, and digit patterns (D10)", () => {
    expect(party("See Roe")).toBe(false);
    expect(party("See, Roe")).toBe(false);
    expect(party("Seeds Co.")).toBe(true);
    expect(party("Roe v. Wade")).toBe(false);
    expect(party("Roe  Wade")).toBe(false);
    expect(party("Roe,")).toBe(false);
    expect(party(" Roe")).toBe(false);
    expect(party('Roe "x"')).toBe(false);
    expect(party("Local 12 of 3 Counties")).toBe(false);
    expect(party("Local 12 Union")).toBe(true);
  });

  it("enforces the 1 to MAX_PARTY length bound", () => {
    expect(party("")).toBe(false);
    expect(party("A".repeat(MAX_PARTY))).toBe(true);
    expect(party("A".repeat(MAX_PARTY + 1))).toBe(false);
  });

  it("reads only inside the range and rejects bad ranges", () => {
    const t = "xx Roe yy";
    expect(isPartyName(t, 3, 6)).toBe(true);
    expect(isPartyName(t, 6, 3)).toBe(false);
    expect(isPartyName(t, 3, 99)).toBe(false);
    expect(isPartyName(t, -1, 3)).toBe(false);
  });
});

describe("isCaseName and isGapCaseName _Requirements: 13.1_", () => {
  it("accepts Case_Names", () => {
    for (const c of [
      "Roe v. Wade,",
      "Acme, Inc. v. Smith, L.L.C.,",
      "Bank of America, N.A. v. Jones,",
      "J. Smith v. Doe,",
      "a v. b,",
    ]) {
      expect(caseName(c)).toBe(true);
      expect(gapCase(c)).toBe(true);
    }
    expect(MIN_CASE_NAME).toBe("a v. b,".length);
    expect(MAX_CASE_NAME).toBe(2 * MAX_PARTY + 5);
  });

  it("rejects names without exactly one v., with a Signal, or too long", () => {
    expect(caseName("A v. B v. C,")).toBe(false);
    expect(caseName("A v. v. B,")).toBe(false);
    expect(caseName("See Roe v. Wade,")).toBe(false);
    expect(caseName("Roe and Wade,")).toBe(false);
    expect(caseName("Roe v. Wade")).toBe(false);
    expect(caseName("A".repeat(MAX_PARTY + 1) + " v. Wade,")).toBe(false);
    expect(caseName("A".repeat(MAX_PARTY) + " v. " + "B".repeat(MAX_PARTY) + ",")).toBe(true);
  });

  it("rejects a leading with or lowercase Gap_Signal only in the gap form (D19)", () => {
    for (const c of ["with Casey v. Smith,", "see Roe v. Wade,", "Roe v. accord Wade,"]) {
      expect(caseName(c)).toBe(true);
      expect(gapCase(c)).toBe(false);
    }
    expect(gapCase("within Reach v. Smith,")).toBe(true);
  });
});

describe("matchPrecedingGap _Requirements: 13.1, 13.9_", () => {
  it("accepts punctuation-only, Gap_Signal, and Case_Name gaps", () => {
    for (const g of [
      "",
      " ",
      ". (",
      " See Roe v. Wade, ",
      " (quoting Roe v. Wade, ",
      " See, e.g., ",
      " See, e.g., Roe v. Wade, ",
      "," + " Roe v. Wade, ",
      " Cf.Roe v. Wade, ",
      " Acme, Inc. v. Smith, L.L.C., ",
      " See ",
    ]) {
      expect(gap(g)).toBe(true);
    }
  });

  it("rejects In, with, doubled signals, and stray words", () => {
    for (const g of [
      " See accord ",
      " In ",
      " with Casey v. Smith, ",
      " See accord Roe v. Wade, ",
      " Roe v. Wade ",
      " See Roe v. Wade, and ",
    ]) {
      expect(gap(g)).toBe(false);
    }
  });

  it("tries only the longest Gap_Signal at a position (D21)", () => {
    expect(gap(" See also See A, Inc. v. A & A, ")).toBe(false);
    for (const g of [
      " See also Roe v. Wade, ",
      " See, e.g., Roe v. Wade, ",
      " See Roe v. Wade, ",
      " see also ",
    ]) {
      expect(gap(g)).toBe(true);
    }
  });

  it("matches only inside [g0, g1)", () => {
    const t = '"x" See Roe v. Wade, 410 U.S. 113';
    expect(matchPrecedingGap(t, 3, 21)).toBe(true);
    expect(matchPrecedingGap(t, 3, 20)).toBe(true);
    expect(matchPrecedingGap(t, 3, 19)).toBe(false);
    expect(matchPrecedingGap(t, 5, 3)).toBe(false);
  });
});
