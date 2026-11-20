import { parseRecord } from "@reveal-codes/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeBaseline } from "../src/core/baseline-codec.js";
import type { SessionState, WindowState } from "../src/core/types.js";
import { createStore } from "../src/io/store.js";
import { ALL_TRACKINGS, arbScenario } from "../src/testing/arbitraries.js";
import type { Scenario } from "../src/testing/arbitraries.js";
import { cellsOf } from "./support/attribution-check.js";
import { newModel, step } from "./support/attribution-model.js";
import { PROV } from "./support/event-harness.js";
import { runs } from "./support/fc.js";
import type { MemoryDeps } from "./support/memory-deps.js";
import { fire, prepare, seed } from "./support/scenario.js";

const RECORDS = `${PROV}/records/`;

type Seen = { crossed: number; inserted: number; otherOpen: number };

async function sessionsOf(deps: MemoryDeps): Promise<Record<string, SessionState>> {
  const read = await createStore(deps, PROV).readState();
  if (!read.ok) throw new Error(read.error.kind);
  const state: WindowState | null = read.value;
  return state === null ? {} : state.sessions;
}

async function countOf(deps: MemoryDeps): Promise<number> {
  const read = await createStore(deps, PROV).readSessions();
  if (!read.ok) throw new Error(read.error.kind);
  return read.value;
}

function recordTexts(deps: MemoryDeps): Map<string, string> {
  const out = new Map<string, string>();
  for (const path of deps.fs.files.keys()) {
    if (!path.startsWith(RECORDS) || !path.endsWith(".reveal")) continue;
    out.set(path.slice(RECORDS.length, -".reveal".length), deps.fs.text(path) ?? "");
  }
  return out;
}

/** Paths whose Baseline_Entry has no findable starting text: their Record is wholly PST (Property 14). */
function lostPaths(deps: MemoryDeps): Set<string> {
  const decoded = decodeBaseline(deps.fs.text(`${PROV}/baseline.json`) ?? "");
  if (!decoded.ok) throw new Error(decoded.error.kind);
  const lost = new Set<string>();
  for (const [path, e] of Object.entries(decoded.value.files)) {
    if (e.blob === undefined && deps.fs.text(`${PROV}/cache/${e.sha256}`) === null) lost.add(path);
  }
  return lost;
}

/** Everything the event wrote with its own time stamp, as `[origin, runId]`, by path. */
function inserted(deps: MemoryDeps, before: Map<string, string>, iso: string, skip: Set<string>) {
  const out: { path: string; origin: string; runId: string | undefined }[] = [];
  for (const [path, text] of recordTexts(deps)) {
    if (before.get(path) === text || skip.has(path)) continue;
    const record = parseRecord(text);
    if (!record.ok) throw new Error(`a Record does not parse: ${record.error.kind}`);
    for (const c of cellsOf(record.value.document)) {
      if (c.ts === iso) out.push({ path, origin: c.origin, runId: c.runId });
    }
  }
  return out;
}

function other(all: Record<string, SessionState>, key: string): Record<string, SessionState> {
  return Object.fromEntries(Object.entries(all).filter(([k]) => k !== key));
}

/** Plays the scenario against the model; returns every violation with its event index. */
async function replay(scenario: Scenario, seen: Seen): Promise<string[]> {
  const { deps, tree: first } = seed(scenario);
  const model = newModel();
  const out: string[] = [];
  let tree = first;
  for (const [index, s] of scenario.steps.entries()) {
    tree = prepare(deps, scenario, tree, s);
    const key = s.event.session ?? "_none";
    const sessionsBefore = await sessionsOf(deps);
    const recordsBefore = recordTexts(deps);
    const skip = lostPaths(deps);
    const countBefore = await countOf(deps);
    const ms = deps.clock.nowMs() + s.event.gapMs;
    const window = step(model, s.event, ms);
    await fire(deps, s);
    const at = `event ${String(index)} (${s.event.event} ${key})`;
    const sessionsAfter = await sessionsOf(deps);
    // Gaps are under 12 hours, so the sweep drops no entry: the others are equal as they were.
    const was = other(sessionsBefore, key);
    if (Object.values(was).some((e) => e.windows.length > 0)) seen.otherOpen += 1;
    if (JSON.stringify(other(sessionsAfter, key)) !== JSON.stringify(was)) {
      out.push(`${at}: another session's entry changed`);
    }
    if (window === null) continue;
    const found = inserted(deps, recordsBefore, new Date(ms).toISOString(), skip);
    seen.inserted += found.length;
    const own = (sessionsBefore[key]?.windows ?? []).some((w) => w.windowRun === window.name);
    if (!own) seen.crossed += 1;
    for (const f of found) {
      if (f.origin !== "AI" || !(f.runId ?? "").startsWith(`${window.name}.`)) {
        out.push(`${at}: ${f.path} got ${f.origin} ${String(f.runId)}, want AI ${window.name}.n`);
      }
    }
    if ((await countOf(deps)) !== countBefore) out.push(`${at}: a difference was Outside_Change`);
  }
  return out;
}

describe("sessions properties _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.21, 3.24, 16.18_", () => {
  // Property 5
  it("P5 sessions are independent", async () => {
    const seen: Seen = { crossed: 0, inserted: 0, otherOpen: 0 };
    await fc.assert(
      fc.asyncProperty(
        arbScenario({
          minSessions: 2,
          maxSessions: 2,
          allowNoId: false,
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
    expect(seen.otherOpen, "some event met another session with a window open").toBeGreaterThan(0);
    expect(seen.inserted, "some difference was inserted while a window was open").toBeGreaterThan(
      0,
    );
    expect(seen.crossed, "some difference went to another session's window").toBeGreaterThan(0);
  });
});
