/**
 * The Reveal_Command dispatch (design The Reveal_Command): the colour choice, the Workspace_Root,
 * the path argument and the form. `reveal <file>` is built here; `--summary`, `--check` and
 * `--record` are added by the next task. Standard output and the injected writers carry every line.
 */
import { neutralize } from "../core/neutralize.js";
import type { ViewMode } from "../core/view.js";
import type { Deps } from "./deps.js";
import type { ColorEnv } from "./env.js";
import { findWorkspaceRoot } from "./recorder.js";
import { revealFile } from "./reveal-file.js";

type RevealDeps = Pick<Deps, "fs" | "git" | "sha256" | "log" | "pid">;

/** The process facts the command needs, injected so a test passes its own. */
export type RevealIo = {
  cwd: string;
  env: ColorEnv;
  isTTY: boolean;
  out: (text: string) => void;
  err: (text: string) => void;
};

export const USAGE =
  "usage: reveal <file> | --summary [path] [--top <n>] | --check [--strict] | --record";

/** 24-bit, 256 colours or plain, from the terminal facts (Req 9.5 to 9.7). */
export function chooseMode(env: ColorEnv, isTTY: boolean): ViewMode {
  if (!isTTY || env.noColor || env.term === "dumb") return "plain";
  if (env.colorterm === "truecolor" || env.colorterm === "24bit") return "truecolor";
  return env.term?.includes("256color") === true ? "ansi256" : "plain";
}

/** The workspace-relative path of `arg`, or null when it lies outside the Workspace_Root. */
export function relativeTo(root: string, cwd: string, arg: string): string | null {
  const parts: string[] = [];
  const joined = arg.startsWith("/") ? arg : `${cwd}/${arg}`;
  for (const part of joined.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  }
  const base = root.split("/").filter((p) => p !== "");
  if (parts.length <= base.length || base.some((p, i) => parts[i] !== p)) return null;
  return parts.slice(base.length).join("/");
}

async function revealOne(deps: RevealDeps, io: RevealIo, arg: string): Promise<number> {
  const root = await findWorkspaceRoot(deps, io.cwd, null);
  if (root === null) {
    io.out("provenance is not set up here: run setup_provenance");
    return 1;
  }
  const path = relativeTo(root, io.cwd, arg);
  if (path === null) {
    io.out(`${neutralize(arg)}: not recorded: not_tracked`);
    return 1;
  }
  const shown = await revealFile(deps, root, path, chooseMode(io.env, io.isTTY));
  io.out(shown.text);
  return shown.status;
}

/** Runs `reveal <args>` and returns the exit status. */
export async function revealCommand(
  deps: RevealDeps,
  args: readonly string[],
  io: RevealIo,
): Promise<number> {
  const [first, ...rest] = args;
  if (first === undefined || first.startsWith("--") || rest.length > 0) {
    io.err(USAGE);
    return 1;
  }
  return revealOne(deps, io, first);
}
