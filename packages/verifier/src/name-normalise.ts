// Name normalisation (Requirement 4, criteria 2 and 5).

import { DROPPED_WORDS, NAME_EXPANSION_TABLE, hasExpansion } from "./name-expansion";

export type Prepared = Readonly<{
  /** Lower-cased, punctuation removed, split, single letters joined; before expansion and dropping. */
  joined: readonly string[];
  /** `joined` after expansion and dropping: the Normalised_Words. */
  words: readonly string[];
}>;

const SINGLE_LETTER = /^\p{L}$/u;

/** Join each run of two or more consecutive one-letter words into one word. */
function joinLetters(tokens: readonly string[]): string[] {
  const out: string[] = [];
  let run = "";
  let runLength = 0;
  const flush = (): void => {
    if (runLength > 0) out.push(run);
    run = "";
    runLength = 0;
  };
  for (const token of tokens) {
    if (SINGLE_LETTER.test(token)) {
      run += token;
      runLength += 1;
    } else {
      flush();
      out.push(token);
    }
  }
  flush();
  return out;
}

function expand(word: string): readonly string[] {
  if (!hasExpansion(word)) return [word];
  return NAME_EXPANSION_TABLE[word] ?? [word];
}

export function prepareName(name: string): Prepared {
  const tokens = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/u)
    .filter((t) => t.length > 0);
  const joined = joinLetters(tokens);
  const words = joined.flatMap(expand).filter((w) => !DROPPED_WORDS.has(w));
  return { joined, words };
}

/** Split a cited name into parties at its ` v. `. */
export function splitParties(name: string): string[] {
  return name.split(" v. ");
}
