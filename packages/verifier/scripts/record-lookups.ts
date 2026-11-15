import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clusterDataByIndex, foundNames, foundYear } from "../src/clusters";
import type { FetchLike } from "../src/deps";
import { asArray, isRecord, parseJson } from "../src/json";
import { namesMatch } from "../src/name-match";
import { buildLookupRequest } from "../src/request";
import { EXPECTED } from "./record-expected";

/**
 * Records live citation-lookup entries as fixtures (case-match, Requirement 11).
 * Dry run by default; `--write` writes the six new fixtures when nothing differs.
 * `main` is the only reader of COURTLISTENER_TOKEN. The token is never printed,
 * logged or written, and no header reaches a fixture.
 */

const BASE_URL = "https://www.courtlistener.com/api/rest/v4";
const TIMEOUT_MS = 30_000;
/** The line kept for comparison only; its committed fixture is not rewritten. */
const COMPARE_ONLY = "556 U.S. 662";

export const RECORD_LINES: readonly string[] = Object.keys(EXPECTED);

export type ReportRow = Readonly<{
  line: string;
  status: number | null;
  clusterId: string | null;
  foundName: string | null;
  foundYear: number | null;
  cited: string;
  outcome: string;
  /** Only for the compare-only line: the live entry against the committed fixture. */
  comparison: "matches" | "differs" | "none";
}>;

export type RecordInput = Readonly<{
  fetch: FetchLike;
  token: string;
  baseUrl: string;
  lines: readonly string[];
  /** The committed fixture entry for a line, or undefined. */
  existing: (line: string) => unknown;
}>;

export type RecordedLine = Readonly<{ line: string; fixture: unknown; report: ReportRow }>;

