import { readFileSync } from "node:fs";
import {
  apply,
  blockingIssues,
  createDocument,
  recordOverride,
  setQuoteCheck,
  setVerification,
} from "@reveal-codes/engine";
import type { Document, IssueKey } from "@reveal-codes/engine";
import {
  checkQuote,
  createDeps,
  createFixtureFetch,
  createMemoryCacheStore,
  fetchOpinionText,
  lookup,
} from "@reveal-codes/verifier";
import type { Deps } from "@reveal-codes/verifier";

/** Structural shape of one assistant run (matches the design's RunInfo). */
type DemoRun = Readonly<{ runId: string; provider: string; modelId: string | null }>;

export const DEMO_NOW = new Date("2026-11-20T18:30:00.000Z");
export const DEMO_VERIFIED_AT = "2026-11-20T18:25:00.000Z";
export const DEMO_OVERRIDE_REASONS = [
  "Cited from the client's court notice; copy requested from the clerk.",
  "Reporter volume is being confirmed with the court library.",
  "Quotation taken from a bench ruling transcript, not the opinion.",
  "Authority is cited for background only and will be removed.",
] as const;
export const DEMO_RUN_LOG: readonly DemoRun[] = [
  { runId: "run-1", provider: "fixture", modelId: "fixture-model" },
  { runId: "run-9", provider: "fixture", modelId: null },
];

const AI_SENTENCE = "\n\nThe Court may consider the facts stated above.";

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`demo fixture rejected: ${r.error.kind}`);
  return r.value;
}

/** A real abortable timer: an instantly resolving sleep makes the verifier's timeout win. */
function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function fixtureDeps(): Deps {
  return createDeps({
    fetch: createFixtureFetch(),
    now: () => DEMO_NOW,
    sleep: realSleep,
    cache: createMemoryCacheStore({ now: () => DEMO_NOW }),
    baseUrl: "https://cl.test/api/rest/v4",
  });
}

function verifiedCluster(doc: Document, start: number): string | null {
  const owner = doc.citations.find((c) => c.citation.start === start);
  if (owner?.kind !== "full" || owner.result.status !== "verified") return null;
  return owner.result.clusterId;
}

/** A quote's owner is its citation, or for a short form the full citation it links to. */
function ownerCluster(doc: Document, citationStart: number): string | null {
  const attached = doc.citations.find((c) => c.citation.start === citationStart);
  if (attached === undefined) return null;
  const value = attached.citation.value;
  if (attached.kind === "short" && value.kind === "short") {
    return value.targetStart === null ? null : verifiedCluster(doc, value.targetStart);
  }
  return verifiedCluster(doc, citationStart);
}

function addAiSpan(doc: Document): Document {
  const op = {
    kind: "insert",
    at: doc.text.length,
    text: AI_SENTENCE,
    provenance: { origin: "AI", runId: "run-1", timestamp: DEMO_VERIFIED_AT },
  } as const;
  return must(apply(doc, op)).document;
}

async function verifyCitations(start: Document, deps: Deps): Promise<Document> {
  let doc = start;
  const results = await lookup(doc.citations, deps);
  for (const [key, result] of results as ReadonlyMap<IssueKey, never>) {
    doc = must(setVerification(doc, key, result));
  }
  return doc;
}

async function checkQuotes(start: Document, deps: Deps): Promise<Document> {
  let doc = start;
  for (const record of start.quotes) {
    const cluster = ownerCluster(start, record.quote.citationStart);
    if (cluster === null) continue;
    const opinion = await fetchOpinionText(cluster, deps);
    if (opinion === null) continue;
    doc = must(setQuoteCheck(doc, record.key, checkQuote(opinion, record.quote.text)));
  }
  return doc;
}

function overrideAll(start: Document): Document {
  let doc = start;
  blockingIssues(start).forEach((issue, i) => {
    const reason = DEMO_OVERRIDE_REASONS[i] ?? "";
    doc = must(recordOverride(doc, issue.key, reason, DEMO_VERIFIED_AT));
  });
  return doc;
}

function assertDemo(doc: Document): void {
  const full = doc.citations.filter((c) => c.kind === "full");
  const verified = full.filter((c) => c.result.status === "verified").length;
  const notFound = full.filter((c) => c.result.status === "not_found").length;
  const mismatch = doc.quotes.filter((q) => q.result.status === "mismatch").length;
  const counts = {
    verified,
    notFound,
    mismatch,
    overrides: doc.overrides.length,
    runs: doc.runs.length,
    blocking: blockingIssues(doc).length,
  };
  const want = { verified: 2, notFound: 3, mismatch: 1, overrides: 4, runs: 1, blocking: 0 };
  if (JSON.stringify(counts) !== JSON.stringify(want)) {
    throw new Error(`demo document counts ${JSON.stringify(counts)}, expected ${JSON.stringify(want)}`);
  }
}

/** The demo motion verified against recorded fixtures, with one AI span and four overrides. */
export async function buildDemoDocument(): Promise<Document> {
  const text = readFileSync(
    new URL("../../../engine/fixtures/demo-motion.txt", import.meta.url),
    "utf8",
  );
  const created = must(createDocument(text, DEMO_VERIFIED_AT));
  const withAi = addAiSpan(created);
  const deps = fixtureDeps();
  const verified = await verifyCitations(withAi, deps);
  const checked = await checkQuotes(verified, deps);
  const doc = overrideAll(checked);
  assertDemo(doc);
  return doc;
}
