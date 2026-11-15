import { createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createMemoryCacheStore } from "../src/cache-memory";
import { cacheGet, cacheSet, isCachedLine } from "../src/cache-access";
import { createDeps } from "../src/create-deps";
import { createFixtureFetch } from "../src/fixtures";
import type { FetchInit, FetchLike } from "../src/deps";
import { lookup, lookupWithInfo } from "../src/lookup";
import { namesMatch } from "../src/name-match";
import { TEST_BASE_URL } from "./support/make-deps";
import { createManualClock } from "./support/manual-clock";

const NOW = "2026-11-02T12:00:00.000Z";

function recordsOf(text: string) {
  const created = createDocument(text, NOW);
  if (!created.ok) throw new Error("createDocument failed");
  return created.value.citations;
}

/** Fixture deps whose fetch also records every request body. */
function recordingFixtureDeps() {
  const inner = createFixtureFetch();
  const bodies: string[] = [];
  const fetch: FetchLike = (url: string, init: FetchInit) => {
    if (init.body !== undefined) bodies.push(init.body);
    return inner(url, init);
  };
  const clock = createManualClock(Date.parse(NOW));
  const cache = createMemoryCacheStore({ now: clock.now });
  const deps = createDeps({
    fetch,
    now: clock.now,
    sleep: clock.sleep,
    cache,
    baseUrl: TEST_BASE_URL,
  });
  return { deps, bodies, cache };
}

describe("namesMatch initialism pairs _Requirements: 4.11, 12.7_", () => {
  it.each([
    ["NLRB v. Jones", "National Labor Relations Board v. Jones"],
    ["SEC v. Chenery", "Securities and Exchange Commission v. Chenery"],
    ["U.S. v. Lopez", "United States v. Lopez"],
    ["U. S. v. Lopez", "United States v. Lopez"],
    ["Dep't of Homeland Sec. v. Regents", "Department of Homeland Security v. Regents"],
  ])("%s matches %s", (cited, found) => {
    expect(namesMatch(cited, [found])).toBe(true);
  });

  it("rejects an unrelated name", () => {
    expect(namesMatch("Henderson v. Pacific Housing Authority", ["Ashcroft v. Iqbal"])).toBe(false);
  });
});

describe("namesMatch uses all three found names _Requirements: 4.1, 5.2_", () => {
  const main = "Alpha v. Beta";
  it("matches only through case_name_full", () => {
    expect(namesMatch("Zorn v. Quill", [main])).toBe(false);
    expect(namesMatch("Zorn v. Quill", [main, "ZORN, Et Al. v. QUILL Et Al."])).toBe(true);
  });
  it("matches only through case_name_short", () => {
    expect(namesMatch("Zorn v. Quill", [main, "Zorn Quill"])).toBe(true);
  });
});

describe("lookup with names against recorded fixtures _Requirements: 5.4, 5.6, 5.7, 5.14_", () => {
  const TEXT =
    "Henderson v. Pacific Housing Authority, 556 U.S. 662 (2009). Ashcroft v. Iqbal, 556 U.S. 662 (2009).";

  it("gives two records on one lookup line separate results", async () => {
    const records = recordsOf(TEXT);
    expect(records).toHaveLength(2);
    const { results } = await lookupWithInfo(records, recordingFixtureDeps().deps);
    const [a, b] = records.map((r) => (r.kind === "other" ? undefined : results.get(r.key)));
    expect(a).toMatchObject({ status: "wrong_case", clusterId: "145875" });
    expect(b).toEqual({ status: "verified", clusterId: "145875" });
  });

  it("direct lookup returns wrong_case for Henderson", async () => {
    const records = recordsOf("Henderson v. Pacific Housing Authority, 556 U.S. 662 (2009).");
    const results = await lookup(records, recordingFixtureDeps().deps);
    expect([...results.values()]).toEqual([
      {
        status: "wrong_case",
        clusterId: "145875",
        foundName: "Ashcroft v. Iqbal",
        foundYear: 2009,
      },
    ]);
  });

  it("sends only the citation line, never the case name", async () => {
    const run = recordingFixtureDeps();
    await lookupWithInfo(recordsOf(TEXT), run.deps);
    expect(run.bodies.length).toBeGreaterThan(0);
    for (const body of run.bodies) {
      expect(new URLSearchParams(body).get("text")).toBe("556 U.S. 662");
      expect(body).not.toMatch(/Henderson|Ashcroft|Iqbal|Pacific/);
    }
  });

  it("treats a cached verified entry without cluster data as a miss and refetches", async () => {
    const run = recordingFixtureDeps();
    await cacheSet(run.deps, "556 U.S. 662", { status: "verified", clusterId: "145875" });
    const { results } = await lookupWithInfo(
      recordsOf("Henderson v. Pacific Housing Authority, 556 U.S. 662 (2009)."),
      run.deps,
    );
    expect(run.bodies).toHaveLength(1);
    expect([...results.values()][0]).toMatchObject({ status: "wrong_case" });
    expect(await cacheGet(run.deps, "556 U.S. 662", isCachedLine)).toMatchObject({
      status: "verified",
      cluster: { caseName: "Ashcroft v. Iqbal" },
    });
  });
});
