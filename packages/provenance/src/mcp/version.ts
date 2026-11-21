/**
 * The build constant that `scripts/build-power.mjs` injects into the provenance Bundle as an
 * esbuild `define` (design M18). Declared as possibly absent: a run from sources has no define.
 * (A `.d.ts` would be ignored by this repository's `.gitignore`, so the declaration lives here.)
 */
declare const __PROVENANCE_VERSION__: string | undefined;

/** The version used for a run from sources, where the build has injected nothing. */
export const DEV_VERSION = "0.0.0-dev";

/**
 * The version the MCP server reports (Req 12.16, design M18): the `version` of
 * `packages/provenance/package.json`, which the build injects as `__PROVENANCE_VERSION__`.
 */
export function serverVersion(): string {
  return typeof __PROVENANCE_VERSION__ === "string" ? __PROVENANCE_VERSION__ : DEV_VERSION;
}
