/**
 * Strip: projects a full Reveal Codes text onto its display form from the text
 * alone (design A11 "Strip"; Req 19.11, 19.12, 19.13).
 */
import type { CodePosition } from "../types.js";
import { CODE_NAMES, ESCAPE } from "./syntax.js";

const DOC_OPEN = `[${CODE_NAMES.doc}`;

/** True when a stripped Code token is the `[DOC]` header. */
function isDocCode(code: string): boolean {
  if (!code.startsWith(DOC_OPEN)) return false;
  const next = code.charAt(DOC_OPEN.length);
  return next === "]" || next === ":";
}

/** Index just past the `}` matching the unescaped `{` at `open` (or `s.length`). */
function skipSection(s: string, open: number): number {
  let i = open + 1;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch === ESCAPE) i += 2;
    else if (ch === "}") return i + 1;
    else i += 1;
  }
  return s.length;
}

/**
 * Two states: outside a Code, `\x` pairs are copied and `[` enters a Code;
 * inside, `\x` pairs are copied, `{`...`}` is skipped, and `]` ends the Code.
 * A Code named `DOC` is dropped. Total: an unterminated Code is kept as read.
 */
export function strip(revealCodesText: string): string {
  const s = revealCodesText;
  let out = "";
  let code: string | null = null;
  let i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch === ESCAPE) {
      const pair = s.slice(i, i + 2);
      if (code === null) out += pair;
      else code += pair;
      i += 2;
    } else if (code === null) {
      if (ch === "[") code = "[";
      else out += ch;
      i += 1;
    } else if (ch === "{") {
      i = skipSection(s, i);
    } else if (ch === "]") {
      code += "]";
      if (!isDocCode(code)) out += code;
      code = null;
      i += 1;
    } else {
      code += ch;
      i += 1;
    }
  }
  return code === null ? out : out + code;
}

/**
 * Drops `[DOC` entries and strips every remaining code string. Offsets are
 * unchanged, and the order is preserved.
 */
export function stripPositions(positions: readonly CodePosition[]): readonly CodePosition[] {
  const out: CodePosition[] = [];
  for (const p of positions) {
    if (p.code.startsWith(DOC_OPEN)) continue;
    out.push({ offset: p.offset, code: strip(p.code) });
  }
  return out;
}
