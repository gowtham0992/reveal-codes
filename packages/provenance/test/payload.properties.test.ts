import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsePayload } from "../src/core/payload.js";
import type { Payload } from "../src/core/types.js";
import { arbPayloadCase, type ObjectPayloadCase } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

const EMPTY: Payload = {
  sessionId: null,
  cwd: null,
  taskName: null,
  specName: null,
  taskSuccess: null,
};

const KEYS = ["cwd", "sessionId", "specName", "taskName", "taskSuccess"];

function stringsOf(payload: Payload): string[] {
  return [payload.sessionId, payload.cwd, payload.taskName, payload.specName].filter(
    (s): s is string => s !== null,
  );
}

function expectedString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function checkObjectCase(c: ObjectPayloadCase): void {
  const result = parsePayload(c.withExtras);
  expect(Object.keys(result).sort()).toEqual(KEYS);
  // Extra fields have no influence on the result.
  expect(result).toEqual(parsePayload(c.withoutExtras));
  // No returned string contains a secret from prompt, tool_input or tool_response.
  for (const s of stringsOf(result)) {
    for (const secret of c.secrets) expect(s.includes(secret)).toBe(false);
  }
  // The four known string fields come through as given (empty session id gives null).
  const sid = expectedString(c.known["session_id"]);
  expect(result.sessionId).toBe(sid === "" ? null : sid);
  expect(result.cwd).toBe(expectedString(c.known["cwd"]));
  expect(result.taskName).toBe(expectedString(c.known["task_name"]));
  const success = c.known["task_success"];
  expect(result.taskSuccess).toBe(typeof success === "boolean" ? success : null);
  // spec_name keeps a directory name only: no separator, and it came from the input.
  if (result.specName !== null) {
    expect(result.specName).not.toMatch(/[\\/]/);
    expect(String(c.known["spec_name"])).toContain(result.specName);
  }
}

describe("payload properties _Requirements: 3.15, 3.16, 3.19_", () => {
  // Property 13
  it("P13 the payload keeps five fields and no prompt", () => {
    fc.assert(
      fc.property(arbPayloadCase, (c) => {
        if (c.kind === "empty") {
          expect(parsePayload(c.text)).toEqual(EMPTY);
        } else {
          checkObjectCase(c);
        }
      }),
      { numRuns: runs(process.env) },
    );
  });
});
