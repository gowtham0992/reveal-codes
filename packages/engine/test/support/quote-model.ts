/**
 * Naive reference model of quote pairing and attachment for Property 20
 * (task 5.24; Req 13.1, 13.5, 13.6, 13.8, 13.9, 13.10; design D19, D20, D21).
 *
 * It shares no code with `src/citations/quotes.ts`, `case-name.ts`, or
 * `signals.ts`: the word lists are typed from the requirements Glossary, and
 * only the Reporter_List data table is read from the Engine, because the
 * Glossary defines the reporter abbreviations as that list. Sentences come
 * from `segment`, looked up by index, not from `countBoundaries`. The
 * Citations are the caller's (Property 20 takes them from `extract`). Kept
 * here so extract.properties.test.ts stays under the 300-line module limit.
 */
import { REPORTERS } from "../../src/citations/reporters";
import { segment } from "../../src/segment";
import type { ExtractedCitation, ExtractedQuote, Span } from "../../src/types";

/** Glossary Legal_Abbreviation, non-reporter entries, then every reporter. */
const ABBREVIATIONS: readonly string[] = [
  ...["Id.", "v.", "Inc.", "Corp.", "Ltd.", "Co.", "L.P.", "N.A.", "L.L.C."],
  ...["No.", "Cir.", "Dist.", "Ct.", "Fed.", "Supp.", "et al."],
  ...REPORTERS,
];

/** Glossary Gap_Signal, capitalised as listed. */
const CAPITAL_GAP: readonly string[] = [
  ...["See", "See also", "See, e.g.,", "E.g.,", "Accord", "Cf.", "But see", "Compare"],
  ...["Citing", "Quoting"],
];

/** Glossary Gap_Signal, first letter lowercased, typed out. `with` is in neither list. */
const LOWER_GAP: readonly string[] = [
  ...["see", "see also", "see, e.g.,", "e.g.,", "accord", "cf.", "but see", "compare"],
  ...["citing", "quoting"],
];

/** Glossary Signal: the ten capitalised Gap_Signals plus four more. */
const SIGNALS: readonly string[] = [...CAPITAL_GAP, "But cf.", "Contra", "E.g.", "See generally"];

