import { createDocument, setVerification } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import {
  buildVerifyBody,
  countVerifiableUnchecked,
  hasFullRecord,
  quotesByCluster,
  runVerifyFlow,
} from "../src/client/verify-flow";
import { nextStep } from "../src/components/next-step";
import { furtherLine } from "../src/client/verify-summary";
import { createStore } from "../src/store-runtime";
import { ISO, demoMotionText, verifiedDemoDocument } from "./support/persist-fixtures";
import { routeFetch } from "./support/route-fetch";

function demoStore() {
  const store = createStore(() => new Date(ISO));
  const created = createDocument(demoMotionText(), ISO);
  if (!created.ok) throw new Error("demo rejected");
  store.dispatch({ type: "replace", document: created.value });
  return store;
}

const CLOCK = (): Date => new Date("2026-11-02T12:30:00.000Z");

/** Counts `verified` dispatches while delegating to the real Store. */
function countingStore(store: ReturnType<typeof demoStore>) {
  let verified = 0;
  const flow = {
    getState: store.getState,
    dispatch: ((action) => {
      if (action.type === "verified") verified += 1;
      return store.dispatch(action);
    }) as typeof store.dispatch,
  };
  return { flow, count: () => verified };
}

const FAILED = "Verification could not be completed. Your citations are unchanged.";
const LIMIT_SENTENCE = "Too many checks from this address. Try again in a moment.";

describe("Verify flow on the demo motion _Requirements: 17.2, 17.3, 17.4, 17.5, 17.6_", () => {
  it("finds 3 not_found citations, a Haines match and an Iqbal mismatch", async () => {
    const server = routeFetch();
    const store = demoStore();
    const counted = countingStore(store);
    const outcome = await runVerifyFlow(createApiClient(server.fetch), counted.flow, CLOCK);
    expect(counted.count()).toBe(1);
    expect(store.getState().verifiedAt).toBe(CLOCK().toISOString());
    const doc = store.getState().document;
    const statuses = doc.citations.flatMap((c) => (c.kind === "full" ? [c.result.status] : []));
    expect(statuses.filter((s) => s === "not_found")).toHaveLength(3);
    const byText = (needle: string) => doc.quotes.find((q) => q.quote.text.includes(needle));
    expect(byText("less stringent")?.result.status).toBe("match");
    expect(byText("retaliation")?.result.status).toBe("mismatch");
    expect(outcome.status).toBe("completed");
    expect(outcome.quotes).toEqual({ match: 1, mismatch: 1, unchecked: 0 });
    expect(store.getState().notice).toBeNull();
  });

  it("sends one POST first, with only full records and no quote or document text", async () => {
    const server = routeFetch();
    const store = demoStore();
    const doc = store.getState().document;
    await runVerifyFlow(createApiClient(server.fetch), store, CLOCK);
    const [first, ...rest] = server.requests;
    expect(first?.method).toBe("POST");
    expect(rest.every((r) => r.method === "GET" && r.body === null)).toBe(true);
    const body = JSON.parse(first?.body ?? "") as { records: { kind: string }[] };
    expect(Object.keys(body)).toEqual(["records"]);
    expect(body.records.every((r) => r.kind === "full")).toBe(true);
    expect(body).toEqual(buildVerifyBody(doc));
    const sent = server.requests.map((r) => `${r.url}${r.body ?? ""}`).join("\n");
    for (const q of doc.quotes) expect(sent).not.toContain(q.quote.text);
    expect(sent).not.toContain("I am not a lawyer");
  });

  it("a quote on a verified short form uses the target's cluster", async () => {
    const doc = await verifiedDemoDocument();
    const groups = quotesByCluster(doc);
    const iqbal = doc.quotes.find((q) => q.quote.text.includes("retaliation"));
    const owner = doc.citations.find((c) => c.citation.start === iqbal?.quote.citationStart);
    expect(owner?.kind).toBe("short");
    const entry = [...groups].find(([, keys]) => keys.includes(iqbal?.key ?? ""));
    expect(entry).toBeDefined();
    const target = doc.citations.find(
      (c) =>
        c.kind === "full" && c.result.status === "verified" && c.result.clusterId === entry?.[0],
    );
    expect(target?.citation.text).toContain("556 U.S. 662");
  });

  it("requests no opinion when no citation is verified", async () => {
    const server = routeFetch();
    const fetchFn: FetchFn = (url, init) =>
      url === "/api/verify"
        ? Promise.resolve(new Response(JSON.stringify({ results: [], info: [] }), { status: 200 }))
        : server.fetch(url, init);
    const store = demoStore();
    const outcome = await runVerifyFlow(createApiClient(fetchFn), store, CLOCK);
    expect(server.requests.filter((r) => r.url.startsWith("/api/opinion"))).toHaveLength(0);
    expect(outcome.status).toBe("completed");
    expect(outcome.quotes.unchecked).toBe(2);
  });

  it("runs opinion requests one after another", async () => {
    const server = routeFetch();
    let inFlight = 0;
    let peak = 0;
    const fetchFn: FetchFn = async (url, init) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const response = await server.fetch(url, init);
      inFlight -= 1;
      return response;
    };
    await runVerifyFlow(createApiClient(fetchFn), demoStore(), CLOCK);
    expect(server.requests.filter((r) => r.url.startsWith("/api/opinion")).length).toBeGreaterThan(
      1,
    );
    expect(peak).toBe(1);
  });
});

