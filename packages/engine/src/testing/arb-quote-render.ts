/**
 * Quote groups for `arbTextWithCitations`: their shapes, their boundary
 * counts, and their rendering (design "Arbitraries" table, the tagged
 * quote-group list; Req 8.3, 8.6, 8.10, 13.1, 13.5, 13.7–13.9).
 *
 * Every group is written as `lead + " " + body + " " + trail` with two
 * lower-case prose words, so no pair can reach a citation outside its group
 * under either rule (a prose word fits neither gap). Each pair uses one mark
 * family for both marks, and groups never nest or cross pairs (Req 13.10).
 *
 * Whether a Preceding_Quote attaches depends on the boundaries in its gap.
 * They are counted from the group's own words (`gapBoundaries`), not by
 * the Segmenter:
 * - one after a closing mark preceded by `.` (`"q."`, or content ending in `.`);
 * - one after a lone ` . `;
 * - one after `Cf.` or `cf.` (not a Legal_Abbreviation, and two letters, so
 *   neither Req 8.6 nor 8.10 applies); none after `E.g.,` or `See, e.g.,`;
 * - in a Case_Name, one after each Single_Capital_Initial followed by ` v. `,
 *   ` et al.`, or a space and a digit run (Req 8.10 needs a Capitalised_Word
 *   next); none after one followed by `,`, a capitalised word, another
 *   initial, or a Legal_Abbreviation, and none after `v.`, an Entity_Suffix,
 *   or any other Legal_Abbreviation (Req 8.6). `arbCaseName` emits no `Id.`.
 *
 * A Following_Quote needs no boundary between its citation's start and the
 * opening mark (Req 13.8). Ranges are skipped (Req 8.5), but a Full_Citation
 * ending in a court such as `(D.)` followed by ` (` has one right after it
 * (`endsWithTerminator`), so that group's quote attaches to nothing.
 */
import {
  attach,
  put,
  putCite,
  putFull,
  putQuote,
  type Builder,
  type Cite,
  type FullCite,
  type PartyCite,
} from "./arb-text-builder.js";
import { LEGAL_ABBREVIATIONS } from "../abbreviations.js";
import { REPORTER_ABBREVIATIONS } from "../citations/reporters.js";
import type { QuoteBody } from "./arb-quote-parts.js";

/** A quotation: its content and its mark family. */
export type QuoteSpec = QuoteBody & Readonly<{ curly: boolean }>;

type Q = Readonly<{ q: QuoteSpec }>;

/** Every quote group, by tag (design table). */
export type QuoteGroup = Q &
  (
    | Readonly<{ tag: "same"; c: Cite }>
    | Readonly<{ tag: "next"; c: Cite; spaced: boolean }>
    | Readonly<{ tag: "caseName"; name: string; f: FullCite }>
    | Readonly<{ tag: "gapSignal"; signal: string; c: FullCite | PartyCite }>
    | Readonly<{ tag: "gapSignalCase"; signal: string; name: string; f: FullCite }>
    | Readonly<{ tag: "paren"; signal: string; name: string; f: FullCite }>
    | Readonly<{ tag: "followParen"; c: Cite }>
    | Readonly<{ tag: "followColon"; c: Cite }>
    | Readonly<{ tag: "both"; c1: Cite; c2: Cite }>
    | Readonly<{ tag: "several"; q2: QuoteSpec; c: Cite }>
    | Readonly<{ tag: "twoBoundaries"; word: string; c: Cite }>
    | Readonly<{ tag: "in"; party: PartyCite }>
    | Readonly<{ tag: "with"; name: string; f: FullCite }>
    | Readonly<{ tag: "twoSignals"; signal: string; signal2: string; name: string; f: FullCite }>
    | Readonly<{ tag: "longParty"; long: string; other: string; f: FullCite }>
    | Readonly<{ tag: "followSignal"; signal: string; c: Cite }>
    | Readonly<{ tag: "lonely" }>
  );

export type QuoteTag = QuoteGroup["tag"];

