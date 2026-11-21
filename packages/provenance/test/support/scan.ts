// Source scanning helpers for the boundary tests. Re-exported from the export package's test support.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Source } from "../../../export/test/support/scan";

export { at, format, isFunctionNode, lineOf, parse, walk } from "../../../export/test/support/scan";
export type { Source, Violation } from "../../../export/test/support/scan";

/** Root of packages/provenance (this file is packages/provenance/test/support/scan.ts). */
export const PROVENANCE_ROOT = join(import.meta.dirname, "..", "..");

/** The repository root. */
export const REPO_ROOT = join(PROVENANCE_ROOT, "..", "..");

/** Every file under `dir` whose name ends in `suffix`, recursively, sorted by path, with `/` separators. */
export function readTree(dir: string, suffix: string): Source[] {
  const out: Source[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readTree(path, suffix));
    else if (entry.name.endsWith(suffix)) {
      out.push({ path: path.replaceAll("\\", "/"), text: readFileSync(path, "utf8") });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, "en"));
}
