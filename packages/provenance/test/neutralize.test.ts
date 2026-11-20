import { describe, expect, it } from "vitest";
import { neutralize } from "../src/core/neutralize.js";
describe("neutralize (Req 9.13)", () => {
  it("replaces ESC with U+241B and carriage return with U+240D", () => {
    expect(neutralize("a\u001b[31mb\r")).toBe("a\u241b[31mb\u240d");
  });
  it("replaces NUL, DEL and C1 controls", () => {
    expect(neutralize("\u0000\u007f\u0080\u009b\u009f")).toBe("\u2400\u2421\ufffd\ufffd\ufffd");
  });
  it("keeps line feed, tab and ordinary text", () => {
    expect(neutralize("a\tb\nc \u00a0é\u{1F600}")).toBe("a\tb\nc \u00a0é\u{1F600}");
  });
  it("keeps the length", () => {
    const s = "\u0001\u001f\u007f\u0085x";
    expect(neutralize(s)).toHaveLength(s.length);
  });
});
