import type { Deps } from "@reveal-codes/verifier";
import { analyseFile } from "./analyse.js";
import type { FilePort } from "./files.js";
import { unreadable } from "./findings.js";
import type { FileReport } from "./types.js";

export type Target = Readonly<{ file: string; path: string }>;

/** `.docx` names (any case), Word lock files dropped silently, sorted by `localeCompare`. */
export function selectFiles(names: readonly string[]): readonly string[] {
  return names
    .filter((name) => /\.docx$/i.test(name) && !name.startsWith("~$"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

/** One file at a time: the next read starts only after the previous analysis settled. */
export async function analyseAll(
  targets: readonly Target[],
  port: FilePort,
  deps: Deps,
): Promise<readonly FileReport[]> {
  const reports: FileReport[] = [];
  for (const target of targets) {
    const read = await port.read(target.path);
    const findings = read.ok
      ? await analyseFile(target.file, read.value, deps)
      : [unreadable(target.file, "read_failed")];
    reports.push({ file: target.file, findings });
  }
  return reports;
}
