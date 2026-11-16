type EnvSource = Readonly<Record<string, string | undefined>>;

/** True for a real token: not empty, and not an unexpanded `${NAME}` placeholder. */
export function hasUsableToken(value: string | undefined): boolean {
  if (value === undefined) return false;
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith("${");
}

/**
 * Pure: the environment the packaged Power runs with. An unusable token is removed and, with
 * no usable token left, fixtures mode is switched on. A usable token leaves `env` as it was.
 */
export function powerEnv(env: EnvSource): EnvSource {
  if (hasUsableToken(env["COURTLISTENER_TOKEN"])) return env;
  const rest = Object.fromEntries(
    Object.entries(env).filter(([name]) => name !== "COURTLISTENER_TOKEN"),
  );
  return { ...rest, REVEAL_CODES_FIXTURES_ONLY: "1" };
}
