import { createDocument, err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { Baseline, BaselineEntry, ProvenanceError } from "./types.js";

const SHA256_RE = /^[0-9a-f]{64}$/u;
const BLOB_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function bad(detail: string): Result<never, ProvenanceError> {
  return err({ kind: "bad_baseline", detail });
}

function entryText(entry: BaselineEntry): string {
  const blob = entry.blob === undefined ? "" : `, "blob": ${JSON.stringify(entry.blob)}`;
  return `{ "sha256": ${JSON.stringify(entry.sha256)}${blob} }`;
}

/**
 * The text of baseline.json (Req 5.4, 6.3): one entry per line, entries in
 * UTF-16 code unit order of path, so the same set gives the same bytes in any
 * insertion order. The text ends with a line feed.
 */
export function encodeBaseline(baseline: Baseline): string {
  const paths = Object.keys(baseline.files).sort();
  const lines = paths.map((path, index) => {
    const entry = baseline.files[path] as BaselineEntry;
    const comma = index < paths.length - 1 ? "," : "";
    return `    ${JSON.stringify(path)}: ${entryText(entry)}${comma}`;
  });
  const files = lines.length === 0 ? '  "files": {}' : `  "files": {\n${lines.join("\n")}\n  }`;
  return `{\n  "version": 1,\n  "at": ${JSON.stringify(baseline.at)},\n${files}\n}\n`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): Result<unknown, ProvenanceError> {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    // Non-JSON text is the defined error case, returned as a value.
    return bad("not JSON");
  }
}

function decodeEntry(path: string, value: unknown): Result<BaselineEntry, ProvenanceError> {
  if (!isRecord(value)) return bad(`entry is not an object: ${path}`);
  const extra = Object.keys(value).find((key) => key !== "sha256" && key !== "blob");
  if (extra !== undefined) return bad(`unknown entry key ${extra}: ${path}`);
  const { sha256, blob } = value;
  if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return bad(`bad sha256: ${path}`);
  if (blob === undefined) return ok({ sha256 });
  if (typeof blob !== "string" || !BLOB_RE.test(blob)) return bad(`bad blob: ${path}`);
  return ok({ sha256, blob });
}

function decodeFiles(value: unknown): Result<Record<string, BaselineEntry>, ProvenanceError> {
  if (!isRecord(value)) return bad("files is not an object");
  const pairs: [string, BaselineEntry][] = [];
  for (const [path, raw] of Object.entries(value)) {
    const entry = decodeEntry(path, raw);
    if (!entry.ok) return entry;
    pairs.push([path, entry.value]);
  }
  // fromEntries defines own properties, so a path such as `__proto__` stays data.
  return ok(Object.fromEntries(pairs));
}

export function validAt(at: unknown): at is string {
  // The Engine exports no timestamp predicate; createDocument checks the same one first.
  return typeof at === "string" && createDocument("", at).ok;
}

/**
 * Read baseline.json: `version` 1, an `at` that the Engine accepts as a
 * timestamp, and `files` entries `{ sha256, blob? }` with lowercase hex. Any
 * other shape is an error value (Req 5.4, 6.3, 5.18). Never throws.
 */
export function decodeBaseline(text: string): Result<Baseline, ProvenanceError> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  if (!isRecord(root)) return bad("not an object");
  if (root["version"] !== 1) return bad("unsupported version");
  const at = root["at"];
  if (!validAt(at)) return bad("bad at");
  const files = decodeFiles(root["files"]);
  if (!files.ok) return files;
  return ok({ version: 1, at, files: files.value });
}
