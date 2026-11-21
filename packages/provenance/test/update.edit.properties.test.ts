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

/** The atom-minimal changed stretch `[p, q)` of `oldText` against `newText`, before any slide. */
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
const splits = (t: string, b: number): boolean =>
  b > 0 && b < t.length && /^(?:[\ud800-\udbff][\udc00-\udfff]|\r\n)$/.test(t.slice(b - 1, b + 1));
/** Whether the same edit placed `k` units further left gives the same new text, with no boundary inside a pair. */
function equalAt(
  oldText: string,
  newText: string,
  e: { p: number; q: number; inserted: number },
  k: number,
): boolean {
  const p = e.p - k;
  const q = e.q - k;
  const end = p + e.inserted;
  const sameEdit = oldText.slice(0, p) + newText.slice(p, end) + oldText.slice(q) === newText;
  const safe =
    [p, q].every((b) => !splits(oldText, b)) && [p, end].every((b) => !splits(newText, b));
  return p >= 0 && sameEdit && safe;
}
/**
 * The minimal changed stretch `[p, q)` of `oldText` against `newText` after the slide
 * (Req 4.17): the nearest line start reached by equal positions one unit at a time, or
 * the minimal stretch itself when none is reachable. Written apart from `slideStretch`.
 */
function stretch(oldText: string, newText: string): { p: number; q: number; inserted: number } {
  const e = minimal(oldText, newText);
  for (let k = 0; ; k++) {
    const at = e.p - k;
    if (at === 0 || oldText[at - 1] === "\n") return { p: at, q: e.q - k, inserted: e.inserted };
    if (!equalAt(oldText, newText, e, k + 1)) return e;
  }
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
 * Every character that replaces `[p, q)` has the new origin, or is an old character
 * from inside `[p, q)` (same text unit) that the line difference kept, with its run
 * and its origin up to the Engine's relabelling.
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
        const edited = stretch(before.text, newText);
        checkOutside(before, after, edited.p, edited.q);
        checkInserted(before, after, edited, origin, window.windowRun);
      }),
      { numRuns: runs(process.env) },
    );
  });
});
