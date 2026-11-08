import type { FetchInit, FetchLike, HttpResponse } from "./deps";
import { isRecord } from "./json";
import cluster108432 from "../fixtures/clusters/108432.json" with { type: "json" };
import cluster145875 from "../fixtures/clusters/145875.json" with { type: "json" };
import lookup1012 from "../fixtures/lookup/1012-f-supp-2d-88.json" with { type: "json" };
import lookup1047 from "../fixtures/lookup/1047-f3d-212.json" with { type: "json" };
import lookup1H150 from "../fixtures/lookup/1-h-150.json" with { type: "json" };
import lookup404 from "../fixtures/lookup/404-us-519.json" with { type: "json" };
import lookup556 from "../fixtures/lookup/556-us-662.json" with { type: "json" };
import lookup576 from "../fixtures/lookup/576-us-644.json" with { type: "json" };
import lookup912 from "../fixtures/lookup/912-f4th-33.json" with { type: "json" };
import manifestJson from "../fixtures/manifest.json" with { type: "json" };
import opinion108432 from "../fixtures/opinions/108432.json" with { type: "json" };
import opinion9435339 from "../fixtures/opinions/9435339.json" with { type: "json" };

/** Every routable fixture body, keyed by its manifest `file`. */
const BODIES: Readonly<Record<string, unknown>> = {
  "lookup/556-us-662.json": lookup556,
  "lookup/404-us-519.json": lookup404,
  "lookup/1047-f3d-212.json": lookup1047,
  "lookup/1012-f-supp-2d-88.json": lookup1012,
  "lookup/912-f4th-33.json": lookup912,
  "lookup/1-h-150.json": lookup1H150,
  "lookup/576-us-644.json": lookup576,
  "clusters/145875.json": cluster145875,
  "clusters/108432.json": cluster108432,
  "opinions/9435339.json": opinion9435339,
  "opinions/108432.json": opinion108432,
};

const LOOKUP_PATH_TAIL = "/citation-lookup/";
const NOT_FOUND_BODY = JSON.stringify({ detail: "Not found." });

type Maps = Readonly<{
  lookupByLine: ReadonlyMap<string, unknown>;
  clusterByPath: ReadonlyMap<string, unknown>;
  opinionByPath: ReadonlyMap<string, unknown>;
}>;

function buildMaps(): Maps {
  const lookupByLine = new Map<string, unknown>();
  const clusterByPath = new Map<string, unknown>();
  const opinionByPath = new Map<string, unknown>();
  const manifest: unknown = manifestJson;
  for (const e of Array.isArray(manifest) ? (manifest as readonly unknown[]) : []) {
    if (!isRecord(e) || typeof e["file"] !== "string") continue;
    const body = BODIES[e["file"]];
    if (body === undefined) continue;
    if (e["kind"] === "lookup" && typeof e["line"] === "string" && isRecord(body)) {
      lookupByLine.set(e["line"], body["entry"]);
    } else if (e["kind"] === "cluster" && typeof e["path"] === "string") {
      clusterByPath.set(e["path"], body);
    } else if (e["kind"] === "opinion" && typeof e["path"] === "string") {
      opinionByPath.set(e["path"], body);
    }
  }
  return { lookupByLine, clusterByPath, opinionByPath };
}

function respond(status: number, body: string): Promise<HttpResponse> {
  const headers = {
    get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
  };
  return Promise.resolve({ status, headers, text: () => Promise.resolve(body) });
}

function unknownEntry(line: string): unknown {
  return {
    citation: line,
    normalized_citations: [],
    start_index: 0,
    end_index: line.length,
    status: 404,
    error_message: `Citation not found: '${line}'`,
    clusters: [],
  };
}

function answerLookup(maps: Maps, body: string | undefined): Promise<HttpResponse> {
  const text = new URLSearchParams(body ?? "").get("text") ?? "";
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const entries = lines.map((l) => maps.lookupByLine.get(l) ?? unknownEntry(l));
  return respond(200, JSON.stringify(entries));
}

function pathnameOf(url: string): string | null {
  return URL.canParse(url) ? new URL(url).pathname : null;
}

/**
 * A `fetch` that serves the committed Fixture_Set and nothing else (A13). Routes on
 * method and pathname (query ignored). Never throws and never touches the network.
 */
export function createFixtureFetch(): FetchLike {
  const maps = buildMaps();
  return (url: string, init: FetchInit): Promise<HttpResponse> => {
    const path = pathnameOf(url);
    if (path === null) return respond(404, NOT_FOUND_BODY);
    if (init.method === "POST" && path.endsWith(LOOKUP_PATH_TAIL)) {
      return answerLookup(maps, init.body);
    }
    if (init.method === "GET") {
      const hit = maps.clusterByPath.get(path) ?? maps.opinionByPath.get(path);
      if (hit !== undefined) return respond(200, JSON.stringify(hit));
    }
    return respond(404, NOT_FOUND_BODY);
  };
}
