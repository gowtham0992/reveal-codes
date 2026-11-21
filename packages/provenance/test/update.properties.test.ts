import fc from "fast-check";
import { apply, createDocument, renderRecord, type Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { diffLines } from "../src/core/diff.js";
import { commonAffixes, slideStretch, trimHunks, widenToLines } from "../src/core/trim.js";
import { updateRecord } from "../src/core/update.js";
import { arbAgentThenOutside } from "../src/testing/arbitraries.js";
import { fixedClock } from "./support/clock.js";
import { runs } from "./support/fc.js";

const W = { windowRun: "turn 2026-11-19T10:00:00Z" };
const AT = "2026-01-01T00:00:00.000Z";

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

/** The Engine applied directly: whole-text trim widened to lines, line diff of the middle, one `replace` per trimmed Hunk, highest offset first, no config. */
function engineDirect(doc: Document, fileText: string, timestamp: string): Document {
  const old = doc.text;
  const slid = slideStretch(old, fileText, commonAffixes(old, fileText));
  const { prefix: p, suffix: s } = widenToLines(old, fileText, slid);
  const middle = diffLines(old.slice(p, old.length - s), fileText.slice(p, fileText.length - s));
  const hunks = trimHunks(
    old,
    middle.map((h) => ({ from: h.from + p, to: h.to + p, text: h.text })),
  );
  return [...hunks].reverse().reduce((current, h) => {
    const op = {
      kind: "replace" as const,
      from: h.from,
      to: h.to,
      text: h.text,
      provenance: { origin: "HUM" as const, timestamp },
    };
    return must(apply(current, op)).document;
  }, doc);
}

describe("update properties _Requirements: 4.6, 4.7, 4.8, 4.9, 16.4_", () => {
  // Property 3
  it("P3 changed agent text goes through the Engine and only the Engine", () => {
    fc.assert(
      fc.property(arbAgentThenOutside, ({ base, agent, outside }) => {
        const clock = fixedClock();
        const start = must(updateRecord(must(createDocument(base, AT)), agent, "AI", W, clock));
        expect(start.spans.some((s) => s.provenance.origin === "AI")).toBe(true);
        let recorded = start;
        let direct = start;
        for (const fileText of outside) {
          recorded = must(updateRecord(recorded, fileText, "HUM", null, clock));
          direct = engineDirect(direct, fileText, clock.nowIso());
          expect(recorded.text).toBe(fileText);
          expect(renderRecord(recorded, null, "full").text).toBe(
            renderRecord(direct, null, "full").text,
          );
          expect(recorded).toEqual(direct);
          for (const span of recorded.spans) {
            if (span.provenance.origin !== "AI>HUM") continue;
            const run = recorded.runs.find((r) => r.runId === span.provenance.runId);
            expect(run?.relabelled).toBe(true);
          }
        }
      }),
      { numRuns: runs(process.env) },
    );
  });
});