describe("Verify flow failures _Requirements: 17.7, 17.8, 17.10, 17.11_", () => {
  it("text null counts as unavailable and the flow continues", async () => {
    const server = routeFetch();
    const fetchFn: FetchFn = (url, init) =>
      url.startsWith("/api/opinion")
        ? Promise.resolve(new Response(JSON.stringify({ clusterId: "1", text: null })))
        : server.fetch(url, init);
    const store = demoStore();
    const outcome = await runVerifyFlow(createApiClient(fetchFn), store, CLOCK);
    expect(outcome.status).toBe("completed");
    expect(outcome.unavailable).toBe(2);
    expect(store.getState().notice).toBeNull();
  });

  it("a good run clears a stale failure Notice but leaves another Notice alone", async () => {
    const store = demoStore();
    store.dispatch({ type: "notice", text: FAILED });
    await runVerifyFlow(createApiClient(routeFetch().fetch), store, CLOCK);
    expect(store.getState().notice).toBeNull();
    store.dispatch({ type: "notice", text: "Something else." });
    await runVerifyFlow(createApiClient(routeFetch().fetch), store, CLOCK);
    expect(store.getState().notice).toBe("Something else.");
  });

  it("a failed POST leaves the Document unchanged and sets the failure Notice", async () => {
    const store = demoStore();
    const before = store.getState().document;
    const api = createApiClient(() => Promise.reject(new Error("offline")));
    const counted = countingStore(store);
    const outcome = await runVerifyFlow(api, counted.flow, CLOCK);
    expect(outcome.status).toBe("failed");
    expect(counted.count()).toBe(0);
    expect(store.getState().verifiedAt).toBeNull();
    expect(store.getState().document).toBe(before);
    expect(store.getState().notice).toBe(FAILED);
  });

  it("a 429 from verify leaves the Document unchanged and reports the limit sentence", async () => {
    const store = demoStore();
    const before = store.getState().document;
    const busy = JSON.stringify({ error: LIMIT_SENTENCE });
    const api = createApiClient(() => Promise.resolve(new Response(busy, { status: 429 })));
    const counted = countingStore(store);
    const outcome = await runVerifyFlow(api, counted.flow, CLOCK);
    expect(outcome.status).toBe("failed");
    expect(outcome.failure).toBe(LIMIT_SENTENCE);
    expect(counted.count()).toBe(0);
    expect(store.getState().verifiedAt).toBeNull();
    expect(store.getState().document).toBe(before);
    expect(store.getState().notice).toBe(LIMIT_SENTENCE);
  });
  it("another failure still reports the general failure sentence", async () => {
    const api = createApiClient(() => Promise.resolve(new Response("down", { status: 503 })));
    const outcome = await runVerifyFlow(api, demoStore(), CLOCK);
    expect(outcome.failure).toBe(FAILED);
  });
  it("a 429 from opinion stops the quote checks, leaves them unchecked and says why", async () => {
    const server = routeFetch();
    const store = demoStore();
    const fetchFn: FetchFn = (input, init) =>
      input.startsWith("/api/opinion")
        ? Promise.resolve(new Response("{}", { status: 429 }))
        : server.fetch(input, init);
    const outcome = await runVerifyFlow(createApiClient(fetchFn), store, CLOCK);
    expect(outcome.status).toBe("completed");
    expect(outcome.limited).toBe(true);
    expect(outcome.quotes).toEqual({ match: 0, mismatch: 0, unchecked: 2 });
    expect(furtherLine(outcome, store.getState().document)).toBe(LIMIT_SENTENCE);
  });
  it("a good run clears a stale limit Notice", async () => {
    const store = demoStore();
    store.dispatch({ type: "notice", text: LIMIT_SENTENCE });
    await runVerifyFlow(createApiClient(routeFetch().fetch), store, CLOCK);
    expect(store.getState().notice).toBeNull();
  });
  it("a replace dispatched mid-flow discards later results", async () => {
    const server = routeFetch();
    const store = demoStore();
    const fresh = createDocument("", ISO);
    if (!fresh.ok) throw new Error("rejected");
    server.onRequest.current = (r) => {
      if (r.url.startsWith("/api/opinion")) {
        server.onRequest.current = null;
        store.dispatch({ type: "replace", document: fresh.value });
      }
    };
    const counted = countingStore(store);
    const outcome = await runVerifyFlow(createApiClient(server.fetch), counted.flow, CLOCK);
    expect(outcome.status).toBe("discarded");
    expect(counted.count()).toBe(0);
    expect(store.getState().verifiedAt).toBeNull();
    expect(store.getState().document).toBe(fresh.value);
    expect(store.getState().notice).toBeNull();
    expect(server.requests.filter((r) => r.url.startsWith("/api/opinion"))).toHaveLength(1);
  });

  it("hasFullRecord is false for text without citations", () => {
    const empty = createDocument("No citations here.", ISO);
    if (!empty.ok) throw new Error("rejected");
    expect(hasFullRecord(empty.value)).toBe(false);
    expect(hasFullRecord(demoStore().getState().document)).toBe(true);
  });
});

