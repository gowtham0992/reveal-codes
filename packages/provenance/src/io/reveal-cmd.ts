/**
 * The Reveal_Command dispatch (design The Reveal_Command): the colour choice, the Workspace_Root,
 * the path argument and the form: `reveal <file>`, `--summary`, `--check` and `--record`.
 * Standard output and the injected writers carry every line.
 */
import { neutralize } from "../core/neutralize.js";
import type { ViewMode } from "../core/view.js";
import type { Deps } from "./deps.js";
import type { ColorEnv } from "./env.js";
import { findWorkspaceRoot, runRecord } from "./recorder.js";
import { checkReport, parseCheckArgs, parseSummaryArgs, summaryReport } from "./reveal-report.js";
import type { Report } from "./reveal-report.js";
import { revealFile } from "./reveal-file.js";

type RevealDeps = Deps;
const NOT_SET_UP = "provenance is not set up here: run setup_provenance";

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
    io.out(NOT_SET_UP);
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

/** The scope of a summary path: `{ scope: null }` for the root itself, null when outside it. */
function scopeOf(root: string, cwd: string, arg: string): { scope: string | null } | null {
  const probe = relativeTo(root, cwd, `${arg}/x`);
  if (probe === null) return null;
  return { scope: probe === "x" ? null : probe.slice(0, -2) };
}

async function inWorkspace(
  deps: RevealDeps,
  io: RevealIo,
  run: (root: string) => Promise<Report>,
): Promise<number> {
  const root = await findWorkspaceRoot(deps, io.cwd, null);
  const report = root === null ? { status: 1 as const, text: NOT_SET_UP } : await run(root);
  io.out(report.text);
  return report.status;
}

async function summaryForm(deps: RevealDeps, io: RevealIo, args: readonly string[]) {
  const parsed = parseSummaryArgs(args);
  if (parsed === null) return usage(io);
  return inWorkspace(deps, io, async (root) => {
    const found = parsed.path === null ? { scope: null } : scopeOf(root, io.cwd, parsed.path);
    if (found === null) {
      return { status: 1, text: `${neutralize(parsed.path ?? "")}: not recorded: not_tracked` };
    }
    return summaryReport(deps, root, found.scope, parsed.top);
  });
}

async function checkForm(deps: RevealDeps, io: RevealIo, args: readonly string[]) {
  const parsed = parseCheckArgs(args);
  if (parsed === null) return usage(io);
  return inWorkspace(deps, io, (root) => checkReport(deps, root, parsed.strict));
}

/** `reveal --record`: the Recorder with the event `manual` (Req 11.11). */
async function recordForm(deps: RevealDeps, io: RevealIo): Promise<number> {
  const root = await findWorkspaceRoot(deps, io.cwd, null);
  if (root === null) {
    io.out(NOT_SET_UP);
    return 1;
  }
  await runRecord(deps, "manual", io.cwd);
  return 0;
}

function usage(io: RevealIo): number {
  io.err(USAGE);
  return 1;
}

/** Runs `reveal <args>` and returns the exit status. */
export async function revealCommand(
  deps: RevealDeps,
  args: readonly string[],
  io: RevealIo,
): Promise<number> {
  const [first, ...rest] = args;
  if (first === "--summary") return summaryForm(deps, io, rest);
  if (first === "--check") return checkForm(deps, io, rest);
  if (first === "--record") return rest.length === 0 ? recordForm(deps, io) : usage(io);
  if (first === undefined || first.startsWith("--") || rest.length > 0) return usage(io);
  return revealOne(deps, io, first);
}
