import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createFixtureFetch } from "../src/fixtures";
import { checkQuote } from "../src/quote";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const BASE = "https://cl.test/api/rest/v4";

type Entry = Readonly<{
  file: string;
  kind: string;
  line?: string;
  path?: string;
  recorded?: string;
  hand_authored?: boolean;
  synthetic?: boolean;
}>;
type Quote = Readonly<{ opinion: string; text: string; inMotion?: boolean }>;

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(DIR, rel), "utf8"));
}
const manifest = readJson("manifest.json") as readonly Entry[];
const quotes = readJson("quotes.json") as { genuine: readonly Quote[]; fabricated: Quote };

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = path.relative(DIR, path.join(dir, d.name));
    return d.isDirectory() ? listFiles(path.join(dir, d.name)) : [rel];
  });
}

const fetchFixture = createFixtureFetch();
async function call(method: "GET" | "POST", url: string, body?: string) {
  const init = {
    method,
    headers: {},
    signal: new AbortController().signal,
    redirect: "error",
    ...(body === undefined ? {} : { body }),
  } as const;
  const res = await fetchFixture(url, init);
  return { status: res.status, json: JSON.parse(await res.text()) as unknown };
}
const post = (text: string) =>
  call("POST", `${BASE}/citation-lookup/`, new URLSearchParams({ text }).toString());

const wordCount = (s: string) => s.trim().split(/\s+/).length;
const excerpt = (id: string) =>
  (readJson(`opinions/${id}.json`) as { plain_text: string }).plain_text;

describe("createFixtureFetch routing _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7_", () => {
  it("answers a lookup POST with one entry per non-empty line in input order", async () => {
    const r = await post("  404 U.S. 519 \n\n999 U.S. 1\n556 U.S. 662\n");
    const entries = r.json as readonly { status: number; citation: string }[];
    expect(r.status).toBe(200);
    expect(entries.map((e) => [e.citation, e.status])).toEqual([
      ["404 U.S. 519", 200],
      ["999 U.S. 1", 404],
      ["556 U.S. 662", 200],
    ]);
  });
  it("returns an empty array for an empty body", async () => {
    expect((await post("")).json).toEqual([]);
  });
  it("serves recorded cluster and opinion paths and ignores the query", async () => {
    const c = await call("GET", `${BASE}/clusters/108432/?fields=id,sub_opinions`);
    expect(c.status).toBe(200);
    expect(c.json).toEqual(readJson("clusters/108432.json"));
    const o = await call("GET", `${BASE}/opinions/9435339/?fields=id,plain_text`);
    expect(o.status).toBe(200);
    expect(o.json).toEqual(readJson("opinions/9435339.json"));
  });
  it.each([
    ["GET", `${BASE}/clusters/1/`],
    ["GET", `${BASE}/opinions/9435340/`],
    ["GET", `${BASE}/citation-lookup/`],
    ["POST", `${BASE}/clusters/108432/`],
    ["GET", "not a url"],
  ] as const)("answers %s %s with 404 Not found", async (method, url) => {
    const r = await call(method, url);
    expect(r).toEqual({ status: 404, json: { detail: "Not found." } });
  });
  it("does not route the HTTP-level 429 fixture", async () => {
    expect((await call("GET", `${BASE}/http/throttle-429.json`)).status).toBe(404);
  });
});

describe("Fixture_Set manifest _Requirements: 12.1, 12.9, 12.11, 12.15_", () => {
  it("has a file for every manifest entry", () => {
    const files = new Set(listFiles(DIR));
    for (const e of manifest) expect(files.has(e.file), e.file).toBe(true);
  });
  it("has a manifest entry for every file except source/ and README", () => {
    const listed = new Set(manifest.map((e) => e.file));
    const unlisted = listFiles(DIR).filter(
      (f) => f !== "manifest.json" && !f.startsWith("source") && path.basename(f) !== "README.md",
    );
    expect(unlisted.filter((f) => !listed.has(f))).toEqual([]);
  });
  it("marks exactly one of recorded or hand_authored on each entry", () => {
    for (const e of manifest) {
      const recorded = e.recorded !== undefined;
      const hand = e.hand_authored === true;
      expect(recorded !== hand, e.file).toBe(true);
      if (recorded) expect(e.recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("marks synthetic only on 1 Hill 150 and 576 U.S. 644, both hand_authored", () => {
    const synthetic = manifest.filter((e) => e.synthetic === true);
    expect(synthetic.map((e) => e.line).sort()).toEqual(["1 Hill 150", "576 U.S. 644"]);
    for (const e of synthetic) expect(e.hand_authored).toBe(true);
  });
  it("holds no token or authorization header in any fixture", () => {
    for (const f of listFiles(DIR).filter((x) => x.endsWith(".json"))) {
      expect(readFileSync(path.join(DIR, f), "utf8"), f).not.toMatch(/authorization|token/i);
    }
  });
});

describe("quotes.json _Requirements: 12.2, 12.13_", () => {
  it("gives each verified case two genuine 8-60 word quotes that match its excerpt", () => {
    for (const id of ["9435339", "108432"]) {
      const own = quotes.genuine.filter((q) => q.opinion === id);
      expect(own, id).toHaveLength(2);
      for (const q of own) {
        expect(wordCount(q.text)).toBeGreaterThanOrEqual(8);
        expect(wordCount(q.text)).toBeLessThanOrEqual(60);
        expect(checkQuote(excerpt(id), q.text)).toEqual({ status: "match" });
      }
    }
  });
  it("has one fabricated 8-60 word quote that mismatches every excerpt", () => {
    const f = quotes.fabricated;
    expect(wordCount(f.text)).toBeGreaterThanOrEqual(8);
    expect(wordCount(f.text)).toBeLessThanOrEqual(60);
    for (const id of ["9435339", "108432"]) {
      expect(checkQuote(excerpt(id), f.text).status, id).toBe("mismatch");
    }
  });
});
