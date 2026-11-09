// Source scanning helpers for the boundary tests. Re-exported from the export package's test support.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Source } from "../../../../packages/export/test/support/scan";

export {
  at,
  format,
  isFunctionNode,
  lineOf,
  literals,
  parse,
  walk,
} from "../../../../packages/export/test/support/scan";
export type { Source, Violation } from "../../../../packages/export/test/support/scan";

/** Root of crew/sentinel (this file is crew/sentinel/test/support/scan.ts). */
export const SENTINEL_ROOT = join(import.meta.dirname, "..", "..");

/** Every file under `dir` whose name ends in `suffix`, recursively, sorted by path. */
export function readTree(dir: string, suffix: string): Source[] {
  const out: Source[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readTree(path, suffix));
    else if (entry.name.endsWith(suffix)) out.push({ path, text: readFileSync(path, "utf8") });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, "en"));
}
