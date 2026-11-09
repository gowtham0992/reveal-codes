import { recordOverride, setVerification } from "@reveal-codes/engine";
import type { Document, IssueKey } from "@reveal-codes/engine";
import { buildDocx, localDateTime } from "@reveal-codes/export";
import type { Deps, FetchLike } from "@reveal-codes/verifier";
import { describe, expect, it } from "vitest";
import { analyseFile } from "../src/analyse.js";
import { editDocumentXml, renameTitles } from "./support/docx-edit.js";
import { buildDemoDocument, buildDemoDocumentStatement } from "./support/export-support.js";
import { recordedFetch, throttleFetch } from "./support/recorded-fetch.js";
import { testDeps } from "./support/test-deps.js";

const FILE = "motion.docx";

async function demoExport(): Promise<Uint8Array> {
  const { statement } = await buildDemoDocumentStatement();
  return buildDocx(await buildDemoDocument(), statement);
}

/** Counts every request that reaches the wrapped fetch. */
function counting(inner: FetchLike): { fetch: FetchLike; calls: () => number } {
  let calls = 0;
  const fetch: FetchLike = (url, init) => {
    calls += 1;
    return inner(url, init);
  };
  return { fetch, calls: () => calls };
}

function replaceOnce(xml: string, from: string, to: string): string {
  expect(xml.split(from)).toHaveLength(2);
  return xml.replace(from, to);
}

/** Replaces the first occurrence; the body paragraph precedes its copy in the Appendix. */
function replaceFirst(xml: string, from: string, to: string): string {
  expect(xml.split(from).length).toBeGreaterThan(1);
  return xml.replace(from, to);
}

/** A copy of `deps` whose `state` throws on every read; the Verifier does not catch that. */
function throwingState(deps: Deps): Deps {
  const descriptors = Object.getOwnPropertyDescriptors(deps);
  const get = (): never => {
    throw new Error("injected failure: state read");
  };
  return Object.defineProperties({}, { ...descriptors, state: { get, enumerable: true } }) as Deps;
}

function must(r: { ok: true; value: Document } | { ok: false }): Document {
  if (!r.ok) throw new Error("engine rejected the setup");
  return r.value;
}

describe("analyseFile", () => {
  it("reports nothing for an unmodified export", async () => {
    const found = await analyseFile(FILE, await demoExport(), testDeps(recordedFetch().fetch));
    expect(found).toEqual([]);
  });

  it("reports body_edited with the 1-based line and both ellipsized paragraphs", async () => {
    const bytes = editDocumentXml(await demoExport(), (xml) =>
      replaceFirst(xml, ">FOR THE DISTRICT OF OREGON</w:t>", ">FOR THE DISTRICT OF IDAHO</w:t>"),
    );
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    expect(found).toEqual([
      {
        kind: "body_edited",
        file: FILE,
        line: 2,
        before: "FOR THE DISTRICT OF OREGON",
        after: "FOR THE DISTRICT OF IDAHO",
      },
    ]);
  });

  it("reports citation_changed when the recorded status is rewritten", async () => {
    const bytes = editDocumentXml(await demoExport(), (xml) =>
      replaceOnce(xml, "[CIT ✓{k=k1;cl=108432}]", "[CIT ✘{k=k1}]"),
    );
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "citation_changed",
      file: FILE,
      before: "not_found",
      after: "verified 108432",
    });
  });

  it("reports exactly one citation_changed when a verified cluster id differs", async () => {
    const bytes = editDocumentXml(await demoExport(), (xml) =>
      replaceOnce(xml, "[CIT ✓{k=k0;cl=145875}]", "[CIT ✓{k=k0;cl=999}]"),
    );
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "citation_changed",
      before: "verified 999",
      after: "verified 145875",
    });
  });

  it("reports recheck_unavailable with the throttle's waitUntil", async () => {
    const waitUntil = "2026-11-02T12:00:30.000Z";
    const found = await analyseFile(FILE, await demoExport(), testDeps(throttleFetch()));
    expect(found).toEqual([
      {
        kind: "recheck_unavailable",
        file: FILE,
        line: null,
        before: "",
        after: `retry after ${localDateTime(new Date(waitUntil))}`,
        waitUntil,
      },
    ]);
  });

  it("reports citation_changed then override_stale for an override the re-check outdates", async () => {
    const doc = await buildDemoDocument();
    const { statement } = await buildDemoDocumentStatement();
    const k0 = doc.citations.find((c) => c.kind === "full" && c.result.status === "verified");
    expect(k0?.kind).toBe("full");
    if (k0?.kind !== "full") return;
    const key: IssueKey = k0.key;
    const notFound = must(setVerification(doc, key, { status: "not_found" }));
    const reason = "Cited from a court notice.";
    const stale = must(recordOverride(notFound, key, reason, "2026-11-20T18:25:00.000Z"));
    const bytes = await buildDocx(stale, statement);
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    expect(found.map((f) => f.kind)).toEqual(["citation_changed", "override_stale"]);
    expect(found[1]).toMatchObject({ before: reason, after: "no longer an issue" });
  });

  it.each([
    ["a non-docx file", () => Promise.resolve(new TextEncoder().encode("not a zip"))],
    ["a file without the export titles", async () => renameTitles(await demoExport())],
    [
      "a file with a bad Appendix",
      async () =>
        editDocumentXml(await demoExport(), (xml) => replaceOnce(xml, "[DOC{v=1;", "[DOC{v=oops;")),
    ],
  ])("returns one unreadable Finding and makes no request for %s", async (_name, make) => {
    const wrapped = counting(recordedFetch({ failOnMiss: false }).fetch);
    const found = await analyseFile(FILE, await make(), testDeps(wrapped.fetch));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "unreadable", file: FILE, line: null, before: "" });
    expect(wrapped.calls()).toBe(0);
  });

  it("returns one unreadable read_failed Finding, without rejecting, when a dependency throws", async () => {
    const deps = throwingState(testDeps(recordedFetch({ failOnMiss: false }).fetch));
    const found = await analyseFile(FILE, await demoExport(), deps);
    expect(found).toEqual([
      { kind: "unreadable", file: FILE, line: null, before: "", after: "read_failed" },
    ]);
  });

  it("leaves bytes unmodified and is deterministic", async () => {
    const bytes = await demoExport();
    const clone = bytes.slice();
    const edited = editDocumentXml(bytes, (xml) =>
      replaceOnce(xml, "[CIT ✓{k=k1;cl=108432}]", "[CIT ✘{k=k1}]"),
    );
    const editedClone = edited.slice();
    const first = await analyseFile(FILE, edited, testDeps(recordedFetch().fetch));
    const second = await analyseFile(FILE, edited, testDeps(recordedFetch().fetch));
    expect(edited).toEqual(editedClone);
    expect(bytes).toEqual(clone);
    expect(second).toEqual(first);
  });
});
