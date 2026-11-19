/**
 * Line difference (design M1, Req 4.2): hand-written Myers O(ND) over lines,
 * after a prefix and suffix trim. Hunks are replacements of `old[from, to)` by
 * `text`, on line boundaries of the old text. Pure; no `node:`.
 */
import { DIFF_CAP } from "./limits.js";
import { splitLines } from "./lines.js";
import type { Hunk } from "./types.js";

/** One edit step from (x0, y0) to (x1, y1) in the middle's line coordinates. */
type Step = { x0: number; y0: number; x1: number; y1: number };

/** FNV-1a over UTF-16 code units. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

function startsOf(lines: readonly string[]): number[] {
  const out = [0];
  for (const l of lines) out.push((out[out.length - 1] ?? 0) + l.length);
  return out;
}

/** Forward Myers. Returns the V arrays per `d` (the last is the finishing one) or null past the cap. */
function myers(
  a: readonly string[],
  b: readonly string[],
  ha: readonly number[],
  hb: readonly number[],
): Int32Array[] | null {
  const n = a.length;
  const m = b.length;
  const trace: Int32Array[] = [];
  for (let d = 0; d <= DIFF_CAP; d++) {
    const cur = new Int32Array(2 * d + 1);
    const prev = trace[d - 1];
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (prev === undefined) x = 0;
      else if (k === -d || (k !== d && (prev[k - 1 + d - 1] ?? 0) < (prev[k + 1 + d - 1] ?? 0))) {
        x = prev[k + 1 + d - 1] ?? 0;
      } else x = (prev[k - 1 + d - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && ha[x] === hb[y] && a[x] === b[y]) {
        x++;
        y++;
      }
      cur[k + d] = x;
      if (x >= n && y >= m) {
        trace.push(cur);
        return trace;
      }
    }
    trace.push(cur);
  }
  return null;
}

/** Walks the trace back to the edit steps, in ascending order. */
function backtrack(trace: readonly Int32Array[], n: number, m: number): Step[] {
  const steps: Step[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 1; d--) {
    const prev = trace[d - 1] as Int32Array;
    const k = x - y;
    const down = k === -d || (k !== d && (prev[k - 1 + d - 1] ?? 0) < (prev[k + 1 + d - 1] ?? 0));
    const pk = down ? k + 1 : k - 1;
    const px = prev[pk + d - 1] ?? 0;
    const py = px - pk;
    steps.push(
      down ? { x0: px, y0: py, x1: px, y1: py + 1 } : { x0: px, y0: py, x1: px + 1, y1: py },
    );
    x = px;
    y = py;
  }
  return steps.reverse();
}

/** Merges steps with no matched line between them into line ranges. */
function mergeSteps(steps: readonly Step[]): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last !== undefined && last.x1 === s.x0 && last.y1 === s.y0) {
      last.x1 = s.x1;
      last.y1 = s.y1;
    } else out.push({ ...s });
  }
  return out;
}

/** The Hunks that turn `oldText` into `newText`, sorted, disjoint, on old line boundaries. */
export function diffLines(oldText: string, newText: string): Hunk[] {
  if (oldText === newText) return [];
  const a = splitLines(oldText);
  const b = splitLines(newText);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const ma = a.slice(p, a.length - s);
  const mb = b.slice(p, b.length - s);
  const wholeMiddle: Step[] = [{ x0: 0, y0: 0, x1: ma.length, y1: mb.length }];
  const steps = middleSteps(ma, mb) ?? wholeMiddle;
  const aStarts = startsOf(a);
  const bStarts = startsOf(b);
  return steps.map((st) => ({
    from: aStarts[p + st.x0] ?? 0,
    to: aStarts[p + st.x1] ?? 0,
    text: newText.slice(bStarts[p + st.y0] ?? 0, bStarts[p + st.y1] ?? 0),
  }));
}

/** Steps for the trimmed middle; null when the cap is passed. */
function middleSteps(ma: readonly string[], mb: readonly string[]): Step[] | null {
  if (ma.length === 0 || mb.length === 0) return [{ x0: 0, y0: 0, x1: ma.length, y1: mb.length }];
  const trace = myers(ma, mb, ma.map(fnv1a), mb.map(fnv1a));
  return trace === null ? null : mergeSteps(backtrack(trace, ma.length, mb.length));
}
