import fc from "fast-check";
import { createDocument, type Document, type Provenance } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { updateRecord } from "../src/core/update.js";
import { arbRecordHistory, arbSingleEdit, type HistoryStep } from "../src/testing/arbitraries.js";
import { advancingClock, type TestClock } from "./support/clock.js";
import { runs } from "./support/fc.js";

const WINDOWS = [0, 1, 2].map((k) => ({ windowRun: `turn 2026-11-19T10:0${String(k)}:00Z` }));
const AT = "2026-01-01T00:00:00.000Z";

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

/** The Record after the history, built through `updateRecord` and the real Engine. */
function build(base: string, steps: readonly HistoryStep[], clock: TestClock): Document {
  return steps.reduce(
    (doc, s) => {
      const window = s.origin === "AI" ? (WINDOWS[s.window] ?? null) : null;
      return must(updateRecord(doc, s.text, s.origin, window, clock));
    },
    must(createDocument(base, AT)),
  );
}

/** Atoms of a text: a surrogate pair is one atom and so is a CR LF pair. */
function atoms(text: string): string[] {
  return text.match(/\r\n|[\ud800-\udbff][\udc00-\udfff]|[\s\S]/g) ?? [];
}

/** The atom-minimal changed stretch `[p, q)` of `oldText` against `newText`. */
function minimal(oldText: string, newText: string): { p: number; q: number; inserted: number } {
  const a = atoms(oldText);
  const b = atoms(newText);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  )
    suf++;
  const len = (xs: string[]): number => xs.reduce((n, x) => n + x.length, 0);
  const p = len(a.slice(0, pre));
  const q = oldText.length - len(a.slice(a.length - suf));
  return { p, q, inserted: newText.length - (oldText.length - (q - p)) };
}
const atLineStart = (t: string, at: number): boolean => at === 0 || t[at - 1] === "\n";
/** True when offset `b` of `t` lies between a high and a low surrogate or between CR and LF. */
function inPair(t: string, b: number): boolean {
  if (b <= 0 || b >= t.length) return false;
  const x = t.charCodeAt(b - 1);
  const y = t.charCodeAt(b);
  return (x >= 0xd800 && x <= 0xdbff && y >= 0xdc00 && y <= 0xdfff) || (x === 13 && y === 10);
}
/** Whether the stretch at `p` (old `[p, q)`, `inserted` new units) can move one unit left (Req 4.17). */
function canMoveLeft(oldText: string, newText: string, p: number, q: number, n: number): boolean {
  if (p < 1) return false;
  const before = oldText[p - 1];
  if (q > p && oldText[q - 1] !== before) return false;
  if (n > 0 && newText[p + n - 1] !== before) return false;
  const cuts = [inPair(oldText, p - 1), inPair(oldText, q - 1), inPair(newText, p - 1 + n)];
  return !cuts.some(Boolean);
}
/**
 * The minimal changed stretch at the rule of Req 4.17: its equivalent positions are the
 * prefix-maximal one and each one reached by moving left; the rightmost of them at a line
 * start is taken, and the prefix-maximal one when none is.
 */
function placed(oldText: string, newText: string): { p: number; q: number; inserted: number } {
  const e = minimal(oldText, newText);
  for (let k = 0; ; k++) {
    if (atLineStart(oldText, e.p - k)) return { p: e.p - k, q: e.q - k, inserted: e.inserted };
    if (!canMoveLeft(oldText, newText, e.p - k, e.q - k, e.inserted)) return e;
  }
}
/**
 * The edited stretch widened to whole lines (Req 16.24), written apart from `trim.ts`: the
 * minimal changed stretch at the latest line start of its equivalent positions (`placed`,
 * Req 4.17), its start back to the start of its line, its end forward to just
 * after the next line feed of the text after it (or to the end of the text), unless both
 * ends already are line starts. Both texts widen by the same count, as the suffix is common.
 */
