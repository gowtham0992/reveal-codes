// Generates src/citations/reporters.json and src/citations/REPORTERS_LICENSE.md
// from a local Free Law Project reporters-db checkout (Req 14.2, 14.4).
//
// Usage (from packages/engine):
//   node --experimental-strip-types scripts/generate-reporters.ts \
//     <reporters-db-checkout> <generation-date YYYY-MM-DD> <release-tag> [out-dir]
//
// Offline only: the maintainer clones reporters-db at a tagged release first.
// No test or build step runs this script.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_URL = "https://github.com/freelawproject/reporters-db";
const DATA_PATH = join("reporters_db", "data", "reporters.json");
const LICENCE_FILES = ["LICENSE", "LICENSE.txt", "LICENSE.md"];
const MAX_REPORTER_LENGTH = 40;
const FORBIDDEN_CHARS = [",", "(", ")", '"', "'", "“", "”", "‘", "’"];
const RESERVED_TOKENS = ["WL", "LEXIS"];

type Args = { checkout: string; date: string; tag: string; outDir: string };
type Dropped = { entry: string; reason: string };
type Selection = { kept: string[]; dropped: Dropped[]; duplicates: string[] };
type Source = { commit: string; licence: string };

function parseArgs(argv: readonly string[]): Args {
  const [checkout, date, tag, outDir] = argv;
  if (checkout === undefined || date === undefined || tag === undefined) {
    throw new Error(
      "usage: generate-reporters.ts <reporters-db-checkout> <YYYY-MM-DD> <release-tag> [out-dir]",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`generation date must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
  }
  if (tag.trim() === "") {
    throw new Error("release tag must be non-empty");
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const out = outDir ?? join(here, "..", "src", "citations");
  return { checkout: resolve(checkout), date, tag, outDir: resolve(out) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// reporters.json maps each reporter key to a list of reporter objects, each of
// which has an `editions` object whose keys are the canonical abbreviations.
function editionKeysInFileOrder(data: unknown): string[] {
  if (!isRecord(data)) {
    throw new Error("reporters.json: expected a top-level object");
  }
  const keys: string[] = [];
  for (const [name, value] of Object.entries(data)) {
    const reporters = Array.isArray(value) ? (value as unknown[]) : [value];
    for (const reporter of reporters) {
      if (!isRecord(reporter) || !isRecord(reporter["editions"])) {
        throw new Error(`reporters.json: entry ${JSON.stringify(name)} has no editions object`);
      }
      keys.push(...Object.keys(reporter["editions"]));
    }
  }
  return keys;
}

// Returns why an entry breaks the citation grammar, or undefined if it is usable.
function dropReason(entry: string): string | undefined {
  if (entry.trim() === "") return "empty or whitespace only";
  if (entry !== entry.trim()) return "leading or trailing whitespace";
  const bad = FORBIDDEN_CHARS.filter((c) => entry.includes(c));
  if (bad.length > 0) return `contains ${bad.map((c) => JSON.stringify(c)).join(", ")}`;
  if (entry.split(/\s+/).some((t) => /^\d+$/.test(t))) return "has an all-digit token";
  if (RESERVED_TOKENS.includes(entry)) return "reserved database token";
  if (entry.length > MAX_REPORTER_LENGTH) {
    return `longer than ${String(MAX_REPORTER_LENGTH)} code units (resolver window)`;
  }
  return undefined;
}

function selectEntries(keys: readonly string[]): Selection {
  const seen = new Set<string>();
  const selection: Selection = { kept: [], dropped: [], duplicates: [] };
  for (const entry of keys) {
    if (seen.has(entry)) {
      selection.duplicates.push(entry);
      continue;
    }
    seen.add(entry);
    const reason = dropReason(entry);
    if (reason === undefined) selection.kept.push(entry);
    else selection.dropped.push({ entry, reason });
  }
  return selection;
}

function resolveRef(gitDir: string, ref: string): string {
  const loose = join(gitDir, ref);
  if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
  const packed = join(gitDir, "packed-refs");
  if (existsSync(packed)) {
    for (const line of readFileSync(packed, "utf8").split("\n")) {
      const [sha, name] = line.split(" ");
      if (name === ref && sha !== undefined) return sha;
    }
  }
  throw new Error(`cannot resolve git ref ${ref} in ${gitDir}`);
}

function readCommit(checkout: string): string {
  const gitDir = join(checkout, ".git");
  if (!existsSync(join(gitDir, "HEAD"))) {
    throw new Error(`${checkout} is not a git checkout (no .git/HEAD)`);
  }
  const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  const commit = head.startsWith("ref: ") ? resolveRef(gitDir, head.slice(5)) : head;
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`unexpected commit id ${JSON.stringify(commit)}`);
  }
  return commit;
}

function readSource(checkout: string): Source {
  const licenceFile = LICENCE_FILES.map((f) => join(checkout, f)).find((p) => existsSync(p));
  if (licenceFile === undefined) {
    throw new Error(`no licence file (${LICENCE_FILES.join(", ")}) in ${checkout}`);
  }
  const licence = readFileSync(licenceFile, "utf8").replace(/\s+$/, "");
  return { commit: readCommit(checkout), licence };
}

function code(entry: string): string {
  return entry.includes("`") ? `\`\` ${entry} \`\`` : `\`${entry}\``;
}

function entryList(lines: readonly string[]): string[] {
  return lines.length === 0 ? ["None."] : [...lines];
}

function licenceNote(args: Args, source: Source, selection: Selection): string {
  const dropped = selection.dropped.map((d) => `- ${code(d.entry)}: ${d.reason}`);
  const duplicates = [...new Set(selection.duplicates)].map((d) => `- ${code(d)}`);
  return [
    "# reporters.json licence note",
    "",
    "`reporters.json` lists the edition abbreviations from Free Law Project's reporters-db,",
    "in source file order, de-duplicated by first occurrence. It is generated by",
    "`scripts/generate-reporters.ts`; do not edit it by hand.",
    "",
    "- Licence: BSD (reporters-db licence text reproduced below)",
    `- Repository: ${REPOSITORY_URL}`,
    `- Release tag: \`${args.tag}\``,
    `- Commit: \`${source.commit}\``,
    `- Generation date: ${args.date}`,
    `- Entries kept: ${String(selection.kept.length)}`,
    "",
    "## Dropped entries (break the citation grammar)",
    "",
    ...entryList(dropped),
    "",
    "## Repeated abbreviations (first occurrence kept)",
    "",
    ...entryList(duplicates),
    "",
    "## reporters-db licence",
    "",
    "```text",
    source.licence,
    "```",
    "",
  ].join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const data: unknown = JSON.parse(readFileSync(join(args.checkout, DATA_PATH), "utf8"));
  const selection = selectEntries(editionKeysInFileOrder(data));
  if (selection.kept.length === 0) {
    throw new Error("no reporter entries survived filtering");
  }
  const source = readSource(args.checkout);
  writeFileSync(
    join(args.outDir, "reporters.json"),
    `${JSON.stringify(selection.kept, null, 2)}\n`,
  );
  writeFileSync(join(args.outDir, "REPORTERS_LICENSE.md"), licenceNote(args, source, selection));
  process.stdout.write(
    `kept ${String(selection.kept.length)}, dropped ${String(selection.dropped.length)}, ` +
      `repeated ${String(selection.duplicates.length)} -> ${args.outDir}\n`,
  );
}

main();
