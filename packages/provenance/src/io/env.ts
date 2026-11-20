/** The one module that reads `process.env` (design, module layout). */
export type ColorEnv = {
  /** `NO_COLOR` is set to a non-empty value (no-color.org). */
  noColor: boolean;
  colorterm: string | null;
  term: string | null;
};

/** Pure form of the read, so a test can pass its own variables. */
export function colorEnvFrom(env: Readonly<Record<string, string | undefined>>): ColorEnv {
  const noColor = env["NO_COLOR"];
  return {
    noColor: noColor !== undefined && noColor !== "",
    colorterm: env["COLORTERM"] ?? null,
    term: env["TERM"] ?? null,
  };
}

/** Reads `NO_COLOR`, `COLORTERM` and `TERM` from the process. */
export function readColorEnv(): ColorEnv {
  return colorEnvFrom(process.env);
}
