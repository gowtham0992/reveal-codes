import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALL_TRACKINGS, arbScenario } from "../src/testing/arbitraries.js";
import type { Scenario } from "../src/testing/arbitraries.js";
import { newModel, step } from "./support/attribution-model.js";
import { PROV, logLines, sessionCount, stateOf } from "./support/event-harness.js";
import { runs } from "./support/fc.js";
import type { MemoryDeps } from "./support/memory-deps.js";
import { fire, prepare, seed } from "./support/scenario.js";
import type { Tree } from "./support/scenario.js";
const NEW_TALLY: Tally = { promptSeen: false, counted: false, stopped: false };
const NO_PROMPT = "agentStop - no_prompt_events";
/** What the property saw, so that a run in which nothing was counted cannot pass unnoticed. */
type Seen = {
  counted: number;
  quiet: number;
  rerunCounted: number;
  /** Second or later `agentStop` of a session with a prompt, after outside changes, not counted. */
  promptStopOutside: number;
};
/** What the oracle knows about one session: whether a prompt event came, and whether it was counted. */
type Tally = { promptSeen: boolean; counted: boolean; stopped: boolean };
/** The texts of the files the Recorder has taken in so far, by path (the oracle's own bookkeeping). */
type Known = ReadonlyMap<string, string>;
const countOf = (texts: readonly string[], text: string): number =>
  texts.filter((t) => t === text).length;
/** A gone file and an appeared file form a rename when exactly one of each has this non-empty text. */
const isRename = (gone: readonly string[], appeared: readonly string[], text: string): boolean =>
  text !== "" && countOf(gone, text) === 1 && countOf(appeared, text) === 1;
/**
 * Whether the working tree differs from what was known by an Outside_Change: a file whose text
 * changed, or a non-empty file that appeared and is not the one rename of a gone file
 * (Requirement 5, criteria 11 to 13). A deleted file and an empty new file change no text. The
 * first change of a file whose starting text is lost is attributed to no one (Requirement 5,
 * criterion 7), so it is not an Outside_Change.
 */
function hasDifference(known: Known, lost: ReadonlySet<string>, tree: Tree): boolean {
  const gone = [...known].filter(([p]) => !tree.has(p)).map(([, t]) => t);
  const appeared = [...tree].filter(([p]) => !known.has(p)).map(([, t]) => t);
  const changed = [...tree].some(([p, t]) => known.has(p) && known.get(p) !== t && !lost.has(p));
  return changed || appeared.some((t) => t !== "" && !isRename(gone, appeared, t));
}
/** The paths whose Baseline_Entry still has lost starting text after the tree became `tree`. */
function nextLost(known: Known, lost: ReadonlySet<string>, tree: Tree): Set<string> {
  const gone = [...known].filter(([p]) => !tree.has(p)).map(([, t]) => t);
  const appeared = [...tree].filter(([p]) => !known.has(p));
  const texts = appeared.map(([, t]) => t);
  const out = new Set<string>();
  for (const p of lost) {
    const was = known.get(p) ?? "";
    if (tree.get(p) === was) out.add(p);
    else if (!tree.has(p) && isRename(gone, texts, was)) {
      const to = appeared.find(([, t]) => t === was);
      if (to !== undefined) out.add(to[0]);
    }
  }
  return out;
}
/**
 * The paths whose starting text the Recorder cannot find (Requirement 5, criteria 5 and 7). The
 * Baseline_Cache is named by digest, so an entry that has no Blob_Id and no cache file of its own
 * still finds its text when another entry with the same text has one; such a path is not lost.
 */
