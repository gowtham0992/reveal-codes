import { apply, createDocument, parseRecord } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeBaseline } from "../src/core/baseline-codec.js";
import { diffLines } from "../src/core/diff.js";
import { commonAffixes, slideStretch, trimHunk, widenToLines } from "../src/core/trim.js";
import type { Baseline, BaselineEntry, Hunk } from "../src/core/types.js";
import { arbScenario } from "../src/testing/arbitraries.js";
import type { Scenario, Tracking } from "../src/testing/arbitraries.js";
import { cellsOf } from "./support/attribution-check.js";
import type { ModelWindow } from "./support/attribution-model.js";
import { newModel, step } from "./support/attribution-model.js";
import { PROV, logLines } from "./support/event-harness.js";
import { runs } from "./support/fc.js";
import type { MemoryDeps } from "./support/memory-deps.js";
import { fire, prepare, seed } from "./support/scenario.js";
import type { Tree } from "./support/scenario.js";
const enc = new TextEncoder();
const ENTRY_KINDS: readonly Tracking[] = ["entry-blob", "entry-cache", "entry-none"];
/** What the property saw, so that a run in which no first change happened cannot pass unnoticed. */
type Seen = { available: number; lost: number; ai: number; hum: number };
function baselineOf(deps: MemoryDeps): Baseline {
  const decoded = decodeBaseline(deps.fs.text(`${PROV}/baseline.json`) ?? "");
  if (!decoded.ok) throw new Error(`baseline.json: ${decoded.error.kind}`);
  return decoded.value;
}
function recordOf(deps: MemoryDeps, path: string): Document | null {
  const text = deps.fs.text(`${PROV}/records/${path}.reveal`);
  if (text === null) return null;
  const parsed = parseRecord(text);
  if (!parsed.ok) throw new Error(`${path}: the Record does not parse: ${parsed.error.kind}`);
  return parsed.value.document;
}
function documentOf(text: string, at: string): Document {
  const made = createDocument(text, at);
  if (!made.ok) throw new Error(made.error.kind);
  return made.value;
}
/** The Hunks from `oldText` to `newText`: whole-text affixes widened to lines, a line difference, each Hunk trimmed. */
function hunksOf(oldText: string, newText: string): Hunk[] {
  const slid = slideStretch(oldText, newText, commonAffixes(oldText, newText));
  const { prefix, suffix } = widenToLines(oldText, newText, slid);
  const middle = diffLines(
    oldText.slice(prefix, oldText.length - suffix),
    newText.slice(prefix, newText.length - suffix),
  );
  const shifted = middle.map((h) => ({ from: h.from + prefix, to: h.to + prefix, text: h.text }));
  return shifted.flatMap((h) => trimHunk(oldText, h) ?? []);
}
/** The starting document with the Hunks applied through Engine `apply`, highest offset first. */
function expectedDocument(
  start: string,
  at: string,
  current: string,
  window: ModelWindow | null,
  iso: string,
): Document {
  const ascending = hunksOf(start, current).sort((a, b) => a.from - b.from);
  let number = 0;
  const ops = ascending.map((h) => {
    number += h.text === "" ? 0 : 1;
    const provenance =
      window === null
        ? { origin: "HUM" as const, timestamp: iso }
        : {
            origin: "AI" as const,
            runId: `${window.name}.${String(h.text === "" ? 0 : number)}`,
            timestamp: iso,
          };
    return { kind: "replace" as const, from: h.from, to: h.to, text: h.text, provenance };
  });
  let doc = documentOf(start, at);
  for (const op of ops.reverse()) {
    const applied = apply(doc, op);
    if (!applied.ok) throw new Error(`apply: ${applied.error.kind}`);
    doc = applied.value.document;
  }
  return doc;
}
/** Offsets in `current` that a Hunk wrote: the inserted text of each Hunk, after the shifts before it. */
function touchedOffsets(start: string, current: string): Set<number> {
  const touched = new Set<number>();
  let shift = 0;
  for (const h of hunksOf(start, current).sort((a, b) => a.from - b.from)) {
    for (let i = 0; i < h.text.length; i += 1) touched.add(h.from + shift + i);
    shift += h.text.length - (h.to - h.from);
  }
  return touched;
}
/** The Baseline_Entry's text can be found: by its Blob_Id in the object store, or in the cache. */
function findable(deps: MemoryDeps, entry: BaselineEntry): boolean {
  const viaBlob = entry.blob !== undefined && deps.git.blobs.has(entry.blob);
  return viaBlob || deps.fs.text(`${PROV}/cache/${entry.sha256}`) !== null;
}
/** A path the event is a First_Change of: an entry and no Record before, a Record and no entry after. */
type First = { path: string; entry: BaselineEntry; text: string; start: string | null };
function firstChanges(deps: MemoryDeps, scenario: Scenario, tree: Tree): First[] {
  const texts = new Map(scenario.setup.map((f) => [deps.sha256(enc.encode(f.text)), f.text]));
  const out: First[] = [];
  for (const [path, entry] of Object.entries(baselineOf(deps).files)) {
    const text = tree.get(path);
    if (text === undefined || recordOf(deps, path) !== null) continue;
    if (deps.sha256(enc.encode(text)) === entry.sha256) continue;
    out.push({
      path,
      entry,
      text,
      start: findable(deps, entry) ? (texts.get(entry.sha256) ?? null) : null,
    });
  }
  return out;
}
function checkAvailable(
  f: First & { start: string },
  doc: Document,
  at: string,
  window: ModelWindow | null,
  iso: string,
): void {
  expect(doc, `${f.path}: the Record is the starting text and the Hunks`).toEqual(
    expectedDocument(f.start, at, f.text, window, iso),
  );
  const touched = touchedOffsets(f.start, f.text);
  const cells = cellsOf(doc);
  cells.forEach((c, i) => {
    if (!touched.has(i))
      expect(c.origin, `${f.path}: untouched character ${String(i)}`).toBe("PST");
  });
}
function checkLost(f: First, doc: Document, iso: string, newLines: string[]): void {
  expect(doc, `${f.path}: the current text, all PST`).toEqual(documentOf(f.text, iso));
  const bad = cellsOf(doc).filter((c) => c.origin !== "PST");
  expect(bad, `${f.path}: no AI or HUM character`).toEqual([]);
  // The Fault_Log writes whitespace and control characters of a path as `_` (Req 7.4).
  const logged = f.path.replace(/[\s\p{Cc}]/gu, "_");
  const found = newLines.filter(
    (l) => l.split(" ").slice(1).join(" ") === `${logged} baseline_text_unavailable`,
  );
  expect(found.length, `${f.path}: one baseline_text_unavailable line`).toBe(1);
}
function checkCache(deps: MemoryDeps): void {
  const digests = new Set(Object.values(baselineOf(deps).files).map((e) => e.sha256));
  const prefix = `${PROV}/cache/`;
  for (const name of deps.fs.files.keys()) {
    if (!name.startsWith(prefix)) continue;
    expect(digests.has(name.slice(prefix.length)), `cache file ${name} is named by an entry`).toBe(
      true,
    );
  }
}
async function replay(scenario: Scenario, seen: Seen): Promise<void> {
  const { deps, tree: first } = seed(scenario);
  const model = newModel();
  let tree = first;
  for (const s of scenario.steps) {
    tree = prepare(deps, scenario, tree, s);
    const firsts = firstChanges(deps, scenario, tree);
    const at = baselineOf(deps).at;
    const logBefore = logLines(deps);
    const ms = deps.clock.nowMs() + s.event.gapMs;
    const window = step(model, s.event, ms);
    await fire(deps, s);
    const iso = new Date(ms).toISOString();
    const newLines = logLines(deps).slice(logBefore.length);
    for (const f of firsts) {
      const doc = recordOf(deps, f.path);
      if (doc === null) continue;
      expect(baselineOf(deps).files[f.path], `${f.path}: no entry after`).toBeUndefined();
      if (f.start === null) {
        seen.lost += 1;
        checkLost(f, doc, iso, newLines);
      } else {
        seen.available += 1;
        if (window === null) seen.hum += 1;
        else seen.ai += 1;
        checkAvailable({ ...f, start: f.start }, doc, at, window, iso);
      }
    }
    checkCache(deps);
  }
}
describe("first change properties _Requirements: 5.5, 5.6, 5.7, 5.19, 6.1, 16.20_", () => {
  // Property 14
  it("P14 the first change never over-attributes", async () => {
    const seen: Seen = { available: 0, lost: 0, ai: 0, hum: 0 };
    await fc.assert(
      fc.asyncProperty(
        arbScenario({
          minSessions: 1,
          maxSessions: 3,
          allowNoId: true,
          trackings: ENTRY_KINDS,
          dropState: false,
          maxChanges: 3,
        }),
        (scenario) => replay(scenario, seen),
      ),
      { numRuns: runs(process.env) },
    );
    expect(seen.available, "some first change found its starting text").toBeGreaterThan(0);
    expect(seen.lost, "some first change did not find its starting text").toBeGreaterThan(0);
    expect(seen.ai, "some first change was inside a window").toBeGreaterThan(0);
    expect(seen.hum, "some first change was outside every window").toBeGreaterThan(0);
  });
});
