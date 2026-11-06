/**
 * `arbEdit(t)`: single text edits `[from, oldTo) → text` aimed at the places
 * where incremental re-extraction can go wrong (design "Arbitraries" table,
 * Property 25; Req 15.1, 22.1, 22.4).
 *
 * Edit positions are biased into the Edit_Targets of `t`: citation ranges,
 * party Short_Form parties, Party_Stop_List entries, Entity_Suffixes, the
 * ` v. ` of a party, and quote-to-citation gaps, and into the `LOOKBEHIND`
 * (162) code units before each of them and before each party tail comma. Inserted text is biased toward the pieces that move
 * a party's canonical start or tail comma from outside its own range, split
 * or join a Party_Run, or add and remove a Gap_Signal in a gap.
 *
 * Targets are found with `extract(t)` and plain text search. They only
 * steer the draw; every Offset pair is valid for `t` whatever `extract`
 * returns. Built only from shrinkable combinators (`oneof`, `constantFrom`,
 * `integer`, `tuple`, `array`, `chain`, `map`); Offsets are snapped left off
 * Surrogate_Pair interiors with `.map`.
 */
import fc from "fast-check";
import { ENTITY_SUFFIX_WORDS } from "../abbreviations.js";
import { extract } from "../citations/extract.js";
import { CONNECTORS, PARTY_STOP_LIST } from "../citations/party.js";
import { LOOKBEHIND } from "../citations/scan.js";
import type { ExtractedCitation } from "../types.js";
import { isValidBoundary } from "../validate.js";
import { arbCapitalisedWord, arbText } from "./arb-text.js";
import { arbGapSignal } from "./arb-case-name.js";
import { arbStopListPrefix } from "./arb-short-form-party.js";

/** The kinds of place `arbEdit` aims at. */
export type EditTargetKind = "citation" | "party" | "stop" | "before" | "suffix" | "versus" | "gap";

/** One Edit_Target: `[start, end]` of `t`, by kind. */
export type EditTarget = Readonly<{ kind: EditTargetKind; start: number; end: number }>;

/** A text edit, and the target its position was drawn from (null for uniform). */
export type TextEdit = Readonly<{
  from: number;
  oldTo: number;
  text: string;
  target: EditTarget | null;
}>;

/** How far a quote mark may be from a citation for the gap between them to be a target. */
const MAX_GAP = 200;

const QUOTE_MARKS: ReadonlySet<string> = new Set(['"', "\u201c", "\u201d"]);

const STOP_ENTRIES: readonly string[] = PARTY_STOP_LIST.map((e) => e.join(" "));
const SUFFIXES: readonly string[] = ENTITY_SUFFIX_WORDS.map((w) => `, ${w}`);
const CONNECTOR_TEXTS: readonly string[] = CONNECTORS.map((c) => c.join(" "));

/** Every `[i, i + needle.length]` where `needle` occurs in `t`. */
function occurrences(t: string, needle: string, kind: EditTargetKind): EditTarget[] {
  const out: EditTarget[] = [];
  for (let i = t.indexOf(needle); i >= 0; i = t.indexOf(needle, i + 1)) {
    out.push({ kind, start: i, end: i + needle.length });
  }
  return out;
}

/** The party of a party Short_Form, which starts the citation range. */
function partyTarget(c: ExtractedCitation): EditTarget | null {
  if (c.value.kind !== "short" || c.value.form !== "party") return null;
  return { kind: "party", start: c.start, end: c.start + c.value.party.length };
}

/** The quote-to-citation gaps on each side of `c`, at most `MAX_GAP` long. */
function gapTargets(t: string, c: ExtractedCitation): EditTarget[] {
  const out: EditTarget[] = [];
  for (let i = c.start - 1; i >= Math.max(0, c.start - MAX_GAP); i -= 1) {
    if (!QUOTE_MARKS.has(t.charAt(i))) continue;
    out.push({ kind: "gap", start: i + 1, end: c.start });
    break;
  }
  for (let i = c.end; i < Math.min(t.length, c.end + MAX_GAP); i += 1) {
    if (!QUOTE_MARKS.has(t.charAt(i))) continue;
    out.push({ kind: "gap", start: c.end, end: i });
    break;
  }
  return out;
}