function widened(oldText: string, newText: string): { p: number; q: number; inserted: number } {
  const e = placed(oldText, newText);
  const start = e.p === 0 ? 0 : oldText.lastIndexOf("\n", e.p - 1) + 1;
  const newEnd = e.p + e.inserted;
  if (atLineStart(oldText, e.q) && atLineStart(newText, newEnd)) {
    return { p: start, q: e.q, inserted: newEnd - start };
  }
  const lf = oldText.indexOf("\n", e.q);
  const forward = (lf === -1 ? oldText.length : lf + 1) - e.q;
  return { p: start, q: e.q + forward, inserted: newEnd + forward - start };
}
function provAt(doc: Document, offset: number): Provenance {
  const span = doc.spans.find((s) => s.start <= offset && offset < s.end);
  if (span === undefined) throw new Error(`no span at ${String(offset)}`);
  return span.provenance;
}

const relabelled = (doc: Document, id: string | undefined): boolean =>
  doc.runs.find((r) => r.runId === id)?.relabelled === true;

/** Every old character outside `[p, q)` keeps its run, and its origin up to the Engine's relabelling. */
function checkOutside(before: Document, after: Document, p: number, q: number): void {
  const shift = after.text.length - before.text.length;
  for (let i = 0; i < before.text.length; i++) {
    if (i >= p && i < q) continue;
    const was = provAt(before, i);
    const now = provAt(after, i < p ? i : i + shift);
    expect(now.runId).toBe(was.runId);
    expect(now.origin).toBe(expectedOrigin(after, was));
  }
}

/** The origin an old character must show in `after`: its own, or `AI>HUM` when its `AI` run is relabelled. */
function expectedOrigin(after: Document, was: Provenance): Provenance["origin"] {
  return was.origin === "AI" && relabelled(after, was.runId) ? "AI>HUM" : was.origin;
}

/** Whether `now` is the new origin of the edit (`AI` in the edit's window, or `HUM`). */
function isNew(now: Provenance, origin: "AI" | "HUM", window: string): boolean {
  if (origin === "HUM") return now.origin === "HUM" && now.runId === undefined;
  return now.origin === "AI" && now.runId?.startsWith(window + ".") === true;
}

/**
 * Every character that replaces the widened stretch `[p, q)` has the new origin, or is an
 * old character from inside it (same text unit) that the line difference kept as an equal
 * line, with its run and its origin up to the Engine's relabelling.
 */
function checkInserted(
  before: Document,
  after: Document,
  edit: { p: number; q: number; inserted: number },
  origin: "AI" | "HUM",
  window: string,
): void {
  for (let i = edit.p; i < edit.p + edit.inserted; i++) {
    const now = provAt(after, i);
    if (isNew(now, origin, window)) continue;
    let kept = false;
    for (let j = edit.p; j < edit.q && !kept; j++) {
      const was = provAt(before, j);
      kept =
        before.text[j] === after.text[i] &&
        now.runId === was.runId &&
        now.origin === expectedOrigin(after, was);
    }
    expect(kept, `character ${String(i)} is neither new nor kept from [p, q)`).toBe(true);
  }
}

const arbCase = arbRecordHistory.chain((h) => {
  const text = h.steps[h.steps.length - 1]?.text ?? h.base;
  return fc.tuple(
    fc.constant(h),
    arbSingleEdit(text),
    fc.constantFrom<"AI" | "HUM">("AI", "HUM"),
    fc.constantFrom(...WINDOWS),
  );
});

describe("update edit properties _Requirements: 4.10, 4.15, 4.16, 16.24_", () => {
  // Property 17
  it("P17 an edit changes only the edited stretch", () => {
    fc.assert(
      fc.property(arbCase, ([history, edit, origin, window]) => {
        const clock = advancingClock();
        const before = build(history.base, history.steps, clock);
        const newText = before.text.slice(0, edit.from) + edit.text + before.text.slice(edit.to);
        const after = must(
          updateRecord(before, newText, origin, origin === "AI" ? window : null, clock),
        );
        expect(after.text).toBe(newText);
        const edited = widened(before.text, newText);
        checkOutside(before, after, edited.p, edited.q);
        checkInserted(before, after, edited, origin, window.windowRun);
      }),
      { numRuns: runs(process.env) },
    );
  });
});
