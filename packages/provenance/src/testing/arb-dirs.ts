// Baseline part filled in by task 4.10, state part by task 4.12, directory part by task 5.8.
import fc from "fast-check";
import type {
  Baseline,
  BaselineEntry,
  ClosedBy,
  FileCache,
  OpenWindow,
  SessionState,
  SkippedFile,
  WindowState,
} from "../core/types.js";
import { arbEvents } from "./arb-windows.js";
import type { EventOptions, GenEvent } from "./arb-windows.js";
import { arbFileText, arbLine, arbPath } from "./arb-text.js";

const HEX = "0123456789abcdef".split("");
const hexOf = (length: number): fc.Arbitrary<string> =>
  fc
    .array(fc.constantFrom(...HEX), { minLength: length, maxLength: length })
    .map((c) => c.join(""));

/** A SHA-256 digest: 64 lowercase hex characters. */
export const arbSha256: fc.Arbitrary<string> = hexOf(64);

/** A Blob_Id: 40 or 64 lowercase hex characters. */
export const arbBlobId: fc.Arbitrary<string> = fc.oneof(hexOf(40), hexOf(64));

/** A Baseline_Entry; `blob` is present for some entries and absent for others. */
export const arbBaselineEntry: fc.Arbitrary<BaselineEntry> = fc
  .tuple(arbSha256, fc.option(arbBlobId, { nil: undefined }))
  .map(([sha256, blob]) => (blob === undefined ? { sha256 } : { sha256, blob }));

/** Characters that stress JSON quoting and UTF-16 code unit order against code point order. */
const TAIL = fc.constantFrom('"', "\\", "\u{1F600}", "\u{10000}", "\uFF5E", "\uFFFF", "\u00e9");

/** A path from `arbPath`, often with one extra character that quotes or orders unusually. */
export const arbBaselinePath: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: arbPath },
  {
    weight: 1,
    arbitrary: fc.tuple(arbPath, TAIL).map(([path, tail]) => `${path}${tail}`),
  },
);

const two = (n: number): string => String(n).padStart(2, "0");

/** A valid `at`: an ISO 8601 UTC time with seconds, ending in `Z`. */
export const arbBaselineAt: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
  )
  .map(
    ([y, mo, d, h, mi, s]) => `${String(y)}-${two(mo)}-${two(d)}T${two(h)}:${two(mi)}:${two(s)}Z`,
  );

/** A set of Baseline_Entries as `[path, entry]` pairs with distinct paths, in one insertion order. */
const arbBaselinePairs: fc.Arbitrary<[string, BaselineEntry][]> = fc.uniqueArray(
  fc.tuple(arbBaselinePath, arbBaselineEntry),
  { maxLength: 8, selector: ([path]) => path },
);

const build = (at: string, pairs: readonly (readonly [string, BaselineEntry])[]): Baseline => ({
  version: 1,
  at,
  files: Object.fromEntries(pairs),
});

/** A Baseline of zero to eight files. */
export const arbBaseline: fc.Arbitrary<Baseline> = fc
  .tuple(arbBaselineAt, arbBaselinePairs)
  .map(([at, pairs]) => build(at, pairs));

/** Two Baselines holding the same set, built from the same pairs in two different insertion orders. */
export const arbBaselineTwoOrders: fc.Arbitrary<{ first: Baseline; second: Baseline }> = fc
  .tuple(arbBaselineAt, arbBaselinePairs)
  .chain(([at, pairs]) =>
    fc
      .shuffledSubarray(pairs, { minLength: pairs.length, maxLength: pairs.length })
      .map((shuffled) => ({ first: build(at, pairs), second: build(at, shuffled) })),
  );

// State part (task 4.12): valid WindowState values for Property 9.

/** A count: a non-negative integer. */
const arbCount: fc.Arbitrary<number> = fc.integer({ min: 0, max: 1_000_000 });

