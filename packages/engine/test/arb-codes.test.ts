import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, render } from "../src/codes";
import {
  SYNTAX_FAULT_KINDS,
  TAMPER_KINDS,
  arbDocument,
  arbSemanticTamper,
  arbSyntaxFault,
  arbTamperDocument,
} from "../src/testing/arbitraries";
import { runs } from "./support/fc";

describe("arbSyntaxFault (_Requirements: 22.1_)", () => {
  it("is rejected by parse at the recorded index, and every kind is reachable", () => {
    const kinds = new Set<string>();
    let multi = 0;
    const arb = arbDocument.chain((d) => arbSyntaxFault(render(d, "full").text));
    fc.assert(
      fc.property(arb, (f) => {
        for (const i of f.injected) kinds.add(i.rule);
        if (f.injected.length > 1) multi += 1;
        const r = parse(f.text);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error).toEqual({ kind: "malformed_codes", index: f.index, rule: f.rule });
        }
      }),
      { ...runs(), numRuns: Math.max(runs().numRuns, 400) },
    );
    expect([...kinds].sort()).toEqual([...SYNTAX_FAULT_KINDS].sort());
    expect(multi).toBeGreaterThan(0);
  });
});

describe("arbSemanticTamper (_Requirements: 22.1_)", () => {
  it("is rejected with the recorded rule and index, and every kind is reachable", () => {
    const seen = new Set<string>();
    const arb = arbTamperDocument.chain((d) => arbSemanticTamper(d));
    fc.assert(
      fc.property(arb, (t) => {
        seen.add(t.kind);
        const r = parse(t.text);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error).toEqual({ kind: "malformed_codes", index: t.index, rule: t.rule });
        }
      }),
      { numRuns: 1500 },
    );
    expect([...seen].sort()).toEqual([...TAMPER_KINDS].sort());
  });

  it("never records the REF payload tamper that the lexer reports as bad_field", () => {
    expect(TAMPER_KINDS.filter((k) => k.includes("payload"))).toEqual([]);
  });
});
