import { compileGlob, type Glob } from "./glob.js";

/** One line of an ignore file, read as a line of a `.gitignore` at the Workspace_Root. */
export type IgnoreRule = {
  negated: boolean;
  /** A trailing `/`: the rule matches directories only. */
  dirOnly: boolean;
  /** A leading or inner `/`: the glob is matched against the whole path from the root. */
  anchored: boolean;
  glob: Glob;
};

/** The rules of one ignore file, in file order. */
export type IgnoreRules = readonly IgnoreRule[];

/** Removes trailing spaces that no backslash escapes, as git does; a final backslash stops it. */
function trimTrailingSpaces(line: string): string {
  let lastSpace = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === " ") {
      if (lastSpace < 0) lastSpace = i;
    } else if (ch === "\\") {
      i += 1;
      if (i >= line.length) return line;
      lastSpace = -1;
    } else {
      lastSpace = -1;
    }
  }
  return lastSpace >= 0 ? line.slice(0, lastSpace) : line;
}

function parseLine(raw: string): IgnoreRule | null {
  const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  if (line === "" || line.startsWith("#")) return null;
  let pattern = trimTrailingSpaces(line);
  const negated = pattern.startsWith("!");
  if (negated) pattern = pattern.slice(1);
  const dirOnly = pattern.endsWith("/");
  if (dirOnly) pattern = pattern.slice(0, -1);
  const anchored = pattern.includes("/");
  if (anchored && pattern.startsWith("/")) pattern = pattern.slice(1);
  if (pattern === "") return null;
  return { negated, dirOnly, anchored, glob: compileGlob(pattern) };
}

/** Parses the text of `.kiroignore` or `.kiro/provenance/ignore` with the full gitignore syntax. */
export function parseIgnore(text: string): IgnoreRules {
  const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rules: IgnoreRule[] = [];
  for (const raw of body.split("\n")) {
    const rule = parseLine(raw);
    if (rule !== null) rules.push(rule);
  }
  return rules;
}
