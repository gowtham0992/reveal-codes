import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rescan } from "../src/citations/incremental";
import { LOOKAHEAD, LOOKBEHIND, scanRange } from "../src/citations/scan";
import type { Match } from "../src/citations/scan";
import { arbText } from "../src/testing/arb-text";
import { runs } from "./support/fc";

const never = (): boolean => false;
const scan = (text: string): readonly Match[] => scanRange(text, 0, never);

type Case = Readonly<{ text: string; from: number; oldTo: number; inserted: string }>;

const applyCase = (c: Case): string => c.text.slice(0, c.from) + c.inserted + c.text.slice(c.oldTo);

/** Runs `rescan` for one edit and returns it with the full scan of the new Text. */
function both(c: Case): { inc: readonly Match[]; full: readonly Match[]; next: string } {
  const next = applyCase(c);
  const edit = { from: c.from, oldTo: c.oldTo, newTo: c.from + c.inserted.length };
  return { inc: rescan(scan(c.text), edit, next), full: scan(next), next };
}

const filler = (n: number): string => "lorem ipsum dolor ".repeat(Math.ceil(n / 18)).slice(0, n);
const texts = (ms: readonly Match[], t: string): string[] => ms.map((m) => t.slice(m.start, m.end));

describe("rescan named examples _Requirements: 15.1, 21.1_", () => {
  it("inserting `In ` before `Casey, 505 U.S. at 833` keeps the party `Casey`", () => {
    const text = `${filler(1500)} held. Casey, 505 U.S. at 833. ${filler(1500)}`;
    const at = text.indexOf("Casey");
    const { inc, full, next } = both({ text, from: at, oldTo: at, inserted: "In " });
    expect(inc).toEqual(full);
    expect(texts(inc, next)).toEqual(["Casey, 505 U.S. at 833"]);
  });

  it("inserting `Roe v. ` before `Wade, 410 U.S. at 153` moves the match start left", () => {
    const text = `${filler(1500)} held. Wade, 410 U.S. at 153. ${filler(1500)}`;
    const at = text.indexOf("Wade");
    const { inc, full, next } = both({ text, from: at, oldTo: at, inserted: "Roe v. " });
    expect(inc).toEqual(full);
    expect(texts(inc, next)).toEqual(["Roe v. Wade, 410 U.S. at 153"]);
  });

  it("an edit 160 code units before a party's tail comma removes the Short_Form", () => {
    // `q of of … of Smith` is 160 code units; `q` starts at c − 160.
    const run = `q${" of".repeat(51)} Smith`;
    const text = `${filler(1200)} ${run}, 5 U.S. at 9. ${filler(800)}`;
    const c = text.indexOf(", 5 U.S.");
    expect(run.length).toBe(160);
    expect(texts(scan(text), text)).toEqual(["Smith, 5 U.S. at 9"]);
    const { inc, full } = both({ text, from: c - 160, oldTo: c - 159, inserted: "Q" });
    expect(inc).toEqual(full);
    expect(full).toEqual([]);
  });

  it("edits 161 and 162 code units before a party's tail comma agree with a full scan", () => {
    const run = `q${" of".repeat(51)} Smith`;
    const text = `${filler(1200)} ${run}, 5 U.S. at 9. ${filler(800)}`;
    const c = text.indexOf(", 5 U.S.");
    for (const k of [159, 160, 161, 162, 163]) {
      for (const inserted of ["In ", "Roe v. ", "Q", ""]) {
        const { inc, full } = both({ text, from: c - k, oldTo: c - k + 1, inserted });
        expect(inc).toEqual(full);
      }
    }
  });

  it("an edit inside a citation re-extracts it", () => {
    const text = `${filler(1500)} See 410 U.S. 113 (1973). ${filler(1500)}`;
    const at = text.indexOf("113") + 3;
    const { inc, full, next } = both({ text, from: at, oldTo: at, inserted: "4" });
    expect(inc).toEqual(full);
    expect(texts(inc, next)).toEqual(["410 U.S. 1134 (1973)"]);
  });

  it("an edit far from any citation only shifts the matches after it", () => {
    const text = `410 U.S. 113. ${filler(3000)} 2024 WL 123456. ${filler(300)}`;
    const prev = scan(text);
    const next = text.slice(0, 1500) + "xyz" + text.slice(1510);
    const inc = rescan(prev, { from: 1500, oldTo: 1510, newTo: 1503 }, next);
    expect(inc).toEqual(scan(next));
    expect(inc[0]).toBe(prev[0]);
    const later = prev[1] as Match;
    expect(inc[1]).toMatchObject({ start: later.start - 7, end: later.end - 7 });
  });

  it("deleting everything yields no matches", () => {
    const text = `Roe v. Wade, 410 U.S. 113 (1973). Id. at 116. ${filler(2000)}`;
    const { inc } = both({ text, from: 0, oldTo: text.length, inserted: "" });
    expect(inc).toEqual([]);
  });

  it("inserting into the empty Text equals a full scan", () => {
    const inserted = "Roe v. Wade, 410 U.S. 113 (1973). Id. at 116.";
    const { inc, full } = both({ text: "", from: 0, oldTo: 0, inserted });
    expect(inc).toEqual(full);
    expect(inc.length).toBe(2);
  });

  it("deleting the comma before a tail removes the party Short_Form", () => {
    const text = `${filler(1500)} Casey, 505 U.S. at 833. ${filler(1500)}`;
    const at = text.indexOf(", 505");
    const { inc, full } = both({ text, from: at, oldTo: at + 1, inserted: "" });
    expect(inc).toEqual(full);
  });

  it("completing a long party's tail 40 code units after its start re-extracts from before it", () => {
    const text = `${filler(1500)} held. Acme Widget Holdings of America, 5 U.S. a 9. ${filler(900)}`;
    const at = text.indexOf(" a 9") + 2;
    const { inc, full, next } = both({ text, from: at, oldTo: at, inserted: "t" });
    expect(inc).toEqual(full);
    expect(texts(inc, next)).toEqual(["Acme Widget Holdings of America, 5 U.S. at 9"]);
  });

  it("every single edit of a short filing agrees with a full scan", () => {
    const text = `q${" of".repeat(50)} Smith, 5 U.S. at 9 Acme Widget Holdings of America, 5 U.S. a 9. Roe v. Wade, 410 U.S. 113, 116 (1973). Id. at 5. In Casey, 505 U.S. at 833. 42 U.S.C. § 1983.`;
    for (let from = 0; from <= text.length; from += 1) {
      for (const [d, inserted] of [
        [0, "t"],
        [0, "Q"],
        [0, "In "],
        [0, " 113"],
        [1, ""],
        [1, "Q"],
        [2, ""],
      ] as const) {
        const oldTo = Math.min(text.length, from + d);
        const { inc, full } = both({ text, from, oldTo, inserted });
        expect(inc).toEqual(full);
      }
    }
  });

  it("falls back to a full scan for an edit inconsistent with the new Text", () => {
    const next = "See 410 U.S. 113.";
    expect(rescan([], { from: 5, oldTo: 2, newTo: 9 }, next)).toEqual(scan(next));
    expect(rescan([], { from: 0, oldTo: 0, newTo: 99 }, next)).toEqual(scan(next));
  });

  it("uses the design window constants", () => {
    expect([LOOKAHEAD, LOOKBEHIND]).toEqual([1024, 162]);
  });
});

