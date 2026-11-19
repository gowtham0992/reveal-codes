/**
 * Hunks into Engine operations (design M2, Req 4.3 to 4.9). One `replace` per
 * Hunk, from the highest offset to the lowest. Every Hunk that inserts text
 * is its own Run, numbered in ascending offset order. No `relabelThreshold`
 * exists here, so the Engine's default decides. Pure; no `node:`.
 */
import type { Document, Replace } from "@reveal-codes/engine";
import { runId } from "./label.js";
import type { Hunk } from "./types.js";
/** An injected clock; the Recorder reads it once for each event. */
export type Clock = { nowIso: () => string };
/** The origin of a change: the agent's (`AI`) or an Outside_Change's (`HUM`). Never `AI>HUM`. */
export type ChangeOrigin = "AI" | "HUM";
/** The Window_Run that an Agent_Change belongs to. */
export type WindowRef = { windowRun: string };
const DIGITS = /^[0-9]+$/;
/** The Hunk numbers that the Run table already holds for `windowRun`, in table order. */
export function existingRunNumbers(doc: Document, windowRun: string): number[] {
  const prefix = windowRun + ".";
  const out: number[] = [];
  for (const run of doc.runs) {
    if (!run.runId.startsWith(prefix)) continue;
    const tail = run.runId.slice(prefix.length);
    if (DIGITS.test(tail)) out.push(Number(tail));
  }
  return out;
}
function provenanceFor(
  origin: ChangeOrigin,
  windowRun: string,
  number: number,
  timestamp: string,
): Replace["provenance"] {
  if (origin === "HUM") return { origin: "HUM", timestamp };
  return { origin: "AI", runId: runId(windowRun, number), timestamp };
}
/**
 * The `replace` operations for `hunks`, highest offset first. Hunks with text
 * take `highest + 1`, `+ 2`, and so on in ascending offset order; a delete-only
 * Hunk takes no number and carries Run number 0, which the Engine ignores
 * (no text is inserted) and `checkProvenance` needs for an `AI` origin.
 * `windowRun` is unused for `HUM`.
 */
export function planHunks(
  hunks: readonly Hunk[],
  origin: ChangeOrigin,
  windowRun: string,
  existing: readonly number[],
  clock: Clock,
): Replace[] {
  const timestamp = clock.nowIso();
  let next = existing.reduce((a, b) => Math.max(a, b), 0);
  const ascending = [...hunks].sort((a, b) => a.from - b.from);
  const ops = ascending.map((h): Replace => {
    const number = h.text === "" ? 0 : ++next;
    const provenance = provenanceFor(origin, windowRun, number, timestamp);
    return { kind: "replace", from: h.from, to: h.to, text: h.text, provenance };
  });
  return ops.reverse();
}
