import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decodeSessions,
  decodeState,
  encodeSessions,
  encodeState,
} from "../src/core/state-codec.js";
import { arbSessionsCount, arbWindowState } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

describe("state-codec properties _Requirements: 3.17, 3.27, 5.16_", () => {
  // Property 9
  it("P9 the window state round-trips", () => {
    fc.assert(
      fc.property(
        arbWindowState,
        arbSessionsCount,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.string({ maxLength: 40 }),
        (state, n, fraction, junk) => {
          // decodeState(encodeState(s)) equals s, and the same state gives the same bytes.
          const text = encodeState(state);
          const decoded = decodeState(text);
          expect(decoded.ok).toBe(true);
          if (decoded.ok) {
            expect(decoded.value).toEqual(state);
            expect(encodeState(decoded.value)).toBe(text);
          }

          // decodeSessions(encodeSessions(n)) equals n.
          const sessions = decodeSessions(encodeSessions(n));
          expect(sessions.ok).toBe(true);
          if (sessions.ok) expect(sessions.value).toBe(n);

          // Text that is not a valid encoding is an error value: a truncation that drops
          // at least the closing brace is not JSON, and neither is a prefix of junk.
          const stateBody = text.trimEnd();
          const stateCut = stateBody.slice(0, Math.floor(fraction * (stateBody.length - 1)));
          expect(decodeState(stateCut).ok).toBe(false);
          const sessionsBody = encodeSessions(n).trimEnd();
          const sessionsCut = sessionsBody.slice(
            0,
            Math.floor(fraction * (sessionsBody.length - 1)),
          );
          expect(decodeSessions(sessionsCut).ok).toBe(false);
          expect(decodeState(`{${junk}`).ok).toBe(false);
          expect(decodeSessions(`{${junk}`).ok).toBe(false);

          // A valid encoding with a wrong version, or a sessions count that is negative
          // or fractional, is an error value.
          expect(decodeState(text.replace('"version": 1', '"version": 2')).ok).toBe(false);
          expect(
            decodeSessions(`{ "version": 1, "noPromptEventSessions": -${String(n + 1)} }`).ok,
          ).toBe(false);
          expect(
            decodeSessions(`{ "version": 1, "noPromptEventSessions": ${String(n)}.5 }`).ok,
          ).toBe(false);
        },
      ),
      { numRuns: runs(process.env) },
    );
  });
});
