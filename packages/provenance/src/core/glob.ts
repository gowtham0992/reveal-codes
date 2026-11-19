// One gitignore glob, matched over path segments in the manner of git's wildmatch.
// Text and pattern are compared as UTF-8 bytes, as git does. No regular expression is
// built from pattern text: each segment is matched by a two-pointer scan that
// backtracks only to the last `*`, so no pattern can cause catastrophic backtracking.

type SetItem =
  | { kind: "byte"; value: number }
  | { kind: "range"; lo: number; hi: number }
  | { kind: "class"; test: (b: number) => boolean };

type Token =
  | { kind: "byte"; value: number }
  | { kind: "any" }
  | { kind: "star"; run: number }
  | { kind: "set"; negated: boolean; items: readonly SetItem[] };

type Segment = { kind: "globstar" } | { kind: "tokens"; tokens: readonly Token[] };

/** A compiled glob. `never` is true for a pattern that can match nothing. */
export type Glob = { never: boolean; segments: readonly Segment[] };

const SLASH = 0x2f;
const BACKSLASH = 0x5c;
const STAR = 0x2a;
const QUESTION = 0x3f;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;
const COLON = 0x3a;
const DASH = 0x2d;
const BANG = 0x21;
const CARET = 0x5e;

const isDigit = (b: number): boolean => b >= 0x30 && b <= 0x39;
const isLower = (b: number): boolean => b >= 0x61 && b <= 0x7a;
const isUpper = (b: number): boolean => b >= 0x41 && b <= 0x5a;
const isAlnum = (b: number): boolean => isDigit(b) || isLower(b) || isUpper(b);
const isGraph = (b: number): boolean => b >= 0x21 && b <= 0x7e;

const CLASSES: ReadonlyMap<string, (b: number) => boolean> = new Map([
  ["alnum", isAlnum],
  ["alpha", (b: number) => isLower(b) || isUpper(b)],
  ["blank", (b: number) => b === 0x20 || b === 0x09],
  ["cntrl", (b: number) => b < 0x20 || b === 0x7f],
  ["digit", isDigit],
  ["graph", isGraph],
  ["lower", isLower],
  ["print", (b: number) => b >= 0x20 && b <= 0x7e],
  ["punct", (b: number) => isGraph(b) && !isAlnum(b)],
  ["space", (b: number) => b === 0x20 || (b >= 0x09 && b <= 0x0d)],
  ["upper", isUpper],
  ["xdigit", (b: number) => isDigit(b) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66)],
]);

const NEVER: Glob = { never: true, segments: [] };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type ClassParse = { item: SetItem; at: number; cur: number };

/** `[:name:]` at `j` (which holds `[`), or a literal `[` when it is not one; null aborts the glob. */
function parseClass(p: Uint8Array, j: number): ClassParse | null {
  const s = j + 2;
  let k = s;
  while (p[k] !== undefined && p[k] !== RBRACKET) k += 1;
  if (p[k] === undefined) return null;
  if (k - s - 1 < 0 || p[k - 1] !== COLON) {
    return { item: { kind: "byte", value: LBRACKET }, at: j, cur: LBRACKET };
  }
  const test = CLASSES.get(decoder.decode(p.slice(s, k - 1)));
  if (test === undefined) return null;
  return { item: { kind: "class", test }, at: k, cur: 0 };
}

/** The end byte of a range whose `-` is followed by index `idx`; null when it is cut off. */
function rangeEnd(p: Uint8Array, idx: number): { hi: number; at: number } | null {
  const c = p[idx];
  if (c === undefined) return null;
  if (c !== BACKSLASH) return { hi: c, at: idx };
  const e = p[idx + 1];
  return e === undefined ? null : { hi: e, at: idx + 1 };
}

/** The members of a bracket class from `start`; null when it is unterminated or malformed. */
function parseSetBody(p: Uint8Array, start: number): { items: SetItem[]; next: number } | null {
  const items: SetItem[] = [];
  let j = start;
  let prev = 0;
  for (;;) {
    const c = p[j];
    if (c === undefined) return null;
    let cur = c;
    if (c === BACKSLASH) {
      const e = p[j + 1];
      if (e === undefined) return null;
      items.push({ kind: "byte", value: e });
      cur = e;
      j += 1;
    } else if (c === DASH && prev !== 0 && p[j + 1] !== undefined && p[j + 1] !== RBRACKET) {
      const r = rangeEnd(p, j + 1);
      if (r === null) return null;
      items.push({ kind: "range", lo: prev, hi: r.hi });
      j = r.at;
      cur = 0;
    } else if (c === LBRACKET && p[j + 1] === COLON) {
      const r = parseClass(p, j);
      if (r === null) return null;
      items.push(r.item);
      j = r.at;
      cur = r.cur;
    } else {
      items.push({ kind: "byte", value: c });
    }
    prev = cur;
    j += 1;
    if (p[j] === RBRACKET) return { items, next: j + 1 };
  }
}

