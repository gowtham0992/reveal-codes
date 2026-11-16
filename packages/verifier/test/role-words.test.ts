import { readFileSync } from "node:fs";
import { createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createMemoryCacheStore } from "../src/cache-memory";
import { createDeps } from "../src/create-deps";
import { createFixtureFetch } from "../src/fixtures";
import { lookupWithInfo } from "../src/lookup";
import { DROPPED_WORDS, NAME_EXPANSION_TABLE } from "../src/name-expansion";
import { namesMatch } from "../src/name-match";
import { prepareName, splitParties } from "../src/name-normalise";
import { createManualClock } from "./support/manual-clock";
import { TEST_BASE_URL } from "./support/make-deps";

const NOW = "2026-11-02T12:00:00.000Z";

type Cluster = Readonly<{
  case_name: string;
  case_name_full: string;
  case_name_short: string;
}>;
type FixtureFile = Readonly<{ entry: Readonly<{ clusters: readonly Cluster[] }> }>;

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/lookup/174-f3d-366.json", import.meta.url), "utf8"),
) as FixtureFile;
const cluster = fixture.entry.clusters[0];
if (cluster === undefined) throw new Error("fixture 174-f3d-366 holds no cluster");
const GREENLEAF_NAMES = [cluster.case_name, cluster.case_name_full, cluster.case_name_short];

const ROLE_WORDS = [
  "plaintiff",
  "plaintiffs",
  "defendant",
  "defendants",
  "appellant",
  "appellants",
  "appellee",
  "appellees",
  "petitioner",
  "petitioners",
  "respondent",
  "respondents",
  "individually",
  "deceased",
  "no",
];

/** The Dropped_Words as they stood before Requirement 20. */
const OLD_DROPPED: ReadonlySet<string> = new Set(
  [...DROPPED_WORDS].filter((w) => !ROLE_WORDS.includes(w)),
);

/** `namesMatch` as it stood before Requirement 20: same rule, old dropped list, no initialisms. */
function oldWordsMatch(cited: string, found: readonly string[]): boolean {
  const words = (name: string): string[] =>
    prepareName(name)
      .joined.flatMap((w) => NAME_EXPANSION_TABLE[w] ?? [w])
      .filter((w) => !OLD_DROPPED.has(w));
  const pool = new Set(found.flatMap(words));
  const parties = splitParties(cited)
    .map(words)
    .filter((p) => p.length > 0);
  return parties.every((p) => p.some((w) => pool.has(w)));
}

describe("Role words _Requirements: 20.1, 20.2, 20.3_", () => {
  it("the fixture's three names hold the role words the example relies on", () => {
    expect(GREENLEAF_NAMES[0]).toBe("Greenleaf v. Garlock, Inc.");
    expect(GREENLEAF_NAMES[1]).toMatch(/Appellant/);
    expect(GREENLEAF_NAMES[1]).toMatch(/Defendants/);
    expect(GREENLEAF_NAMES[1]).toMatch(/Deceased/);
  });

  it("Kowalski, Appellant v. Quimby, Defendants shares only role words and does not match", () => {
    const cited = "Kowalski, Appellant v. Quimby, Defendants";
    expect(oldWordsMatch(cited, GREENLEAF_NAMES)).toBe(true);
    expect(namesMatch(cited, GREENLEAF_NAMES)).toBe(false);
  });

  it("No. in a cited name is dropped", () => {
    expect(prepareName("No. Wexford").words).toEqual(["wexford"]);
    const cited = "No. Wexford v. Garlock, Inc.";
    expect(oldWordsMatch(cited, GREENLEAF_NAMES)).toBe(true);
    expect(namesMatch(cited, GREENLEAF_NAMES)).toBe(false);
  });

  it("a cited party made only of role words is skipped and the other party decides", () => {
    expect(prepareName("Appellant, Deceased").words).toEqual([]);
    expect(namesMatch("Appellant v. Garlock, Inc.", GREENLEAF_NAMES)).toBe(true);
    expect(namesMatch("Appellant v. Quimby", GREENLEAF_NAMES)).toBe(false);
  });

  it("a real shared word still matches beside a role word", () => {
    expect(namesMatch("Greenleaf, Appellant v. Garlock, Inc.", GREENLEAF_NAMES)).toBe(true);
  });
});

describe("Role words through lookupWithInfo _Requirements: 20.2, 20.6_", () => {
  it("gives wrong_case with cluster 3011108 for the Kowalski citation", async () => {
    const text = "Kowalski Appellant v. Quimby Defendants, 174 F.3d 366 (3d Cir. 1999)";
    const created = createDocument(text, NOW);
    if (!created.ok) throw new Error("createDocument failed");
    const records = created.value.citations;
    const full = records.find((r) => r.kind === "full");
    expect(full?.citation.caseName).toBe("Kowalski Appellant v. Quimby Defendants");
    const clock = createManualClock(Date.parse(NOW));
    const deps = createDeps({
      fetch: createFixtureFetch(),
      now: clock.now,
      sleep: clock.sleep,
      cache: createMemoryCacheStore({ now: clock.now }),
      baseUrl: TEST_BASE_URL,
    });
    const { results } = await lookupWithInfo(records, deps);
    const result = full === undefined ? undefined : results.get(full.key);
    expect(result).toMatchObject({ status: "wrong_case", clusterId: "3011108" });
  });
});
