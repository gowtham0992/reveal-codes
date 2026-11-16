// The engine arbitraries keep their own copy of the name-rule lists (case-match
// design D19). These tests fail when the copy and the verifier's lists differ.
import { describe, expect, it } from "vitest";
import { DROPPED, EXPANSION_ENTRIES } from "../../engine/src/testing/arb-case-match";
import { DROPPED_WORDS, NAME_EXPANSION_TABLE } from "../src/name-expansion";

const sameWords = (a: Iterable<string>, b: Iterable<string>): boolean => {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((w, i) => w === right[i]);
};

const sameTable = (
  a: ReadonlyArray<readonly [string, readonly string[]]>,
  b: Readonly<Record<string, readonly string[]>>,
): boolean => {
  const keys = Object.keys(b);
  return (
    a.length === keys.length &&
    a.every(([k, words]) => k in b && JSON.stringify(b[k]) === JSON.stringify(words))
  );
};

describe("list drift _Requirements: 20.4_", () => {
  it("the engine DROPPED list holds exactly the words of DROPPED_WORDS", () => {
    expect(new Set(DROPPED).size).toBe(DROPPED.length);
    expect(sameWords(DROPPED, DROPPED_WORDS)).toBe(true);
  });

  it("the engine expansion entries equal NAME_EXPANSION_TABLE", () => {
    expect(sameTable(EXPANSION_ENTRIES, NAME_EXPANSION_TABLE)).toBe(true);
  });

  it("a planted difference in either direction is reported", () => {
    expect(sameWords([...DROPPED, "planted"], DROPPED_WORDS)).toBe(false);
    expect(sameWords(DROPPED.slice(1), DROPPED_WORDS)).toBe(false);
    expect(sameWords(DROPPED, [...DROPPED_WORDS, "planted"])).toBe(false);
    expect(sameTable([...EXPANSION_ENTRIES, ["zz", ["zed"]]], NAME_EXPANSION_TABLE)).toBe(false);
    expect(sameTable(EXPANSION_ENTRIES.slice(1), NAME_EXPANSION_TABLE)).toBe(false);
    const first = EXPANSION_ENTRIES[0];
    if (first === undefined) throw new Error("EXPANSION_ENTRIES is empty");
    const changed = [[first[0], ["planted"]] as const, ...EXPANSION_ENTRIES.slice(1)];
    expect(sameTable(changed, NAME_EXPANSION_TABLE)).toBe(false);
  });
});
