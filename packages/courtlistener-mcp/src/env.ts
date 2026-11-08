/** Environment settings of the MCP server (Req 13.10). The only reader of `COURTLISTENER_TOKEN`. */
export type Env = Readonly<{
  /** Absent when the variable is unset or empty. */
  token?: string;
  cacheDir: string;
  fixturesOnly: boolean;
}>;

type EnvSource = Readonly<Record<string, string | undefined>>;

function joinPath(home: string, ...parts: readonly string[]): string {
  return [home.replace(/\/+$/, ""), ...parts].join("/");
}

/**
 * Pure: reads the three variables from `env`. An empty token is absent; an empty cache
 * directory falls back to `<home>/.reveal-codes/cache`; only the value `1` enables fixtures.
 */
export function readEnv(env: EnvSource, home: string): Env {
  const token = env["COURTLISTENER_TOKEN"];
  const dir = env["REVEAL_CODES_CACHE_DIR"];
  const base = {
    cacheDir: dir === undefined || dir === "" ? joinPath(home, ".reveal-codes", "cache") : dir,
    fixturesOnly: env["REVEAL_CODES_FIXTURES_ONLY"] === "1",
  };
  return token === undefined || token === "" ? base : { ...base, token };
}
