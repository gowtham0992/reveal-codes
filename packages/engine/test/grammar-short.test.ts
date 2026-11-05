import { describe, expect, it } from "vitest";
import { matchIdAt, matchPartyShortAt, matchShortAt } from "../src/citations/grammar-short";

/** The matched text, or null. */
const matched = (text: string, m: { start: number; end: number } | null): string | null =>
  m === null ? null : text.slice(m.start, m.end);

describe("matchIdAt _Requirements: 12.1_", () => {
  it("matches a bare Id. up to its period", () => {
    expect(matchIdAt("Id.", 0)).toEqual({
      start: 0,
      end: 3,
      value: { kind: "short", form: "id", targetStart: null },
    });
  });

  it("matches Id. at 118 and records the pincite", () => {
    const text = "See it. Id. at 118.";
    const p = text.indexOf("Id.");
    const m = matchIdAt(text, p);
    expect(matched(text, m)).toBe("Id. at 118");
    expect(m?.value).toEqual({ kind: "short", form: "id", pincite: 118, targetStart: null });
  });

  it("accepts whitespace and opening punctuation before Id.", () => {
    for (const before of [" ", "\n", "(", "[", '"', "“", "‘", "'"]) {
      expect(matchIdAt(`x${before}Id.`, 2)?.start).toBe(2);
    }
  });

  it("rejects Id. glued to a letter or digit on the left", () => {
    expect(matchIdAt("SeeId. at 5", 3)).toBeNull();
    expect(matchIdAt("5Id.", 1)).toBeNull();
  });

  it("ends at the period when the page is glued to a letter", () => {
    expect(matched("Id. at 118a", matchIdAt("Id. at 118a", 0))).toBe("Id.");
  });
});

describe("matchPartyShortAt _Requirements: 9.2, 12.2, 12.8_", () => {
  it("matches Roe, 410 U.S. at 116", () => {
    const text = "As held in Roe, 410 U.S. at 116, the right exists.";
    const p = text.indexOf("Roe");
    const m = matchPartyShortAt(text, p);
    expect(matched(text, m)).toBe("Roe, 410 U.S. at 116");
    expect(m?.value).toEqual({
      kind: "short",
      form: "party",
      party: "Roe",
      volume: 410,
      reporter: "U.S.",
      pincite: 116,
      targetStart: null,
    });
  });

  it("matches Smith, Inc., 5 U.S. at 9 at S, skipping the Entity_Suffix comma", () => {
    const text = "Smith, Inc., 5 U.S. at 9";
    expect(matchPartyShortAt(text, 0)?.value.party).toBe("Smith, Inc.");
    expect(matchPartyShortAt(text, text.indexOf("Inc."))).toBeNull();
  });

  it("matches Roe v. Wade, 410 U.S. at 153 at R and not at W", () => {
    const text = "Roe v. Wade, 410 U.S. at 153";
    expect(matched(text, matchPartyShortAt(text, 0))).toBe(text);
    expect(matchPartyShortAt(text, 0)?.value.party).toBe("Roe v. Wade");
    expect(matchPartyShortAt(text, text.indexOf("Wade"))).toBeNull();
  });

  it("returns null at a p that is not the partyStartFor start", () => {
    const text = "In Casey, 505 U.S. at 833";
    expect(matchPartyShortAt(text, 0)).toBeNull();
    expect(matchPartyShortAt(text, 3)?.value.party).toBe("Casey");
  });

  it("skips a prose comma before the tail comma", () => {
    const text = "Then, Smith, 5 U.S. at 9";
    expect(matchPartyShortAt(text, 0)).toBeNull();
    expect(matchPartyShortAt(text, 6)?.value.party).toBe("Smith");
  });

  it("fast-rejects a lowercase start and a start inside a word", () => {
    expect(matchPartyShortAt("smith, 5 U.S. at 9", 0)).toBeNull();
    expect(matchPartyShortAt("XSmith, 5 U.S. at 9", 1)).toBeNull();
  });

  it("rejects a tail without at, or a page glued to a letter", () => {
    expect(matchPartyShortAt("Roe, 410 U.S. 116", 0)).toBeNull();
    expect(matchPartyShortAt("Roe, 410 U.S. at 116a", 0)).toBeNull();
  });

  it("resolves a Near_Miss reporter in the tail", () => {
    expect(matchPartyShortAt("Roe, 410 US at 116", 0)?.value.reporter).toBe("U.S.");
  });

  it("reads nothing outside [p − 162, p + 1024)", () => {
    const party = "Roe";
    const text = `${"x".repeat(500)} ${party}, 410 U.S. at 116 ${"y".repeat(2000)}`;
    const p = text.indexOf(party);
    const window = text.slice(p - 162, p + 1024);
    const local = matchPartyShortAt(window, 162);
    const full = matchPartyShortAt(text, p);
    expect(full?.value).toEqual(local?.value);
    expect(full && full.end - p).toBe(local && local.end - 162);
  });
});

describe("matchShortAt: one class, longer wins _Requirements: 12.1, 12.2_", () => {
  it("prefers the party form in Id. Smith, 5 U.S. at 9 (D16)", () => {
    const text = "Id. Smith, 5 U.S. at 9";
    const m = matchShortAt(text, 0);
    expect(matched(text, m)).toBe(text);
    expect(m?.value).toMatchObject({ form: "party", party: "Id. Smith" });
  });

  it("keeps Id. at 5 and Smith, 5 U.S. at 9 apart", () => {
    const text = "Id. at 5. Smith, 5 U.S. at 9";
    expect(matched(text, matchShortAt(text, 0))).toBe("Id. at 5");
    expect(matchShortAt(text, text.indexOf("Smith"))?.value).toMatchObject({ party: "Smith" });
  });

  it("returns null when neither form matches", () => {
    expect(matchShortAt("the court said", 4)).toBeNull();
    expect(matchShortAt("", 0)).toBeNull();
    expect(matchShortAt("Id.", -1)).toBeNull();
  });
});
