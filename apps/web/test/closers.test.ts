import type { CodePosition } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { openerFamilies } from "../src/pane/closers";

const at = (...codes: readonly string[]): CodePosition[] =>
  codes.map((code, offset) => ({ offset, code }));

describe("openerFamilies _Requirements: 7.7, 7.16_", () => {
  it("gives a closer the family of its opener and everything else null", () => {
    expect(
      openerFamilies(
        at("[HUM]", "[CIT ✓]", "[/CIT]", "[CIT …]", "[/CIT]", "[REF]", "[/REF]", "[OVR:why]"),
      ),
    ).toEqual([null, null, "verified", null, "pending", null, "ref", null]);
  });

  it("pairs by kind when a quote sits inside a citation", () => {
    expect(openerFamilies(at("[CIT …]", "[QUO ✓]", "[/QUO]", "[/CIT]"))).toEqual([
      null,
      null,
      "verified",
      "pending",
    ]);
  });

  it("pairs failing openers with their failed family", () => {
    expect(openerFamilies(at("[CIT ✘]", "[/CIT]", "[CIT ?:2]", "[/CIT]"))).toEqual([
      null,
      "failed",
      null,
      "pending",
    ]);
  });

  it("gives an unbalanced closer null, including one left after a pair", () => {
    expect(openerFamilies(at("[/CIT]", "[/QUO]", "[/REF]"))).toEqual([null, null, null]);
    expect(openerFamilies(at("[REF]", "[/REF]", "[/REF]"))).toEqual([null, "ref", null]);
  });

  it("does not let one kind's closer consume another kind's opener", () => {
    expect(openerFamilies(at("[CIT ✓]", "[/QUO]", "[/CIT]"))).toEqual([null, null, "verified"]);
  });
});
