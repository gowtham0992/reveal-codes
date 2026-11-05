/**
 * Short_Form linking (design A9 "Linking"; Req 12.1, 12.2, 12.3, 12.6, 12.7).
 *
 * One walk over the matches in document order, tracking:
 *
 * - `prev`, what an `Id.` at this point refers to: the start of the previous
 *   Full_Citation, the target of the previous linked Short_Form (Req 12.1),
 *   or nothing when the previous citation is an Other_Reference or an Orphan
 *   (Req 12.6, 12.7) or there is no previous citation (Req 12.3).
 * - `byPair`, a map from `(volume, reporter)` to the start of the last
 *   Full_Citation with that pair. A Parallel_Citation contributes every
 *   member's pair (Req 12.2). Reporters are already resolved to their
 *   Reporter_List entry by the grammar, so a Near_Miss such as `US` has the
 *   same key as `U.S.`. Database_Citations carry no pair.
 *
 * A party Short_Form looks up `byPair`; a miss makes it an Orphan. The input
 * is not modified: every Short_Form match is returned as a new value with
 * `targetStart` set. Nothing here throws. O(c) in the number of matches.
 */

import type { CitationValue, FullValue } from "../types.js";
import type { Match } from "./scan.js";

type State = Readonly<{
  /** Link target for an `Id.` here, or null for an Orphan. */
  prev: number | null;
  byPair: ReadonlyMap<string, number>;
}>;

const pairKey = (volume: number, reporter: string): string => `${String(volume)} ${reporter}`;

/** The `(volume, reporter)` keys a Full_Citation contributes. */
function pairsOf(value: FullValue): readonly string[] {
  switch (value.kind) {
    case "reporter":
      return [pairKey(value.volume, value.reporter)];
    case "parallel":
      return value.members.map((m) => pairKey(m.volume, m.reporter));
    case "database":
      return [];
  }
}

/** The state after a Full_Citation starting at `start`. */
function afterFull(state: State, value: FullValue, start: number): State {
  const byPair = new Map(state.byPair);
  for (const key of pairsOf(value)) byPair.set(key, start);
  return { prev: start, byPair };
}

/** The link target of a Short_Form value in `state`, or null for an Orphan. */
function targetOf(value: CitationValue, state: State): number | null {
  if (value.kind !== "short") return null;
  if (value.form === "id") return state.prev;
  return state.byPair.get(pairKey(value.volume, value.reporter)) ?? null;
}

type Step = Readonly<{ match: Match; state: State }>;

/** Links one match and advances the walk state. */
function step(m: Match, state: State): Step {
  const v = m.value;
  switch (v.kind) {
    case "reporter":
    case "parallel":
    case "database":
      return { match: m, state: afterFull(state, v, m.start) };
    case "other":
      return { match: m, state: { prev: null, byPair: state.byPair } };
    case "short": {
      const targetStart = targetOf(v, state);
      const match: Match = { ...m, value: { ...v, targetStart } };
      return { match, state: { prev: targetStart, byPair: state.byPair } };
    }
  }
}

/**
 * Sets `targetStart` on every Short_Form in `matches` (which must be in
 * ascending start order, as `scanRange` returns them) and returns the new
 * list. Full_Citations and Other_References are returned unchanged.
 */
export function linkShortForms(matches: readonly Match[]): readonly Match[] {
  const out: Match[] = [];
  let state: State = { prev: null, byPair: new Map() };
  for (const m of matches) {
    const s = step(m, state);
    out.push(s.match);
    state = s.state;
  }
  return out;
}
