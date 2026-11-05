import { describe, expect, it } from "vitest";
import { LOOKAHEAD, LOOKBEHIND, MAX_MATCH, matchAt, scanRange } from "../src/citations/scan";
import type { Match } from "../src/citations/scan";

const never = (): boolean => false;

/** The matched text of every match of a full scan. */
const scanned = (text: string): string[] =>
  scanRange(text, 0, never).map((m) => text.slice(m.start, m.end));

const kindOf = (m: Match | null): string | null =>
  m === null ? null : m.value.kind === "short" ? `short:${m.value.form}` : m.value.kind;

describe("scan constants _Requirements: 9.1, 9.7_", () => {
  it("uses the design values, with LOOKBEHIND = PARTY_SCAN + 1", () => {
    expect([MAX_MATCH, LOOKAHEAD, LOOKBEHIND]).toEqual([512, 1024, 162]);
  });
});

describe("matchAt class order _Requirements: 9.1, 9.7_", () => {
  // Req 14.7 removed the only reporter/database collisions (`… LEXIS` entries), so no text has both readings.
  it("takes a Parallel_Citation over its first member", () => {
    const text = "410 U.S. 113, 93 S. Ct. 705 (1973)";
    const m = matchAt(text, 0);
    expect(kindOf(m)).toBe("parallel");
    expect(m?.end).toBe(text.length);
  });

  it("takes the longer Short_Form at the same p (D16)", () => {
    const text = "Id. Smith, 5 U.S. at 9";
    const m = matchAt(text, 0);
    expect(kindOf(m)).toBe("short:party");
    expect(m?.end).toBe(text.length);
    expect(kindOf(matchAt("Id. at 5.", 0))).toBe("short:id");
  });

  it("recognises an Other_Reference when no Full_Citation starts inside it", () => {
    const m = matchAt("42 U.S.C. § 1983", 0);
    expect(m?.value).toMatchObject({ kind: "other", form: "usc", title: 42, section: "1983" });
  });

  it("rejects an Other_Reference when a reporter match starts inside it (Req 9.7)", () => {
    // `12 U.S.C. § 5` is an Other_Reference on its own, but `5 U.S. 9`
    // starts inside it, so the Full_Citation wins.
    const text = "12 U.S.C. § 5 U.S. 9";
    expect(matchAt(text, 0)).toBeNull();
    expect(scanned(text)).toEqual(["5 U.S. 9"]);
    expect(kindOf(matchAt(text, text.indexOf("5 U.S.")))).toBe("reporter");
  });

  it("returns null outside the Text and for non-integer p", () => {
    for (const p of [-1, 3, 0.5, Number.NaN]) expect(matchAt("Id.", p)).toBeNull();
    expect(matchAt("", 0)).toBeNull();
  });
});

describe("Req 9.8 word boundary _Requirements: 9.8_", () => {
  it("rejects a citation glued to a letter or digit on the left", () => {
    expect(scanned("x410 U.S. 113")).toEqual([]);
    // 123456 is out of the volume range, and every suffix (`23456 …`) is
    // glued to a digit on the left.
    expect(scanned("123456 U.S. 113")).toEqual([]);
    expect(scanned("\u{1D400}410 U.S. 113")).toEqual([]);
    expect(scanned("a42 U.S.C. § 1983")).toEqual([]);
    expect(scanned("x2024 WL 123456")).toEqual([]);
  });

  it("rejects a citation glued to a letter on the right", () => {
    expect(scanned("410 U.S. 113a")).toEqual([]);
    expect(scanned("2024 WL 123456z")).toEqual([]);
  });

  it("accepts the same citations after a space", () => {
    expect(scanned("x 410 U.S. 113")).toEqual(["410 U.S. 113"]);
  });
});

describe("scanRange _Requirements: 9.1, 9.7_", () => {
  const paragraph =
    "See Roe v. Wade, 410 U.S. 113, 116 (1973). Id. at 118. Later, Roe, 410 U.S. at 116; " +
    "42 U.S.C. § 1983; 2024 WL 123456; 410 U.S. 113, 93 S. Ct. 705 (1973).";

  it("finds every form leftmost-longest and in order", () => {
    expect(scanned(paragraph)).toEqual([
      "410 U.S. 113, 116 (1973)",
      "Id. at 118",
      "Roe, 410 U.S. at 116",
      "42 U.S.C. § 1983",
      "2024 WL 123456",
      "410 U.S. 113, 93 S. Ct. 705 (1973)",
    ]);
  });

  it("returns non-overlapping matches with ascending starts", () => {
    const ms = scanRange(paragraph, 0, never);
    expect(ms).toHaveLength(6);
    ms.slice(1).forEach((m, i) => {
      expect(m.start).toBeGreaterThanOrEqual(ms[i]?.end ?? Infinity);
    });
  });

  it("scans a sub-range from a cursor position up to a stop predicate", () => {
    const idStart = paragraph.indexOf("Id.");
    const otherStart = paragraph.indexOf("42 U.S.C.");
    const sub = scanRange(paragraph, idStart, (p) => p >= otherStart);
    expect(sub.map((m) => paragraph.slice(m.start, m.end))).toEqual([
      "Id. at 118",
      "Roe, 410 U.S. at 116",
    ]);
  });

  it("treats a bad from as 0 and returns nothing past the end", () => {
    expect(scanRange("410 U.S. 113", -5, never)).toHaveLength(1);
    expect(scanRange("410 U.S. 113", 99, never)).toEqual([]);
    expect(scanRange("", 0, never)).toEqual([]);
  });

  it("does not throw on unpaired surrogates", () => {
    expect(scanned("\uD800 410 U.S. 113 \uDC00")).toEqual(["410 U.S. 113"]);
  });
});

describe("matchAt locality _Requirements: 9.1_", () => {
  it("decides every p from [p − LOOKBEHIND, p + LOOKAHEAD) alone", () => {
    const filler = "the court considered the matter at length and ".repeat(8);
    const text =
      filler +
      "Planned Parenthood of Southeastern Pennsylvania, 505 U.S. at 833. " +
      filler +
      "410 U.S. 113, 116 (1973); 12 U.S.C. § 5 U.S. 9. " +
      filler;
    for (let p = 0; p < text.length; p += 1) {
      const lo = Math.max(0, p - LOOKBEHIND);
      const local = matchAt(text.slice(lo, p + LOOKAHEAD), p - lo);
      const shifted =
        local === null ? null : { ...local, start: local.start + lo, end: local.end + lo };
      expect(shifted).toEqual(matchAt(text, p));
    }
    expect(scanned(text)).toEqual([
      "Planned Parenthood of Southeastern Pennsylvania, 505 U.S. at 833",
      "410 U.S. 113, 116 (1973)",
      "5 U.S. 9",
    ]);
  });
});