/** A group with the prose words around it. */
export type WrappedGroup = Readonly<{ lead: string; trail: string; group: QuoteGroup }>;

/** What a rendered group was, for coverage statistics. */
export type GroupRecord = Readonly<{
  tag: QuoteTag;
  signals: readonly string[];
  cite: Cite["kind"] | null;
  attached: number;
}>;

const plain = (q: QuoteBody): string => q.body + (q.dot ? "." : "");
const dotB = (q: QuoteBody): number => (q.dot ? 1 : 0);

/** Boundaries a Gap_Signal adds before a following word (see module comment). */
export const signalBoundaries = (s: string): number => (s === "Cf." || s === "cf." ? 1 : 0);

const INITIAL = /^[A-Z]\.$/;
const DIGIT_RUN = /^\d+,?$/;

/** Boundaries inside an `arbCaseName` value (see module comment). */
export function caseNameBoundaries(name: string): number {
  const tokens = name.split(" ");
  let n = 0;
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    if (!INITIAL.test(t) || next === undefined) return;
    if (next === "v." || next === "et" || DIGIT_RUN.test(next)) n += 1;
  });
  return n;
}

const ok = (boundaries: number): boolean => boundaries <= 1;

const ABBREVIATIONS: readonly string[] = [...LEGAL_ABBREVIATIONS, ...REPORTER_ABBREVIATIONS];

/** True when `head` ends with a Legal_Abbreviation preceded by the start, a space, or `(`. */
function endsWithAbbreviation(head: string): boolean {
  return ABBREVIATIONS.some((a) => {
    if (!head.endsWith(a)) return false;
    const before = head.charAt(head.length - a.length - 1);
    return before === "" || before === " " || before === "(";
  });
}

/**
 * True when a citing piece ends in a terminator sequence that makes a
 * boundary before whatever follows one space later: a court parenthetical
 * such as `(D.)` or `(x.')` whose court does not end with a Legal_Abbreviation
 * (Req 8.3, 8.6). The next code unit is `(`, so Req 8.10 never applies.
 */
