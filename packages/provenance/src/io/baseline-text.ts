/**
 * The Baseline_Text resolver (Req 5.5, design First change), in this order and no other:
 * `git cat-file blob <Blob_Id>` when the entry has a Blob_Id and the bytes hash to the entry's
 * digest (no history walk, no depth limit); then `cache/<digest>` when its bytes hash to its
 * name; then none. None means the caller records the current text as `[PST]`, never `AI` or `HUM`.
 */
import type { BaselineEntry } from "../core/types.js";
import type { BaselineCache } from "./baseline-cache.js";
import type { Deps } from "./deps.js";
import { catBlob } from "./git.js";
import { decodeUtf8 } from "./scan.js";
type TextDeps = Pick<Deps, "git" | "sha256">;
async function fromGit(deps: TextDeps, root: string, entry: BaselineEntry) {
  if (entry.blob === undefined) return null;
  const blob = await catBlob(deps, root, entry.blob);
  return blob.ok && deps.sha256(blob.value) === entry.sha256 ? blob.value : null;
}
async function fromCache(deps: TextDeps, cache: BaselineCache, entry: BaselineEntry) {
  const bytes = await cache.read(entry.sha256);
  return bytes !== null && deps.sha256(bytes) === entry.sha256 ? bytes : null;
}
/** The decoded starting text of the entry's file (byte order mark kept), or null when not found. */
export async function resolveBaselineText(
  deps: TextDeps,
  root: string,
  cache: BaselineCache,
  entry: BaselineEntry,
): Promise<string | null> {
  const bytes = (await fromGit(deps, root, entry)) ?? (await fromCache(deps, cache, entry));
  return bytes === null ? null : decodeUtf8(bytes);
}
