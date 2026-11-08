// Normalisation_Pipeline (design A7, Req 8.2 to 8.4, 8.10, 8.11).

/** Unicode White_Space, written out: `\s` omits U+0085 and includes U+FEFF. */
export const WS_CLASS =
  "\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

export const WS_RUN = new RegExp(`[${WS_CLASS}]+`, "g");
const WS_CHAR = new RegExp(`^[${WS_CLASS}]$`);
export const ELLIPSIS = new RegExp(`\\.(?:[${WS_CLASS}]*\\.){2,}|…`, "g");
const TAIL_PUNCTUATION = ".,;:";

/** Step 2: curly quotes to straight quotes. */
export function straightenQuotes(s: string): string {
  return s.replace(/[“”]/g, '"').replace(/[‘’‚]/g, "'");
}

/** Step 3: en and em dash to hyphen. */
export function straightenDashes(s: string): string {
  return s.replace(/[–—]/g, "-");
}

/** Stack-matched bracket pairs as `[open, close]` index pairs. */
export function matchedBrackets(s: string): Array<readonly [number, number]> {
  const open: number[] = [];
  const pairs: Array<readonly [number, number]> = [];
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "[") {
      open.push(i);
    } else if (ch === "]") {
      const o = open.pop();
      if (o !== undefined) pairs.push([o, i]);
    }
  }
  return pairs;
}

/** Step 4: delete the brackets of stack-matched pairs; unmatched brackets stay. */
export function removeBracketPairs(s: string): string {
  const drop = new Set<number>();
  for (const [o, c] of matchedBrackets(s)) {
    drop.add(o);
    drop.add(c);
  }
  if (drop.size === 0) return s;
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    if (!drop.has(i)) out += s.charAt(i);
  }
  return out;
}

/** Step 5: every ellipsis form becomes the single character U+2026. */
export function foldEllipses(s: string): string {
  return s.replace(ELLIPSIS, "…");
}

function isWhiteSpace(ch: string | undefined): boolean {
  return ch !== undefined && WS_CHAR.test(ch);
}

/** Step 6: collapse White_Space runs to one space and trim both ends. */
export function collapseWhitespace(s: string): string {
  const collapsed = s.replace(WS_RUN, " ");
  let start = 0;
  let end = collapsed.length;
  if (collapsed[start] === " ") start += 1;
  if (end > start && collapsed[end - 1] === " ") end -= 1;
  return collapsed.slice(start, end);
}

/** Steps 1 to 7 (no case folding, no tail trimming). */
export function pipeline(s: string): string {
  const nfc = s.normalize("NFC");
  const steps = collapseWhitespace(
    foldEllipses(removeBracketPairs(straightenDashes(straightenQuotes(nfc)))),
  );
  return steps.normalize("NFC");
}

/** Repeatedly delete a final White_Space character or one of `. , ; :`. */
export function trimTail(s: string): string {
  let end = s.length;
  while (end > 0) {
    const ch = s[end - 1];
    if (isWhiteSpace(ch) || (ch !== undefined && TAIL_PUNCTUATION.includes(ch))) end -= 1;
    else break;
  }
  return s.slice(0, end);
}

/** Lower-case each UTF-16 unit whose lower-case form is exactly one unit. */
export function foldCase(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const u = s[i] as string;
    const lower = u.toLowerCase();
    out += lower.length === 1 ? lower : u;
  }
  return out;
}

/** The opinion form: pipeline, then case folding. */
export function normalise(s: string): string {
  return foldCase(pipeline(s));
}

/** The quote form: pipeline, tail trimming, then case folding. */
export function normaliseQuote(s: string): string {
  return foldCase(trimTail(pipeline(s)));
}
