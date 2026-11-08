import { readFileSync } from "node:fs";
import {
  apply,
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
import { quotesByCluster } from "../../src/client/verify-flow";

export const ISO = "2026-11-02T12:00:00.000Z";

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${r.error.kind}`);
  return r.value;
}

export function freshDocument(): Document {
  return must(createDocument("", ISO));
}

/** Typed text, then a paste, then a deletion: spans of two origins. */
export function editedDocument(): Document {
  let doc = must(createDocument("", ISO));
  const insert = (at: number, text: string, origin: "HUM" | "PST"): void => {
    doc = must(
      apply(doc, { kind: "insert", at, text, provenance: { origin, timestamp: ISO } }),
    ).document;
  };
  insert(0, "I ask the Court [to] deny the motion.", "HUM");
  insert(10, "\\ pasted \u{1F600} text ", "PST");
  doc = must(apply(doc, { kind: "delete", from: 0, to: 2, actor: "HUM" })).document;
  return doc;
}

/** One citation recorded not found, with a written override for its issue. */
export function overriddenDocument(): Document {
  const created = must(createDocument("See Foo v. Bar, 999 U.S. 999 (2020).", ISO));
  const full = created.citations.find(
    (c): c is Extract<typeof c, { kind: "full" }> => c.kind === "full",
  );
  if (full === undefined) throw new Error("no full citation extracted");
  const verified = must(setVerification(created, full.key, { status: "not_found" }));
  return must(recordOverride(verified, full.key, "Cited from the client's notes: reason", ISO));
}

export function demoMotionText(): string {
  return readFileSync(
    new URL("../../../../packages/engine/fixtures/demo-motion.txt", import.meta.url),
    "utf8",
  );
}

/** A real abortable timer: an instantly resolving sleep makes the verifier's timeout win every race. */
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
    now: () => new Date(ISO),
    sleep: realSleep,
    cache: createMemoryCacheStore({ now: () => new Date(ISO) }),
    baseUrl: "https://cl.test/api/rest/v4",
  });
}

async function applyQuoteChecks(start: Document, deps: Deps): Promise<Document> {
  let doc = start;
  // Owners resolve through Short_Form links, as the Verify flow does.
  for (const [cluster, keys] of quotesByCluster(start)) {
    const opinion = await fetchOpinionText(cluster, deps);
    if (opinion === null) continue;
    for (const key of keys) {
      const quote = start.quotes.find((q) => q.key === key);
      if (quote === undefined) continue;
      doc = must(setQuoteCheck(doc, key, checkQuote(opinion, quote.quote.text)));
    }
  }
  return doc;
}

/** The demo motion after a Verify run against the recorded verifier fixtures. */
export async function verifiedDemoDocument(): Promise<Document> {
  const deps = fixtureDeps();
  let doc = must(createDocument(demoMotionText(), ISO));
  const results = await lookup(doc.citations, deps);
  for (const [key, result] of results as ReadonlyMap<IssueKey, never>) {
    doc = must(setVerification(doc, key, result));
  }
  return applyQuoteChecks(doc, deps);
}