/** The `LOOKBEHIND + 1` code units up to and including each anchor. */
function beforeTargets(anchors: readonly number[]): EditTarget[] {
  return anchors.map((a) => ({ kind: "before", start: Math.max(0, a - LOOKBEHIND - 1), end: a }));
}

/** All Edit_Targets of `t`, by kind, in no particular order. */
export function editTargets(t: string): readonly EditTarget[] {
  const cits = extract(t).citations;
  const citations = cits.map((c): EditTarget => ({ kind: "citation", start: c.start, end: c.end }));
  const parties = cits.map(partyTarget).filter((p): p is EditTarget => p !== null);
  const stops = STOP_ENTRIES.flatMap((e) => occurrences(t, e, "stop"));
  const anchors = [
    ...citations.map((c) => c.start),
    ...parties.map((p) => p.end),
    ...stops.map((s) => s.start),
  ];
  return [
    ...citations,
    ...parties,
    ...stops,
    ...beforeTargets(anchors),
    ...SUFFIXES.flatMap((s) => occurrences(t, s, "suffix")),
    ...occurrences(t, " v. ", "versus"),
    ...cits.flatMap((c) => gapTargets(t, c)),
  ];
}

/**
 * 6 to 14 Capitalised_Words and Connectors joined by spaces: enough, next to
 * a party, to push its Party_Run past `MAX_PARTY` from outside its range.
 */
const arbLongRun: fc.Arbitrary<string> = fc
  .array(
    fc.oneof({ arbitrary: arbCapitalisedWord, weight: 3 }, fc.constantFrom(...CONNECTOR_TEXTS)),
    { minLength: 6, maxLength: 14 },
  )
  .map((ws) => ws.join(" "));

/** One inserted piece, before optional spacing. */
const arbPiece: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: arbStopListPrefix, weight: 1 },
  { arbitrary: arbLongRun, weight: 4 },
  fc.constantFrom(...CONNECTOR_TEXTS),
  arbCapitalisedWord,
  arbGapSignal,
  fc.constantFrom(...SUFFIXES),
  fc.constant(" v. "),
  arbCapitalisedWord.map((w) => `v. ${w}`),
  fc.constantFrom(", ", "; "),
);

const arbSpacedPiece: fc.Arbitrary<string> = fc
  .tuple(arbPiece, fc.constantFrom("", " ", "lead", "both", "both"))
  .map(([p, s]) => (s === "lead" ? ` ${p}` : s === "both" ? ` ${p} ` : p + s));

/** Inserted text: 0 to 3 biased pieces, or (rarely) any `arbText` string. */
export const arbEditText: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.array(arbSpacedPiece, { maxLength: 3 }).map((ps) => ps.join("")), weight: 6 },
  { arbitrary: arbText.map((s) => s.slice(0, 64)), weight: 1 },
);

const snap = (t: string, offset: number): number =>
  isValidBoundary(t, offset) ? offset : offset - 1;

/**
 * A distance into a target of length `len`, biased to its edges, one and two
 * code units in (the separator before a party), and `LOOKBEHIND ± 1`.
 */
function arbDistance(len: number): fc.Arbitrary<number> {
  const marks = [0, 1, 2, len, LOOKBEHIND - 1, LOOKBEHIND, LOOKBEHIND + 1];
  const edges = marks.filter((e) => e <= len);
  return fc.oneof(fc.integer({ min: 0, max: len }), {
    arbitrary: fc.constantFrom(...edges),
    weight: 2,
  });
}

/** An edit position, and the Offset a deletion from it is biased to stop at. */
type Aim = Readonly<{ at: number; stop: number }>;

