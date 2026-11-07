import { describe, expect, it } from "vitest";
import { strip, stripPositions } from "../src/codes/strip.js";

describe("strip (Req 19.11–19.13)", () => {
  it("drops [DOC] and every payload section, keeping retained payloads", () => {
    const full = "[DOC{v=1;n=2;r=r7,3,1,0}][AI:r7{t=5}]Hi[CIT ?:3{k=1;p=a\\}b}]x[/CIT]";
    expect(strip(full)).toBe("[AI:r7]Hi[CIT ?:3]x[/CIT]");
  });

  it("copies escaped brackets and braces in text verbatim", () => {
    expect(strip("[HUM{a=1}]a\\[b\\]c\\\\d")).toBe("[HUM]a\\[b\\]c\\\\d");
  });

  it("keeps an escaped { inside a retained payload", () => {
    expect(strip("[OVR:a\\{b{x=1}]")).toBe("[OVR:a\\{b]");
  });

  it("drops [DOC] entries from positions and strips the rest", () => {
    expect(
      stripPositions([
        { offset: 0, code: "[DOC{v=1}]" },
        { offset: 0, code: "[PST{t=1}]" },
        { offset: 4, code: "[/CIT]" },
      ]),
    ).toEqual([
      { offset: 0, code: "[PST]" },
      { offset: 4, code: "[/CIT]" },
    ]);
  });
});