export function endsWithTerminator(c: Cite): boolean {
  if (c.kind !== "full") return false;
  const m = /[.?!]["”'’)]*$/.exec(c.text);
  if (m === null) return false;
  const head = c.text.slice(0, m.index + 1);
  return !(head.endsWith(".") && endsWithAbbreviation(head));
}

/** `"q" ` + cite, attached preceding when the gap holds at most one boundary. */
function precede(
  b: Builder,
  q: QuoteSpec,
  content: string,
  gap: string,
  c: Cite,
  n: number,
): number {
  const r = putQuote(b, q.curly, content);
  put(b, gap);
  const s = putCite(b, c);
  if (!ok(n)) return 0;
  attach(b, r, s, "preceding");
  return 1;
}

/** `"q<p>" <gap text> <Full_Citation><tail>`, attached when `n` allows. */
function precedeFull(
  b: Builder,
  q: QuoteSpec,
  content: string,
  gap: string,
  f: FullCite,
  n: number,
  tail = "",
): number {
  const r = putQuote(b, q.curly, content);
  put(b, gap);
  const s = putFull(b, f.value, f.text);
  put(b, tail);
  if (n < 0 || !ok(n)) return 0;
  attach(b, r, s, "preceding");
  return 1;
}

/** Cite, then `gap` and a quote attached following (or not, when `follows` is false). */
function follow(
  b: Builder,
  c: Cite,
  gap: string,
  q: QuoteSpec,
  close: string,
  follows: boolean,
): number {
  const s = putCite(b, c);
  put(b, gap);
  const r = putQuote(b, q.curly, plain(q));
  put(b, close);
  if (!follows || (gap.startsWith(" ") && endsWithTerminator(c))) return 0;
  attach(b, r, s, "following");
  return 1;
}

const NEVER = -1;

/** Renders the groups that attach preceding (or would, but for their gap). */
function renderPreceding(b: Builder, g: QuoteGroup): number | null {
  const { q } = g;
  switch (g.tag) {
    case "same":
      return precede(b, q, plain(q), " ", g.c, dotB(q));
    case "next":
      return g.spaced
        ? precede(b, q, plain(q), " . ", g.c, dotB(q) + 1)
        : precede(b, q, `${q.body}.`, " ", g.c, 1);
    case "caseName":
      return precedeFull(b, q, `${q.body},`, ` ${g.name} `, g.f, caseNameBoundaries(g.name));
    case "gapSignal":
      return precede(b, q, plain(q), ` ${g.signal} `, g.c, dotB(q) + signalBoundaries(g.signal));
    case "gapSignalCase": {
      const n = 1 + signalBoundaries(g.signal) + caseNameBoundaries(g.name);
      return precedeFull(b, q, `${q.body}.`, ` ${g.signal} ${g.name} `, g.f, n);
    }
    case "paren": {
      const n = dotB(q) + signalBoundaries(g.signal) + caseNameBoundaries(g.name);
      return precedeFull(b, q, plain(q), ` (${g.signal} ${g.name} `, g.f, n, ")");
    }
    default:
      return null;
  }
}

/** Renders the following, both-rule, and several-quote groups. */
function renderFollowing(b: Builder, g: QuoteGroup): number | null {
  const { q } = g;
  switch (g.tag) {
    case "followParen":
      return follow(b, g.c, " (", q, ")", true);
    case "followColon":
      return follow(b, g.c, ": ", q, "", true);
    case "followSignal":
      return follow(b, g.c, ` (${g.signal} `, q, ")", false);
    case "both": {
      putCite(b, g.c1);
      put(b, " ");
      return precede(b, q, plain(q), " ", g.c2, dotB(q));
    }
    case "several": {
      const n = precede(b, q, plain(q), " ", g.c, dotB(q));
      const s = b.citations[b.citations.length - 1]?.start ?? 0;
      put(b, " (");
      const r = putQuote(b, g.q2.curly, plain(g.q2));
      put(b, ")");
      if (endsWithTerminator(g.c)) return n;
      attach(b, r, s, "following");
      return n + 1;
    }
    default:
      return null;
  }
}

/** Renders the groups whose pairs attach to nothing (Req 13.9). */
function renderUnattached(b: Builder, g: QuoteGroup): number {
  const { q } = g;
  switch (g.tag) {
    case "twoBoundaries":
      return precede(b, q, `${q.body}.`, ` ${g.word}. `, g.c, 2);
    case "in":
      return precede(b, q, plain(q), " In ", g.party, 2);
    case "with":
      return precedeFull(b, q, `${q.body},`, ` with ${g.name} `, g.f, NEVER);
    case "twoSignals":
      return precedeFull(b, q, plain(q), ` ${g.signal} ${g.signal2} ${g.name} `, g.f, NEVER);
    case "longParty":
      return precedeFull(b, q, `${q.body},`, ` ${g.long} v. ${g.other}, `, g.f, NEVER);
    default:
      putQuote(b, q.curly, plain(q));
      return 0;
  }
}

function signalsOf(g: QuoteGroup): readonly string[] {
  if (g.tag === "twoSignals") return [g.signal, g.signal2];
  return "signal" in g ? [g.signal] : [];
}

function citeKindOf(g: QuoteGroup): Cite["kind"] | null {
  if ("c" in g) return g.c.kind;
  if ("f" in g) return "full";
  return g.tag === "in" ? "party" : null;
}

/** Writes `lead body trail` and records the expected quotes. */
export function renderGroup(b: Builder, w: WrappedGroup): GroupRecord {
  const g = w.group;
  put(b, `${w.lead} `);
  const attached = renderPreceding(b, g) ?? renderFollowing(b, g) ?? renderUnattached(b, g);
  put(b, ` ${w.trail}`);
  return { tag: g.tag, signals: signalsOf(g), cite: citeKindOf(g), attached };
}
