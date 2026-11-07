/**
 * `arbSyntaxFault` (design Property 40; Req 20.3, 22.1): injects one to
 * `maxFaults` syntax faults into a Full_Rendering and records the input
 * index of the lowest one. Every fault is inserted at a cut point of the
 * original, so each lands at a known index and the lowest fault is simply
 * the one at the lowest cut; the lexer is never consulted.
 *
 * Interference is ruled out by construction:
 * - an `unclosed_open` Code is only offered for a family whose range is not
 *   open at the cut, so it is the Code left on the stack (reported at the cut);
 * - a stray `]` after an `unterminated_code` is dropped, because the `]`
 *   would close the unterminated Code instead of being unmatched;
 * - with `missing_doc` the `[DOC]` Code is removed (lowest fault, index 0),
 *   and no other fault is placed at the cut that becomes index 0.
 */
import fc from "fast-check";
import type { Arbitrary } from "fast-check";
import type { MalformedSyntaxRule } from "../errors.js";
import {
  applyEdits,
  insertEdit,
  replaceCode,
  scanRendering,
  usableCuts,
} from "./arb-codes-scan.js";
import type { Cut, Scanned } from "./arb-codes-scan.js";

/** The syntax rules injected. `ovr_position` is decode-level and not injected. */
export const SYNTAX_FAULT_KINDS = [
  "missing_doc",
  "unknown_code",
  "unterminated_code",
  "unbalanced_close",
  "unclosed_open",
  "misplaced_doc",
  "bad_field",
  "dangling_escape",
] as const satisfies readonly MalformedSyntaxRule[];

export type SyntaxFaultKind = (typeof SYNTAX_FAULT_KINDS)[number];

/** One injected fault and the input index it has in the final text. */
export type InjectedFault = Readonly<{ rule: SyntaxFaultKind; index: number }>;

/** `index` and `rule` are those of the lowest injected fault. */
export type SyntaxFault = Readonly<{
  text: string;
  index: number;
  rule: SyntaxFaultKind;
  injected: readonly InjectedFault[];
}>;

type Planned = Readonly<{ rule: SyntaxFaultKind; at: Cut; insert: string }>;

/** Opening Codes whose family has no open range at `at` (so the new one stays unclosed). */
function openersAt(s: Scanned, at: Cut): readonly string[] {
  const before = s.codes.filter((c) => c.end <= at.index);
  const depth = (open: (n: string) => boolean, close: string): number =>
    before.reduce((d, c) => d + (open(c.name) ? 1 : 0) - (c.name === close ? 1 : 0), 0);
  const out: string[] = [];
  if (depth((n) => n.startsWith("CIT "), "/CIT") === 0) out.push("[CIT …{k=zz}]");
  if (depth((n) => n.startsWith("QUO "), "/QUO") === 0) out.push("[QUO …{k=zz}]");
  if (depth((n) => n === "REF", "/REF") === 0) out.push("[REF]");
  // Citation and reference ranges never overlap, so one of them is always closed.
  return out.length > 0 ? out : ["[REF]"];
}

function arbInsert(s: Scanned, rule: SyntaxFaultKind, at: Cut, atEnd: boolean): Arbitrary<string> {
  switch (rule) {
    case "missing_doc":
      return fc.constant("");
    case "unknown_code":
      return fc.constantFrom("[ZZZ]", "[hum{t=a}]", "[CIT]", "[]");
    case "unterminated_code":
      return fc.constantFrom("[", "[HUM{t=x", "[CIT ✓{k=");
    case "unbalanced_close":
      return fc.constant("]");
    case "unclosed_open":
      return fc.constantFrom(...openersAt(s, at));
    case "misplaced_doc":
      return fc.constant(s.codes[0]?.text ?? "[DOC{v=1;n=0}]");
    case "bad_field":
      return fc.constantFrom("[HUM]", "[PST{t=a;t=b}]", "[AI{t=x}]");
    case "dangling_escape":
      // A lone `\` is only dangling at the very end; elsewhere it would escape the next character.
      return fc.constantFrom(...(atEnd ? ["\\q", "\\"] : ["\\q", "\\n"]));
  }
}

/** Sorted by cut; a stray `]` after an unterminated Code is dropped. */
function pruned(ps: readonly Planned[]): readonly Planned[] {
  const sorted = [...ps].sort((a, b) => a.at.index - b.at.index);
  const u = sorted.findIndex((p) => p.rule === "unterminated_code");
  return sorted.filter((p, i) => !(p.rule === "unbalanced_close" && u >= 0 && i > u));
}

function assemble(s: Scanned, planned: readonly Planned[]): SyntaxFault {
  const doc = s.codes[0]?.name === "DOC" ? s.codes[0] : undefined;
  const dropDoc = planned.some((p) => p.rule === "missing_doc");
  const docEnd = doc?.end ?? 0;
  const live = pruned(
    planned.filter((p) => p.rule !== "missing_doc" && !(dropDoc && p.at.index <= docEnd)),
  );
  const docLen = dropDoc && doc !== undefined ? doc.end - doc.start : 0;
  const edits = live.map((p) => insertEdit(p.at.index, p.insert));
  if (dropDoc && doc !== undefined) edits.push(replaceCode(doc, ""));
  let shift = 0;
  const injected: InjectedFault[] = live.map((p) => {
    const index = p.at.index + shift - docLen;
    shift += p.insert.length;
    return { rule: p.rule, index };
  });
  if (dropDoc) injected.unshift({ rule: "missing_doc", index: 0 });
  const lowest = injected.reduce((a, b) => (b.index < a.index ? b : a));
  return {
    text: applyEdits(s.rendering, edits),
    index: lowest.index,
    rule: lowest.rule,
    injected,
  };
}

/**
 * Faults for the Full_Rendering `rendering` (from `render(d, "full").text`).
 * Each of the eight kinds is reachable, alone or together with others.
 */
export function arbSyntaxFault(rendering: string, maxFaults = 3): Arbitrary<SyntaxFault> {
  const s = scanRendering(rendering);
  const cuts = usableCuts(s);
  const none: Cut = { index: rendering.length, offset: s.textLength };
  return fc
    .array(fc.constantFrom(...SYNTAX_FAULT_KINDS), { minLength: 1, maxLength: maxFaults })
    .chain((kinds) => {
      const n = Math.min(kinds.length, Math.max(cuts.length, 1));
      return fc
        .uniqueArray(fc.integer({ min: 0, max: Math.max(cuts.length - 1, 0) }), {
          minLength: n,
          maxLength: n,
        })
        .chain((ids) => {
          const picks = kinds.slice(0, n).map((rule, i) => ({
            rule,
            at: cuts[ids[i] ?? 0] ?? none,
          }));
          const inserts = picks.map((p) =>
            arbInsert(s, p.rule, p.at, p.at.index === rendering.length),
          );
          return fc.tuple(...inserts).map((texts) =>
            assemble(
              s,
              picks.map((p, i) => ({ ...p, insert: texts[i] ?? "" })),
            ),
          );
        });
    });
}