function startLost(scenario: Scenario): Set<string> {
  const cached = new Set(
    scenario.setup.filter((f) => f.tracking === "entry-cache").map((f) => f.text),
  );
  return new Set(
    scenario.setup
      .filter((f) => f.tracking === "entry-none" && !cached.has(f.text))
      .map((f) => scenario.pool[f.at] ?? ""),
  );
}
function startKnown(scenario: Scenario): Known {
  return new Map(
    scenario.setup
      .filter((f) => f.tracking !== "untracked")
      .map((f) => [scenario.pool[f.at] ?? "", f.text]),
  );
}
const noPromptLines = (deps: MemoryDeps): number =>
  logLines(deps).filter((l) => l === NO_PROMPT).length;
/** The Session_Keys whose entry in `state.json` has `noPromptCounted`. */
async function countedKeys(deps: MemoryDeps): Promise<string[]> {
  const state = await stateOf(deps);
  return Object.entries(state.sessions)
    .filter(([, e]) => e.noPromptCounted)
    .map(([k]) => k)
    .sort();
}
type Facts = { counts: Map<string, Tally>; known: Known; lost: Set<string> };
/** The oracle's verdict on one event: does it count its session (Requirement 3, criterion 26)? */
function verdict(f: Facts, key: string, stop: boolean, outside: boolean): boolean {
  const t = f.counts.get(key) ?? NEW_TALLY;
  return stop && !t.promptSeen && !t.counted && outside;
}
/** One event: fires it and returns the problems found. */
async function playEvent(
  deps: MemoryDeps,
  s: Scenario["steps"][number],
  tree: Tree,
  f: Facts,
  model: ReturnType<typeof newModel>,
  seen: Seen,
): Promise<string[]> {
  const key = s.event.session ?? "_none";
  const stop = s.event.event === "agentStop";
  const before = { count: await sessionCount(deps), lines: noPromptLines(deps) };
  const ms = deps.clock.nowMs() + s.event.gapMs;
  const window = step(model, s.event, ms);
  const outside = window === null && hasDifference(f.known, f.lost, tree);
  const counts = verdict(f, key, stop, outside);
  const prior = f.counts.get(key) ?? NEW_TALLY;
  f.counts.set(key, {
    promptSeen: prior.promptSeen || s.event.event === "promptSubmit",
    counted: prior.counted || counts,
    stopped: prior.stopped || stop,
  });
  await fire(deps, s);
  tally(seen, stop, outside, prior, counts);
  const after = { count: await sessionCount(deps), lines: noPromptLines(deps) };
  const want = counts ? 1 : 0;
  const out: string[] = [];
  if (after.count - before.count !== want)
    out.push(`count ${String(before.count)} to ${String(after.count)}, want +${String(want)}`);
  if (after.lines - before.lines !== want)
    out.push(
      `${String(after.lines - before.lines)} new no_prompt_events lines, want ${String(want)}`,
    );
  return out;
}
function tally(seen: Seen, stop: boolean, outside: boolean, prior: Tally, counts: boolean): void {
  if (counts) seen.counted += 1;
  else if (stop && prior.promptSeen && prior.stopped && outside) seen.promptStopOutside += 1;
  else if (stop && !prior.promptSeen && !prior.counted && !outside) seen.quiet += 1;
}
/** The end-of-run checks: the count, the log and the entries agree with the oracle. */
async function endProblems(deps: MemoryDeps, f: Facts): Promise<string[]> {
  const counted = [...f.counts]
    .filter(([, t]) => t.counted)
    .map(([k]) => k)
    .sort();
  const out: string[] = [];
  const count = await sessionCount(deps);
  if (count !== counted.length) out.push(`count ${String(count)}, want ${String(counted.length)}`);
  if (noPromptLines(deps) !== counted.length)
    out.push("no_prompt_events lines differ from the oracle");
  const flagged = await countedKeys(deps);
  if (JSON.stringify(flagged) !== JSON.stringify(counted))
    out.push(`flagged ${flagged.join(",")}, want ${counted.join(",")}`);
  return out;
}
/** Runs the last event again: the count, the log and the Sessions_File must not change. */
async function rerunProblems(deps: MemoryDeps, last: Scenario["steps"][number]): Promise<string[]> {
  const file = `${PROV}/sessions.json`;
  const before = {
    count: await sessionCount(deps),
    lines: noPromptLines(deps),
    text: deps.fs.text(file),
  };
  await fire(deps, { ...last, changes: [] });
  const out: string[] = [];
  if ((await sessionCount(deps)) !== before.count) out.push("the count changed on the second run");
  if (noPromptLines(deps) !== before.lines) out.push("a no_prompt_events line was added");
  if (deps.fs.text(file) !== before.text) out.push("sessions.json changed on the second run");
  return out;
}
async function replay(scenario: Scenario, seen: Seen): Promise<string[]> {
  const { deps, tree: first } = seed(scenario);
  const model = newModel();
  const facts: Facts = {
    counts: new Map(),
    known: startKnown(scenario),
    lost: startLost(scenario),
  };
  const out: string[] = [];
  let tree = first;
  let last = await sessionCount(deps);
  let countedBefore = seen.counted;
  for (const [index, s] of scenario.steps.entries()) {
    tree = prepare(deps, scenario, tree, s);
    countedBefore = seen.counted;
    const found = await playEvent(deps, s, tree, facts, model, seen);
    facts.lost = nextLost(facts.known, facts.lost, tree);
    facts.known = new Map(tree);
    const now = await sessionCount(deps);
    if (now < last) found.push(`the count fell from ${String(last)} to ${String(now)}`);
    last = now;
    out.push(...found.map((p) => `event ${String(index)} (${s.event.event}): ${p}`));
  }
  const lastStep = scenario.steps[scenario.steps.length - 1];
  out.push(...(await endProblems(deps, facts)));
  if (lastStep !== undefined) out.push(...(await rerunProblems(deps, lastStep)));
  if (seen.counted > countedBefore) seen.rerunCounted += 1;
  return out;
}
const SHARED_CACHE: Scenario = {
  pool: ["a.txt", "b.txt"],
  setup: [
    { at: 0, text: "", tracking: "entry-none" },
    { at: 1, text: "", tracking: "entry-cache" },
  ],
  steps: [
    {
      event: {
        event: "agentStop",
        session: "sess-2",
        taskName: null,
        specName: null,
        taskSuccess: null,
        gapMs: 1018,
      },
      changes: [{ kind: "prepend", at: 0, text: "\n" }],
      dropState: false,
    },
  ],
};

