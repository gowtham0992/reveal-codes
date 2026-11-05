import { describe, expect, it } from "vitest";
import {
  isCourtText,
  matchParallelTail,
  matchParenthetical,
  matchReporterAt,
  resolveReporterAt,
} from "../src/citations/grammar";

const at0 = (text: string) => matchReporterAt(text, 0);

describe("matchReporterAt reporter citations _Requirements: 9.3_", () => {
  it("reads volume, reporter, page, pincite, and year", () => {
    const t = "410 U.S. 113, 116 (1973)";
    expect(at0(t)).toEqual({
      start: 0,
      end: t.length,
      value: {
        kind: "reporter",
        volume: 410,
        reporter: "U.S.",
        page: 113,
        pincite: 116,
        year: 1973,
      },
    });
  });

  it("reads a court and year", () => {
    const t = "598 F.3d 1, 7 (2d Cir. 2010)";
    expect(at0(t)?.value).toEqual({
      kind: "reporter",
      volume: 598,
      reporter: "F.3d",
      page: 1,
      pincite: 7,
      court: "2d Cir.",
      year: 2010,
    });
    expect(at0(t)?.end).toBe(t.length);
  });

  it("resolves a multi-word reporter, longest token first", () => {
    const t = "123 Cal. App. 4th 456 (2004)";
    expect(at0(t)?.value).toEqual({
      kind: "reporter",
      volume: 123,
      reporter: "Cal. App. 4th",
      page: 456,
      year: 2004,
    });
  });

  it("leaves absent fields absent", () => {
    expect(at0("410 U.S. 113 and more")).toEqual({
      start: 0,
      end: 12,
      value: { kind: "reporter", volume: 410, reporter: "U.S.", page: 113 },
    });
  });

  it("reads a court-only parenthetical", () => {
    expect(at0("5 F.3d 9 (9th Cir.)")?.value).toEqual({
      kind: "reporter",
      volume: 5,
      reporter: "F.3d",
      page: 9,
      court: "9th Cir.",
    });
  });

  it("matches at an inner position preceded by a space or (", () => {
    const t = "See (410 U.S. 113).";
    expect(matchReporterAt(t, 5)).toMatchObject({ start: 5, end: 17 });
  });
});

describe("matchReporterAt Req 9.8 boundaries _Requirements: 9.3_", () => {
  it("rejects a volume preceded by a letter or digit", () => {
    expect(matchReporterAt("x410 U.S. 113", 1)).toBeNull();
    expect(matchReporterAt("410 U.S. 113", 1)).toBeNull();
  });

  it("rejects a page followed by a letter or digit", () => {
    expect(at0("410 U.S. 113x")).toBeNull();
  });

  it("drops a pincite followed by a letter, ending at the page", () => {
    expect(at0("410 U.S. 113, 1st")).toMatchObject({ end: 12 });
  });

  it("rejects leading zeros and out-of-range numbers", () => {
    expect(at0("0410 U.S. 113")).toBeNull();
    expect(at0("410 U.S. 0113")).toBeNull();
    expect(at0("410 U.S. 100000")).toBeNull();
  });
});

describe("matchReporterAt Near_Miss and garbage _Requirements: 11.1, 11.5_", () => {
  it("normalises 410 US 113 and 410 U. S. 113 to U.S., keeping written offsets", () => {
    expect(at0("410 US 113")).toEqual({
      start: 0,
      end: 10,
      value: { kind: "reporter", volume: 410, reporter: "U.S.", page: 113 },
    });
    expect(at0("410 U. S. 113")?.value).toMatchObject({ reporter: "U.S." });
    expect(at0("410 U. S. 113")?.end).toBe(13);
  });

  it("prefers the longest token: So. 2 d resolves to So. 2d", () => {
    expect(at0("5 So. 2 d 10")?.value).toEqual({
      kind: "reporter",
      volume: 5,
      reporter: "So. 2d",
      page: 10,
    });
  });

  it("is case-sensitive", () => {
    expect(at0("410 u.s. 113")).toBeNull();
  });

  it("does not extract garbage", () => {
    expect(at0("410 Q.Z. 113")).toBeNull();
    expect(matchReporterAt("410 Q.Z. 113", 1)).toBeNull();
  });

  it("is deterministic across repeated calls", () => {
    expect(at0("410 U. S. 113")).toEqual(at0("410 U. S. 113"));
  });
});