function parsed(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("rejected");
  return created.value;
}

function verifyAllFull(start: Document): Document {
  let doc = start;
  for (const c of start.citations) {
    if (c.kind !== "full") continue;
    const next = setVerification(doc, c.key, { status: "verified", clusterId: "1" });
    if (!next.ok) throw new Error("rejected");
    doc = next.value;
  }
  return doc;
}

function stepFor(doc: Document): string {
  return nextStep({
    empty: doc.text.length === 0,
    verifying: false,
    verifiableUnchecked: countVerifiableUnchecked(doc),
    needsCheckDate: false,
    blocking: 0,
  });
}

const FULL = "Roe v. Wade, 410 U.S. 113, 153 (1973)";

describe("countVerifiableUnchecked _Requirements: 4.2, 4.4, 4.5_", () => {
  it("counts an unchecked quotation on a verified full citation and names verify", () => {
    const doc = verifyAllFull(parsed(`See ${FULL} ("the right of privacy is broad").`));
    expect(doc.quotes.map((q) => q.result.status)).toEqual(["unchecked"]);
    expect(countVerifiableUnchecked(doc)).toBe(1);
    expect(stepFor(doc)).toBe("verify");
  });

  it("counts an unchecked quotation attached to a short form with no target as zero", () => {
    const doc = parsed('Id. at 5 ("the right of privacy is broad").');
    expect(doc.quotes).toHaveLength(1);
    expect(countVerifiableUnchecked(doc)).toBe(0);
  });

  it("gives zero and export for a short form only", () => {
    const doc = parsed("Id. at 5.");
    expect(doc.citations.some((c) => c.kind === "short")).toBe(true);
    expect(countVerifiableUnchecked(doc)).toBe(0);
    expect(stepFor(doc)).toBe("export");
  });

  it("gives export when unchecked items exist but there is no full citation", () => {
    const doc = parsed('Id. at 5 ("the right of privacy is broad"). Id. at 6.');
    expect(hasFullRecord(doc)).toBe(false);
    expect(countVerifiableUnchecked(doc)).toBe(0);
    expect(stepFor(doc)).toBe("export");
  });

  it("counts unchecked full citations", () => {
    const doc = parsed(`See ${FULL}.`);
    expect(countVerifiableUnchecked(doc)).toBe(1);
    expect(stepFor(doc)).toBe("verify");
  });
});
