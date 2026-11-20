import { createDocument, parseRecord } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeBaseline } from "../src/core/baseline-codec.js";
import type { Baseline } from "../src/core/types.js";
import { ALL_TRACKINGS, arbScenario } from "../src/testing/arbitraries.js";
import type { Scenario } from "../src/testing/arbitraries.js";
import { cellsOf, unavailableProblems, updateProblems } from "./support/attribution-check.js";
import type { EventFacts } from "./support/attribution-check.js";
import { newModel, step } from "./support/attribution-model.js";
import { PROV } from "./support/event-harness.js";
import { runs } from "./support/fc.js";
import type { MemoryDeps } from "./support/memory-deps.js";
import { fire, prepare, seed } from "./support/scenario.js";

const enc = new TextEncoder();
const RECORDS = `${PROV}/records/`;

/** What the properties saw, so that a run in which nothing was attributed cannot pass unnoticed. */
type Seen = { ai: number; hum: number; pst: number };

/** The Record texts by workspace-relative path. */
function recordTexts(deps: MemoryDeps): Map<string, string> {
  const out = new Map<string, string>();
  for (const path of deps.fs.files.keys()) {
    if (!path.startsWith(RECORDS) || !path.endsWith(".reveal")) continue;
    out.set(path.slice(RECORDS.length, -".reveal".length), deps.fs.text(path) ?? "");
  }
  return out;
}

function parsed(text: string): Document {
  const record = parseRecord(text);
  if (!record.ok) throw new Error(`a Record does not parse: ${record.error.kind}`);
  return record.value.document;
}

function baselineOf(deps: MemoryDeps): Baseline {
  const decoded = decodeBaseline(deps.fs.text(`${PROV}/baseline.json`) ?? "");
  if (!decoded.ok) throw new Error(`baseline.json: ${decoded.error.kind}`);
  return decoded.value;
}

function documentOf(text: string, at: string): Document {
  const made = createDocument(text, at);
  if (!made.ok) throw new Error(made.error.kind);
  return made.value;
}

/** The starting texts of the scenario by digest: a Baseline_Entry's text is one of these. */
function textsBySha(deps: MemoryDeps, scenario: Scenario): Map<string, string> {
  return new Map(scenario.setup.map((f) => [deps.sha256(enc.encode(f.text)), f.text]));
}

/** The Records and the Baseline_File before the event, and the entries whose starting text cannot be found. */
type Snapshot = { records: Map<string, string>; baseline: Baseline; lost: Set<string> };

function snapshot(deps: MemoryDeps): Snapshot {
  const baseline = baselineOf(deps);
  const lost = new Set<string>();
  for (const [path, entry] of Object.entries(baseline.files)) {
    const cached = deps.fs.text(`${PROV}/cache/${entry.sha256}`) !== null;
    if (entry.blob === undefined && !cached) lost.add(path);
  }
  return { records: recordTexts(deps), baseline, lost };
}

type Before = { kind: "doc"; doc: Document } | { kind: "unavailable" } | { kind: "moved" };

/** What a path held before the event: its Record, its Baseline_Entry's text, a moved Record, or nothing. */
function beforeOf(
  deps: MemoryDeps,
  scenario: Scenario,
  path: string,
  before: Snapshot,
  after: Map<string, string>,
): Before {
  const record = before.records.get(path);
  if (record !== undefined) return { kind: "doc", doc: parsed(record) };
  const entry = before.baseline.files[path];
  if (entry !== undefined) {
    const text = textsBySha(deps, scenario).get(entry.sha256);
    if (before.lost.has(path)) return { kind: "unavailable" };
    if (text === undefined) throw new Error("an entry's text is not a starting text");
    return { kind: "doc", doc: documentOf(text, before.baseline.at) };
  }
  const now = after.get(path);
  const moved = [...before.records].some(([p, t]) => !after.has(p) && t === now);
  return moved ? { kind: "moved" } : { kind: "doc", doc: documentOf("", before.baseline.at) };
}

function count(doc: Document, old: Before, facts: EventFacts, seen: Seen): void {
  if (old.kind === "unavailable") seen.pst += 1;
  else if (facts.window === null) seen.hum += 1;
  seen.ai += cellsOf(doc).filter((c) => c.ts === facts.iso && c.origin === "AI").length;
}

/** The violations of Property 2 in the Records an event wrote, by path. */
function violations(
  deps: MemoryDeps,
  scenario: Scenario,
  before: Snapshot,
  facts: EventFacts,
  seen: Seen,
): string[] {
  const after = recordTexts(deps);
  const out: string[] = [];
  for (const [path, text] of after) {
    if (before.records.get(path) === text) continue;
    const old = beforeOf(deps, scenario, path, before, after);
    if (old.kind === "moved") continue;
    const doc = parsed(text);
    count(doc, old, facts, seen);
    const found =
      old.kind === "unavailable"
        ? unavailableProblems(doc, facts)
        : updateProblems(old.doc, doc, facts);
    out.push(...found.map((p) => `${path}: ${p}`));
  }
  return out;
}

/** Plays the scenario against the reference model; returns every violation with its event index. */
async function replay(scenario: Scenario, seen: Seen): Promise<string[]> {
  const { deps, tree: first } = seed(scenario);
  const model = newModel();
  const out: string[] = [];
  let tree = first;
  for (const [index, s] of scenario.steps.entries()) {
    tree = prepare(deps, scenario, tree, s);
    const before = snapshot(deps);
    const ms = deps.clock.nowMs() + s.event.gapMs;
    const window = step(model, s.event, ms);
    await fire(deps, s);
    const facts = { iso: new Date(ms).toISOString(), window };
    out.push(
      ...violations(deps, scenario, before, facts, seen).map((v) => `event ${String(index)}: ${v}`),
    );
  }
  return out;
}

describe("attribution properties _Requirements: 3.12, 3.21, 4.3, 4.4, 4.5, 4.10, 5.7, 5.8, 5.9, 16.3_", () => {
  // Property 2
  it("P2 attribution follows the windows and nothing else", async () => {
    const seen: Seen = { ai: 0, hum: 0, pst: 0 };
    await fc.assert(
      fc.asyncProperty(
        arbScenario({
          minSessions: 1,
          maxSessions: 3,
          allowNoId: true,
          trackings: ALL_TRACKINGS,
          dropState: false,
          maxChanges: 3,
        }),
        async (scenario) => {
          expect(await replay(scenario, seen)).toEqual([]);
        },
      ),
      { numRuns: runs(process.env) },
    );
    expect(seen.ai, "some run attributed text to a window").toBeGreaterThan(0);
    expect(seen.hum, "some run attributed text to no window").toBeGreaterThan(0);
    expect(seen.pst, "some run met a Baseline_Text that was not found").toBeGreaterThan(0);
  });
});
