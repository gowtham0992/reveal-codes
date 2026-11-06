/**
 * Property 7 counterexample (seed 1330162038, path
 * "379:807:0:4:10:13:16:19:21:23:24:25:25:25:25:25:25:25:25"), found
 * 2026-11-05, as its minimal public-API reproduction (design A4, Req 6.9).
 * Run `r` sits at 1/10 after a HUM delete at the default threshold. An AI
 * Replace under `r` at threshold 0.05 relabels `r` in its delete step, but
 * its insert grows Original_Length to 22, so 1/22 is under 0.05 and a single
 * relabel after both steps would miss the crossing.
 */
import { createDocument } from "../../src/document";
import type { Document, EngineConfig, Replace } from "../../src/types";
import { applied } from "./replace-model";

const T0 = "2026-11-03T10:00:00Z";
const T1 = "2026-11-03T10:05:00Z";

/** The Document before the Replace, the Replace, and its config. */
export function p7Seed1330162038(): {
  readonly doc: Document;
  readonly op: Replace;
  readonly config: EngineConfig;
} {
  const created = createDocument("XXXX", T0);
  if (!created.ok) throw new Error("fixture: createDocument failed");
  const provenance = { origin: "AI", runId: "r", timestamp: T1 } as const;
  const withAi = applied(created.value, { kind: "insert", at: 4, text: "abcdefghij", provenance });
  const doc = applied(withAi, { kind: "delete", from: 5, to: 6, actor: "HUM" });
  const op: Replace = { kind: "replace", from: 0, to: 2, text: "ABCDEFGHIJKL", provenance };
  return { doc, op, config: { relabelThreshold: 0.05 } };
}