const PARTY_CHARS = /^[\p{L}0-9 .,'’&-]*$/u;
const LETTER_OR_DIGIT = /^[\p{L}0-9]/u;
/** D10: a digit, a space, at least one code unit, a space, a digit. */
const DIGIT_TOKEN_DIGIT = /[0-9] [\s\S]+ [0-9]/;
/** Req 13.1 `P1`, `P2`, `P3`: whitespace and `, ; : . ( )` only. */
const P_RUN = /^[\s,;:.()]*$/;
/** Req 13.8 following gap: whitespace and `, ; : (` only. */
const FOLLOW_RUN = /^[\s,;:(]*$/;

/** `p` begins with one of `words` followed by a space, `,`, or its end. */
function beginsWithWord(p: string, words: readonly string[]): boolean {
  return words.some((w) => {
    const next = p[w.length];
    return p.startsWith(w) && (next === undefined || next === " " || next === ",");
  });
}

/** Every `.` is a Legal_Abbreviation period (occurrence at a word start, D9) or closes an initial. */
function everyPeriodCovered(p: string): boolean {
  const covered = new Set<number>();
  for (let j = 0; j < p.length; j++) {
    if (j > 0 && p[j - 1] !== " ") continue;
    for (const a of ABBREVIATIONS) {
      if (!p.startsWith(a, j)) continue;
      for (let k = 0; k < a.length; k++) if (a[k] === ".") covered.add(j + k);
    }
    if (/^[A-Z]\./.test(p.slice(j, j + 2))) covered.add(j + 1);
  }
  return positions(p, ".").every((i) => covered.has(i));
}

/** Glossary Party_Name, clause by clause, plus the D19 leading-word rule. */
function isGapPartyName(p: string): boolean {
  const last = p[p.length - 1];
  return (
    p.length >= 1 &&
    p.length <= 80 &&
    PARTY_CHARS.test(p) &&
    LETTER_OR_DIGIT.test(p) &&
    last !== " " &&
    last !== "," &&
    !p.includes("  ") &&
    everyPeriodCovered(p) &&
    !p.includes(" v. ") &&
    !beginsWithWord(p, SIGNALS) &&
    !DIGIT_TOKEN_DIGIT.test(p) &&
    !beginsWithWord(p, ["with", ...LOWER_GAP])
  );
}

/** Glossary Case_Name (Party_Name + ` v. ` + Party_Name + `,`) with D19, tried at every ` v. `. */
export function isModelCaseName(c: string): boolean {
  if (!c.endsWith(",")) return false;
  const body = c.slice(0, -1);
  for (let i = body.indexOf(" v. "); i >= 0; i = body.indexOf(" v. ", i + 1)) {
    if (isGapPartyName(body.slice(0, i)) && isGapPartyName(body.slice(i + 4))) return true;
  }
  return false;
}

/** Ends of `S` at `i`: empty, or the longest Gap_Signal starting at `i` (D21). */
function signalEnds(g: string, i: number): readonly number[] {
  const fits = [...CAPITAL_GAP, ...LOWER_GAP].filter((s) => g.startsWith(s, i));
  const longest = Math.max(0, ...fits.map((s) => s.length));
  return longest === 0 ? [i] : [i, i + longest];
}

/** Req 13.1: the gap is `P1 + S + P2 + C + P3`, trying every split. */
export function modelGapMatches(g: string): boolean {
  for (let i = 0; i <= g.length && P_RUN.test(g.slice(0, i)); i++) {
    for (const j of signalEnds(g, i)) {
      for (let k = j; k <= g.length && P_RUN.test(g.slice(j, k)); k++) {
        for (let l = k; l <= g.length; l++) {
          if (!P_RUN.test(g.slice(l))) continue;
          if (l === k || isModelCaseName(g.slice(k, l))) return true;
        }
      }
    }
  }
  return false;
}

type Pair = Readonly<{ open: number; close: number }>;

/** Code-unit Offsets of `mark` in `text`. */
function positions(text: string, mark: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (text.charAt(i) === mark) out.push(i);
  return out;
}

/** Req 13.1, 13.6, 13.10: pair each family, drop blank pairs, then drop pairs opening inside a kept one. */
export function modelPairs(text: string): readonly Pair[] {
  const straight = positions(text, '"');
  const pairs: Pair[] = [];
  for (let k = 0; k + 1 < straight.length; k += 2) {
    pairs.push({ open: straight[k] ?? 0, close: straight[k + 1] ?? 0 });
  }
  for (const open of positions(text, "“")) {
    const rest = text.slice(open + 1);
    const close = rest.indexOf("”");
    const reopen = rest.indexOf("“");
    if (close >= 0 && (reopen < 0 || close < reopen)) pairs.push({ open, close: open + 1 + close });
  }
  const filled = pairs.filter((p) => /\S/.test(text.slice(p.open + 1, p.close)));
  filled.sort((a, b) => a.open - b.open);
  const kept: Pair[] = [];
  for (const p of filled) {
    if (!kept.some((k) => k.open < p.open && p.open < k.close)) kept.push(p);
  }
  return kept;
}

const oneSpan = (text: string): Span[] => [
  { start: 0, end: text.length, provenance: { origin: "HUM", timestamp: "2026-01-01T00:00:00Z" } },
];

/** Index of the Sentence holding each Offset, from `segment`. */
function sentenceIndexer(text: string): (x: number) => number {
  const r = segment(text, oneSpan(text));
  if (!r.ok) throw new Error(`segment failed: ${r.error.kind}`);
  const sentences = r.value;
  return (x) => sentences.findIndex((s) => s.start <= x && x < s.end);
}

type Ctx = Readonly<{
  text: string;
  cits: readonly ExtractedCitation[];
  idx: (x: number) => number;
}>;

/** Req 13.1: the first citation after the closing mark, if it qualifies. */
function precedingTarget(ctx: Ctx, p: Pair): number | null {
  const x = ctx.cits.find((c) => c.start > p.close);
  if (x === undefined || x.value.kind === "other") return null;
  if (ctx.idx(x.start) - ctx.idx(p.close) > 1) return null;
  return modelGapMatches(ctx.text.slice(p.close + 1, x.start)) ? x.start : null;
}

/** Req 13.8: a citation before the opening mark, same Sentence, punctuation-only gap. */
function followingTarget(ctx: Ctx, p: Pair): number | null {
  const ys = ctx.cits.filter(
    (c) =>
      c.value.kind !== "other" &&
      c.end <= p.open &&
      FOLLOW_RUN.test(ctx.text.slice(c.end, p.open)) &&
      ctx.idx(c.start) === ctx.idx(p.open),
  );
  return ys.at(-1)?.start ?? null;
}

/** The quotes Req 13 assigns in `text`, given its citations, in document order. */
export function modelQuotes(text: string, cits: readonly ExtractedCitation[]): ExtractedQuote[] {
  const ctx: Ctx = { text, cits, idx: sentenceIndexer(text) };
  const out: ExtractedQuote[] = [];
  for (const p of modelPairs(text)) {
    const quote = { start: p.open + 1, end: p.close, text: text.slice(p.open + 1, p.close) };
    const pre = precedingTarget(ctx, p);
    const fol = pre === null ? followingTarget(ctx, p) : null;
    if (pre !== null) out.push({ ...quote, citationStart: pre, rule: "preceding" });
    else if (fol !== null) out.push({ ...quote, citationStart: fol, rule: "following" });
  }
  return out;
}
