/**
 * The git pre-commit block (design, Setup and the pre-commit hook) and the pure decision about
 * how to put it into a hook file. No file access here; `io/git-hook-write.ts` does the writing.
 */

/** The first line of the block; its presence marks a hook that already has the block. */
export const GIT_HOOK_MARKER =
  "# reveal-codes provenance: catch up the record, stage it. Never blocks a commit.";

const BLOCK_HEAD = [
  GIT_HOOK_MARKER,
  "if [ -f .kiro/provenance/provenance.mjs ]; then",
  "  node .kiro/provenance/provenance.mjs record manual >/dev/null 2>&1 || true",
];

/** The previous block, whose single `git add` failed as a whole when `records/` was absent. */
const PREVIOUS_BLOCK = [
  ...BLOCK_HEAD,
  "  git add -- .kiro/provenance/baseline.json .kiro/provenance/sessions.json .kiro/provenance/records >/dev/null 2>&1 || true",
  "fi",
  "",
].join("\n");

/** The block, ending in a line feed. Each path is staged by its own guarded `git add`. */
export function gitHookBlock(): string {
  return [
    ...BLOCK_HEAD,
    '  for p in .kiro/provenance/baseline.json .kiro/provenance/sessions.json .kiro/provenance/records; do [ -e "$p" ] && git add -- "$p" >/dev/null 2>&1; done; true',
    "fi",
    "",
  ].join("\n");
}

export type HookPlan =
  | { kind: "create"; text: string }
  | { kind: "append"; text: string }
  | { kind: "present" }
  | { kind: "replace"; text: string }
  | { kind: "blocked"; reason: "unconditional_exit" | "not_shell_script" };

const SHELL_SHEBANG = /^#!\s*(?:\/usr\/bin\/env\s+)?(?:\S*\/)?(?:sh|bash|dash|zsh)(?:\s|$)/u;
const TOP_LEVEL_EXIT = /^exit(?:\s|;|$)/mu;

/**
 * What to do with the current content of `.git/hooks/pre-commit` (`null` when the file is absent).
 * An existing hook keeps its bytes; the block is appended after a line feed. A hook that is not a
 * shell script, or that has an unindented `exit` line, is reported and left alone, because the
 * block would never run or would not be valid there. A hook with the previous block gets it
 * replaced in place.
 */
export function planHook(existing: string | null): HookPlan {
  if (existing === null) return { kind: "create", text: `#!/bin/sh\n${gitHookBlock()}` };
  if (existing.includes(gitHookBlock())) return { kind: "present" };
  if (existing.includes(PREVIOUS_BLOCK)) {
    return { kind: "replace", text: existing.replace(PREVIOUS_BLOCK, () => gitHookBlock()) };
  }
  if (existing.includes(GIT_HOOK_MARKER)) return { kind: "present" };
  const first = existing.split("\n", 1)[0] ?? "";
  if (first.startsWith("#!") && !SHELL_SHEBANG.test(first)) {
    return { kind: "blocked", reason: "not_shell_script" };
  }
  if (TOP_LEVEL_EXIT.test(existing)) return { kind: "blocked", reason: "unconditional_exit" };
  const joiner = existing === "" || existing.endsWith("\n") ? "" : "\n";
  return { kind: "append", text: `${existing}${joiner}${gitHookBlock()}` };
}
