// Initialism_Match (Requirement 4, criterion 10).

import { DROPPED_WORDS, INITIALS_SKIP_WORDS } from "./name-expansion";
import type { Prepared } from "./name-normalise";

function firstLetter(word: string): string {
  return Array.from(word)[0] ?? "";
}

/** Initials of every window of two or more consecutive words, skipping only the Initials_Skip_Words. */
export function initialisms(joined: readonly string[]): ReadonlySet<string> {
  const kept = joined.filter((w) => !INITIALS_SKIP_WORDS.has(w));
  const out = new Set<string>();
  for (let i = 0; i < kept.length; i += 1) {
    let initials = firstLetter(kept[i] as string);
    for (let j = i + 1; j < kept.length; j += 1) {
      initials += firstLetter(kept[j] as string);
      out.add(initials);
    }
  }
  return out;
}

function candidates(p: Prepared): string[] {
  const extra = p.joined.filter((w) => !DROPPED_WORDS.has(w));
  return [...p.words, ...extra].filter((w) => Array.from(w).length >= 2);
}

/** True when a word of one side equals the initials of consecutive words of the other. */
export function initialismMatch(a: Prepared, b: Prepared): boolean {
  const fromB = initialisms(b.joined);
  if (candidates(a).some((w) => fromB.has(w))) return true;
  const fromA = initialisms(a.joined);
  return candidates(b).some((w) => fromA.has(w));
}
