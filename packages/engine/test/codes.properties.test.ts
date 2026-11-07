import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, render, strip, stripPositions } from "../src/codes";
import { escapeText } from "../src/codes/syntax";
import { structuralEqual } from "../src/equal";
import {
  TAMPER_KINDS,
  arbAnyString,
  arbDocument,
  arbSemanticTamper,
  arbSyntaxFault,
  arbTamperDocument,
} from "../src/testing/arbitraries";
import type { CodePosition, Document } from "../src/types";
import { VOCABULARY, modelEvents } from "./support/codes-model";
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

/** Positions are sorted by offset, and each code sits at its own place in `text`. */
function expectConsistent(d: Document, text: string, positions: readonly CodePosition[]): void {
  let emitted = 0;
  let previous = 0;
  for (const p of positions) {
    expect(p.offset).toBeGreaterThanOrEqual(previous);
    previous = p.offset;
    const at = escapeText(d.text.slice(0, p.offset)).length + emitted;
    expect(text.startsWith(p.code, at)).toBe(true);
    emitted += p.code.length;
  }
}

describe("Property 37: Display is the Strip projection of full _Requirements: 19.10, 19.11, 19.12, 19.13_", () => {
  it("display is strip of full, positions project, offsets are consistent, strip is total", () => {
    // Property 37
    fc.assert(
      fc.property(fc.tuple(arbDocument, arbAnyString), ([d, garbage]) => {
        const full = render(d, "full");
        const display = render(d, "display");
        expect(display.text).toBe(strip(full.text));
        expect(strip(display.text)).toBe(display.text);

        const projected = stripPositions(full.positions);
        expect(display.positions).toEqual(projected);
        expect(projected.length).toBe(
          full.positions.filter((p) => !p.code.startsWith("[DOC")).length,
        );

        expectConsistent(d, full.text, full.positions);
        expectConsistent(d, display.text, display.positions);

        expect(strip(garbage).length).toBeLessThanOrEqual(garbage.length);
      }),
      runs(),
    );
  });
});

/** Test-local: drop every `[`..`]` Code, treating `\x` pairs as text, then unescape `\[` `\]` `\\`. */
function removeCodesAndUnescape(rendered: string): string {
  let kept = "";
  let i = 0;
  while (i < rendered.length) {
    const c = rendered[i] as string;
    if (c === "\\" && i + 1 < rendered.length) {
      kept += rendered.slice(i, i + 2);
      i += 2;
    } else if (c === "[") {
      i += 1;
      while (i < rendered.length && rendered[i] !== "]") i += rendered[i] === "\\" ? 2 : 1;
      i += 1;
    } else {
      kept += c;
      i += 1;
    }
  }
  return kept.replace(/\\([[\]\\])/g, "$1");
}

describe("Property 38: Removing Codes and unescaping yields the Text _Requirements: 19.3, 19.5_", () => {
  it("removing every Code and unescaping gives d.text in both modes", () => {
    // Property 38
    fc.assert(
      fc.property(arbDocument, fc.constantFrom("full", "display"), (d, mode) => {
        expect(removeCodesAndUnescape(render(d, mode).text)).toBe(d.text);
      }),
      runs(),
    );
  });
});

describe("Property 39: Codes match the document structure _Requirements: 19.1, 19.2, 19.4, 19.6, 19.7, 19.8_", () => {
  it("positions equal the independent model, with a vocabulary-only code set and one DOC in full", () => {
    // Property 39
    fc.assert(
      fc.property(arbDocument, fc.constantFrom("full", "display"), (d, mode) => {
        const actual = render(d, mode).positions;
        const expected = modelEvents(d, mode);
        expect(actual.map((p) => p.offset)).toEqual(expected.map((e) => e.offset));
        expect(actual.map((p) => p.code)).toEqual(expected.map((e) => e.code));

        const names = actual.map((p) => /^\[([^:{\]]*)/.exec(p.code)?.[1] ?? "");
        for (const n of names) expect(VOCABULARY).toContain(n);
        expect(names.filter((n) => n === "DOC").length).toBe(mode === "full" ? 1 : 0);
        if (mode === "full") expect(actual[0]?.offset).toBe(0);
        expect(names.filter((n) => n === "OVR").length).toBe(d.overrides.length);
      }),
      runs(),
    );
  });
});

type Case40 =
  | Readonly<{ kind: "fault"; text: string; index: number; rule: string }>
  | Readonly<{ kind: "free"; text: string }>;

const SYNTAX_CHARS = fc.constantFrom("[", "]", "\\", "{", "}", "=", ";", ",", ":", "/", "x");

/** Arbitrary strings, plus truncations and single-character mutations of renderings. */
const arbFreeText = fc.oneof(
  arbAnyString,
  fc
    .tuple(arbDocument, fc.nat(), fc.nat(), SYNTAX_CHARS)
    .map(([d, a, b, c]) => {
      const t = render(d, "full").text;
      const cut = a % (t.length + 1);
      const at = b % (t.length + 1);
      return [t.slice(0, cut), t.slice(0, at) + c + t.slice(at + 1)] as const;
    })
    .chain((pair) => fc.constantFrom(...pair)),
);

const arbCase40: fc.Arbitrary<Case40> = fc.oneof(
  arbDocument
    .chain((d) => arbSyntaxFault(render(d, "full").text))
    .map((f): Case40 => ({ kind: "fault", text: f.text, index: f.index, rule: f.rule })),
  arbFreeText.map((text): Case40 => ({ kind: "free", text })),
);

describe("Property 40: Malformed text is rejected at the lowest fault index, and parse never throws _Requirements: 20.3, 20.6_", () => {
  it("injected faults are reported at the lowest index with their rule; parse is total", () => {
    // Property 40
    fc.assert(
      fc.property(arbCase40, (c) => {
        const r = parse(c.text);
        if (c.kind === "fault") {
          expect(r).toEqual({
            ok: false,
            error: { kind: "malformed_codes", index: c.index, rule: c.rule },
          });
        } else if (r.ok) {
          expect(render(r.value, "full").text).toBe(c.text);
        } else {
          expect(r.error.kind).toBe("malformed_codes");
          if (r.error.kind === "malformed_codes") {
            expect(r.error.index).toBeGreaterThanOrEqual(0);
            expect(r.error.index).toBeLessThanOrEqual(c.text.length);
          }
        }
      }),
      runs(),
    );
  });
});

const arbTamper41 = arbTamperDocument.chain((d) => arbSemanticTamper(d));

// The named D23 example (unlisted LEXIS `2023 Foo Cty. Ct. LEXIS 5` with a forged
// `[CIT ✓{k=k0;cl=1}]`) lives in test/codes.test.ts and is reused by reference.
// The REF payload tamper is deliberately not generated (lexer reports bad_field).
describe("Property 41: Semantically tampered renderings are rejected with the violated rule _Requirements: 20.4, 20.5_", () => {
  it("parse returns malformed_codes with the recorded index and rule", () => {
    // Property 41
    fc.assert(
      fc.property(arbTamper41, (t) => {
        expect(parse(t.text)).toEqual({
          ok: false,
          error: { kind: "malformed_codes", index: t.index, rule: t.rule },
        });
      }),
      runs(),
    );
  });

  it("every tamper kind is reachable from arbTamperDocument (example, not a property)", () => {
    const seen = new Set(fc.sample(arbTamper41, { numRuns: 1500, seed: 41 }).map((t) => t.kind));
    expect([...seen].sort()).toEqual([...TAMPER_KINDS].sort());
  });
});
