import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lookupWithInfo, missingLines } from "../src/lookup";
import type { LookupInfo } from "../src/lookup";
import { verifierStatus } from "../src/status";
import { arbMissingCase, makeRig } from "./support/arb-missing-lines";
import type { MissingCase } from "./support/arb-missing-lines";
import { runs } from "./support/fc";

function plain(o: LookupInfo): unknown {
  return { results: [...o.results.entries()], info: [...o.info.entries()] };
}

async function check(c: MissingCase): Promise<void> {
  const a = makeRig(c);
  const storeBefore = a.store.contents();
  const countersBefore = verifierStatus(a.deps).counters;
  const missing = await missingLines(c.records, a.deps);
  // Clause 2: missingLines writes nothing and bumps no counter.
  expect(a.store.contents()).toEqual(storeBefore);
  expect(verifierStatus(a.deps).counters).toEqual(countersBefore);
  expect(a.sent.sentLines()).toEqual([]);
  const withPeek = await lookupWithInfo(c.records, a.deps);
  // Clause 1: the same lines, as a set, and empty exactly when nothing is sent.
  const sent = a.sent.sentLines();
  expect(new Set(missing)).toEqual(new Set(sent));
  expect(missing.length === 0).toBe(sent.length === 0);
  // Clause 3: the lookup result does not depend on missingLines having run.
  const b = makeRig(c);
  expect(plain(await lookupWithInfo(c.records, b.deps))).toEqual(plain(withPeek));
}

// Property 5
describe("Property 5: missing lines agree with the lookup _Requirements: 24.7, 24.8, 24.9, 24.14_", () => {
  it("missingLines equals the lines lookupWithInfo sends, writes nothing, and changes no result", async () => {
    await fc.assert(fc.asyncProperty(arbMissingCase, check), { numRuns: runs() });
  });
});
