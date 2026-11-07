/**
 * Scanner and edit helpers for the Reveal Codes fault arbitraries
 * (`arb-codes.ts`; Req 22.1). The scanner is independent of the engine's
 * lexer on purpose: expected fault indexes are computed from where an
 * injection lands, never by asking `lexCodes`. It only has to understand
 * well-formed Full_Renderings, where a Code runs from `[` to the first
 * unescaped `]` and `\x` pairs are skipped.
 */
import fc from "fast-check";
import type { Arbitrary } from "fast-check";
import type { MalformedRule } from "../errors.js";
import type { Document } from "../types.js";

/** One Code in a rendering. `offset` is the Text Offset it sits at. */
export type CodePiece = Readonly<{
  name: string;
  start: number;
  end: number;
  text: string;
  offset: number;
}>;

/** A place between tokens, or between whole Text characters, where a string can be inserted. */
export type Cut = Readonly<{ index: number; offset: number }>;

export type Scanned = Readonly<{
  rendering: string;
  codes: readonly CodePiece[];
  cuts: readonly Cut[];
  textLength: number;
}>;

const ESC = "\\";

function codeEnd(r: string, i: number): number {
  let j = i + 1;
  while (j < r.length && r.charAt(j) !== "]") j += r.charAt(j) === ESC ? 2 : 1;
  return Math.min(j + 1, r.length);
}

function nameOf(body: string): string {
  const at = body.search(/[:{]/);
  return at < 0 ? body : body.slice(0, at);
}

/** Splits a well-formed rendering into Codes and escape-aligned cut points. */
export function scanRendering(r: string): Scanned {
  const codes: CodePiece[] = [];
  const cuts: Cut[] = [];
  let i = 0;
  let offset = 0;
  const cut = (index: number): void => {
    if (cuts[cuts.length - 1]?.index !== index) cuts.push({ index, offset });
  };
  while (i < r.length) {
    cut(i);
    if (r.charAt(i) === "[") {
      const end = codeEnd(r, i);
      const body = r.slice(i + 1, r.charAt(end - 1) === "]" ? end - 1 : end);
      codes.push({ name: nameOf(body), start: i, end, text: r.slice(i, end), offset });
      i = end;
    } else {
      i += r.charAt(i) === ESC ? 2 : 1;
      offset += 1;
    }
  }
  cut(r.length);
  return { rendering: r, codes, cuts, textLength: offset };
}

/**
 * Cuts where a Code or character may be inserted without hitting the
 * `[OVR]` attachment rule: at or after `[DOC]`, and not just before an `[OVR]`.
 */
export function usableCuts(s: Scanned): readonly Cut[] {
  const first = s.codes[0];
  const floor = first?.name === "DOC" ? first.end : 0;
  const beforeOvr = new Set(s.codes.filter((c) => c.name === "OVR").map((c) => c.start));
  return s.cuts.filter((k) => k.index >= floor && !beforeOvr.has(k.index));
}

export type Edit = Readonly<{ start: number; end: number; text: string }>;

/** Applies non-overlapping edits, last position first so earlier indexes stay valid. */
export function applyEdits(r: string, edits: readonly Edit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce((acc, e) => acc.slice(0, e.start) + e.text + acc.slice(e.end), r);
}

export const replaceCode = (c: CodePiece, text: string): Edit => ({
  start: c.start,
  end: c.end,
  text,
});

export const insertEdit = (index: number, text: string): Edit => ({
  start: index,
  end: index,
  text,
});

/** The next Code named `name` at or after the end of `open`. */
export const closeOf = (s: Scanned, open: CodePiece, name: string): CodePiece | undefined =>
  s.codes.find((c) => c.start >= open.end && c.name === name);

/** The `k=` field of a Code, if any. Keys never contain escapes. */
export const keyOf = (c: CodePiece): string | undefined => /[{;]k=([^;}]*)/.exec(c.text)?.[1];

/** The `t=` field of a Code, if any. */
export const stampOf = (c: CodePiece): string => /[{;]t=([^;}]*)/.exec(c.text)?.[1] ?? "";

/** A valid Timestamp for Codes the tamper writes. */
export const TS = "2026-11-03T10:00:00Z";

/** Rewrites the Issue_Key_Counter of `[DOC]`; `delta` is the change in rendering length. */
export function withCounter(
  s: Scanned,
  next: (n: number) => number,
): Readonly<{ text: string; n: number; delta: number }> | undefined {
  const doc = s.codes[0];
  const m = doc === undefined ? null : /^\[DOC\{v=1;n=(\d+)/.exec(doc.text);
  if (doc === undefined || m === null) return undefined;
  const n = Number(m[1]);
  const head = `[DOC{v=1;n=${String(next(n))}`;
  const text = s.rendering.slice(0, doc.start) + head + s.rendering.slice(doc.start + m[0].length);
  return { text, n, delta: head.length - m[0].length };
}

/** Codes whose name starts with `prefix`. */
export const named = (s: Scanned, prefix: string): readonly CodePiece[] =>
  s.codes.filter((c) => c.name.startsWith(prefix));

/** Every tamper kind (design Property 41). */
export type TamperKind =
  | "coverage_drop"
  | "coverage_empty"
  | "canonical_split"
  | "provenance_empty_run"
  | "run_flip"
  | "run_missing"
  | "surrogate"
  | "quote_prefix"
  | "short_code"
  | "short_count"
  | "unverifiable_lexis"
  | "ref_as_cit"
  | "ref_override"
  | "override_nonissue"
  | "issue_key_counter"
  | "issue_key_duplicate"
  | "ref_missing"
  | "ref_extra"
  | "ref_moved"
  | "cit_shifted"
  | "quo_extra"
  | "quo_removed";

/** A rendering that is syntactically valid but violates exactly `rule`, at input `index`. */
export type SemanticTamper = Readonly<{
  kind: TamperKind;
  text: string;
  rule: MalformedRule;
  index: number;
}>;

export type TamperCtx = Readonly<{ doc: Document; s: Scanned }>;

/** A tamper builder; `undefined` means the tamper cannot apply to this document. */
export type Builder = (c: TamperCtx) => Arbitrary<SemanticTamper> | undefined;

/** `fc.constantFrom` over `xs` mapped to a tamper, or `undefined` when `xs` is empty. */
export function pick<T>(
  xs: readonly T[],
  f: (x: T) => SemanticTamper,
): Arbitrary<SemanticTamper> | undefined {
  return xs.length === 0 ? undefined : fc.constantFrom(...xs).map(f);
}

/** The rendering with `edits` applied. */
export const edited = (c: TamperCtx, ...edits: readonly Edit[]): string =>
  applyEdits(c.s.rendering, edits);

export const tamper = (
  kind: TamperKind,
  rule: MalformedRule,
  index: number,
  text: string,
): SemanticTamper => ({ kind, text, rule, index });
