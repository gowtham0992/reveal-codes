/** Property run count: FC_NUM_RUNS if set, else 500 under CI, else 200. */
export function runs(): number {
  const fromEnv = Number.parseInt(process.env["FC_NUM_RUNS"] ?? "", 10);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return process.env["CI"] ? 500 : 200;
}
