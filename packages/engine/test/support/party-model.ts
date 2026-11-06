/**
 * Property 50 reference model (task 5.30; Req 9.2, 12.2; Glossary
 * Short_Form_Party, Capitalised_Word as amended, Connector, Word_Run,
 * Party_Side, Party_Run, Entity_Suffix, Party_Stop_List; D12 to D18).
 *
 * Written from the Glossary over a word list, not by code-unit scanning. It
 * tries every word start from the left (a start is the start of the text or
 * follows a code unit that is not a letter, ASCII digit, `.`, `'`, `’`, or
 * `-`), splits the rest on single spaces, and accepts the first start whose
 * words parse as a Party_Run. It shares no code with `party.ts` or
 * `party-lex.ts`, and no checker with Property 49's `party-run.ts`: only that
 * module's plain word lists are imported, so the two oracles stay independent.
 *
 * The model needs no window (design P50); `windowAgrees` checks that claim
 * for each input instead of building D17 into the model.
 */
import { LEGAL_ABBREVIATIONS, STOP_ENTRIES, SUFFIX_WORDS } from "./party-run";

/** Glossary bound on a Party_Run, in code units. */
export const MODEL_MAX_PARTY = 80;

/** D17 read window before the tail comma, in code units. */
export const MODEL_PARTY_SCAN = 161;

const SINGLE_CONNECTORS: ReadonlySet<string> = new Set(["&", "of", "the", "and"]);
const STOP_WORDS: readonly (readonly string[])[] = STOP_ENTRIES.map((e) => e.split(" "));
const UPPER = /^\p{Lu}$/u;
const REST_UNIT = /^[\p{L}0-9'’-]$/u;
const BOUNDARY_UNIT = /^[\p{L}0-9.'’-]$/u;
const DIGIT_TRIPLE = /[0-9]+ [^ ]+ [0-9]/;

/** Capitalised_Word: letter rule, Single_Capital_Initial, or a `.`-ending abbreviation. */
function capWord(w: string): boolean {
  const units = Array.from(w.matchAll(/./gsu), (m) => m[0]);
  const [first, ...rest] = units;
  if (first === undefined) return false;
  if (UPPER.test(first) && rest.every((u) => REST_UNIT.test(u))) return true;
  if (units.length === 2 && /^[A-Z]$/.test(first) && rest[0] === ".") return true;
  return w !== "v." && w.endsWith(".") && LEGAL_ABBREVIATIONS.has(w);
}

/** Word_Run: first and last Capitalised_Words, Connectors only in between. */
function wordRun(ws: readonly string[]): boolean {
  const n = ws.length;
  if (n === 0 || !capWord(ws[0] ?? "") || !capWord(ws[n - 1] ?? "")) return false;
  for (let i = 1; i < n - 1; i++) {
    const w = ws[i] ?? "";
    if (capWord(w) || SINGLE_CONNECTORS.has(w)) continue;
    if (w === "ex" && ws[i + 1] === "rel." && i + 1 < n - 1) {
      i++;
      continue;
    }
    return false;
  }
  return true;
}

/** Party_Side: a Word_Run, optionally followed by `, ` and one Entity_Suffix word. */
function partySide(ws: readonly string[]): boolean {
  const n = ws.length;
  const prev = ws[n - 2];
  if (n >= 2 && SUFFIX_WORDS.has(ws[n - 1] ?? "") && prev !== undefined && prev.endsWith(",")) {
    return wordRun([...ws.slice(0, n - 2), prev.slice(0, -1)]);
  }
  return wordRun(ws);
}

/** Party_Run: one Party_Side, or two joined by the single word `v.`. */
export function modelPartyRun(ws: readonly string[]): boolean {
  const text = ws.join(" ");
  if (/["“”]/.test(text) || DIGIT_TRIPLE.test(text)) return false;
  const vs = ws.flatMap((w, i) => (w === "v." ? [i] : []));
  const [v, ...more] = vs;
  if (more.length > 0) return false;
  if (v === undefined) return partySide(ws);
  return partySide(ws.slice(0, v)) && partySide(ws.slice(v + 1));
}

/** The code point that ends just before `p` (a surrogate pair counts as one). */
function unitBefore(s: string, p: number): string {
  const low = s.charCodeAt(p - 1);
  const high = s.charCodeAt(p - 2);
  const pair = low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff;
  return s.slice(pair ? p - 2 : p - 1, p);
}

/** Every word start in `before`, left to right, whose words parse as a Party_Run. */
export function runStarts(before: string): readonly number[] {
  const out: number[] = [];
  for (let p = 0; p < before.length; p++) {
    if (p > 0 && BOUNDARY_UNIT.test(unitBefore(before, p))) continue;
    if (modelPartyRun(before.slice(p).split(" "))) out.push(p);
  }
  return out;
}

/** Leading Connectors removed, each with the space after it (D12). */
function dropConnectors(ws: readonly string[]): readonly string[] {
  let cur = ws;
  for (;;) {
    if (cur.length > 1 && SINGLE_CONNECTORS.has(cur[0] ?? "")) cur = cur.slice(1);
    else if (cur.length > 2 && cur[0] === "ex" && cur[1] === "rel.") cur = cur.slice(2);
    else return cur;
  }
}

/** Whole stop-list entries followed by a space, then Connectors, until none lead (D12, D13). */
export function stripWords(ws: readonly string[]): readonly string[] {
  let cur = ws;
  for (;;) {
    const n = cur.length;
    const entry = STOP_WORDS.find((e) => e.length < cur.length && e.every((w, i) => cur[i] === w));
    if (entry !== undefined) cur = cur.slice(entry.length);
    cur = dropConnectors(cur);
    if (cur.length === n) return cur;
  }
}

/** The model's reading of the text before a tail comma. */
export type PartyModel =
  | Readonly<{ kind: "no_run" }>
  | Readonly<{ kind: "too_long"; runStart: number; firstOver: number }>
  | Readonly<{ kind: "not_run"; runStart: number; stripped: string }>
  | Readonly<{ kind: "party"; runStart: number; start: number; party: string }>;

/** The longest Party_Run ending at `before.length`, stripped (Glossary Short_Form_Party). */
export function modelParty(before: string): PartyModel {
  const starts = runStarts(before);
  const runStart = starts[0];
  if (runStart === undefined) return { kind: "no_run" };
  const c = before.length;
  const over = starts.filter((p) => c - p > MODEL_MAX_PARTY);
  const firstOver = over[over.length - 1];
  if (firstOver !== undefined) return { kind: "too_long", runStart, firstOver };
  const stripped = stripWords(before.slice(runStart).split(" ")).join(" ");
  if (!modelPartyRun(stripped.split(" "))) return { kind: "not_run", runStart, stripped };
  return { kind: "party", runStart, start: c - stripped.length, party: stripped };
}

/** Start of the space-delimited chunk that ends at `q − 1`, or `q` when none does. */
function predecessorStart(s: string, q: number): number {
  if (q < 2 || s[q - 1] !== " ") return q;
  return s.lastIndexOf(" ", q - 2) + 1;
}

/**
 * True when D17 cannot change the answer: a run of at most 80 code units is
 * always read whole inside the window, and an over-long run is rejected at
 * its first accepted start past 80, which must lie, with the token before it,
 * inside the last `MODEL_PARTY_SCAN` code units (conservative).
 */
export function windowAgrees(before: string, m: PartyModel): boolean {
  if (m.kind !== "too_long") return true;
  return before.length - predecessorStart(before, m.firstOver) <= MODEL_PARTY_SCAN;
}
