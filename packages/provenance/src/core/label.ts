import { LABEL_MAX } from "./limits.js";

/** The Task_Number (or null) and the Run_Label title of one window (Req 3.13, 3.14). */
export type Label = { taskNumber: string | null; title: string };

/** The event that opens a window: `promptSubmit` gives a `turn` window. */
export type LabelKind = "promptSubmit" | "preTask";

/** What `parseRunId` reads back from a Run_Id (design M3). */
export type RunName = {
  taskNumber: string | null;
  title: string;
  time: string | null;
  suffix: number | null;
  n: number | null;
};

const FALLBACK_TITLE = "task";
const TURN_TITLE = "turn";
// `\s` and every control character (C0, DEL and C1: general category Cc).
const SPACE_RUN = /[\s\p{Cc}]+/gu;
const TASK_TOKEN = /^(\d+(?:\.\d+)*)\.?(?= |$)/u;
const RUN_ID = /^(?:(\d+(?:\.\d+)*) )?(.*) (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)(?:~(\d+))?\.(\d+)$/su;

function clean(text: string): string {
  return text.replace(SPACE_RUN, " ").trim();
}

function cutTitle(title: string): string {
  const points = Array.from(title);
  return points.length <= LABEL_MAX ? title : points.slice(0, LABEL_MAX).join("").trimEnd();
}

/**
 * Splits `task_name` into a Task_Number and a title (design, Run names).
 * Reads nothing but the string it is given. An absent name, an empty name and
 * a name that holds only a Task_Number give the title `task`.
 */
export function parseTaskName(taskName: string | null): Label {
  const text = taskName === null ? "" : clean(taskName);
  const token = TASK_TOKEN.exec(text);
  const taskNumber = token === null ? null : (token[1] ?? null);
  const rest = token === null ? text : text.slice(token[0].length).trim();
  const title = cutTitle(rest);
  return { taskNumber, title: title === "" ? FALLBACK_TITLE : title };
}

/** The label of a window: `turn` with no Task_Number for `promptSubmit`, else the task's. */
export function makeLabel(taskName: string | null, kind: LabelKind): Label {
  if (kind === "promptSubmit") return { taskNumber: null, title: TURN_TITLE };
  return parseTaskName(taskName);
}

/**
 * `[<Task_Number> ]<title> <time>`, with `~2`, `~3`, and so on appended only
 * while the name is in `taken` (the open windows and the last opened window).
 */
export function windowRunName(
  taskNumber: string | null,
  title: string,
  time: string,
  taken: readonly string[],
): string {
  const head = taskNumber === null ? "" : `${taskNumber} `;
  const base = `${head}${title} ${time}`;
  if (!taken.includes(base)) return base;
  let k = 2;
  while (taken.includes(base + "~" + String(k))) k += 1;
  return base + "~" + String(k);
}

/** The Run_Id of Hunk `n` of a Window_Run. */
export function runId(windowRun: string, n: number): string {
  return windowRun + "." + String(n);
}

/** Reads a Run_Id by the pattern of design M3; an id that does not match has the title `?`. */
export function parseRunId(id: string): RunName {
  const m = RUN_ID.exec(id);
  if (m === null) return { taskNumber: null, title: "?", time: null, suffix: null, n: null };
  const suffix = m[4];
  return {
    taskNumber: m[1] ?? null,
    title: m[2] ?? "",
    time: m[3] ?? null,
    suffix: suffix === undefined ? null : Number(suffix),
    n: Number(m[5]),
  };
}

/** `written in task 5.3 Build the view`, `written in task`, or `written in turn`. */
export function describeRun(taskNumber: string | null, title: string): string {
  if (taskNumber === null && title === TURN_TITLE) return "written in turn";
  const number = taskNumber === null ? "" : ` ${taskNumber}`;
  const name = title === FALLBACK_TITLE ? "" : ` ${title}`;
  return `written in task${number}${name}`;
}
