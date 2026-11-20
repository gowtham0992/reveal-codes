/**
 * `provenance setup [--git-hook]` (Req 13.3, 13.4, 13.14; design, Setup and the pre-commit hook).
 * In order: the Record_Directory, the Bundle copy, the wrapper, the Record_Directory `.gitignore`,
 * the Ignore_File, the Hook_File, then the baseline. Only the Bundle copy and the wrapper are ever
 * replaced, and only when their bytes differ. Everything else that exists is kept untouched.
 * `.kiroignore` is never read or written.
 */
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import { hookFileText } from "../core/hook-file.js";
import type { ProvenanceError } from "../core/types.js";
import { wrapperText } from "../core/wrapper.js";
import { atomicWrite } from "./atomic.js";
import { runBaseline } from "./baseline-cmd.js";
import type { BaselineSummary } from "./baseline-cmd.js";
import type { Deps } from "./deps.js";
import { makeExecutable, writeGitHook } from "./git-hook-write.js";
import type { HookOutcome } from "./git-hook-write.js";
type SetupDeps = Pick<Deps, "fs" | "git" | "sha256" | "clock" | "log" | "pid">;
export type SetupReport = {
  written: string[];
  replaced: string[];
  kept: string[];
  baseline: BaselineSummary;
  /** Present only with `--git-hook`. */
  gitHook?: HookOutcome;
};
type Status = "written" | "replaced" | "kept";
const PROV = ".kiro/provenance";
const HOOK_PATH = ".kiro/hooks/0-provenance.json";
const GITIGNORE_TEXT = "state.json\nerrors.log\nlock\ncache/\n";
const IGNORE_TEXT = [
  "# Recording-only exclusions for Provenance, in gitignore syntax.",
  "# A path matched here is not recorded and gets no Record or Baseline entry.",
  "# This file never hides a file from the agent; .kiroignore is separate and is not touched.",
  "",
].join("\n");
const failed = (kind: "read_failed" | "write_failed", detail: string): ProvenanceError => ({
  kind,
  detail,
});
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
type Put = { root: string; rel: string; data: Uint8Array; executable: boolean };
/** Writes a file that does not exist; an existing file is never touched. */
async function putIfAbsent(deps: SetupDeps, put: Put): Promise<Result<Status, ProvenanceError>> {
  const path = `${put.root}/${put.rel}`;
  const stat = await deps.fs.lstat(path);
  if (stat.ok) return ok("kept");
  if (stat.error.code !== "ENOENT") return err(failed("read_failed", stat.error.code));
  return writeNew(deps, path, put);
}
async function writeNew(
  deps: SetupDeps,
  path: string,
  put: Put,
): Promise<Result<Status, ProvenanceError>> {
  const written = await atomicWrite(deps, path, put.data);
  if (!written.ok) return err(failed("write_failed", written.error.code));
  if (put.executable) {
    const mode = await makeExecutable(path);
    if (!mode.ok) return mode;
  }
  return ok("written");
}
/** Writes a file that does not exist, or replaces it when its bytes differ. */
async function putOrReplace(deps: SetupDeps, put: Put): Promise<Result<Status, ProvenanceError>> {
  const path = `${put.root}/${put.rel}`;
  const read = await deps.fs.readFile(path);
  if (!read.ok && read.error.code !== "ENOENT") return err(failed("read_failed", read.error.code));
  if (!read.ok) return writeNew(deps, path, put);
  if (sameBytes(read.value, put.data)) return ok("kept");
  const done = await writeNew(deps, path, put);
  return done.ok ? ok("replaced") : done;
}
type Lists = { written: string[]; replaced: string[]; kept: string[] };
function note(lists: Lists, status: Status, rel: string): void {
  lists[status].push(rel);
}
async function readBundle(
  deps: SetupDeps,
  bundlePath: string,
): Promise<Result<Uint8Array, ProvenanceError>> {
  if (!bundlePath.endsWith(".mjs")) {
    return err(failed("read_failed", "not_running_from_bundle"));
  }
  const read = await deps.fs.readFile(bundlePath);
  return read.ok ? ok(read.value) : err(failed("read_failed", read.error.code));
}
/** The files after the Bundle: wrapper, `.gitignore`, Ignore_File, Hook_File. */
async function writeFixedFiles(
  deps: SetupDeps,
  root: string,
  lists: Lists,
): Promise<Result<void, ProvenanceError>> {
  const steps: [(d: SetupDeps, p: Put) => Promise<Result<Status, ProvenanceError>>, Put][] = [
    [putOrReplace, { root, rel: `${PROV}/reveal`, data: enc(wrapperText()), executable: true }],
    [
      putIfAbsent,
      { root, rel: `${PROV}/.gitignore`, data: enc(GITIGNORE_TEXT), executable: false },
    ],
    [putIfAbsent, { root, rel: `${PROV}/ignore`, data: enc(IGNORE_TEXT), executable: false }],
    [putIfAbsent, { root, rel: HOOK_PATH, data: enc(hookFileText()), executable: false }],
  ];
  for (const [put, spec] of steps) {
    const done = await put(deps, spec);
    if (!done.ok) return done;
    note(lists, done.value, spec.rel);
  }
  return ok(undefined);
}
async function existing(deps: SetupDeps, path: string): Promise<boolean> {
  return (await deps.fs.lstat(path)).ok;
}
/** Runs the baseline and files its outputs under written or kept by whether they existed before. */
async function runBaselineStep(
  deps: SetupDeps,
  root: string,
  lists: Lists,
): Promise<Result<BaselineSummary, ProvenanceError>> {
  const dir = `${root}/${PROV}`;
  const before = new Set<string>();
  for (const name of ["baseline.json", "sessions.json"]) {
    if (await existing(deps, `${dir}/${name}`)) before.add(name);
  }
  const cacheBefore = await deps.fs.readdir(`${dir}/cache`);
  const hadCache = new Set(cacheBefore.ok ? cacheBefore.value : []);
  const summary = await runBaseline(deps, root);
  if (!summary.ok) return summary;
  for (const name of ["baseline.json", "sessions.json"]) {
    if (await existing(deps, `${dir}/${name}`)) {
      note(lists, before.has(name) ? "kept" : "written", `${PROV}/${name}`);
    }
  }
  const cacheAfter = await deps.fs.readdir(`${dir}/cache`);
  for (const name of cacheAfter.ok ? cacheAfter.value.sort() : []) {
    note(lists, hadCache.has(name) ? "kept" : "written", `${PROV}/cache/${name}`);
  }
  return summary;
}
/** Setup without the git hook; see the module comment. */
export async function setupProvenance(
  deps: SetupDeps,
  root: string,
  bundlePath: string,
  gitHook: boolean,
): Promise<Result<SetupReport, ProvenanceError>> {
  const bundle = await readBundle(deps, bundlePath);
  if (!bundle.ok) return bundle;
  if (gitHook) {
    const git = await deps.fs.lstat(`${root}/.git`);
    if (!git.ok || git.value.kind !== "dir") return err(failed("write_failed", "no_git_directory"));
  }
  const made = await deps.fs.mkdirp(`${root}/${PROV}`);
  if (!made.ok) return err(failed("write_failed", made.error.code));
  const lists: Lists = { written: [], replaced: [], kept: [] };
  const copy = await putOrReplace(deps, {
    root,
    rel: `${PROV}/provenance.mjs`,
    data: bundle.value,
    executable: false,
  });
  if (!copy.ok) return copy;
  note(lists, copy.value, `${PROV}/provenance.mjs`);
  const fixed = await writeFixedFiles(deps, root, lists);
  if (!fixed.ok) return fixed;
  const baseline = await runBaselineStep(deps, root, lists);
  if (!baseline.ok) return baseline;
  if (!gitHook) return ok({ ...lists, baseline: baseline.value });
  const hook = await writeGitHook(deps, root);
  return hook.ok ? ok({ ...lists, baseline: baseline.value, gitHook: hook.value }) : hook;
}
