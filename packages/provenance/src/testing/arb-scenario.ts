// Directory part (moved from arb-dirs.ts to keep each module under 300 lines).
import fc from "fast-check";
import { arbEvents } from "./arb-windows.js";
import type { EventOptions, GenEvent } from "./arb-windows.js";
import { arbFileText, arbLine, arbPath } from "./arb-text.js";

// Directory part (task 5.8): a Record_Directory, file changes and event steps for Properties 1, 2, 4, 5, 14 and 16.

/** How a starting file is known to the Record_Directory. `entry-*` says where its starting text can be found. */
export type Tracking = "entry-blob" | "entry-cache" | "entry-none" | "record" | "untracked";

export const ALL_TRACKINGS: readonly Tracking[] = [
  "entry-blob",
  "entry-cache",
  "entry-none",
  "record",
  "untracked",
];

/** A file that exists before the first event, named by its index in the pool. */
export type SetupFile = { at: number; text: string; tracking: Tracking };

/** A change of the working tree between two events; `at`, `from` and `to` are pool indices. */
export type FileChange =
  | { kind: "set"; at: number; text: string }
  | { kind: "clear"; at: number }
  | { kind: "prepend"; at: number; text: string }
  | { kind: "append"; at: number; text: string }
  | { kind: "delete"; at: number }
  | { kind: "rename"; from: number; to: number };

/** One event, the changes made just before it, and whether `state.json` is removed first. */
export type Step = { event: GenEvent; changes: FileChange[]; dropState: boolean };

export type Scenario = { pool: string[]; setup: SetupFile[]; steps: Step[] };

export type ScenarioOptions = EventOptions & {
  /** The ways a starting file may be tracked. */
  trackings: readonly Tracking[];
  /** When false, `dropState` is always false (Property 16 keeps `state.json`). */
  dropState: boolean;
  maxChanges: number;
};

export const POOL_SIZE = 4;

/** True when no path is, or lies under, another (so a file never needs a directory of the same name). */
const independent = (paths: readonly string[]): boolean =>
  paths.every((a, i) => paths.every((b, j) => i === j || (a !== b && !b.startsWith(`${a}/`))));

/** Four workspace paths of which none is a directory of another. */
export const arbPool: fc.Arbitrary<string[]> = fc
  .array(arbPath, { minLength: POOL_SIZE, maxLength: POOL_SIZE })
  .filter(independent);

const arbIndex = fc.integer({ min: 0, max: POOL_SIZE - 1 });

/** Zero to three starting files at distinct pool indices. */
export const arbSetup = (trackings: readonly Tracking[]): fc.Arbitrary<SetupFile[]> =>
  fc
    .uniqueArray(fc.tuple(arbIndex, arbFileText, fc.constantFrom(...trackings)), {
      maxLength: 3,
      selector: ([at]) => at,
    })
    .map((rows) => rows.map(([at, text, tracking]) => ({ at, text, tracking })));

/** Appeared, emptied, edited at either end, deleted and renamed files. */
export const arbChange: fc.Arbitrary<FileChange> = fc.oneof(
  fc.tuple(arbIndex, arbFileText).map(([at, text]) => ({ kind: "set" as const, at, text })),
  arbIndex.map((at) => ({ kind: "clear" as const, at })),
  fc
    .tuple(arbIndex, arbLine)
    .map(([at, text]) => ({ kind: "prepend" as const, at, text: `${text}\n` })),
  fc
    .tuple(arbIndex, arbLine)
    .map(([at, text]) => ({ kind: "append" as const, at, text: `\n${text}` })),
  arbIndex.map((at) => ({ kind: "delete" as const, at })),
  fc.tuple(arbIndex, arbIndex).map(([from, to]) => ({ kind: "rename" as const, from, to })),
);

/** The file texts by path after `change`; a rename of a missing file or onto an existing one does nothing. */
export function applyChange(
  files: ReadonlyMap<string, string>,
  pool: readonly string[],
  change: FileChange,
): Map<string, string> {
  const next = new Map(files);
  const path = (i: number): string => pool[i] ?? "";
  if (change.kind === "rename") {
    const text = files.get(path(change.from));
    if (text === undefined || files.has(path(change.to))) return next;
    next.delete(path(change.from));
    next.set(path(change.to), text);
    return next;
  }
  const old = files.get(path(change.at)) ?? "";
  if (change.kind === "delete") next.delete(path(change.at));
  else if (change.kind === "set") next.set(path(change.at), change.text);
  else if (change.kind === "clear") next.set(path(change.at), "");
  else if (change.kind === "prepend") next.set(path(change.at), change.text + old);
  else next.set(path(change.at), old + change.text);
  return next;
}

/**
 * A pool, a Record_Directory's starting files (each with its Baseline_Entry, Record or neither;
 * an entry's starting text is in the object store, only in the cache, or nowhere), and events with
 * the file changes made before each.
 */
export function arbScenario(options: ScenarioOptions): fc.Arbitrary<Scenario> {
  const arbStep = (event: GenEvent): fc.Arbitrary<Step> =>
    fc
      .tuple(
        fc.array(arbChange, { maxLength: options.maxChanges }),
        options.dropState ? fc.boolean() : fc.constant(false),
      )
      .map(([changes, dropState]) => ({ event, changes, dropState }));
  return fc
    .tuple(arbPool, arbSetup(options.trackings), arbEvents(options))
    .chain(([pool, setup, events]) =>
      fc.tuple(...events.map(arbStep)).map((steps) => ({ pool, setup, steps })),
    );
}
