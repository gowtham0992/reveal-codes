import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, render } from "../src/codes";
import {
  SYNTAX_FAULT_KINDS,
  TAMPER_KINDS,
  arbDocument,
  arbSemanticTamper,
  arbSyntaxFault,
  arbSyntaxFaultOf,
  arbTamperDocument,
  arbTamperOfKind,
} from "../src/testing/arbitraries";
import type { TamperKind } from "../src/testing/arbitraries";
import type { Document } from "../src/types";
import { runs } from "./support/fc";
import {
  MULTI_FAULT_WITNESS,
  TAMPER_WITNESSES,
  missingWitnesses,
} from "./support/tamper-witnesses";

const FAULT_RENDERING = render(TAMPER_WITNESSES.short_code, "full").text;
// Kinds that `assemble` never prunes, so each of two drawn faults survives.
const MULTI_FAULT_KINDS = [
  "unknown_code",
  "unclosed_open",
  "bad_field",
  "dangling_escape",
] as const;
const MULTI_RENDERING = render(MULTI_FAULT_WITNESS, "full").text;

describe("arbSyntaxFault (_Requirements: 22.1, 22.3_)", () => {
  it("is rejected by parse at the recorded index", () => {
    const arb = arbDocument.chain((d) => arbSyntaxFault(render(d, "full").text));
    fc.assert(
      fc.property(arb, (f) => {
        const r = parse(f.text);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error).toEqual({ kind: "malformed_codes", index: f.index, rule: f.rule });
        }
      }),
      { ...runs(), numRuns: Math.max(runs().numRuns, 400) },
    );
  });

  it.each(SYNTAX_FAULT_KINDS)("reaches %s on a fixed rendering and rejects it", (kind) => {
    const arb = arbSyntaxFaultOf(FAULT_RENDERING, [kind], { minFaults: 1, maxFaults: 1 });
    fc.assert(
      fc.property(arb, (f) => {
        expect(f.injected.length).toBeGreaterThan(0);
        for (const i of f.injected) expect(i.rule).toBe(kind);
        expect(parse(f.text)).toEqual({
          ok: false,
          error: { kind: "malformed_codes", index: f.index, rule: f.rule },
        });
      }),
      runs(),
    );
  });

  it("injects at least two faults when minFaults is 2 on the multi-fault Witness_Document", () => {
    const arb = arbSyntaxFaultOf(MULTI_RENDERING, MULTI_FAULT_KINDS, {
      minFaults: 2,
      maxFaults: 3,
    });
    fc.assert(
      fc.property(arb, (f) => {
        expect(f.injected.length).toBeGreaterThanOrEqual(2);
        expect(parse(f.text)).toEqual({
          ok: false,
          error: { kind: "malformed_codes", index: f.index, rule: f.rule },
        });
      }),
      runs(),
    );
  });
});

describe("arbSemanticTamper (_Requirements: 22.1, 22.2, 22.3, 22.4_)", () => {
  it("is rejected with the recorded rule and index", () => {
    const arb = arbTamperDocument.chain((d) => arbSemanticTamper(d));
    fc.assert(
      fc.property(arb, (t) => {
        const r = parse(t.text);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error).toEqual({ kind: "malformed_codes", index: t.index, rule: t.rule });
        }
      }),
      { numRuns: 1500 },
    );
  });

  it.each(TAMPER_KINDS)("reaches %s on its Witness_Document and rejects it", (kind) => {
    const arb = arbTamperOfKind(kind, TAMPER_WITNESSES[kind]);
    expect(arb).toBeDefined();
    if (arb === undefined) return;
    fc.assert(
      fc.property(arb, (t) => {
        expect(t.kind).toBe(kind);
        expect(parse(t.text)).toEqual({
          ok: false,
          error: { kind: "malformed_codes", index: t.index, rule: t.rule },
        });
      }),
      runs(),
    );
  });

  it("records bad_field at the [REF code for ref_payload", () => {
    const arb = arbTamperOfKind("ref_payload", TAMPER_WITNESSES.ref_payload);
    expect(arb).toBeDefined();
    if (arb === undefined) return;
    fc.assert(
      fc.property(arb, (t) => {
        expect(t.rule).toBe("bad_field");
        expect(t.text.startsWith("[REF{k=k0}]", t.index)).toBe(true);
      }),
      runs(),
    );
  });
});

describe("Witness_Documents (_Requirements: 22.2, 22.4_)", () => {
  it("has exactly one witness per TAMPER_KINDS member", () => {
    expect(Object.keys(TAMPER_WITNESSES).sort()).toEqual([...TAMPER_KINDS].sort());
    expect(missingWitnesses(TAMPER_KINDS, TAMPER_WITNESSES)).toEqual([]);
  });

  it("missingWitnesses names a kind removed from a copy of the table", () => {
    const removed: TamperKind = "ref_payload";
    const rest: Partial<Record<TamperKind, Document>> = Object.fromEntries(
      TAMPER_KINDS.filter((k) => k !== removed).map((k) => [k, TAMPER_WITNESSES[k]]),
    );
    expect(missingWitnesses(TAMPER_KINDS, rest)).toEqual([removed]);
  });
});
