import { describe, expect, it } from "vitest";
import { blockSegments } from "../src/pane/blocks";
import type { PaneItem } from "../src/pane/layout";

const t = (text: string, offset = 0): PaneItem => ({ kind: "text", offset, text });
const code = (text: string, failing: boolean): PaneItem => ({
  kind: "code",
  offset: 0,
  text,
  family: "close",
  meaning: text,
  failing,
});
const citFail = code("[CIT ✘]", true);
const citFailEnd = code("[/CIT]", true);
const citOk = code("[CIT ✓]", false);
const citOkEnd = code("[/CIT]", false);
const quoFail = code("[QUO ✘]", true);
const quoFailEnd = code("[/QUO]", true);
const quoOk = code("[QUO ✓]", false);
const quoOkEnd = code("[/QUO]", false);

/** [block flag, item count] per segment per line. */
function shape(lines: readonly (readonly PaneItem[])[]): (readonly [boolean, number])[][] {
  return blockSegments(lines).map((segs) => segs.map((s) => [s.block, s.items.length] as const));
}

function expectLossless(lines: readonly (readonly PaneItem[])[]): void {
  const out = blockSegments(lines).map((segs) => segs.flatMap((s) => s.items));
  expect(out).toEqual(lines.map((l) => [...l]));
}

describe("blockSegments _Requirements: 7.8, 7.9, 7.10, 7.16, 13.10_", () => {
  it("makes a failing citation with its text one segment from opener to closer", () => {
    const lines = [[t("a"), citFail, t("b"), t("c"), citFailEnd, t("d")]];
    expect(shape(lines)).toEqual([
      [
        [false, 1],
        [true, 4],
        [false, 1],
      ],
    ]);
    expectLossless(lines);
  });

  it("draws a failing quote across a line break as a block on each line", () => {
    const lines = [
      [t("a"), quoFail, t("b"), t("\n")],
      [t("c"), quoFailEnd, t("d")],
    ];
    expect(shape(lines)).toEqual([
      [
        [false, 1],
        [true, 3],
      ],
      [
        [true, 2],
        [false, 1],
      ],
    ]);
    expectLossless(lines);
  });

  it("keeps a QUO ✘ inside a CIT ✘ in one block", () => {
    const lines = [[citFail, t("a"), quoFail, t("b"), quoFailEnd, t("c"), citFailEnd, t("d")]];
    expect(shape(lines)).toEqual([
      [
        [true, 7],
        [false, 1],
      ],
    ]);
    expectLossless(lines);
  });

  it("keeps a non-failing QUO ✓ inside a CIT ✘ in the block", () => {
    const lines = [[citFail, t("a"), quoOk, t("b"), quoOkEnd, t("c"), citFailEnd]];
    expect(shape(lines)).toEqual([[[true, 7]]]);
    expectLossless(lines);
  });

  it("blocks only the quote of a CIT ✓ containing a QUO ✘", () => {
    const lines = [[citOk, t("a"), quoFail, t("b"), quoFailEnd, t("c"), citOkEnd]];
    expect(shape(lines)).toEqual([
      [
        [false, 2],
        [true, 3],
        [false, 2],
      ],
    ]);
    expectLossless(lines);
  });

  it("runs an unclosed failing opener to the end, across lines", () => {
    const lines = [[t("a"), citFail, t("\n")], [t("b")], []];
    expect(shape(lines)).toEqual([
      [
        [false, 1],
        [true, 2],
      ],
      [[true, 1]],
      [],
    ]);
    expectLossless(lines);
  });

  it("does not let an unbalanced failing closer push depth below zero", () => {
    const lines = [[citFailEnd, t("a"), citFail, t("b"), citFailEnd]];
    expect(shape(lines)).toEqual([
      [
        [false, 2],
        [true, 3],
      ],
    ]);
    expectLossless(lines);
  });
});
