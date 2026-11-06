// Generates src/citations/reporters.json, src/citations/lexis-courts.json, and
// src/citations/REPORTERS_LICENSE.md from a local Free Law Project reporters-db
// checkout (Req 14.2, 14.4, 14.7, 14.9).
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
// Longest LEXIS court the Database grammar reads (design A9 step 2, MAX_COURT).
const MAX_COURT_LENGTH = 40;
const FORBIDDEN_CHARS = [",", "(", ")", '"', "'", "“", "”", "‘", "’"];
const RESERVED_TOKENS = ["WL", "LEXIS"];
const DATABASE_FORM = "database citation form";
const LEXIS_TAIL = /\s+LEXIS$/;
const YEAR_TOKEN = /^(1[6-9]|2\d)\d\d$/;

type Args = { checkout: string; date: string; tag: string; outDir: string };
type Dropped = { entry: string; reason: string };
type Selection = { kept: string[]; dropped: Dropped[]; duplicates: string[] };
type Source = { commit: string; licence: string };
type Output = { reporters: Selection; courts: Selection };

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

function forbiddenReason(entry: string): string | undefined {
  const bad = FORBIDDEN_CHARS.filter((c) => entry.includes(c));
  return bad.length > 0 ? `contains ${bad.map((c) => JSON.stringify(c)).join(", ")}` : undefined;
}

// Returns why an entry breaks the citation grammar, or undefined if it is usable.
function dropReason(entry: string): string | undefined {
  if (entry.trim() === "") return "empty or whitespace only";
  if (entry !== entry.trim()) return "leading or trailing whitespace";
  const forbidden = forbiddenReason(entry);
  if (forbidden !== undefined) return forbidden;
  if (entry.split(/\s+/).some((t) => /^\d+$/.test(t))) return "has an all-digit token";
  // Exact match first, so bare `WL` / `LEXIS` keep their own reason.
  if (RESERVED_TOKENS.includes(entry)) return "reserved database token";
  // `… LEXIS` / `… WL` reporters collide with Database_Citations (Req 14.7).
  if (RESERVED_TOKENS.includes(entry.split(/\s+/).at(-1) ?? "")) return DATABASE_FORM;
  if (entry.length > MAX_REPORTER_LENGTH) {
    return `longer than ${String(MAX_REPORTER_LENGTH)} code units (resolver window)`;
  }
  return undefined;
}

// Returns why a LEXIS court breaks the Database grammar (design A9 step 2), or
// undefined if the grammar can read it back exactly. All-digit tokens are
// allowed; year tokens are not, because the year must directly precede the court.
function courtDropReason(court: string): string | undefined {
  if (court === "") return "empty court";
  if (court.split(" ").some((t) => t === "" || /\s/.test(t))) {
    return "whitespace other than single spaces";
  }
  const forbidden = forbiddenReason(court);
  if (forbidden !== undefined) return forbidden;
  const tokens = court.split(" ");
  if (tokens.some((t) => YEAR_TOKEN.test(t))) return "has a year token (1600–2999)";
  if (tokens[0] === "WL") return "starts with a WL token";
  if (tokens.includes("LEXIS")) return "contains a LEXIS token";
  if (court.length > MAX_COURT_LENGTH) {
    return `longer than ${String(MAX_COURT_LENGTH)} code units (court bound)`;
  }
  return undefined;
}

function selectEntries(
  keys: readonly string[],
  reasonOf: (entry: string) => string | undefined,
): Selection {
  const seen = new Set<string>();
  const selection: Selection = { kept: [], dropped: [], duplicates: [] };
  for (const entry of keys) {
    if (seen.has(entry)) {
      selection.duplicates.push(entry);
      continue;
    }
    seen.add(entry);
    const reason = reasonOf(entry);
    if (reason === undefined) selection.kept.push(entry);
    else selection.dropped.push({ entry, reason });
  }
  return selection;
}

