import { encodeParts, matchGlob } from "./glob.js";
import type { IgnoreRule, IgnoreRules } from "./ignore-parse.js";

function ruleMatches(rule: IgnoreRule, parts: readonly Uint8Array[], isDir: boolean): boolean {
  if (rule.dirOnly && !isDir) return false;
  if (rule.anchored) return matchGlob(rule.glob, parts);
  const last = parts[parts.length - 1];
  return last !== undefined && matchGlob(rule.glob, [last]);
}

/** Whether the last rule that matches the entry excludes it; no match leaves it included. */
function excludedAt(rules: IgnoreRules, parts: readonly Uint8Array[], isDir: boolean): boolean {
  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const rule = rules[i] as IgnoreRule;
    if (ruleMatches(rule, parts, isDir)) return !rule.negated;
  }
  return false;
}

/**
 * Whether one ignore file excludes the file at `path` (workspace-relative, `/` separated).
 * Each ancestor directory is tested from the root, then the file. The last matching rule
 * decides at each level, and nothing below an excluded directory is re-included.
 */
export function isIgnored(rules: IgnoreRules, path: string): boolean {
  const parts = encodeParts(path.split("/"));
  for (let depth = 1; depth <= parts.length; depth += 1) {
    if (excludedAt(rules, parts.slice(0, depth), depth < parts.length)) return true;
  }
  return false;
}

/**
 * Whether any of the ignore files excludes the path. Each file is evaluated on its own, so a
 * `!` rule in one file never re-includes a file that another file excludes.
 */
export function isIgnoredByAny(files: readonly IgnoreRules[], path: string): boolean {
  return files.some((rules) => isIgnored(rules, path));
}
