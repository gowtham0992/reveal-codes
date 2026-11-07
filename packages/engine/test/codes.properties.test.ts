import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, render } from "../src/codes";
import { structuralEqual } from "../src/equal";
import { arbDocument } from "../src/testing/arbitraries";
import { runs } from "./support/fc";

describe("Property 36: Full Reveal Codes round trip _Requirements: 19.2, 19.3, 20.1, 20.2_", () => {
  it("parse(render(d, full)) is ok, equals d, and re-renders to the same text", () => {
    // Property 36
    fc.assert(
      fc.property(arbDocument, (d) => {
        const text = render(d, "full").text;
        const parsed = parse(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(structuralEqual(parsed.value, d)).toBe(true);
        expect(render(parsed.value, "full").text).toBe(text);
      }),
      runs(),
    );
  });
});
