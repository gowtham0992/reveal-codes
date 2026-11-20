/** `provenance setup [--git-hook]`: argument parsing and the printed report. */
import { formatBaselineLine } from "./baseline-cmd.js";
import type { Deps } from "./deps.js";
import { setupProvenance } from "./setup.js";
import type { SetupReport } from "./setup.js";
type SetupDeps = Pick<Deps, "fs" | "git" | "sha256" | "clock" | "log" | "pid">;
const CACHE_DIR = ".kiro/provenance/cache/";
/** Cache files can be many; they print as one line with a count. */
function collapse(paths: readonly string[]): string[] {
  const plain = paths.filter((p) => !p.startsWith(CACHE_DIR));
  const cached = paths.length - plain.length;
  const noun = cached === 1 ? "file" : "files";
  return cached === 0 ? plain : [...plain, `${CACHE_DIR} (${String(cached)} ${noun})`];
}
function section(title: string, paths: readonly string[]): string[] {
  const lines = collapse(paths);
  return lines.length === 0 ? [`${title}: none`] : [`${title}:`, ...lines.map((l) => `  ${l}`)];
}
const HOOK_WORDS = {
  written: "written (.git/hooks/pre-commit)",
  appended: "appended to the existing .git/hooks/pre-commit",
  replaced: "previous block replaced in .git/hooks/pre-commit",
  kept: "kept (the block is already in .git/hooks/pre-commit)",
} as const;
function hookLine(report: SetupReport): string[] {
  const hook = report.gitHook;
  if (hook === undefined) return [];
  if (hook.status === "blocked") {
    return [`git hook: not written, the existing pre-commit hook is blocked (${hook.reason})`];
  }
  return [`git hook: ${HOOK_WORDS[hook.status]}`];
}
/** The lines `provenance setup` prints. */
export function formatSetupReport(report: SetupReport): string[] {
  const replacedNote =
    report.replaced.length === 0 ? [] : ["replaced files had different bytes and were refreshed"];
  return [
    ...section("written", report.written),
    ...section("replaced", report.replaced),
    ...replacedNote,
    ...section("kept", report.kept),
    formatBaselineLine(report.baseline),
    ...hookLine(report),
  ];
}
/** Parses the flags: `--git-hook` or nothing. `null` for anything else. */
export function parseSetupArgs(args: readonly string[]): { gitHook: boolean } | null {
  if (args.length === 0) return { gitHook: false };
  return args.length === 1 && args[0] === "--git-hook" ? { gitHook: true } : null;
}
export type SetupIo = { out: (line: string) => void; err: (line: string) => void };
/** Exit status 0 on success, 1 on a usage error or a failed step. */
export async function setupCommand(
  deps: SetupDeps,
  root: string,
  bundlePath: string,
  args: readonly string[],
  io: SetupIo,
): Promise<number> {
  const flags = parseSetupArgs(args);
  if (flags === null) {
    io.err("usage: provenance setup [--git-hook]");
    return 1;
  }
  const result = await setupProvenance(deps, root, bundlePath, flags.gitHook);
  if (!result.ok) {
    const detail = result.error.detail === undefined ? "" : `: ${result.error.detail}`;
    io.err(`setup failed (${result.error.kind}${detail})`);
    return 1;
  }
  for (const line of formatSetupReport(result.value)) io.out(line);
  return 0;
}
