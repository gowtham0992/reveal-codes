import { describe, expect, it } from "vitest";
import { linkShortForms } from "../src/citations/link";
import { scanRange } from "../src/citations/scan";
import type { Match } from "../src/citations/scan";

const never = (): boolean => false;
const linked = (text: string): readonly Match[] => linkShortForms(scanRange(text, 0, never));

/** `[matched text, targetStart]` for every Short_Form, in order. */
function shortTargets(text: string): Array<[string, number | null]> {
  return linked(text).flatMap((m): Array<[string, number | null]> =>
    m.value.kind === "short" ? [[text.slice(m.start, m.end), m.value.targetStart]] : [],
  );
}

describe("linkShortForms Id. _Requirements: 12.1, 12.3, 12.6, 12.7_", () => {
  it("links Id. to the preceding Full_Citation", () => {
    expect(shortTargets("See 410 U.S. 113 (1973). Id. at 116.")).toEqual([["Id. at 116", 4]]);
  });

  it("links Id. after a linked Id. to the same Full_Citation", () => {
    expect(shortTargets("410 U.S. 113 (1973). Id. at 116. Id.")).toEqual([
      ["Id. at 116", 0],
      ["Id.", 0],
    ]);
  });

  it("links Id. after a linked party Short_Form to that form's target", () => {
    const text = "410 U.S. 113 (1973). Later, Roe, 410 U.S. at 116. Id. at 117.";
    expect(shortTargets(text)).toEqual([
      ["Roe, 410 U.S. at 116", 0],
      ["Id. at 117", 0],
    ]);
  });

  it("makes Id. after an Other_Reference an Orphan (12.6)", () => {
    const text = "410 U.S. 113 (1973); 42 U.S.C. § 1983. Id.";
    const kinds = linked(text).map((m) => m.value.kind);
    expect(kinds).toEqual(["reporter", "other", "short"]);
    expect(shortTargets(text)).toEqual([["Id.", null]]);
  });

  it("makes Id. after an Orphan an Orphan (12.7)", () => {
    expect(shortTargets("Id. at 5. Id. at 6.")).toEqual([
      ["Id. at 5", null],
      ["Id. at 6", null],
    ]);
  });

  it("makes Id. at the start of the Text an Orphan (12.3)", () => {
    expect(shortTargets("Id. Then 410 U.S. 113 (1973).")).toEqual([["Id.", null]]);
  });
});

describe("linkShortForms party form _Requirements: 12.2, 12.3_", () => {
  it("links a party form to the Full_Citation with the same volume and reporter", () => {
    expect(shortTargets("410 U.S. 113 (1973). Later, Roe, 410 U.S. at 116.")).toEqual([
      ["Roe, 410 U.S. at 116", 0],
    ]);
  });

  it("links a party form to a Near_Miss Full_Citation after normalisation", () => {
    expect(shortTargets("410 US 113 (1973). Later, Roe, 410 U.S. at 116.")).toEqual([
      ["Roe, 410 U.S. at 116", 0],
    ]);
  });

  it("makes a party form an Orphan when the volume or the reporter matches nothing", () => {
    const text = "410 U.S. 113 (1973). Later, Roe, 411 U.S. at 116; Doe, 410 F.3d at 116.";
    expect(shortTargets(text)).toEqual([
      ["Roe, 411 U.S. at 116", null],
      ["Doe, 410 F.3d at 116", null],
    ]);
  });

  it("makes a party form before every Full_Citation an Orphan", () => {
    expect(shortTargets("Later, Roe, 410 U.S. at 116; 410 U.S. 113 (1973).")).toEqual([
      ["Roe, 410 U.S. at 116", null],
    ]);
  });

  it("picks the last matching Full_Citation, skipping later non-matching ones", () => {
    const text =
      "410 U.S. 113 (1973); 410 U.S. 959 (1973); 5 U.S. 137 (1803). Later, Roe, 410 U.S. at 960.";
    const second = text.indexOf("410 U.S. 959");
    expect(shortTargets(text)).toEqual([["Roe, 410 U.S. at 960", second]]);
  });

  it("matches any member of a Parallel_Citation", () => {
    const text =
      "410 U.S. 113, 93 S. Ct. 705 (1973). Later, Roe, 93 S. Ct. at 710; Roe, 410 U.S. at 116.";
    expect(linked(text)[0]?.value.kind).toBe("parallel");
    expect(shortTargets(text)).toEqual([
      ["Roe, 93 S. Ct. at 710", 0],
      ["Roe, 410 U.S. at 116", 0],
    ]);
  });
});

describe("linkShortForms purity _Requirements: 12.1_", () => {
  it("returns new values and leaves the input unchanged", () => {
    const input = scanRange("410 U.S. 113 (1973). Id.", 0, never);
    const before = JSON.stringify(input);
    const out = linkShortForms(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(out[0]).toBe(input[0]);
    expect(out[1]).not.toBe(input[1]);
    expect(out[1]?.value).toMatchObject({ kind: "short", form: "id", targetStart: 0 });
  });
});
