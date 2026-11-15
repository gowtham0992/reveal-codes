// Name_Match (Requirement 4). Pure: no I/O, no clock, no node: imports.

import { initialismMatch } from "./name-initials";
import { prepareName, splitParties, type Prepared } from "./name-normalise";

function shares(p: Prepared, names: readonly Prepared[], pool: ReadonlySet<string>): boolean {
  return p.words.some((w) => pool.has(w)) || names.some((n) => initialismMatch(p, n));
}

/** Whether the name a filing gives is the same case as any of the names CourtListener returns. */
export function namesMatch(cited: string, found: readonly string[]): boolean {
  const parties = splitParties(cited)
    .map(prepareName)
    .filter((p) => p.words.length > 0);
  if (parties.length === 0) return true;
  const names = found.map(prepareName);
  const pool = new Set(names.flatMap((n) => n.words));
  return parties.every((p) => shares(p, names, pool));
}
