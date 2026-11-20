/**
 * Writes the pre-commit block into `.git/hooks/pre-commit` (design, Setup and the pre-commit
 * hook). A new hook is an executable `#!/bin/sh` script; an existing hook gets the block appended
 * and keeps its earlier bytes and its mode; a hook that already has the block is left unchanged.
 */
import { chmod } from "node:fs/promises";
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import { planHook } from "../core/git-hook.js";
import type { ProvenanceError } from "../core/types.js";
import type { Deps } from "./deps.js";

export type HookOutcome =
  | { status: "written" | "appended" | "replaced" | "kept" }
  | { status: "blocked"; reason: "unconditional_exit" | "not_shell_script" };

const failed = (detail: string): ProvenanceError => ({ kind: "write_failed", detail });

/** The one place a failed `chmod` becomes a value. */
export async function makeExecutable(path: string): Promise<Result<void, ProvenanceError>> {
  const done = await chmod(path, 0o755).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : "chmod failed"),
  );
  return done === null ? ok(undefined) : err(failed(done));
}

async function readExisting(
  deps: Pick<Deps, "fs">,
  path: string,
): Promise<Result<string | null, ProvenanceError>> {
  const read = await deps.fs.readFile(path);
  if (read.ok) return ok(new TextDecoder("utf-8").decode(read.value));
  return read.error.code === "ENOENT"
    ? ok(null)
    : err({ kind: "read_failed", detail: read.error.code });
}

/** Puts the block into `<root>/.git/hooks/pre-commit`; see the module comment. */
export async function writeGitHook(
  deps: Pick<Deps, "fs">,
  root: string,
): Promise<Result<HookOutcome, ProvenanceError>> {
  const path = `${root}/.git/hooks/pre-commit`;
  const existing = await readExisting(deps, path);
  if (!existing.ok) return existing;
  const plan = planHook(existing.value);
  if (plan.kind === "present") return ok({ status: "kept" });
  if (plan.kind === "blocked") return ok({ status: "blocked", reason: plan.reason });
  if (plan.kind === "replace") {
    const done = await deps.fs.writeFile(path, plan.text);
    return done.ok ? ok({ status: "replaced" }) : err(failed(done.error.code));
  }
  if (plan.kind === "append") {
    const added = await deps.fs.appendFile(path, plan.text.slice((existing.value ?? "").length));
    return added.ok ? ok({ status: "appended" }) : err(failed(added.error.code));
  }
  const made = await deps.fs.mkdirp(`${root}/.git/hooks`);
  if (!made.ok) return err(failed(made.error.code));
  const written = await deps.fs.writeFile(path, plan.text, true);
  if (!written.ok) return err(failed(written.error.code));
  const mode = await makeExecutable(path);
  return mode.ok ? ok({ status: "written" }) : mode;
}
