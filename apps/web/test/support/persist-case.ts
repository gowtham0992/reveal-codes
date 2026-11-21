import * as fc from "fast-check";
import {
  arbCheckedDocument,
  arbSavedEntries,
} from "../../../../packages/engine/src/testing/arbitraries";
import type { RunLogEntry } from "../../src/store";

export const arbRunLog: fc.Arbitrary<readonly RunLogEntry[]> = fc.array(
  fc.record({
    runId: fc.stringMatching(/^[a-z0-9]{1,6}$/),
    provider: fc.constantFrom("fixture", "anthropic"),
    modelId: fc.option(fc.constantFrom("m1", "m2"), { nil: null }),
    prompt: fc.string({ maxLength: 20 }),
    timestamp: fc.constant("2026-11-02T12:00:00.000Z"),
  }),
  { maxLength: 2 },
);

/** A checked Document with saved Display_Info entries, a Run_Log and a check date or null. */
export const arbPersistCase = arbCheckedDocument.chain(({ document }) =>
  fc.record({
    document: fc.constant(document),
    saved: arbSavedEntries(document),
    runLog: arbRunLog,
    verifiedAt: fc.option(fc.constant("2026-11-20T18:25:00.000Z"), { nil: null }),
  }),
);