const PIECES = [
  "Roe v. Wade, 410 U.S. 113, 116 (1973)",
  "Casey, 505 U.S. at 833",
  "Wade, 410 U.S. at 153",
  "Smith, Inc., 5 F.3d at 9",
  "Acme Co. v. Doe, 12 F.4th 3",
  "598 F.3d 1, 7 (2d Cir. 2010)",
  "2024 WL 123456",
  "42 U.S.C. § 1983",
  "Id. at 5",
  "Id.",
  "“the right to privacy”",
  "410 U.S.",
  "505 U.S. at",
  "Casey, 505",
  "Acme Widget Holdings of America, 5 U.S. a 9",
  "In ",
  "See ",
  ", ",
  ". ",
];

const INSERTS = [
  ...["In ", "Roe v. ", ", Inc.", "7", "", "x", " v. ", "Smith ", ", ", "Q", "of ", "“"],
  ...[" 113", "113", " at 9", "U.S. ", "410 ", ", 116", " (1973)"],
];

/** A party run of Connectors ending in `Smith`, whose first word `q` sits up to 162 before the comma. */
const arbConnectorParty = fc
  .integer({ min: 0, max: 54 })
  .map((k) => `q${" of".repeat(k)} Smith, 5 U.S. at 9`);

const arbPiece = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...PIECES) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 1400 }).map(filler) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 40 }).map(filler) },
  { weight: 1, arbitrary: arbText },
  { weight: 1, arbitrary: arbConnectorParty },
);