// The court part (entry minus its trailing ` LEXIS`) of every entry dropped as a
// database citation form whose last token is `LEXIS`, in source file order.
function lexisCourtsOf(reporters: Selection): string[] {
  return reporters.dropped
    .filter((d) => d.reason === DATABASE_FORM && LEXIS_TAIL.test(d.entry))
    .map((d) => d.entry.replace(LEXIS_TAIL, ""));
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

function droppedList(selection: Selection): string[] {
  return entryList(selection.dropped.map((d) => `- ${code(d.entry)}: ${d.reason}`));
}

function repeatedList(selection: Selection): string[] {
  return entryList([...new Set(selection.duplicates)].map((d) => `- ${code(d)}`));
}

function noteHeader(args: Args, source: Source, output: Output): string[] {
  return [
    "# reporters.json licence note",
    "",
    "`reporters.json` lists the edition abbreviations from Free Law Project's reporters-db,",
    "in source file order, de-duplicated by first occurrence. `lexis-courts.json` lists the",
    "LEXIS courts derived from the same data. Both are generated by",
    "`scripts/generate-reporters.ts`; do not edit them by hand.",
    "",
    "- Licence: BSD (reporters-db licence text reproduced below)",
    `- Repository: ${REPOSITORY_URL}`,
    `- Release tag: \`${args.tag}\``,
    `- Commit: \`${source.commit}\``,
    `- Generation date: ${args.date}`,
    `- Entries kept: ${String(output.reporters.kept.length)}`,
    `- \`lexis-courts.json\`: ${String(output.courts.kept.length)} entries, each the court part ` +
      "(the entry minus its trailing ` LEXIS`) of an entry dropped below as " +
      `\`${DATABASE_FORM}\` whose last token is \`LEXIS\`, in source file order, ` +
      "de-duplicated by first occurrence, minus the courts dropped below",
  ];
}

function licenceNote(args: Args, source: Source, output: Output): string {
  return [
    ...noteHeader(args, source, output),
    "",
    "## Dropped entries (break the citation grammar)",
    "",
    ...droppedList(output.reporters),
    "",
    "## Repeated abbreviations (first occurrence kept)",
    "",
    ...repeatedList(output.reporters),
    "",
    "## Dropped LEXIS courts (break the Database grammar)",
    "",
    ...droppedList(output.courts),
    "",
    "## Repeated LEXIS courts (first occurrence kept)",
    "",
    ...repeatedList(output.courts),
    "",
    "## reporters-db licence",
    "",
    "```text",
    source.licence,
    "```",
    "",
  ].join("\n");
}

function select(data: unknown): Output {
  const reporters = selectEntries(editionKeysInFileOrder(data), dropReason);
  if (reporters.kept.length === 0) {
    throw new Error("no reporter entries survived filtering");
  }
  const courts = selectEntries(lexisCourtsOf(reporters), courtDropReason);
  if (courts.kept.length === 0) {
    throw new Error("no LEXIS courts survived filtering");
  }
  return { reporters, courts };
}

function writeJson(path: string, entries: readonly string[]): void {
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const data: unknown = JSON.parse(readFileSync(join(args.checkout, DATA_PATH), "utf8"));
  const output = select(data);
  const source = readSource(args.checkout);
  writeJson(join(args.outDir, "reporters.json"), output.reporters.kept);
  writeJson(join(args.outDir, "lexis-courts.json"), output.courts.kept);
  writeFileSync(join(args.outDir, "REPORTERS_LICENSE.md"), licenceNote(args, source, output));
  const { reporters, courts } = output;
  process.stdout.write(
    `kept ${String(reporters.kept.length)}, dropped ${String(reporters.dropped.length)}, ` +
      `repeated ${String(reporters.duplicates.length)}; lexis courts ` +
      `${String(courts.kept.length)}, dropped ${String(courts.dropped.length)} -> ${args.outDir}\n`,
  );
}

main();
