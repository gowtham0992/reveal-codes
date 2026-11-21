/**
 * The per-file checks of Property 2, character by character.
 *
 * What a Record lets a test see: the Engine merges adjacent spans of one origin and one run and
 * keeps the timestamp of the lowest-start member (Requirement 4, criterion 10). A character with a
 * run (`AI`, `AI>HUM`) is never merged with a neighbour of another Hunk, so its run and timestamp
 * are exact. A character with no run (`HUM`, `PST`) may take the timestamp of a neighbour, so its
 * timestamp is checked against the timestamps its origin had before or the event's own.
 */
import type { Document } from "@reveal-codes/engine";
import type { ModelWindow } from "./attribution-model.js";

export type Cell = { ch: string; origin: string; runId: string | undefined; ts: string };

/** One cell for each UTF-16 code unit of the Document's text. */
export function cellsOf(doc: Document): Cell[] {
  const out: Cell[] = [];
  for (const s of doc.spans) {
    const { origin, runId, timestamp } = s.provenance;
    for (let i = s.start; i < s.end; i += 1) {
      out.push({ ch: doc.text.charAt(i), origin, runId, ts: timestamp });
    }
  }
  return out;
}

export type EventFacts = { iso: string; window: ModelWindow | null };

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

function backOffPrefix(a: string, b: string, p: number): number {
  const splits = (n: number): boolean =>
    isHigh(a.charCodeAt(n - 1)) || (a[n - 1] === "\r" && (a[n] === "\n" || b[n] === "\n"));
  let n = p;
  while (n > 0 && splits(n)) n -= 1;
  return n;
}

function backOffSuffix(a: string, b: string, s: number): number {
  const splits = (n: number): boolean => {
    const i = a.length - n;
    const j = b.length - n;
    if (isLow(a.charCodeAt(i))) return isHigh(a.charCodeAt(i - 1)) || isHigh(b.charCodeAt(j - 1));
    return a[i] === "\n" && (a[i - 1] === "\r" || b[j - 1] === "\r");
  };
  let n = s;
  while (n > 0 && splits(n)) n -= 1;
  return n;
}

