/**
 * Short_Form_Party start (Glossary Short_Form_Party; Req 9.2, 12.2, 12.8;
 * design A9 step 4, "`partyStartFor`"; D12 to D18).
 *
 * `partyStartFor(text, c)` finds the longest Party_Run ending at the tail
 * comma `c` with a right-to-left token automaton (states `E`, `S`, `R`, `K`),
 * then strips leading Party_Stop_List entries and Connectors. It reads only
 * `text[c − PARTY_SCAN .. c)` and never throws.
 */

import { ENTITY_SUFFIX_WORDS } from "../abbreviations.js";
import { readTokenBefore, readWordTokenBefore, type PartyToken } from "./party-lex.js";
import { LEGAL_ABBREVIATION_INDEX } from "./reporters.js";
import { SIGNALS } from "./signals.js";

/** Party_Name and Party_Run upper bound, in code units (Glossary). */
export const MAX_PARTY = 80;

/** `partyStartFor` reads only `text[c − PARTY_SCAN .. c)` (D17). */
export const PARTY_SCAN = 2 * MAX_PARTY + 1;

/** The Connectors, each as its words (Glossary Connector). */
export const CONNECTORS: readonly (readonly string[])[] = [
  ["&"],
  ["of"],
  ["the"],
  ["and"],
  ["ex", "rel."],
];

/** The Party_Stop_List, each entry as its words, in Glossary order. */
export const PARTY_STOP_LIST: readonly (readonly string[])[] = [
  ...SIGNALS,
  "In",
  "As",
  "Under",
  "Following",
  "Applying",
  "The court in",
  "The Court in",
].map((entry) => entry.split(" "));