/**
 * A position for `target`: inside it (stopping at its end), or up to
 * `LOOKBEHIND + 1` code units before its start (stopping at its start). A
 * `before` target is measured back from its anchor and stops there.
 */
function arbAim(target: EditTarget): fc.Arbitrary<Aim> {
  const { start, end } = target;
  if (target.kind === "before") {
    return arbDistance(end - start).map((d): Aim => ({ at: end - d, stop: end }));
  }
  const inside = arbDistance(end - start).map((d): Aim => ({ at: start + d, stop: end }));
  const back = arbDistance(Math.min(start, LOOKBEHIND + 1)).map((d): Aim => ({
    at: start - d,
    stop: start,
  }));
  return fc.oneof(inside, back);
}

/**
 * A deleted length: none or a few code units, up to the stop or one short
 * of it (which keeps the separator before a party), or anything to 64.
 */
function arbDeleteLength(rest: number): fc.Arbitrary<number> {
  const r = Math.max(0, rest);
  return fc.oneof(
    { arbitrary: fc.constant(0), weight: 3 },
    { arbitrary: fc.integer({ min: 1, max: 4 }), weight: 3 },
    { arbitrary: fc.constantFrom(Math.max(0, r - 1), r), weight: 4 },
    { arbitrary: fc.integer({ min: 0, max: r }), weight: 1 },
    { arbitrary: fc.integer({ min: 0, max: 64 }), weight: 1 },
  );
}

/** An edit whose position is drawn from `target`, or uniformly when it is null. */
function arbEditAt(t: string, target: EditTarget | null): fc.Arbitrary<TextEdit> {
  const aim =
    target === null
      ? fc.integer({ min: 0, max: t.length }).map((at): Aim => ({ at, stop: t.length }))
      : arbAim(target);
  return aim.chain(({ at, stop }) => {
    const from = snap(t, at);
    return fc.tuple(arbDeleteLength(stop - from), arbEditText).map(([n, text]): TextEdit => {
      const oldTo = Math.max(from, snap(t, Math.min(t.length, from + n)));
      return { from, oldTo, text, target };
    });
  });
}

/** Kinds next to a party's left context, where a Party_Run can change from outside it. */
const PARTY_SIDE: ReadonlySet<EditTargetKind> = new Set(["party", "stop", "before"]);

/** One weighted arbitrary per target kind present in `targets` (party-side kinds at 2). */
function byKind(targets: readonly EditTarget[]): readonly fc.WeightedArbitrary<EditTarget>[] {
  const groups = new Map<EditTargetKind, EditTarget[]>();
  for (const x of targets) groups.set(x.kind, [...(groups.get(x.kind) ?? []), x]);
  return [...groups.entries()].map(([kind, xs]) => ({
    arbitrary: fc.constantFrom(...xs),
    weight: PARTY_SIDE.has(kind) ? 2 : 1,
  }));
}

/**
 * One edit of `t`, biased into its Edit_Targets (party-side kinds at twice
 * the weight of the others) with a uniform draw at weight 1 in 5. Apply it
 * with `applyTextEdit`.
 */
export function arbEdit(t: string): fc.Arbitrary<TextEdit> {
  const kinds = byKind(editTargets(t));
  const uniform = arbEditAt(t, null);
  if (kinds.length === 0) return uniform;
  const aimed = fc.oneof(...kinds).chain((target) => arbEditAt(t, target));
  return fc.oneof({ arbitrary: aimed, weight: 4 }, { arbitrary: uniform, weight: 1 });
}

/** The new Text and the A5 Edit (`[from, oldTo)` became `[from, newTo)`). */
export function applyTextEdit(
  t: string,
  e: TextEdit,
): Readonly<{ text: string; edit: Readonly<{ from: number; oldTo: number; newTo: number }> }> {
  const text = t.slice(0, e.from) + e.text + t.slice(e.oldTo);
  return { text, edit: { from: e.from, oldTo: e.oldTo, newTo: e.from + e.text.length } };
}
