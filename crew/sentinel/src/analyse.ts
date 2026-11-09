import type { Deps } from "@reveal-codes/verifier";
import { readDocx } from "./docx-read.js";
import { deriveFindings, unreadable } from "./findings.js";
import { recordedDocument } from "./recorded.js";
import { reverify } from "./reverify.js";
import { splitExport } from "./split.js";
import type { Finding } from "./types.js";

async function analyse(file: string, bytes: Uint8Array, deps: Deps): Promise<readonly Finding[]> {
  const read = readDocx(bytes);
  if (!read.ok) return [unreadable(file, read.error.kind)];
  const parts = splitExport(read.value);
  if (!parts.ok) return [unreadable(file, parts.error.kind)];
  const recorded = recordedDocument(parts.value.appendix);
  if (!recorded.ok) return [unreadable(file, recorded.error.kind)];
  const outcome = await reverify(recorded.value, deps);
  const bodyText = parts.value.body.join("\n");
  return deriveFindings({ file, recorded: recorded.value, bodyText, outcome });
}

/**
 * Findings for one file. Never rejects and never writes `bytes`. The catch is the last resort
 * (D17): any unexpected throw becomes one `unreadable` Finding so the sweep can go on.
 */
export async function analyseFile(
  file: string,
  bytes: Uint8Array,
  deps: Deps,
): Promise<readonly Finding[]> {
  try {
    return await analyse(file, bytes, deps);
  } catch {
    return [unreadable(file, "read_failed")];
  }
}
