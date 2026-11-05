import { describe, expect, it } from "vitest";
import {
  CONNECTORS,
  MAX_PARTY,
  PARTY_SCAN,
  PARTY_STOP_LIST,
  isCapitalisedWord,
  partyStartFor,
} from "../src/citations/party";

const TAIL = ", 5 U.S. at 9";

/** The party `partyStartFor` gives for the tail comma in `text`, or null. */
function partyOf(text: string): string | null {
  const c = text.lastIndexOf(TAIL);
  const s = partyStartFor(text, c);
  return s === null ? null : text.slice(s, c);
}

const word = (n: number): string => "A" + "b".repeat(n - 1);
const run = (...lengths: number[]): string => lengths.map(word).join(" ");

describe("party constants _Requirements: 12.8_", () => {
  it("builds the stop list from the Signals plus the extra entries", () => {
    expect(PARTY_STOP_LIST).toHaveLength(21);
    expect(PARTY_STOP_LIST[2]).toEqual(["See,", "e.g.,"]);
    expect(PARTY_STOP_LIST.slice(14)).toEqual([
      ["In"],
      ["As"],
      ["Under"],
      ["Following"],
      ["Applying"],
      ["The", "court", "in"],
      ["The", "Court", "in"],
    ]);
    expect(CONNECTORS).toEqual([["&"], ["of"], ["the"], ["and"], ["ex", "rel."]]);
    expect(PARTY_SCAN).toBe(2 * MAX_PARTY + 1);
  });
});

describe("isCapitalisedWord _Requirements: 12.2_", () => {
  const cap = (w: string): boolean => isCapitalisedWord(w, 0, w.length);

  it("accepts capitalised words, Legal_Abbreviations, and initials", () => {
    for (const w of ["Smith", "O'Neil", "Smith-Jones", "Él", "Id.", "Inc.", "U.S.", "J.", "LLC"]) {
      expect(cap(w)).toBe(true);
    }
  });

  it("rejects v., lower-case words, and other periods", () => {
    for (const w of ["v.", "smith", "Smith.", "5", "&", "ex", "rel.", "Smith,"]) {
      expect(cap(w)).toBe(false);
    }
  });
});

describe("partyStartFor: stripping (D12, D13, D15) _Requirements: 9.2, 12.2, 12.8_", () => {
  it.each([
    ["In Casey" + TAIL, "Casey"],
    ["Planned Parenthood" + TAIL, "Planned Parenthood"],
    ["See Planned Parenthood" + TAIL, "Planned Parenthood"],
    ["In the Matter of Smith" + TAIL, "Matter of Smith"],
    ["See In the Casey" + TAIL, "Casey"],
    ["The Smith Corp." + TAIL, "The Smith Corp."],
    ["Seeds Co." + TAIL, "Seeds Co."],
    ["In" + TAIL, "In"],
    ["See also Casey" + TAIL, "Casey"],
    ["Cf. Casey" + TAIL, "Casey"],
    ["E.g., Casey" + TAIL, "Casey"],
  ])("%s gives %s", (text, party) => {
    expect(partyOf(text)).toBe(party);
  });
});

describe("partyStartFor: suffixes, v., connectors (D14, D16) _Requirements: 9.2, 12.2, 12.8_", () => {
  it.each([
    ["Smith, Inc." + TAIL, "Smith, Inc."],
    ["foo, Inc." + TAIL, "Inc."],
    ["Smith, Jones" + TAIL, "Jones"],
    ["Roe v. Wade" + TAIL, "Roe v. Wade"],
    ["See Roe v. Wade" + TAIL, "Roe v. Wade"],
    ["Acme, Inc. v. Smith" + TAIL, "Acme, Inc. v. Smith"],
    ["Acme, Inc. v. Smith, LLC" + TAIL, "Acme, Inc. v. Smith, LLC"],
    ["A v. B v. C" + TAIL, "B v. C"],
    ["foo v. Wade" + TAIL, "Wade"],
    ["Id. Smith" + TAIL, "Id. Smith"],
    ["Id. v. Smith" + TAIL, "Id. v. Smith"],
    ["United States ex rel. Smith" + TAIL, "United States ex rel. Smith"],
    ["Smith & Jones" + TAIL, "Smith & Jones"],
    ["Board of the City" + TAIL, "Board of the City"],
    ["Smith&Jones" + TAIL, "Jones"],
    ["Smith  Jones" + TAIL, "Jones"],
    ["(Smith Jones" + TAIL, "Smith Jones"],
    ["Smith rel. Jones" + TAIL, "Jones"],
  ])("%s gives %s", (text, party) => {
    expect(partyOf(text)).toBe(party);
  });

  it("returns null when stripping leaves v., or no Party_Run ends at the comma", () => {
    expect(partyOf("In v. Wade" + TAIL)).toBeNull();
    expect(partyOf("smith" + TAIL)).toBeNull();
    expect(partyOf("Smith " + TAIL)).toBeNull();
    expect(partyStartFor("Smith", -1)).toBeNull();
    expect(partyStartFor("Smith", 9)).toBeNull();
  });
});

describe("partyStartFor: MAX_PARTY and PARTY_SCAN (D17) _Requirements: 12.8_", () => {
  it("accepts a run of exactly MAX_PARTY code units and rejects MAX_PARTY + 1", () => {
    const exact = run(10, 10, 10, 10, 10, 10, 10, 3);
    expect(exact).toHaveLength(80);
    expect(partyOf("x " + exact + TAIL)).toBe(exact);
    const over = run(10, 10, 10, 10, 10, 10, 10, 4);
    expect(partyOf("x " + over + TAIL)).toBeNull();
  });

  it("counts v. and Entity_Suffixes toward the bound", () => {
    const side = (n: number): string => run(n, 10, 10) + ", Inc.";
    const exact = side(10) + " v. " + side(10);
    expect(exact).toHaveLength(80);
    expect(partyOf(exact + TAIL)).toBe(exact);
    expect(partyOf(side(11) + " v. " + side(10) + TAIL)).toBeNull();
  });

  it("classifies the word that straddles the 80 mark", () => {
    const party = run(10, 10, 10, 10, 10, 10, 10);
    expect(party).toHaveLength(76);
    expect(partyOf("He wrote extensively " + party + TAIL)).toBe(party);
    expect(partyOf("He wrote Extensively " + party + TAIL)).toBeNull();
    expect(partyOf(word(70) + " " + party + TAIL)).toBeNull();
  });

  it("treats a token starting outside the window as a stop (D17)", () => {
    const party = run(10, 10, 10, 10, 10, 10, 10);
    expect(partyOf("x " + word(90) + " " + party + TAIL)).toBe(party);
    expect(partyOf(word(90) + " " + party + TAIL)).toBe(party);
  });

  it("ends a Connector chain at the window edge and reads nothing before it", () => {
    const chain = (n: number): string => Array.from({ length: n }, () => "of").join(" ");
    // Inside the window the leading Capitalised_Word makes the run too long.
    expect(partyOf("Abc " + chain(30) + " Smith" + TAIL)).toBeNull();
    // 60 Connectors span 179 code units, so `Abc` lies outside the window and
    // the scan stops in state K with `Smith` as the longest accepted run.
    const far = chain(60) + " Smith" + TAIL;
    expect(far.lastIndexOf(TAIL)).toBeGreaterThan(PARTY_SCAN);
    expect(partyOf("Abc " + far)).toBe("Smith");
    expect(partyOf("abc " + far)).toBe("Smith");
  });
});