describe("matchReporterAt parallel citations _Requirements: 9.5, 11.6_", () => {
  it("reads members with per-member pincites and a shared parenthetical (D1)", () => {
    const t = "410 U.S. 113, 116, 93 S. Ct. 705, 708 (1973)";
    expect(at0(t)).toEqual({
      start: 0,
      end: t.length,
      value: {
        kind: "parallel",
        members: [
          { volume: 410, reporter: "U.S.", page: 113, pincite: 116 },
          { volume: 93, reporter: "S. Ct.", page: 705, pincite: 708 },
        ],
        year: 1973,
      },
    });
  });

  it("reads comma-joined members with no parenthetical as one parallel (D2)", () => {
    expect(at0("1 F.3d 2, 3 F.3d 4")?.value).toEqual({
      kind: "parallel",
      members: [
        { volume: 1, reporter: "F.3d", page: 2 },
        { volume: 3, reporter: "F.3d", page: 4 },
      ],
    });
  });

  it("normalises a Near_Miss member", () => {
    const t = "410 US 113, 93 S.Ct. 705 (1973)";
    const m = at0(t);
    expect(m?.end).toBe(t.length);
    expect(m?.value).toMatchObject({
      members: [{ reporter: "U.S." }, { reporter: "S. Ct." }],
    });
  });

  it("stops after four members", () => {
    const t = "1 F.3d 2, 3 F.3d 4, 5 F.3d 6, 7 F.3d 8, 9 F.3d 10";
    const m = at0(t);
    expect(m?.value.kind).toBe("parallel");
    expect(m?.value).toMatchObject({ members: { length: 4 } });
    expect(m?.end).toBe("1 F.3d 2, 3 F.3d 4, 5 F.3d 6, 7 F.3d 8".length);
  });

  it("matchParallelTail returns the input when nothing follows", () => {
    const first = { volume: 1, reporter: "F.3d", page: 2 };
    expect(matchParallelTail("1 F.3d 2.", 8, [first])).toEqual({ members: [first], end: 8 });
  });
});

describe("matchParenthetical court rule (D3) _Requirements: 9.3_", () => {
  it("splits court and year", () => {
    expect(matchParenthetical(" (2d Cir. 2010)", 0)).toEqual({
      end: 15,
      court: "2d Cir.",
      year: 2010,
    });
    expect(matchParenthetical(" (1973)", 0)).toEqual({ end: 7, year: 1973 });
  });

  it("rejects malformed courts, so the citation ends at the page", () => {
    for (const bad of [" ()", " (2d  Cir. 2010)", " ( 1973)", ' (a"b 1999)', " (x\t2001)"]) {
      expect(matchParenthetical(bad, 0)).toBeNull();
    }
    expect(at0("410 U.S. 113 (a  b)")).toMatchObject({ end: 12 });
  });

  it("rejects an unclosed or over-long parenthetical", () => {
    expect(matchParenthetical(" (2d Cir. 2010", 0)).toBeNull();
    expect(matchParenthetical(` (${"x".repeat(41)})`, 0)).toBeNull();
    expect(matchParenthetical(` (${"x".repeat(40)} 2010)`, 0)).toMatchObject({ year: 2010 });
  });

  it("isCourtText applies the tightened rule", () => {
    expect(isCourtText("2d Cir.")).toBe(true);
    expect(isCourtText("Cir. 1500")).toBe(true);
    expect(isCourtText("x 2001")).toBe(false);
    expect(isCourtText("1999")).toBe(false);
    expect(isCourtText("a  b")).toBe(false);
    expect(isCourtText("")).toBe(false);
  });
});

describe("resolveReporterAt _Requirements: 11.1, 11.5_", () => {
  it("passes the resolved entry and token end to follow, longest first", () => {
    const seen: string[] = [];
    resolveReporterAt("So. 2d 10 x", 0, (r) => {
      seen.push(r);
      return null;
    });
    expect(seen).toEqual(["So. 2d", "So."]);
  });

  it("never looks past 40 code units", () => {
    const text = `U.S.${" ".repeat(40)}`;
    const ends: number[] = [];
    resolveReporterAt(text, 0, (_r, e) => {
      ends.push(e);
      return null;
    });
    expect(Math.max(...ends)).toBeLessThanOrEqual(40);
  });

  it("does not depend on text beyond the read bound", () => {
    const t = "410 U.S. 113, 116, 93 S. Ct. 705, 708 (1973)";
    const long = t + " ".repeat(2000) + "tail";
    expect(at0(long)).toEqual(at0(t));
  });
});
