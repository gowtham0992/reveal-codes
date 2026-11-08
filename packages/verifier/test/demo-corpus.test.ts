import { readFileSync } from "node:fs";
import { createDocument, extract } from "@reveal-codes/engine";
import type { VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import throttle429 from "../fixtures/http/throttle-429.json" with { type: "json" };
import { createMemoryCacheStore } from "../src/cache-memory";
import { createDeps } from "../src/create-deps";
import { createFixtureFetch } from "../src/fixtures";
import { lookup, planLookup } from "../src/lookup";
import { fetchOpinionText } from "../src/opinion";
import { checkQuote } from "../src/quote";
import { createManualClock } from "./support/manual-clock";
import { makeDeps, TEST_BASE_URL } from "./support/make-deps";

const MOTION = readFileSync(
  new URL("../../engine/fixtures/demo-motion.txt", import.meta.url),
  "utf8",
);
const NOW = "2026-11-02T12:00:00.000Z";
const LINES = [
  "556 U.S. 662",
  "404 U.S. 519",
  "1047 F.3d 212",
  "1012 F. Supp. 2d 88",
  "912 F.4th 33",
  "1 Hill 150",
  "576 U.S. 644",
];

function fixtureDeps() {
  const clock = createManualClock(Date.parse(NOW));
  return createDeps({
    fetch: createFixtureFetch(),
    now: clock.now,
    sleep: clock.sleep,
    cache: createMemoryCacheStore({ now: clock.now }),
    baseUrl: TEST_BASE_URL,
  });
}

function docOf(text: string) {
  const doc = createDocument(text, NOW);
  if (!doc.ok) throw new Error("createDocument failed");
  return doc.value;
}

const EXPECTED: readonly VerificationResult[] = [
  { status: "verified", clusterId: "145875" },
  { status: "verified", clusterId: "108432" },
  { status: "not_found" },
  { status: "not_found" },
  { status: "not_found" },
  { status: "ambiguous", candidates: ["999000003", "999000004"] },
  { status: "unchecked", waitUntil: "2026-11-02T12:00:30.000Z" },
];

describe("Demo_Corpus lookup through createFixtureFetch _Requirements: 12.12_", () => {
  it("lookup() returns the recorded outcome for all seven lines in one call", async () => {
    const doc = docOf(LINES.join(". ") + ".");
    const keys = doc.citations.flatMap((c) => (c.kind === "full" ? [c.key] : []));
    expect(keys).toHaveLength(LINES.length);
    const results = await lookup(doc.citations, fixtureDeps());
    expect(keys.map((k) => results.get(k))).toEqual(EXPECTED);
  });
});
describe("Demo_Corpus opinions and quotes _Requirements: 12.13_", () => {
  it("serves the excerpt as the first sub-opinion text of both verified clusters", async () => {
    const deps = fixtureDeps();
    const iqbal = await fetchOpinionText("145875", deps);
    const haines = await fetchOpinionText("108432", deps);
    expect(iqbal).toContain("A claim has facial plausibility");
    expect(haines).toContain("less stringent standards than formal pleadings");
    expect(await fetchOpinionText("1", deps)).toBeNull();
  });
  it("matches the motion's Haines quote and mismatches its Iqbal quote", async () => {
    const deps = fixtureDeps();
    const strip = (s: string) => s.replace(/^["\u201c]|["\u201d]$/g, "");
    const quotes = extract(MOTION).quotes.map((q) => strip(q.text));
    const haines = quotes.find((q) => q.includes("less stringent standards"));
    const iqbal = quotes.find((q) => q.includes("pro se plaintiff who alleges retaliation"));
    expect(haines).toBeDefined();
    expect(iqbal).toBeDefined();
    expect(checkQuote((await fetchOpinionText("108432", deps)) ?? "", haines ?? "")).toEqual({
      status: "match",
    });
    expect(checkQuote((await fetchOpinionText("145875", deps)) ?? "", iqbal ?? "").status).toBe(
      "mismatch",
    );
  });
});

describe("demo-motion.txt extraction _Requirements: 12.1_", () => {
  it("yields exactly the five reporter lines, with 912 F.4th 33 normalised", () => {
    const lines = planLookup(docOf(MOTION).citations).lines;
    expect(lines).toEqual([
      "556 U.S. 662",
      "404 U.S. 519",
      "1047 F.3d 212",
      "1012 F. Supp. 2d 88",
      "912 F.4th 33",
    ]);
  });
});

describe("recorded HTTP-level 429 _Requirements: 12.1_", () => {
  it("replayed three times gives unchecked with the last waitUntil", async () => {
    const t = makeDeps(
      [1, 2, 3].map(() => ({
        status: throttle429.status,
        headers: throttle429.headers,
        body: throttle429.body,
      })),
      { startMs: Date.parse(throttle429.body.wait_until) - 30_000 },
    );
    const doc = docOf("410 U.S. 113.");
    const results = await lookup(doc.citations, t.deps);
    expect([...results.values()]).toEqual([
      { status: "unchecked", waitUntil: new Date(throttle429.body.wait_until).toISOString() },
    ]);
    expect(t.fetch.calls).toHaveLength(3);
  });
});
