// Run counts for property tests. Same pattern as packages/export/test/support/arbitraries.ts.
type Env = Readonly<Record<string, string | undefined>>;

const POSITIVE_INTEGER = /^[1-9]\d*$/;

function positiveRuns(env: Env): number | null {
  const raw = env["FC_NUM_RUNS"];
  return raw !== undefined && POSITIVE_INTEGER.test(raw) ? Number(raw) : null;
}

/** `FC_NUM_RUNS` when a positive integer, else 500 when `CI` is set, else 200. */
export function runs(env: Env): number {
  const set = positiveRuns(env);
  if (set !== null) return set;
  const ci = env["CI"];
  return ci !== undefined && ci !== "" ? 500 : 200;
}

/** 50 when `FC_NUM_RUNS` is unset or not a positive integer, else `min(FC_NUM_RUNS, 100)`. */
export function docxRuns(env: Env): number {
  const set = positiveRuns(env);
  return set === null ? 50 : Math.min(set, 100);
}
