/**
 * Short run tags for `reveal <file>` (Req 9.14, 9.15; design, Run tags). Pure; no `node:`.
 * A tag names a window, not a Run: all hunks of a window in the file share it.
 */
import { parseRunId } from "./label.js";

/** One window of the file, with its tag and the number of its Runs that hold text. */
export type WindowTag = {
  tag: string;
  windowRun: string;
  taskNumber: string | null;
  title: string;
  /** The opening time as in the Run_Id, or null for an id that does not parse. */
  time: string | null;
  hunks: number;
};

type Group = Omit<WindowTag, "tag"> & { base: string; runIds: Set<string> };

const HUNK_SUFFIX = /\.\d+$/u;

/** The Window_Run of a Run_Id: the id without its `.<Hunk>` ending. */
export function windowRunOf(runId: string): string {
  return runId.replace(HUNK_SUFFIX, "");
}

function baseOf(taskNumber: string | null, title: string): string {
  if (taskNumber !== null) return taskNumber;
  return title === "turn" ? "turn" : "task";
}

function groupOf(runId: string): Group {
  const name = parseRunId(runId);
  return {
    windowRun: windowRunOf(runId),
    taskNumber: name.taskNumber,
    title: name.title,
    time: name.time,
    base: baseOf(name.taskNumber, name.title),
    hunks: 0,
    runIds: new Set(),
  };
}

const compareUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function byOpening(a: Group, b: Group): number {
  return compareUnits(a.time ?? "", b.time ?? "") || compareUnits(a.windowRun, b.windowRun);
}

/**
 * The windows of `runIds` (the Run_Ids of the file's `AI` and `AI>HUM` spans), in order of
 * opening time and then of Window_Run in UTF-16 code unit order, each with its tag. The first
 * window with a base tag keeps it; the k-th later one gets `<base>~<k>`.
 */
export function assignTags(runIds: readonly string[]): WindowTag[] {
  const groups = new Map<string, Group>();
  for (const id of runIds) {
    const key = windowRunOf(id);
    const group = groups.get(key) ?? groupOf(id);
    group.runIds.add(id);
    groups.set(key, group);
  }
  const seen = new Map<string, number>();
  return [...groups.values()].sort(byOpening).map((g) => {
    const k = (seen.get(g.base) ?? 0) + 1;
    seen.set(g.base, k);
    const { base, runIds: ids, ...rest } = g;
    return { ...rest, tag: k === 1 ? base : `${base}~${String(k)}`, hunks: ids.size };
  });
}