function pickStrings(
  from: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = from[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function trimCluster(c: unknown): unknown {
  if (!isRecord(c)) return c;
  const out = pickStrings(c, ["id", "absolute_url", "case_name"]);
  for (const k of ["case_name_full", "case_name_short"]) {
    if (typeof c[k] === "string") out[k] = c[k];
  }
  if (c["date_filed"] !== undefined) out["date_filed"] = c["date_filed"];
  return out;
}

/** Keeps only the identifying fields of one lookup entry. Pure. */
export function trimEntry(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
  const out = pickStrings(entry, [
    "citation",
    "normalized_citations",
    "start_index",
    "end_index",
    "status",
    "error_message",
  ]);
  const clusters = asArray(entry["clusters"]);
  if (clusters !== null) out["clusters"] = clusters.map(trimCluster);
  return out;
}

/** The single-line form of a fixture entry: indexes relative to the line alone. */
function rebase(line: string, trimmed: unknown): unknown {
  if (!isRecord(trimmed)) return trimmed;
  return { ...trimmed, start_index: 0, end_index: line.length };
}

function outcomeOf(cited: string, entry: unknown): ReportRow["outcome"] {
  if (!isRecord(entry)) return "missing";
  const status = entry["status"];
  if (status === 404) return "not_found";
  if (status === 300) return "ambiguous";
  if (status !== 200) return `other_${String(status)}`;
  const data = clusterDataByIndex([entry]).get(0);
  if (data === undefined) return "other_200";
  const names = foundNames(data);
  if (data.caseName === undefined || data.caseName.trim() === "") return "verified";
  return namesMatch(cited, names) ? "verified" : "wrong_case";
}

function firstCluster(entry: unknown): Readonly<Record<string, unknown>> | null {
  if (!isRecord(entry)) return null;
  const first = (asArray(entry["clusters"]) ?? []).find(isRecord);
  return first ?? null;
}

function reportFor(line: string, entry: unknown, existing: unknown): ReportRow {
  const cited = EXPECTED[line]?.cited ?? "";
  const cluster = firstCluster(entry);
  const data = entry === undefined ? undefined : clusterDataByIndex([entry]).get(0);
  const id = cluster?.["id"];
  const live = JSON.stringify(rebase(line, trimEntry(entry)));
  const old = JSON.stringify(rebase(line, trimEntry(existing)));
  const compared = line === COMPARE_ONLY && existing !== undefined;
  return {
    line,
    status: isRecord(entry) && typeof entry["status"] === "number" ? entry["status"] : null,
    clusterId: typeof id === "number" || typeof id === "string" ? String(id) : null,
    foundName: data?.caseName ?? null,
    foundYear: data === undefined ? null : (foundYear(data) ?? null),
    cited,
    outcome: outcomeOf(cited, entry),
    comparison: compared ? (live === old ? "matches" : "differs") : "none",
  };
}

function entryAt(entries: readonly unknown[], offset: number): unknown {
  return entries.find((e) => isRecord(e) && e["start_index"] === offset);
}

/** One request for all lines; returns a fixture and a report row per line. */
export async function recordLookups(input: RecordInput): Promise<readonly RecordedLine[]> {
  const req = buildLookupRequest({ baseUrl: input.baseUrl, token: input.token }, input.lines);
  const res = await input.fetch(req.url, {
    ...req.spec,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
  if (res.status !== 200) throw new Error(`CourtListener answered HTTP ${String(res.status)}`);
  const parsed = parseJson(await res.text());
  const entries = parsed.ok ? (asArray(parsed.value) ?? []) : [];
  let offset = 0;
  return input.lines.map((line) => {
    const entry = entryAt(entries, offset);
    offset += line.length + 1;
    const report = reportFor(line, entry, input.existing(line));
    const fixture = entry === undefined ? null : { line, entry: rebase(line, trimEntry(entry)) };
    return { line, fixture, report };
  });
}

/** The differences between the report rows and the Expected_Outcomes, or []. Pure. */
export function checkExpected(rows: readonly ReportRow[]): readonly string[] {
  const out: string[] = [];
  for (const [line, want] of Object.entries(EXPECTED)) {
    const row = rows.find((r) => r.line === line);
    if (row === undefined) {
      out.push(`${line}: no result`);
      continue;
    }
    if (row.status !== want.status)
      out.push(`${line}: status ${String(want.status)} expected, got ${String(row.status)}`);
    if (row.clusterId !== want.clusterId)
      out.push(`${line}: cluster ${String(want.clusterId)} expected, got ${String(row.clusterId)}`);
    if (row.outcome !== want.outcome)
      out.push(
        `${line}: outcome ${want.outcome} expected, got ${row.outcome} (found name ${String(row.foundName)})`,
      );
  }
  return out;
}

function slugOf(line: string): string {
  return line
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatRow(r: ReportRow): string {
  const cmp = r.comparison === "none" ? "" : ` | fixture ${r.comparison}`;
  return (
    [
      r.line,
      `status ${String(r.status)}`,
      `cluster ${String(r.clusterId)}`,
      `found ${String(r.foundName)} (${String(r.foundYear)})`,
      `cited ${r.cited}`,
      `rule ${r.outcome}`,
    ].join(" | ") + cmp
  );
}

export type MainIo = Readonly<{
  env: Readonly<Record<string, string | undefined>>;
  fetch: FetchLike;
  readExisting: (line: string) => unknown;
  writeFixture: (slug: string, body: string) => void;
  print: (text: string) => void;
  printError: (text: string) => void;
}>;

/** Exit code: 0 ok, 1 no token, 2 differences from the Expected_Outcomes. */
export async function main(argv: readonly string[], io: MainIo): Promise<number> {
  const token = io.env["COURTLISTENER_TOKEN"];
  if (token === undefined || token === "") {
    io.printError(
      "record-lookups: COURTLISTENER_TOKEN is not set. Run this script in your own terminal with the token in your environment.",
    );
    return 1;
  }
  const recorded = await recordLookups({
    fetch: io.fetch,
    token,
    baseUrl: BASE_URL,
    lines: RECORD_LINES,
    existing: io.readExisting,
  });
  const rows = recorded.map((r) => r.report);
  for (const r of rows) io.print(formatRow(r));
  const diffs = checkExpected(rows);
  if (diffs.length > 0) {
    io.printError(
      ["record-lookups: differs from the Expected_Outcomes, nothing written:", ...diffs].join("\n"),
    );
    return 2;
  }
  if (!argv.includes("--write")) {
    io.print("Dry run: no differences. Run again with --write to record the six new fixtures.");
    return 0;
  }
  for (const r of recorded) {
    if (r.line === COMPARE_ONLY) continue;
    io.writeFixture(slugOf(r.line), `${JSON.stringify(r.fixture, null, 2)}\n`);
  }
  io.print(
    "Wrote six fixtures under fixtures/lookup/. Manifest, README and fixtures.ts are not touched.",
  );
  return 0;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOKUP_DIR = resolve(HERE, "../fixtures/lookup");

function readExistingFixture(line: string): unknown {
  const parsed = parseJson(readFileSync(resolve(LOOKUP_DIR, `${slugOf(line)}.json`), "utf8"));
  return parsed.ok && isRecord(parsed.value) ? parsed.value["entry"] : undefined;
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2), {
    env: process.env,
    fetch: (url, init) => fetch(url, init),
    readExisting: readExistingFixture,
    writeFixture: (slug, body) => {
      writeFileSync(resolve(LOOKUP_DIR, `${slug}.json`), body);
    },
    print: (t) => process.stdout.write(`${t}\n`),
    printError: (t) => process.stderr.write(`${t}\n`),
  }).then((code) => {
    process.exitCode = code;
  });
}
