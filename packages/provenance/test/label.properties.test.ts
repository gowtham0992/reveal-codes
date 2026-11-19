import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseRunId, parseTaskName, runId, windowRunName } from "../src/core/label.js";
import { LABEL_MAX } from "../src/core/limits.js";
import {
  arbCollisionCount,
  arbHunkNumber,
  arbOtherTakenNames,
  arbRunTime,
  arbTaskName,
} from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

/** Names already in use: the base name and its `~2`.. forms (`collisions` of them), plus others. */
function takenNames(base: string, collisions: number, others: readonly string[]): string[] {
  const used = Array.from({ length: collisions }, (_, i) =>
    i === 0 ? base : `${base}~${String(i + 1)}`,
  );
  return [...others, ...used];
}

const NUMBER_PATTERN = /^\d+(\.\d+)*$/u;
const NUMBER_START = /^\d+(\.\d+)*\.? /u;
const CONTROL = /\p{Cc}/u;

describe("label properties _Requirements: 3.11, 3.12, 3.13, 3.14, 10.6, 10.11_", () => {
  // Property 10
  it("P10 run names round-trip", () => {
    fc.assert(
      fc.property(
        arbTaskName,
        arbRunTime,
        arbCollisionCount,
        arbOtherTakenNames,
        arbHunkNumber,
        (taskName, time, collisions, others, n) => {
          const { taskNumber, title } = parseTaskName(taskName);
          const base = windowRunName(taskNumber, title, time, []);
          const taken = takenNames(base, collisions, others);
          const name = windowRunName(taskNumber, title, time, taken);
          const id = runId(name, n);
          const suffix = collisions === 0 ? null : collisions + 1;

          // The name is new among those taken, and the Run_Id reads back whole.
          expect(taken).not.toContain(name);
          expect(parseRunId(id)).toEqual({ taskNumber, title, time, suffix, n });

          // The Run_Id is the Task_Number, the cleaned title, the time, the suffix and n, nothing else.
          const head = taskNumber === null ? "" : `${taskNumber} `;
          const tail = suffix === null ? "" : `~${String(suffix)}`;
          expect(id).toBe(`${head}${title} ${time}${tail}.${String(n)}`);

          // Shape of the label.
          if (taskNumber !== null) expect(taskNumber).toMatch(NUMBER_PATTERN);
          expect(Array.from(title).length).toBeLessThanOrEqual(LABEL_MAX);
          expect(title).not.toMatch(CONTROL);
          expect(title).not.toContain("  ");
          expect(title).toBe(title.trim());
          if (taskNumber === null) expect(title).not.toMatch(NUMBER_START);
        },
      ),
      { numRuns: runs(process.env) },
    );
  });
});
