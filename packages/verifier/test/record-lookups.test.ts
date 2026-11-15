import { describe, expect, it } from "vitest";
import { EXPECTED } from "../scripts/record-expected";
import {
  checkExpected,
  main,
  RECORD_LINES,
  recordLookups,
  trimEntry,
} from "../scripts/record-lookups";
import {
  LIVE,
  TOKEN,
  fakeFetch,
  harness,
  liveEntries,
  rowsFor,
} from "./support/record-lookups-harness";

describe("record-lookups main  _Requirements: 11.2, 11.5_", () => {
  it.each([undefined, ""])(
    "exits 1 with one line and no request when the token is %j",
    async (t) => {
      const h = harness({ COURTLISTENER_TOKEN: t }, liveEntries(LIVE));
      expect(await main(["--write"], h.io)).toBe(1);
      expect(h.calls).toEqual([]);
      expect(h.err).toHaveLength(1);
      expect(h.out).toEqual([]);
      expect(h.written.size).toBe(0);
    },
  );

  it("sends the token only as the Authorization header, in one request", async () => {
    const h = harness({ COURTLISTENER_TOKEN: TOKEN }, liveEntries(LIVE));
    await main([], h.io);
    expect(h.calls).toHaveLength(1);
    const call = h.calls[0];
    expect(call?.init.headers["Authorization"]).toBe(`Token ${TOKEN}`);
    expect(call?.url).not.toContain(TOKEN);
    expect(call?.init.body ?? "").not.toContain(TOKEN);
  });

  it("dry run with no differences exits 0 and writes nothing; the token is never printed", async () => {
    const h = harness({ COURTLISTENER_TOKEN: TOKEN }, liveEntries(LIVE));
    expect(await main([], h.io)).toBe(0);
    expect(h.written.size).toBe(0);
    expect([...h.out, ...h.err].join("\n")).not.toContain(TOKEN);
    expect(h.out.filter((l) => l.includes("rule "))).toHaveLength(7);
  });

  it("--write records the six new lines only, never the two excluded lines, with no credential", async () => {
    const h = harness({ COURTLISTENER_TOKEN: TOKEN }, liveEntries(LIVE));
    expect(await main(["--write"], h.io)).toBe(0);
    expect([...h.written.keys()].sort()).toEqual(
      [
        "174-f3d-366",
        "501-us-32",
        "516-f3d-1237",
        "516-us-217",
        "905-f-supp-2d-121",
        "925-f3d-1339",
      ].sort(),
    );
    expect(h.written.has("556-us-662")).toBe(false);
    expect(h.written.has("360-nj-super-360")).toBe(false);
    expect(h.written.has("821-f2d-1147")).toBe(false);
    const all = [...h.written.values(), ...h.out, ...h.err].join("\n");
    expect(all).not.toContain(TOKEN);
    expect(all.toLowerCase()).not.toContain("authorization");
    expect(all).not.toMatch(/\b(?:Token|Bearer) +\S/);
  });

  it("exits 2 and writes nothing when a result differs, even with --write", async () => {
    const live = { ...LIVE, "925 F.3d 1339": { status: 200, id: 1, name: "Varghese v. China" } };
    const h = harness({ COURTLISTENER_TOKEN: TOKEN }, liveEntries(live));
    expect(await main(["--write"], h.io)).toBe(2);
    expect(h.written.size).toBe(0);
    expect(h.err.join("\n")).toContain("925 F.3d 1339");
    expect(h.err.join("\n")).not.toContain(TOKEN);
  });
});

describe("checkExpected  _Requirements: 11.10_", () => {
  it("reports nothing for the expected outcomes", async () => {
    expect(checkExpected(await rowsFor(LIVE))).toEqual([]);
  });

  it("reports a changed status", async () => {
    const rows = await rowsFor({ ...LIVE, "516 F.3d 1237": { status: 300 } });
    const diffs = checkExpected(rows);
    expect(diffs.some((d) => d.startsWith("516 F.3d 1237: status 404 expected, got 300"))).toBe(
      true,
    );
  });

  it("reports a changed cluster id", async () => {
    const rows = await rowsFor({
      ...LIVE,
      "501 U.S. 32": { status: 200, id: 999, name: "Chambers v. NASCO, Inc." },
    });
    expect(checkExpected(rows)).toEqual(["501 U.S. 32: cluster 112616 expected, got 999"]);
  });

  it("reports a changed rule outcome", async () => {
    const rows = await rowsFor({
      ...LIVE,
      "516 U.S. 217": { status: 200, id: 117990, name: "Wholly Different v. Name" },
    });
    const diffs = checkExpected(rows);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("516 U.S. 217: outcome verified expected, got wrong_case");
  });

  it("reports a line with no result", () => {
    expect(checkExpected([])).toHaveLength(Object.keys(EXPECTED).length);
    expect(checkExpected([])[0]).toMatch(/: no result$/);
  });
});