const CAPITALISED = /^\p{Lu}[\p{L}0-9'’-]*$/u;
const SINGLE_CAPITAL_INITIAL = /^[A-Z]\.$/;
const SUFFIXES: ReadonlySet<string> = new Set(ENTITY_SUFFIX_WORDS);
const SINGLE_CONNECTORS: ReadonlySet<string> = new Set(["&", "of", "the", "and"]);

const isOffset = (n: number): boolean => Number.isInteger(n) && n >= 0;

/** True when `word` is a Legal_Abbreviation other than `v.`. */
function isLegalAbbreviation(word: string): boolean {
  if (word === "v.") return false;
  return LEGAL_ABBREVIATION_INDEX.byLength.get(word.length)?.has(word) ?? false;
}

/**
 * Glossary Capitalised_Word over `text[start .. end)`: an uppercase letter
 * then letters, ASCII digits, `'`, `’`, or `-`; or a Legal_Abbreviation other
 * than `v.`; or a Single_Capital_Initial ending in `.`.
 */
export function isCapitalisedWord(text: string, start: number, end: number): boolean {
  if (!isOffset(start) || !isOffset(end) || end <= start || end > text.length) return false;
  const word = text.slice(start, end);
  if (CAPITALISED.test(word) || SINGLE_CAPITAL_INITIAL.test(word)) return true;
  return isLegalAbbreviation(word);
}

type State = "E" | "S" | "R" | "K";

/** One automaton step: what was consumed, and how to read the next token. */
type Step = Readonly<{
  accept: boolean;
  state: State;
  leftSide: boolean;
  /** The leftmost token consumed by this step. */
  from: PartyToken;
  via: "space" | "comma";
}>;

const wordOf = (text: string, t: PartyToken): string => text.slice(t.start, t.end);

/** The token left of `t` across exactly one space, or `null` (a stop). */
function tokenBeforeSpace(text: string, t: PartyToken, lo: number): PartyToken | null {
  const s = t.start;
  if (s - 1 < lo || text[s - 1] !== " ") return null;
  return readTokenBefore(text, s - 1, lo);
}

/** The `W` run left of `t` across exactly `, `, or `null` (a stop). */
function tokenBeforeComma(text: string, t: PartyToken, lo: number): PartyToken | null {
  const s = t.start;
  if (s - 2 < lo || text[s - 1] !== " " || text[s - 2] !== ",") return null;
  return readWordTokenBefore(text, s - 2, lo);
}

/** The leftmost token of a Connector ending with `t`, or `null`. */
function connectorFrom(text: string, t: PartyToken, lo: number): PartyToken | null {
  const word = wordOf(text, t);
  if (SINGLE_CONNECTORS.has(word)) return t;
  if (word !== "rel.") return null;
  const ex = tokenBeforeSpace(text, t, lo);
  return ex !== null && wordOf(text, ex) === "ex" ? ex : null;
}

/** The transition for token `t` in `state`, or `null` for a stop (A9 table). */
function step(
  text: string,
  t: PartyToken,
  state: State,
  leftSide: boolean,
  lo: number,
): Step | null {
  const cap = isCapitalisedWord(text, t.start, t.end);
  const toR: Step = { accept: true, state: "R", leftSide, from: t, via: "space" };
  if (state === "E") {
    const suffix = SUFFIXES.has(wordOf(text, t)) && tokenBeforeComma(text, t, lo) !== null;
    if (suffix) return { accept: true, state: "S", leftSide, from: t, via: "comma" };
    return cap ? toR : null;
  }
  if (cap) return toR;
  if (state === "S") return null;
  const connector = connectorFrom(text, t, lo);
  if (connector !== null)
    return { accept: false, state: "K", leftSide, from: connector, via: "space" };
  if (state === "R" && !leftSide && wordOf(text, t) === "v.") {
    return { accept: false, state: "E", leftSide: true, from: t, via: "space" };
  }
  return null;
}

/**
 * The start of the longest Party_Run ending at `c`, `null` if none, or
 * `"too_long"` once an accepted start lies more than `MAX_PARTY` before `c`.
 */
function longestRunStart(text: string, c: number): number | null | "too_long" {
  const lo = Math.max(0, c - PARTY_SCAN);
  let tok = readWordTokenBefore(text, c, lo);
  let state: State = "E";
  let leftSide = false;
  let best: number | null = null;
  while (tok !== null) {
    const next = step(text, tok, state, leftSide, lo);
    if (next === null) break;
    if (next.accept) {
      if (c - next.from.start > MAX_PARTY) return "too_long";
      best = next.from.start;
    }
    ({ state, leftSide } = next);
    tok =
      next.via === "comma"
        ? tokenBeforeComma(text, next.from, lo)
        : tokenBeforeSpace(text, next.from, lo);
  }
  return best;
}

/** True when `words[i ..]` starts with `entry` and at least one word follows. */
function startsWithEntry(words: readonly string[], i: number, entry: readonly string[]): boolean {
  if (i + entry.length >= words.length) return false;
  return entry.every((w, k) => words[i + k] === w);
}

/** Index of the first word left after stripping entries and Connectors (D12, D13). */
function strippedWordIndex(words: readonly string[]): number {
  let i = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const entry = PARTY_STOP_LIST.find((e) => startsWithEntry(words, i, e));
    if (entry !== undefined) {
      i += entry.length;
      changed = true;
    }
    for (;;) {
      const connector = CONNECTORS.find((e) => startsWithEntry(words, i, e));
      if (connector === undefined) break;
      i += connector.length;
      changed = true;
    }
  }
  return i;
}

/**
 * The start Offset of the Short_Form_Party ending at the tail comma `c`, or
 * `null` when there is none: no Party_Run ends at `c`, the longest one
 * exceeds `MAX_PARTY`, or stripping leaves it starting with `v.`.
 */
export function partyStartFor(text: string, c: number): number | null {
  if (!isOffset(c) || c > text.length) return null;
  const best = longestRunStart(text, c);
  if (best === null || best === "too_long") return null;
  const words = text.slice(best, c).split(" ");
  const i = strippedWordIndex(words);
  if (i >= words.length || words[i] === "v.") return null;
  return words.slice(0, i).reduce((offset, w) => offset + w.length + 1, best);
}
