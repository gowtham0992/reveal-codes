import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALL_TRACKINGS, arbScenario } from "../src/testing/arbitraries.js";
import type { Scenario } from "../src/testing/arbitraries.js";
import { PROV } from "./support/event-harness.js";
import { runs } from "./support/fc.js";
import type { MemoryDeps } from "./support/memory-deps.js";
import { fire, prepare, seed } from "./support/scenario.js";

const EXCLUDED = new Set([`${PROV}/state.json`, `${PROV}/errors.log`]);

/** Every file under the Record_Directory except `state.json` and `errors.log`, by path, as text. */
function kept(deps: MemoryDeps): Map<string, string> {
  const out = new Map<string, string>();
  for (const path of deps.fs.files.keys()) {
    if (!path.startsWith(`${PROV}/`) || EXCLUDED.has(path)) continue;
    out.set(path, deps.fs.text(path) ?? "");
  }
  return out;
}

/** The paths, in order, whose bytes differ between two snapshots (a missing file counts as a difference). */
function differences(a: Map<string, string>, b: Map<string, string>): string[] {
  const paths = new Set([...a.keys(), ...b.keys()]);
  return [...paths].filter((p) => a.get(p) !== b.get(p)).sort();
}

type Seen = { events: number; counted: number };

/** Runs each event twice with no file change between the runs; returns what the second run changed. */
async function replay(scenario: Scenario, seen: Seen): Promise<string[]> {
  const { deps, tree: first } = seed(scenario);
  const out: string[] = [];
  let tree = first;
  for (const [index, step] of scenario.steps.entries()) {
    tree = prepare(deps, scenario, tree, step);
    await fire(deps, step);
    const once = kept(deps);
    await fire(deps, step);
    seen.events += 1;
    if (/"noPromptEventSessions":\s*[1-9]/.test(once.get(`${PROV}/sessions.json`) ?? ""))
      seen.counted += 1;
    for (const p of differences(once, kept(deps))) out.push(`event ${String(index)}: ${p}`);
  }
  return out;
}

describe("idempotence properties _Requirements: 3.26, 3.27, 5.15, 6.2, 6.3, 6.7, 16.5_", () => {
  // Property 4
  it("P4 running the same event again with no file change changes only state.json and errors.log", async () => {
    const seen: Seen = { events: 0, counted: 0 };
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
    expect(seen.events, "events were repeated").toBeGreaterThan(0);
    expect(seen.counted, "some repeated event followed a counted session").toBeGreaterThan(0);
  });
});
