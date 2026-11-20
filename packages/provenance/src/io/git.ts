/**
 * The git calls of the Recorder (design, Candidate files and exclusion; Baseline file). Each call
 * goes through `deps.git.exec` with an argument array and never a shell. A missing `git` or a
 * directory that is not a git working tree is a value (`GitTree` of kind `none`), not an error.
 */
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { Deps, GitFailure } from "./deps.js";

type GitUse = Pick<Deps, "git">;

/** The files of a git working tree, with tracked files that an ignore rule matches removed. */
export type GitTree = { kind: "none" } | { kind: "tree"; files: string[] };

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

function nulList(bytes: Uint8Array): string[] {
  return decoder
    .decode(bytes)
    .split("\0")
    .filter((p) => p !== "");
}

const LIST_BASE = ["ls-files", "-z", "--cached"] as const;

/**
 * `ls-files -z --cached --others --exclude-standard` minus `ls-files -z --cached --ignored
 * --exclude-standard`. Paths are relative to `root`. When either call fails (no `git`, not a
 * working tree) the result is `none`, and the caller walks the directory instead.
 */
export async function listGitFiles(deps: GitUse, root: string): Promise<GitTree> {
  const all = await deps.git.exec(root, [...LIST_BASE, "--others", "--exclude-standard"]);
  if (!all.ok) return { kind: "none" };
  const ignored = await deps.git.exec(root, [...LIST_BASE, "--ignored", "--exclude-standard"]);
  if (!ignored.ok) return { kind: "none" };
  const skip = new Set(nulList(ignored.value));
  const files = [...new Set(nulList(all.value))].filter((p) => !skip.has(p));
  return { kind: "tree", files };
}

/** `--stdin-paths` reads one path per line and unquotes a path that starts with `"`. */
function hashable(path: string): boolean {
  return !path.includes("\n") && !path.startsWith('"');
}

const failedCall: GitFailure = { kind: "failed" };

/**
 * Blob_Ids of the working-tree files, from one `hash-object --no-filters --stdin-paths` call
 * (no line-ending or attribute conversion, so the id is that of the bytes on disk). A path that
 * a line-based call cannot carry (a line feed, or a leading quote) is absent from the map.
 */
export async function hashObjects(
  deps: GitUse,
  root: string,
  paths: readonly string[],
): Promise<Result<Map<string, string>, GitFailure>> {
  const carried = paths.filter(hashable);
  if (carried.length === 0) return ok(new Map());
  const out = await deps.git.exec(
    root,
    ["hash-object", "--no-filters", "--stdin-paths"],
    encoder.encode(carried.map((p) => `${p}\n`).join("")),
  );
  if (!out.ok) return out;
  const ids = decoder
    .decode(out.value)
    .split("\n")
    .filter((l) => l !== "");
  if (ids.length !== carried.length) return err(failedCall);
  return ok(new Map(carried.map((p, i) => [p, ids[i] as string])));
}

/**
 * Which Blob_Ids are in the object store, from one `cat-file --batch-check` call. A line is
 * `<id> blob <size>` for a blob that is there and `<id> missing` for one that is not.
 */
export async function checkBlobs(
  deps: GitUse,
  root: string,
  blobIds: readonly string[],
): Promise<Result<Map<string, boolean>, GitFailure>> {
  const unique = [...new Set(blobIds)];
  if (unique.length === 0) return ok(new Map());
  const out = await deps.git.exec(
    root,
    ["cat-file", "--batch-check"],
    encoder.encode(unique.map((id) => `${id}\n`).join("")),
  );
  if (!out.ok) return out;
  const lines = decoder
    .decode(out.value)
    .split("\n")
    .filter((l) => l !== "");
  if (lines.length !== unique.length) return err(failedCall);
  return ok(new Map(unique.map((id, i) => [id, (lines[i] ?? "").split(" ")[1] === "blob"])));
}

/** `cat-file blob <id>`: the bytes of one blob, or the failure. */
export function catBlob(
  deps: GitUse,
  root: string,
  blobId: string,
): Promise<Result<Uint8Array, GitFailure>> {
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/u.test(blobId)) return Promise.resolve(err(failedCall));
  return deps.git.exec(root, ["cat-file", "blob", blobId]);
}
