/**
 * Event sequences for the Recorder properties (task 5.8; Properties 1, 2, 4, 5, 14 and 16): one or
 * more sessions, each a valid `promptSubmit`, `preTask`, `postTask`, `agentStop` sequence, or the
 * Specs-panel shape (`preTask`, `postTask`, `agentStop`, no `promptSubmit`), or a bare `agentStop`
 * (the orchestrator shape), interleaved in any order. Every gap between two events is at most 30
 * minutes and a sequence has at most 18 events, so no session ever waits 12 hours.
 */
import fc from "fast-check";

export type GenEventName = "promptSubmit" | "preTask" | "postTask" | "agentStop";

/** One Hook_Event: the command-line name, the session and the payload fields the Recorder reads. */
export type GenEvent = {
  event: GenEventName;
  /** The `session_id`; null for an event whose payload has none. */
  session: string | null;
  taskName: string | null;
  specName: string | null;
  taskSuccess: boolean | null;
  /** Milliseconds the clock moves on before this event (1 s to 30 min). */
  gapMs: number;
};

/** The longest gap between two events of the generated sequences. */
export const MAX_GAP_MS = 1_800_000;

type Shape = "turn" | "specsPanel" | "bareStop";
type Plain = Omit<GenEvent, "gapMs">;

const plain = (event: GenEventName, session: string | null, task: number | null): Plain => ({
  event,
  session,
  taskName: task === null ? null : `${String(task)}.1 Task`,
  specName: task === null ? null : "specs/demo/tasks.md",
  taskSuccess: event === "postTask" ? true : null,
});

/** How a session departs from the plain `pre n, post n` pairs. */
export type Quirks = {
  /** Fire each `preTask` twice (the task tool re-marks a task in progress). */
  repeat: boolean;
  /** Close the tasks outermost first: `pre 1, pre 2, post 1, post 2`. */
  nested: boolean;
  /** Add a `postTask` for a name that is never open. */
  stray: boolean;
};

const NO_QUIRKS: Quirks = { repeat: false, nested: false, stray: false };

function taskEvents(session: string | null, tasks: number, q: Quirks): Plain[] {
  const nums = Array.from({ length: tasks }, (_, i) => i + 1);
  const pre = (n: number): Plain[] => {
    const one = plain("preTask", session, n);
    return q.repeat ? [one, one] : [one];
  };
  const post = (n: number): Plain => plain("postTask", session, n);
  const body = q.nested
    ? [...nums.flatMap(pre), ...nums.map(post)]
    : nums.flatMap((n) => [...pre(n), post(n)]);
  return q.stray ? [...body, plain("postTask", session, 9)] : body;
}

/** The events of one session, in the order the hooks fire them. */
function sessionEvents(
  session: string | null,
  shape: Shape,
  tasks: number,
  q: Quirks = NO_QUIRKS,
): Plain[] {
  const inner = taskEvents(session, tasks, q);
  if (shape === "bareStop") return [plain("agentStop", session, null)];
  const head = shape === "turn" ? [plain("promptSubmit", session, null)] : [];
  return [...head, ...inner, plain("agentStop", session, null)];
}

export type EventOptions = {
  minSessions: number;
  maxSessions: number;
  /** When true, the first session may omit `session_id` (at most one session does). */
  allowNoId: boolean;
};

const arbShape: fc.Arbitrary<Shape> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Shape>("turn") },
  { weight: 1, arbitrary: fc.constant<Shape>("specsPanel") },
  { weight: 1, arbitrary: fc.constant<Shape>("bareStop") },
);

const arbSessionPlan = (index: number, allowNoId: boolean): fc.Arbitrary<Plain[]> =>
  fc
    .tuple(
      arbShape,
      fc.integer({ min: 0, max: 2 }),
      allowNoId && index === 0 ? fc.boolean() : fc.constant(false),
      fc.record({ repeat: fc.boolean(), nested: fc.boolean(), stray: fc.boolean() }),
    )
    .map(([shape, tasks, noId, quirks]) =>
      sessionEvents(noId ? null : `sess-${String(index)}`, shape, tasks, quirks),
    );

/** Merges per-session lists in the order given by `order` (a session index per event). */
function interleave(plans: readonly Plain[][], order: readonly number[]): Plain[] {
  const taken = plans.map(() => 0);
  return order.flatMap((s) => {
    const next = plans[s]?.[taken[s] ?? 0];
    taken[s] = (taken[s] ?? 0) + 1;
    return next === undefined ? [] : [next];
  });
}

/**
 * An interleaving of `minSessions` to `maxSessions` sessions, each keeping its own event order,
 * with every `gapMs` in `[1000, MAX_GAP_MS]`. Sessions are named `sess-0`, `sess-1`, and so on.
 */
export function arbEvents(options: EventOptions): fc.Arbitrary<GenEvent[]> {
  return fc.integer({ min: options.minSessions, max: options.maxSessions }).chain((count) =>
    fc
      .tuple(...Array.from({ length: count }, (_, i) => arbSessionPlan(i, options.allowNoId)))
      .chain((plans) => {
        const slots = plans.flatMap((p, s) => p.map(() => s));
        return fc
          .tuple(
            fc.shuffledSubarray(slots, { minLength: slots.length, maxLength: slots.length }),
            fc.array(fc.integer({ min: 1000, max: MAX_GAP_MS }), {
              minLength: slots.length,
              maxLength: slots.length,
            }),
          )
          .map(([order, gaps]) =>
            interleave(plans, order).map((e, i) => ({ ...e, gapMs: gaps[i] ?? 1000 })),
          );
      }),
  );
}

/** The hook payload of an event, as the harness writes it to standard input. */
export function payloadOf(e: GenEvent, cwd: string): Record<string, unknown> {
  return {
    cwd,
    ...(e.session === null ? {} : { session_id: e.session }),
    ...(e.taskName === null ? {} : { task_name: e.taskName }),
    ...(e.specName === null ? {} : { spec_name: e.specName }),
    ...(e.taskSuccess === null ? {} : { task_success: e.taskSuccess }),
  };
}
