/**
 * Number of runs for every property test: `FC_NUM_RUNS` when it is a positive
 * integer, else 500 when `CI` is set and not empty, else 200 (tech.md).
 *
 * Use as `fc.assert(prop, { numRuns: runs(process.env) })`. On failure
 * fast-check prints a seed; replay with `fc.assert(prop, { numRuns, seed })`.
 */
export function runs(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env["FC_NUM_RUNS"];
  if (raw !== undefined && /^[1-9]\d*$/.test(raw)) return Number(raw);
  const ci = env["CI"];
  return ci !== undefined && ci !== "" ? 500 : 200;
}
