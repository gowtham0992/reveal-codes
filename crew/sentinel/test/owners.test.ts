import { setVerification } from "@reveal-codes/engine";
import type { Document, IssueKey } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { quotesByCluster } from "../src/owners.js";
import { buildDemoDocument } from "./support/export-support.js";

function quoteKey(doc: Document, startsWith: string): IssueKey {
  const found = doc.quotes.find((q) => q.quote.text.startsWith(startsWith));
  if (found === undefined) throw new Error(`no quote starting ${startsWith}`);
  return found.key;
}

describe("quotesByCluster", () => {
  it("groups the Haines quote under 108432 and the Iqbal short-form quote under 145875", async () => {
    const doc = await buildDemoDocument();
    const haines = quoteKey(doc, "less stringent");
    const iqbal = quoteKey(doc, "a pro se plaintiff");
    const groups = quotesByCluster(doc);
    expect([...groups.entries()]).toEqual([
      ["108432", [haines]],
      ["145875", [iqbal]],
    ]);
  });

  it("leaves out a quote whose owner is not verified", async () => {
    const doc = await buildDemoDocument();
    const iqbalFull = doc.citations.find(
      (c) => c.kind === "full" && c.result.status === "verified" && c.result.clusterId === "145875",
    );
    expect(iqbalFull?.kind).toBe("full");
    if (iqbalFull?.kind !== "full") return;
    const changed = setVerification(doc, iqbalFull.key, { status: "not_found" });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const groups = quotesByCluster(changed.value);
    expect([...groups.keys()]).toEqual(["108432"]);
    expect(groups.get("145875")).toBeUndefined();
  });
});