/** A non-negative finite number, often fractional, never `-0` (JSON writes `-0` as `0`). */
const arbMs: fc.Arbitrary<number> = fc
  .oneof(
    fc.integer({ min: 0, max: 2_000_000_000_000 }),
    fc.double({ min: 0, max: 1e13, noNaN: true }),
  )
  .map((n) => n + 0);

/** Free text for labels and window runs, including quotes, backslashes and lone surrogates. */
const arbFree: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 16 }),
  fc.string({ unit: "binary", maxLength: 8 }),
);

/** A map key (a Session_Key or a path), sometimes one that is special to objects. */
const arbMapKey: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: arbBaselinePath },
  { weight: 1, arbitrary: fc.constantFrom("__proto__", "constructor", "toString", "") },
);

export const arbOpenWindow: fc.Arbitrary<OpenWindow> = fc
  .tuple(
    arbFree,
    arbFree,
    fc.option(fc.string({ maxLength: 6 }), { nil: null }),
    fc.constantFrom<"turn" | "task">("turn", "task"),
    arbBaselineAt,
    arbCount,
    fc.option(arbFree, { nil: undefined }),
    fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: undefined }),
  )
  .map(([windowRun, label, taskNumber, kind, openedAt, order, spec, taskName]) => {
    const base: OpenWindow = { windowRun, label, taskNumber, kind, openedAt, order };
    const withSpec = spec === undefined ? base : { ...base, spec };
    return taskName === undefined ? withSpec : { ...withSpec, taskName };
  });

export const arbClosedBy: fc.Arbitrary<ClosedBy | null> = fc.constantFrom<ClosedBy | null>(
  "postTask",
  "agentStop",
  "sweep",
  "leftover",
  null,
);

/** A session entry; the stack may be empty. */
export const arbSessionState: fc.Arbitrary<SessionState> = fc
  .tuple(
    arbBaselineAt,
    arbClosedBy,
    fc.boolean(),
    fc.boolean(),
    fc.array(arbOpenWindow, { maxLength: 3 }),
  )
  .map(([lastEventAt, lastClosedBy, promptSeen, noPromptCounted, windows]) => ({
    lastEventAt,
    lastClosedBy,
    promptSeen,
    noPromptCounted,
    windows,
  }));

export const arbFileCache: fc.Arbitrary<FileCache> = fc
  .tuple(arbCount, arbMs, arbSha256, arbMs)
  .map(([size, mtimeMs, digest, seenMs]) => ({ size, mtimeMs, digest, seenMs }));

export const arbSkippedFile: fc.Arbitrary<SkippedFile> = fc
  .tuple(arbCount, arbMs)
  .map(([size, mtimeMs]) => ({ size, mtimeMs, reason: "over_limit" as const }));

const arbRecord = <T>(value: fc.Arbitrary<T>): fc.Arbitrary<Record<string, T>> =>
  fc
    .uniqueArray(fc.tuple(arbMapKey, value), { maxLength: 4, selector: ([key]) => key })
    .map((pairs) => Object.fromEntries(pairs));

/** A valid WindowState: any mix of sessions, hints and skipped entries, every flag. */
export const arbWindowState: fc.Arbitrary<WindowState> = fc
  .tuple(
    arbCount,
    fc.option(arbFree, { nil: null }),
    fc.option(arbBaselineAt, { nil: null }),
    fc.option(arbBaselineAt, { nil: undefined }),
    arbMs,
    fc.boolean(),
    arbRecord(arbSessionState),
    arbRecord(arbFileCache),
    arbRecord(arbSkippedFile),
  )
  .map(
    ([
      order,
      lastWindowRun,
      lastEventAt,
      lastHookEventAt,
      recordedAtMs,
      noSessionIdLogged,
      sessions,
      files,
      skipped,
    ]) => ({
      version: 1 as const,
      order,
      lastWindowRun,
      lastEventAt,
      ...(lastHookEventAt === undefined ? {} : { lastHookEventAt }),
      recordedAtMs,
      noSessionIdLogged,
      sessions,
      files,
      skipped,
    }),
  );

/** A count for `sessions.json`. */
export const arbSessionsCount: fc.Arbitrary<number> = arbCount;

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