function parseSet(p: Uint8Array, at: number): { token: Token; next: number } | null {
  const negated = p[at] === BANG || p[at] === CARET;
  const body = parseSetBody(p, negated ? at + 1 : at);
  return body === null
    ? null
    : { token: { kind: "set", negated, items: body.items }, next: body.next };
}

type Builder = { segments: Segment[]; cur: Token[] };

function endSegment(b: Builder): void {
  const only = b.cur.length === 1 ? b.cur[0] : undefined;
  if (only !== undefined && only.kind === "star" && only.run >= 2) {
    b.segments.push({ kind: "globstar" });
  } else {
    b.segments.push({ kind: "tokens", tokens: b.cur });
  }
  b.cur = [];
}

/** Handles the escape at `i`; returns the next index, or -1 for a trailing backslash. */
function escapeAt(p: Uint8Array, i: number, b: Builder): number {
  const e = p[i + 1];
  if (e === undefined) return -1;
  if (e === SLASH) endSegment(b);
  else b.cur.push({ kind: "byte", value: e });
  return i + 2;
}

function starAt(p: Uint8Array, i: number, b: Builder): number {
  let j = i;
  while (p[j] === STAR) j += 1;
  b.cur.push({ kind: "star", run: j - i });
  return j;
}

/** Compiles one gitignore glob; the pattern has no leading `!` and no trailing `/`. */
export function compileGlob(pattern: string): Glob {
  const p = encoder.encode(pattern);
  const b: Builder = { segments: [], cur: [] };
  let i = 0;
  while (i < p.length) {
    const c = p[i] as number;
    if (c === SLASH) {
      endSegment(b);
      i += 1;
    } else if (c === BACKSLASH) {
      i = escapeAt(p, i, b);
      if (i < 0) return NEVER;
    } else if (c === STAR) {
      i = starAt(p, i, b);
    } else if (c === LBRACKET) {
      const set = parseSet(p, i + 1);
      if (set === null) return NEVER;
      b.cur.push(set.token);
      i = set.next;
    } else {
      b.cur.push(c === QUESTION ? { kind: "any" } : { kind: "byte", value: c });
      i += 1;
    }
  }
  endSegment(b);
  return { never: false, segments: b.segments };
}

function inSet(items: readonly SetItem[], b: number): boolean {
  return items.some((it) => {
    if (it.kind === "byte") return it.value === b;
    if (it.kind === "range") return b >= it.lo && b <= it.hi;
    return it.test(b);
  });
}

function tokenMatches(t: Token, b: number): boolean {
  if (t.kind === "byte") return t.value === b;
  if (t.kind === "any") return b !== SLASH;
  if (t.kind === "set") return b !== SLASH && inSet(t.items, b) !== t.negated;
  return false;
}

/** One path segment against one segment's tokens; `*` never crosses `/` because segments hold none. */
function matchTokens(tokens: readonly Token[], text: Uint8Array): boolean {
  let ti = 0;
  let bi = 0;
  let starT = -1;
  let starB = 0;
  while (bi < text.length) {
    const t = tokens[ti];
    if (t !== undefined && t.kind === "star") {
      starT = ti;
      ti += 1;
      starB = bi;
    } else if (t !== undefined && tokenMatches(t, text[bi] as number)) {
      ti += 1;
      bi += 1;
    } else if (starT >= 0) {
      ti = starT + 1;
      starB += 1;
      bi = starB;
    } else {
      return false;
    }
  }
  while (tokens[ti]?.kind === "star") ti += 1;
  return ti === tokens.length;
}

function matchSegment(seg: Segment, text: Uint8Array): boolean {
  return seg.kind === "tokens" && matchTokens(seg.tokens, text);
}

/** Encodes path segments as the UTF-8 bytes that `matchGlob` compares. */
export function encodeParts(parts: readonly string[]): Uint8Array[] {
  return parts.map((p) => encoder.encode(p));
}

/**
 * Matches a glob against whole path segments. A segment that is only `**` matches zero or
 * more segments, and one or more when it is last. Returns false for a glob that can match nothing.
 */
export function matchGlob(glob: Glob, text: readonly Uint8Array[]): boolean {
  if (glob.never) return false;
  const pat = glob.segments;
  let pi = 0;
  let ti = 0;
  let starP = -1;
  let starT = 0;
  while (ti < text.length) {
    const seg = pat[pi];
    if (seg !== undefined && seg.kind === "globstar") {
      if (pi === pat.length - 1) return true;
      starP = pi;
      pi += 1;
      starT = ti;
    } else if (seg !== undefined && matchSegment(seg, text[ti] as Uint8Array)) {
      pi += 1;
      ti += 1;
    } else if (starP >= 0) {
      pi = starP + 1;
      starT += 1;
      ti = starT;
    } else {
      return false;
    }
  }
  while (pi < pat.length - 1 && pat[pi]?.kind === "globstar") pi += 1;
  return pi === pat.length;
}
