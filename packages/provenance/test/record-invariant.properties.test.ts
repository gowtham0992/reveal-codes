import { parseRecord } from "@reveal-codes/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeBaseline } from "../src/core/baseline-codec.js";
import { ALL_TRACKINGS, arbScenario } from "../src/testing/arbitraries.js";
import { PROV } from "./support/event-harness.js";
import { runs } from "./support/fc.js";
import type { MemoryDeps } from "./support/memory-deps.js";
import { playScenario } from "./support/scenario.js";
import type { Tree } from "./support/scenario.js";

const enc = new TextEncoder();

/** The Baseline_Entry digests by path, read from `baseline.json` as the Recorder left it. */
function entryDigests(deps: MemoryDeps): Map<string, string> {
  const text = deps.fs.text(`${PROV}/baseline.json`);
  if (text === null) throw new Error("baseline.json is missing");
  const decoded = decodeBaseline(text);
  if (!decoded.ok) throw new Error(`baseline.json: ${decoded.error.kind}`);
  return new Map(Object.entries(decoded.value.files).map(([p, e]) => [p, e.sha256]));
}

/** For each file of the tree: a Record that parses to the file text, or no Record and an entry of its digest; never both. */
function expectRecordOrBaseline(deps: MemoryDeps, tree: Tree): void {
  const entries = entryDigests(deps);
  for (const [path, text] of tree) {
    const record = deps.fs.text(`${PROV}/records/${path}.reveal`);
    if (record !== null) {
      const parsed = parseRecord(record);
      expect(parsed.ok, `${path}: the Record parses`).toBe(true);
      if (parsed.ok) expect(parsed.value.document.text, `${path}: Record text`).toBe(text);
      expect(entries.has(path), `${path}: a Record and an entry`).toBe(false);
    } else {
      expect(entries.get(path), `${path}: no Record, so an entry of the file's digest`).toBe(
        deps.sha256(enc.encode(text)),
      );
    }
  }
}

describe("record invariant properties _Requirements: 4.1, 4.2, 5.1, 5.2, 5.5, 5.6, 5.7, 5.15, 5.16, 16.2_", () => {
  // Property 1
  it("P1 the record or the baseline is the file", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbScenario({
          minSessions: 1,
          maxSessions: 3,
          allowNoId: true,
          trackings: ALL_TRACKINGS,
          dropState: true,
          maxChanges: 3,
        }),
        async (scenario) => {
          await playScenario(scenario, (deps, tree) => {
            expectRecordOrBaseline(deps, tree);
          });
        },
      ),
      { numRuns: runs(process.env) },
    );
  });
});