describe("556 U.S. 662 comparison  _Requirements: 11.8_", () => {
  const committed = {
    citation: "556 U.S. 662",
    normalized_citations: ["556 U.S. 662"],
    start_index: 0,
    end_index: 12,
    status: 200,
    error_message: "",
    clusters: [
      {
        id: 145875,
        absolute_url: "/opinion/145875/x/",
        case_name: "Ashcroft v. Iqbal",
        date_filed: "2001-02-03",
      },
    ],
  };

  async function compare(existing: unknown): Promise<string | undefined> {
    const { fetch } = fakeFetch(liveEntries(LIVE));
    const rows = await recordLookups({
      fetch,
      token: TOKEN,
      baseUrl: "https://cl.test/api",
      lines: RECORD_LINES,
      existing: (line) => (line === "556 U.S. 662" ? existing : undefined),
    });
    return rows.find((r) => r.line === "556 U.S. 662")?.report.comparison;
  }

  it("reports matches when the live entry equals the committed one", async () => {
    expect(await compare(committed)).toBe("matches");
  });

  it("reports differs when the committed entry has another cluster name", async () => {
    const changed = {
      ...committed,
      clusters: [{ ...committed.clusters[0], case_name: "Ashcroft v. Iqbal, et al." }],
    };
    expect(await compare(changed)).toBe("differs");
  });

  it("reports none for the other lines", async () => {
    const rows = await rowsFor(LIVE);
    expect(rows.filter((r) => r.comparison !== "none").map((r) => r.line)).toEqual([]);
  });

  it("printed report carries 'fixture matches' or 'fixture differs' for that line", async () => {
    const h = harness({ COURTLISTENER_TOKEN: TOKEN }, liveEntries(LIVE), (l) =>
      l === "556 U.S. 662" ? committed : undefined,
    );
    await main([], h.io);
    const row = h.out.find((l) => l.startsWith("556 U.S. 662"));
    expect(row).toContain("fixture matches");
  });
});

const RAW_ENTRY = {
  citation: "1 U.S. 1",
  normalized_citations: ["1 U.S. 1"],
  start_index: 0,
  end_index: 8,
  status: 200,
  error_message: "",
  headers: { Authorization: `Token ${TOKEN}` },
  extra: "dropped",
  clusters: [
    {
      id: 5,
      absolute_url: "/opinion/5/a/",
      case_name: "A v. B",
      case_name_full: "A FULL v. B",
      case_name_short: "A",
      date_filed: "1999-01-01",
      sub_opinions: ["https://x/"],
      html: "<p>body</p>",
    },
  ],
};

const TRIMMED_ENTRY = {
  citation: "1 U.S. 1",
  normalized_citations: ["1 U.S. 1"],
  start_index: 0,
  end_index: 8,
  status: 200,
  error_message: "",
  clusters: [
    {
      id: 5,
      absolute_url: "/opinion/5/a/",
      case_name: "A v. B",
      case_name_full: "A FULL v. B",
      case_name_short: "A",
      date_filed: "1999-01-01",
    },
  ],
};

describe("trimEntry  _Requirements: 11.5_", () => {
  it("keeps exactly the identifying fields and drops everything else", () => {
    expect(trimEntry(RAW_ENTRY)).toEqual(TRIMMED_ENTRY);
  });

  it("omits optional fields the response lacks and passes non-records through", () => {
    expect(trimEntry({ status: 404, clusters: [{ id: 1, other: 2 }] })).toEqual({
      status: 404,
      clusters: [{ id: 1 }],
    });
    expect(trimEntry(undefined)).toBeUndefined();
    expect(trimEntry("x")).toBe("x");
  });
});
