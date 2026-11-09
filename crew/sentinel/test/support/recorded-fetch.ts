import { readFileSync } from "node:fs";
import { onTestFinished } from "vitest";
import { createFixtureFetch } from "@reveal-codes/verifier";
import type { FetchInit, FetchLike, HttpResponse } from "@reveal-codes/verifier";

export type RecordedFetch = Readonly<{ fetch: FetchLike; misses: string[] }>;

export type RecordedFetchOptions = Readonly<{ failOnMiss?: boolean }>;

const FIXTURES = "../../../../packages/verifier/fixtures/";

type Recorded = Readonly<{ lines: ReadonlySet<string>; paths: ReadonlySet<string> }>;

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(FIXTURES + name, import.meta.url), "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The lookup lines, cluster paths and opinion paths listed in the verifier manifest. */
function loadRecorded(): Recorded {
  const lines = new Set<string>();
  const paths = new Set<string>();
  const manifest = readFixture("manifest.json");
  for (const entry of Array.isArray(manifest) ? (manifest as readonly unknown[]) : []) {
    if (!isRecord(entry)) continue;
    if (entry["kind"] === "lookup" && typeof entry["line"] === "string") lines.add(entry["line"]);
    const isPath = entry["kind"] === "cluster" || entry["kind"] === "opinion";
    if (isPath && typeof entry["path"] === "string") paths.add(entry["path"]);
  }
  return { lines, paths };
}

function lookupLines(body: string | undefined): string[] {
  return (new URLSearchParams(body ?? "").get("text") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

function pathOf(url: string): string | null {
  return URL.canParse(url) ? new URL(url).pathname : null;
}

function isRecordedRequest(recorded: Recorded, url: string, init: FetchInit): boolean {
  const path = pathOf(url);
  if (path === null) return false;
  if (init.method === "POST" && path.endsWith("/citation-lookup/")) {
    const lines = lookupLines(init.body);
    return lines.length > 0 && lines.every((l) => recorded.lines.has(l));
  }
  return init.method === "GET" && recorded.paths.has(path);
}

/**
 * A fetch that serves only requests listed in the verifier manifest. Any other request is
 * recorded in `misses` and throws. The Verifier turns a thrown fetch into `unchecked`, so
 * unless `failOnMiss` is false the test also fails when it ends with a miss (D15).
 */
export function recordedFetch(options: RecordedFetchOptions = {}): RecordedFetch {
  const recorded = loadRecorded();
  const inner = createFixtureFetch();
  const misses: string[] = [];
  const fetch: FetchLike = (url, init) => {
    if (isRecordedRequest(recorded, url, init)) return inner(url, init);
    const description = `${init.method} ${url} [${lookupLines(init.body).join(", ")}]`;
    misses.push(description);
    throw new Error(`unrecorded request: ${description}`);
  };
  if (options.failOnMiss !== false) {
    onTestFinished(() => {
      if (misses.length > 0) {
        throw new Error(`unrecorded requests: ${misses.join("; ")}`);
      }
    });
  }
  return { fetch, misses };
}

/** A fetch that answers every request with the recorded HTTP 429 (`Retry-After: 30`). */
export function throttleFetch(): FetchLike {
  const recorded = readFixture("http/throttle-429.json");
  const status =
    isRecord(recorded) && typeof recorded["status"] === "number" ? recorded["status"] : 429;
  const headerMap = new Map<string, string>();
  const headers = isRecord(recorded) ? recorded["headers"] : undefined;
  for (const [name, value] of Object.entries(isRecord(headers) ? headers : {})) {
    if (typeof value === "string") headerMap.set(name.toLowerCase(), value);
  }
  const body = JSON.stringify(isRecord(recorded) ? recorded["body"] : {});
  return (): Promise<HttpResponse> =>
    Promise.resolve({
      status,
      headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
      text: () => Promise.resolve(body),
    });
}
