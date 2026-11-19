import { describe, expect, it } from "vitest";
import { EMPTY_SHA256, pairRenames } from "../src/core/renames.js";

describe("pairRenames", () => {
  it("pairs one gone and one appeared file with the same digest", () => {
    expect(
      pairRenames([{ path: "a.ts", digest: "d1" }], [{ path: "b/a.ts", digest: "d1" }]),
    ).toEqual([{ from: "a.ts", to: "b/a.ts" }]);
  });

  it("changes only the path of an Unchanged_File: the pair keeps the digest's one owner", () => {
    const gone = [
      { path: "old.md", digest: "same" },
      { path: "x.md", digest: "other" },
    ];
    const appeared = [{ path: "new.md", digest: "same" }];
    expect(pairRenames(gone, appeared)).toEqual([{ from: "old.md", to: "new.md" }]);
  });

  it("pairs nothing when two gone files have identical text", () => {
    const gone = [
      { path: "a", digest: "d" },
      { path: "b", digest: "d" },
    ];
    expect(pairRenames(gone, [{ path: "c", digest: "d" }])).toEqual([]);
  });

  it("pairs nothing when two appeared files have the text of one gone file", () => {
    const appeared = [
      { path: "c", digest: "d" },
      { path: "e", digest: "d" },
    ];
    expect(pairRenames([{ path: "a", digest: "d" }], appeared)).toEqual([]);
  });

  it("never pairs an empty file or an empty digest", () => {
    for (const digest of [EMPTY_SHA256, ""]) {
      expect(pairRenames([{ path: "a", digest }], [{ path: "b", digest }])).toEqual([]);
    }
  });

  it("treats a rename plus an edit as a deletion and a creation", () => {
    expect(pairRenames([{ path: "a", digest: "d1" }], [{ path: "b", digest: "d2" }])).toEqual([]);
  });

  it("pairs each unique digest independently", () => {
    const gone = [
      { path: "a", digest: "1" },
      { path: "b", digest: "2" },
      { path: "c", digest: "2" },
    ];
    const appeared = [
      { path: "x", digest: "1" },
      { path: "y", digest: "2" },
    ];
    expect(pairRenames(gone, appeared)).toEqual([{ from: "a", to: "x" }]);
  });
});