/** The common prefix, then the common suffix, of two texts, cut back so that no pair is split. */
function affixes(a: string, b: string): { prefix: number; suffix: number } {
  const most = Math.min(a.length, b.length);
  let p = 0;
  while (p < most && a[p] === b[p]) p += 1;
  const prefix = backOffPrefix(a, b, p);
  let s = 0;
  while (s < most - prefix && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1;
  return { prefix, suffix: backOffSuffix(a, b, s) };
}

const splitsAt = (t: string, b: number): boolean =>
  b > 0 && b < t.length && /^(?:[\ud800-\udbff][\udc00-\udfff]|\r\n)$/.test(t.slice(b - 1, b + 1));

/**
 * `affixes`, then the changed stretch slid left to the nearest line start by equal positions
 * one unit at a time (Req 4.17); no step puts a boundary inside a pair; unchanged when none is reached.
 */
function slidAffixes(a: string, b: string): { prefix: number; suffix: number } {
  const first = affixes(a, b);
  const added = b.length - a.length;
  for (let p = first.prefix, q = a.length - first.suffix; ; p -= 1, q -= 1) {
    if (p === 0 || a[p - 1] === "\n") return { prefix: p, suffix: a.length - q };
    const np = p - 1;
    const same = a.slice(0, np) + b.slice(np, q - 1 + added) + a.slice(q - 1) === b;
    const safe =
      [np, q - 1].every((x) => !splitsAt(a, x)) &&
      [np, q - 1 + added].every((x) => !splitsAt(b, x));
    if (!same || !safe) return first;
  }
}

const lineStart = (t: string, at: number): boolean => at === 0 || t[at - 1] === "\n";

/**
 * The slid affixes widened to whole lines (Req 4.15, 4.17, design M15), written apart from
 * `trim.ts`: the start goes back to its line start; the end goes forward to just after the first
 * line feed of the common suffix (or the end of the texts) unless it already is a line start in both.
 */
function widenedAffixes(a: string, b: string): { prefix: number; suffix: number } {
  const { prefix, suffix } = slidAffixes(a, b);
  const start = prefix === 0 ? 0 : a.lastIndexOf("\n", prefix - 1) + 1;
  const q = a.length - suffix;
  if (lineStart(a, q) && lineStart(b, b.length - suffix)) return { prefix: start, suffix };
  const lf = a.indexOf("\n", q);
  const forward = (lf === -1 ? a.length : lf + 1) - q;
  return { prefix: start, suffix: suffix - forward };
}

/** What a character of the old Record allows its successor to be. */
type Allowed = {
  relabelled: ReadonlySet<string>;
  iso: string;
  oldStamps: ReadonlyMap<string, Set<string>>;
};

function stampsOf(olds: readonly Cell[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const c of olds) out.set(c.origin, (out.get(c.origin) ?? new Set<string>()).add(c.ts));
  return out;
}

function stampOk(old: Cell, now: Cell, a: Allowed): boolean {
  if (old.runId !== undefined || old.ts === now.ts) return old.ts === now.ts;
  return now.ts === a.iso || (a.oldStamps.get(now.origin)?.has(now.ts) ?? false);
}

/** `now` is `old` kept: same character and run, `AI` only becoming `AI>HUM` in a relabelled run. */
function kept(old: Cell, now: Cell, a: Allowed): boolean {
  if (old.ch !== now.ch || old.runId !== now.runId || !stampOk(old, now, a)) return false;
  if (old.origin === now.origin) return true;
  const asRelabelled = now.runId !== undefined && a.relabelled.has(now.runId);
  return old.origin === "AI" && now.origin === "AI>HUM" && asRelabelled;
}

/** Every cell of `news`, in order, matches a later cell of `olds` (greedy earliest match is complete). */
function follows<T>(
  olds: readonly T[],
  news: readonly T[],
  same: (o: T, n: T) => boolean,
): boolean {
  let at = 0;
  for (const n of news) {
    while (at < olds.length && !same(olds[at] as T, n)) at += 1;
    if (at === olds.length) return false;
    at += 1;
  }
  return true;
}

/** The Hunk numbers the old Record's Run table holds for `windowRun`, highest. */
function highestNumber(doc: Document, windowRun: string): number {
  const prefix = `${windowRun}.`;
  let highest = 0;
  for (const run of doc.runs) {
    const tail = run.runId.startsWith(prefix) ? run.runId.slice(prefix.length) : "";
    if (/^[0-9]+$/.test(tail)) highest = Math.max(highest, Number(tail));
  }
  return highest;
}

/** The run ids of the event's AI characters, one for each maximal stretch of one run. */
function stretches(now: readonly Cell[], iso: string): string[] {
  const out: string[] = [];
  now.forEach((c, i) => {
    if (c.ts !== iso || c.runId === undefined) return;
    const before = now[i - 1];
    if (before?.ts !== iso || before.runId !== c.runId) out.push(c.runId);
  });
  return out;
}

/** The first clause: what the event inserted with a run is `AI`, of the selected window, numbered on. */
function insertedProblems(old: Document, now: readonly Cell[], facts: EventFacts): string[] {
  const own = now.filter((c) => c.ts === facts.iso && c.runId !== undefined);
  const w = facts.window;
  if (w === null)
    return own.length === 0 ? [] : ["text with a run was inserted while no window was open"];
  const problems = own.some((c) => c.origin !== "AI") ? ["inserted text with a run is not AI"] : [];
  const ids = stretches(now, facts.iso);
  const base = highestNumber(old, w.name);
  const wanted = ids.map((_, k) => `${w.name}.${String(base + k + 1)}`);
  if (JSON.stringify(ids) !== JSON.stringify(wanted)) {
    problems.push(`run ids ${JSON.stringify(ids)}, want ${JSON.stringify(wanted)}`);
  }
  return problems;
}

/** Text with no run: `PST` is never made, and `HUM` is made only when no window was open. */
function runlessProblems(
  olds: readonly Cell[],
  now: readonly Cell[],
  facts: EventFacts,
  a: Allowed,
) {
  const runless = (c: Cell): boolean => c.runId === undefined;
  const same = (o: Cell, n: Cell): boolean =>
    o.ch === n.ch && o.origin === n.origin && stampOk(o, n, a);
  const oldOf = (origin: string): Cell[] => olds.filter((c) => runless(c) && c.origin === origin);
  const newOf = (origin: string): Cell[] => now.filter((c) => runless(c) && c.origin === origin);
  const problems: string[] = [];
  if (now.some((c) => runless(c) && c.origin !== "HUM" && c.origin !== "PST")) {
    problems.push("text with no run is neither HUM nor PST");
  }
  if (!follows(oldOf("PST"), newOf("PST"), same)) problems.push("PST text was made or changed");
  if (facts.window !== null && !follows(oldOf("HUM"), newOf("HUM"), same)) {
    problems.push("HUM text was made while a window was open");
  }
  return problems;
}

/** The characters of the common prefix and suffix (after the slide and the widening to whole lines) are outside every Hunk and are kept at their place. */
function affixProblems(old: Document, doc: Document, olds: Cell[], now: Cell[], a: Allowed) {
  const { prefix, suffix } = widenedAffixes(old.text, doc.text);
  const problems: string[] = [];
  for (let i = 0; i < prefix; i += 1) {
    if (!kept(olds[i] as Cell, now[i] as Cell, a))
      problems.push(`prefix char ${String(i)} changed`);
  }
  for (let j = 1; j <= suffix; j += 1) {
    const [o, n] = [olds[olds.length - j], now[now.length - j]];
    if (o === undefined || n === undefined || !kept(o, n, a))
      problems.push(`suffix char ${String(j)} changed`);
  }
  return problems;
}

/** Property 2 for a Record that was updated from `old` to `doc` by an event. */
export function updateProblems(old: Document, doc: Document, facts: EventFacts): string[] {
  const olds = cellsOf(old);
  const now = cellsOf(doc);
  const relabelled = new Set(doc.runs.filter((r) => r.relabelled).map((r) => r.runId));
  const a: Allowed = { relabelled, iso: facts.iso, oldStamps: stampsOf(olds) };
  const withRun = (c: Cell): boolean => c.runId !== undefined;
  const earlier = now.filter((c) => withRun(c) && c.ts !== facts.iso);
  const problems = [...insertedProblems(old, now, facts), ...runlessProblems(olds, now, facts, a)];
  if (!follows(olds.filter(withRun), earlier, (o, n) => kept(o, n, a))) {
    problems.push("a character with a run changed or appeared");
  }
  return [...problems, ...affixProblems(old, doc, olds, now, a)];
}

/** A First_Change whose Baseline_Text was not found: every character `PST`, at the event, with no Run. */
export function unavailableProblems(doc: Document, facts: EventFacts): string[] {
  const bad = cellsOf(doc).filter(
    (c) => c.origin !== "PST" || c.runId !== undefined || c.ts !== facts.iso,
  );
  return bad.length === 0 ? [] : ["a character is not PST with no run at the event's time"];
}