const arbFilingText = fc.array(arbPiece, { maxLength: 14 }).map((ps) => ps.join(" "));

/** Offsets of every `,` directly followed by ` ` and a digit (a tail comma), and of every digit run. */
const anchors = (t: string): number[] => [...t.matchAll(/, \d|\d+/g)].map((m) => m.index);

/** An edit `[from, from + d) → ins` clamped to the Text. */
const editAt = (text: string, from: number, d: number, ins: string): Case => {
  const f = Math.min(text.length, Math.max(0, from));
  return { text, from: f, oldTo: Math.min(text.length, f + d), inserted: ins };
};

/**
 * Single edits: anywhere; up to `LOOKBEHIND + 2` before a tail comma or digit
 * run; up to 40 after one (inside a citation); or deleting the anchor itself.
 */
function arbEditFor(text: string): fc.Arbitrary<Case> {
  const inserted = fc.oneof(
    fc.constantFrom(...INSERTS),
    arbText.map((s) => s.slice(0, 12)),
  );
  const plain = fc
    .tuple(fc.nat(text.length), fc.nat(24), inserted)
    .map(([from, d, ins]) => editAt(text, from, d, ins));
  const points = anchors(text);
  if (points.length === 0) return plain;
  const point = fc.constantFrom(...points);
  const before = fc
    .tuple(point, fc.nat(LOOKBEHIND + 2), fc.nat(3), inserted)
    .map(([c, k, d, ins]) => editAt(text, c - k, d, ins));
  const inside = fc
    .tuple(point, fc.nat(14), fc.nat(3), inserted)
    .map(([c, k, d, ins]) => editAt(text, c + k, d, ins));
  const dropAt = point.map((c) => editAt(text, c, 1, ""));
  return fc.oneof(plain, before, inside, dropAt, arbCaseChange(text));
}

/** Upper-cases one lower-case letter that starts a word, or edits at 0 if there is none. */
function arbCaseChange(text: string): fc.Arbitrary<Case> {
  const starts = [...text.matchAll(/(?<= )[a-z]/g)].map((m) => m.index);
  if (starts.length === 0) return fc.constant(editAt(text, 0, 0, "Q"));
  return fc
    .constantFrom(...starts)
    .map((i) => editAt(text, i, 1, (text[i] as string).toUpperCase()));
}

describe("rescan equals a full scan for single edits (local check, not a numbered property) _Requirements: 15.1_", () => {
  it("the edit generator reaches both resync points", () => {
    const sample = fc.sample(arbFilingText.chain(arbEditFor), { numRuns: 300, seed: 39 });
    const leftKept = sample.filter((c) => c.from > LOOKAHEAD + 1).length;
    const rightShifted = sample.filter(
      (c) => c.from + c.inserted.length + LOOKBEHIND + 2 * 512 < applyCase(c).length,
    ).length;
    expect(leftKept).toBeGreaterThan(30);
    expect(rightShifted).toBeGreaterThan(30);
  });

  it("rescan(scan(t), edit, t') equals scanRange(t', 0, never)", () => {
    const arbCase = fc.oneof(arbFilingText, arbText).chain(arbEditFor);
    fc.assert(
      fc.property(arbCase, (c) => {
        const { inc, full } = both(c);
        expect(inc).toEqual(full);
      }),
      runs(),
    );
  });
});
