/**
 * Candidate files (design, Candidate files and exclusion): the git tree minus tracked-but-ignored
 * files, or a walk when there is no git tree; the built-in exclusions and the two ignore files;
 * then, per file, the size and binary checks. Everything goes through `deps`, so a symbolic link
 * is seen by `lstat` and is treated as absent, never followed.
 */
import { isBuiltInExcluded } from "../core/exclude.js";
import { isIgnoredByAny } from "../core/ignore.js";
import { parseIgnore } from "../core/ignore-parse.js";
import type { IgnoreRules } from "../core/ignore-parse.js";
import { SIZE_LIMIT } from "../core/limits.js";
import type { Deps } from "./deps.js";
import { listGitFiles } from "./git.js";

type ScanDeps = Pick<Deps, "fs" | "git" | "sha256" | "log">;

/** A regular file found by `lstat`, with the size and modification time the Recorder compares. */
export type Candidate = { path: string; size: number; mtimeMs: number };

/** `git` is true when the list came from a git working tree. */
export type CandidateList = { git: boolean; files: Candidate[] };

/** Byte length above which a file is over the limit without being read (3 bytes per code unit). */
export const READ_FREE_LIMIT_BYTES = SIZE_LIMIT * 3;

const WALK_SKIP: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "target",
]);

const IGNORE_FILES: readonly string[] = [".kiroignore", ".kiro/provenance/ignore"];
const STAT_BATCH = 64;

/** The Kiro_Ignore_File and the Ignore_File, each parsed on its own; absent files give no rules. */
export async function loadIgnoreFiles(deps: ScanDeps, root: string): Promise<IgnoreRules[]> {
  const found: IgnoreRules[] = [];
  for (const name of IGNORE_FILES) {
    const read = await deps.fs.readFile(`${root}/${name}`);
    if (read.ok) {
      found.push(parseIgnore(new TextDecoder("utf-8").decode(read.value)));
    } else if (read.error.code !== "ENOENT") {
      await deps.log.fault({ event: "scan", path: name, reason: "read_failed" });
    }
  }
  return found;
}

/** Built-in exclusions first; then either ignore file (neither can re-include the other's). */
export function isExcluded(rules: readonly IgnoreRules[], path: string): boolean {
  return isBuiltInExcluded(path) || isIgnoredByAny(rules, path);
}

async function statFiles(deps: ScanDeps, root: string, paths: string[]): Promise<Candidate[]> {
  const found: Candidate[] = [];
  for (let i = 0; i < paths.length; i += STAT_BATCH) {
    const batch = paths.slice(i, i + STAT_BATCH);
    const stats = await Promise.all(batch.map((p) => deps.fs.lstat(`${root}/${p}`)));
    stats.forEach((stat, j) => {
      if (stat.ok && stat.value.kind === "file") {
        found.push({
          path: batch[j] as string,
          size: stat.value.size,
          mtimeMs: stat.value.mtimeMs,
        });
      }
    });
  }
  return found;
}

async function walk(deps: ScanDeps, root: string, dir: string, out: string[]): Promise<void> {
  const names = await deps.fs.readdir(dir === "" ? root : `${root}/${dir}`);
  if (!names.ok) return;
  for (const name of [...names.value].sort()) {
    if (WALK_SKIP.has(name)) continue;
    const path = dir === "" ? name : `${dir}/${name}`;
    const stat = await deps.fs.lstat(`${root}/${path}`);
    if (!stat.ok) continue;
    if (stat.value.kind === "dir") await walk(deps, root, path, out);
    else if (stat.value.kind === "file") out.push(path);
  }
}

/**
 * The candidate files of the Workspace_Root, sorted by path. With a git tree the paths are
 * git's; with none, a walk that skips `.git node_modules dist build out .next coverage target`
 * and applies no git ignore rule (Req 2.2). Either way the built-in exclusions and the two
 * ignore files apply (Req 2.4 to 2.9), and only regular files remain (Req 2.14).
 */
export async function listCandidates(deps: ScanDeps, root: string): Promise<CandidateList> {
  const rules = await loadIgnoreFiles(deps, root);
  const tree = await listGitFiles(deps, root);
  const names: string[] = [];
  if (tree.kind === "tree") names.push(...tree.files);
  else await walk(deps, root, "", names);
  const kept = names.filter((p) => !isExcluded(rules, p));
  const files = (await statFiles(deps, root, kept)).sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  return { git: tree.kind === "tree", files };
}

/** What reading one candidate gave. Binary files are skipped silently (Req 2.11). */
export type FileRead =
  | { kind: "absent" }
  | { kind: "unreadable"; code: string }
  | { kind: "over_limit"; size: number; mtimeMs: number }
  | { kind: "binary" }
  | {
      kind: "text";
      /** Decoded with the byte order mark kept (Req 4.1). */
      text: string;
      bytes: Uint8Array;
      sha256: string;
      size: number;
      mtimeMs: number;
    };

/** The decoded text, or null when the bytes are not valid UTF-8. A leading BOM is kept. */
function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

/**
 * Reads one candidate. `size > 600,000` is over the limit without a read; `size <= 200,000`
 * cannot be over; between them the decoded text's length is compared with `SIZE_LIMIT`.
 */
export async function readCandidate(
  deps: ScanDeps,
  root: string,
  candidate: Candidate,
): Promise<FileRead> {
  const { size, mtimeMs } = candidate;
  if (size > READ_FREE_LIMIT_BYTES) return { kind: "over_limit", size, mtimeMs };
  const read = await deps.fs.readFile(`${root}/${candidate.path}`);
  if (!read.ok) {
    return read.error.code === "ENOENT"
      ? { kind: "absent" }
      : { kind: "unreadable", code: read.error.code };
  }
  const bytes = read.value;
  if (bytes.includes(0)) return { kind: "binary" };
  const text = decodeUtf8(bytes);
  if (text === null) return { kind: "binary" };
  if (size > SIZE_LIMIT && text.length > SIZE_LIMIT) return { kind: "over_limit", size, mtimeMs };
  return { kind: "text", text, bytes, sha256: deps.sha256(bytes), size, mtimeMs };
}
