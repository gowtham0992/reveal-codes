/**
 * Number of runs for every property test: `FC_NUM_RUNS` if set to a positive
 * integer, else 500 when `CI` is set, else 200.
 */
export function runs(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env["FC_NUM_RUNS"];
  if (raw !== undefined && /^[1-9]\d*$/.test(raw)) return Number(raw);
  const ci = env["CI"];
  return ci !== undefined && ci !== "" ? 500 : 200;
}
