/**
 * Workspace discovery for the MCP tools (Req 12.12, 12.13, design "The MCP tools", Workspace).
 * The Workspace_Root is the `workspace` argument or the current directory, then the nearest
 * directory above it that holds `.kiro/provenance`. Every `path` argument is resolved inside the
 * root and rejected otherwise. Errors are values; the tool code turns them into error results.
 */
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { Deps } from "../io/deps.js";
import { findWorkspaceRoot, normalizeDir } from "../io/recorder.js";
import { relativeTo } from "../io/reveal-cmd.js";

type WorkspaceDeps = Pick<Deps, "fs">;

/** The error text for a workspace that has no Record_Directory (Req 12.13). */
export const NOT_SET_UP_MESSAGE =
  "Provenance is not set up in this workspace. Call the tool setup_provenance first.";
/** The error text for `setup_provenance` without `workspace` where the current directory is no workspace (Req 12.12). */
export const NEEDS_WORKSPACE_MESSAGE =
  "The current directory holds neither .git nor .kiro. Pass the argument workspace (an absolute path).";

export type WorkspaceError = { message: string };

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//u.test(path);
}

async function holdsEntry(deps: WorkspaceDeps, dir: string, name: string): Promise<boolean> {
  const base = dir === "/" ? "" : dir;
  return (await deps.fs.lstat(`${base}/${name}`)).ok;
}

/**
 * The Workspace_Root for the four read tools: from `workspace` (absolute) or else `cwd`, up to the
 * nearest directory that holds `.kiro/provenance`.
 */
export async function resolveWorkspace(
  deps: WorkspaceDeps,
  cwd: string,
  workspace: string | undefined,
): Promise<Result<string, WorkspaceError>> {
  const start = normalizeDir(workspace ?? cwd);
  if (!isAbsolutePath(start)) {
    return err({ message: "The argument workspace must be an absolute path." });
  }
  const root = await findWorkspaceRoot(deps, start, null);
  return root === null ? err({ message: NOT_SET_UP_MESSAGE }) : ok(root);
}

/**
 * The directory `setup_provenance` installs into: `workspace` when given, else the current
 * directory only if it holds `.git` or `.kiro` (Req 12.12). No walk up: nothing is set up yet.
 */
export async function resolveSetupRoot(
  deps: WorkspaceDeps,
  cwd: string,
  workspace: string | undefined,
): Promise<Result<string, WorkspaceError>> {
  if (workspace !== undefined) {
    const given = normalizeDir(workspace);
    return isAbsolutePath(given)
      ? ok(given)
      : err({ message: "The argument workspace must be an absolute path." });
  }
  const here = normalizeDir(cwd);
  const found = (await holdsEntry(deps, here, ".git")) || (await holdsEntry(deps, here, ".kiro"));
  return found ? ok(here) : err({ message: NEEDS_WORKSPACE_MESSAGE });
}

/**
 * The workspace-relative form of a `path` argument (absolute, or relative to the root), or an
 * error when it lies outside the root. The root itself gives the empty string. The check is
 * lexical, as the command line's: a `..` is folded away before the comparison.
 */
export function resolveInside(root: string, path: string): Result<string, WorkspaceError> {
  if (path === "") return ok("");
  const probe = relativeTo(root, root, `${path}/x`);
  if (probe === null) {
    return err({ message: `The path ${JSON.stringify(path)} is outside the workspace.` });
  }
  return ok(probe === "x" ? "" : probe.slice(0, -2));
}