describe("sessions-count properties _Requirements: 3.26, 3.27, 16.23_", () => {
  // Shrunk counterexample of seed 2090571658: a same-digest cache file makes the text findable.
  it("P16 example: an entry without its own cache file finds its text through a same-digest entry", async () => {
    const seen: Seen = { counted: 0, quiet: 0, rerunCounted: 0, promptStopOutside: 0 };
    expect(await replay(SHARED_CACHE, seen)).toEqual([]);
    expect(seen.counted).toBe(1);
  });

  // Property 16
  it("P16 sessions without prompt events are counted once", async () => {
    const seen: Seen = { counted: 0, quiet: 0, rerunCounted: 0, promptStopOutside: 0 };
    await fc.assert(
      fc.asyncProperty(
        arbScenario({
          minSessions: 2,
          maxSessions: 3,
          allowNoId: true,
          trackings: ALL_TRACKINGS,
          dropState: false,
          maxChanges: 3,
        }),
        async (scenario) => {
          expect(await replay(scenario, seen)).toEqual([]);
        },
      ),
      { numRuns: runs(process.env) },
    );
    expect(seen.counted, "some session without a prompt event was counted").toBeGreaterThan(0);
    expect(seen.quiet, "some session without a prompt event found nothing outside").toBeGreaterThan(
      0,
    );
    expect(seen.rerunCounted, "some last event that counted was run again").toBeGreaterThan(0);
    expect(
      seen.promptStopOutside,
      "some session with a prompt stopped twice with outside changes and was not counted",
    ).toBeGreaterThan(0);
  });
});
