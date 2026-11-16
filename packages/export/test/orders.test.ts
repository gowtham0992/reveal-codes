import { describe, expect, it } from "vitest";
import data from "../../../data/standing-orders.json";
import { ORDERS, judgeSurname, loadOrders, selectableOrders } from "../src/index.js";
import type { OrderEntry, OrderJudge, OrderSet } from "../src/orders-types.js";

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A deep copy of the shipped file, free to mutate. */
function fresh(): Rec {
  const copy: unknown = structuredClone(data);
  if (!isRec(copy)) throw new Error("shipped file is not an object");
  return copy;
}

function entryAt(root: Rec, index: number): Rec {
  const entries = root["entries"];
  if (!Array.isArray(entries)) throw new Error("entries is not an array");
  const entry: unknown = (entries as unknown[])[index];
  if (!isRec(entry)) throw new Error(`entry ${String(index)} is not an object`);
  return entry;
}

function vocabGroup(root: Rec, group: string): Rec {
  const vocabulary = root["vocabulary"];
  if (!isRec(vocabulary)) throw new Error("vocabulary is not an object");
  const words = vocabulary[group];
  if (!isRec(words)) throw new Error(`vocabulary.${group} is not an object`);
  return words;
}

function mutated(change: (root: Rec) => void): Rec {
  const root = fresh();
  change(root);
  return root;
}

function withEntry(change: (entry: Rec) => void, index = 0): Rec {
  return mutated((root) => {
    change(entryAt(root, index));
  });
}

function expectErr(value: unknown, field: string): void {
  expect(loadOrders(value)).toMatchObject({
    ok: false,
    error: expect.stringContaining(`"${field}"`) as unknown,
  });
}

const FIRST_ID = "ndtex-lr-7-2-f";

describe("loadOrders on the shipped file _Requirements: 1.1, 1.12, 9.1_", () => {
  it("loads ok", () => {
    expect(loadOrders(fresh()).ok).toBe(true);
  });

  it("ORDERS holds the file's entries, in file order, with version 1", () => {
    const fileEntries = (data as { entries: readonly { id: string }[] }).entries;
    expect(ORDERS.version).toBe(1);
    expect(ORDERS.entries.map((e) => e.id)).toEqual(fileEntries.map((e) => e.id));
    expect(ORDERS.entries).toEqual(fileEntries);
    expect(ORDERS.entries.length).toBe(41);
  });

  it("loadOrders of the file equals ORDERS", () => {
    expect(loadOrders(fresh())).toEqual({ ok: true, value: ORDERS });
  });
});

describe("loadOrders malformed roots _Requirements: 1.2_", () => {
  it.each<[string, unknown, string]>([
    ["null", null, "root"],
    ["an array", [], "root"],
    ["a string", "orders", "root"],
    ["missing entries", { version: 1 }, "entries"],
    ["entries not an array", { version: 1, entries: "x" }, "entries"],
    ["missing version", { entries: [] }, "version"],
  ])("returns err for %s", (_name, value, field) => {
    const result = loadOrders(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(field);
  });
});

describe("loadOrders version _Requirements: 1.3_", () => {
  it.each<[string, unknown]>([
    ["2", 2],
    ["the string 1", "1"],
    ["0", 0],
    ["null", null],
  ])("rejects version %s", (_name, version) => {
    expectErr(
      mutated((root) => {
        root["version"] = version;
      }),
      "version",
    );
  });
});

describe("loadOrders required fields _Requirements: 1.4_", () => {
  const FIELDS: readonly (readonly [string, string])[] = [
    ["id", "id"],
    ["court", "court.name"],
    ["judge", "judge"],
    ["instrument", "instrument"],
    ["title", "title"],
    ["date", "date"],
    ["kind", "kind"],
    ["applies_to", "applies_to"],
    ["elements", "elements"],
    ["caption", "caption"],
    ["key_language", "key_language"],
    ["source_url", "source_url"],
    ["source_kind", "source_kind"],
    ["retrieved", "retrieved"],
    ["status", "status"],
  ];

  it.each(FIELDS)("rejects an entry missing %s", (field, named) => {
    expectErr(
      withEntry((entry) => {
        Reflect.deleteProperty(entry, field);
      }),
      named,
    );
  });

  it("names the entry id in the message", () => {
    const result = loadOrders(
      withEntry((entry) => {
        Reflect.deleteProperty(entry, "title");
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining(FIRST_ID) as unknown,
    });
  });

  it.each(["date_note", "supersedes", "superseded_by", "notes"])(
    "accepts an entry without %s but rejects a non-string %s",
    (field) => {
      expect(
        loadOrders(
          withEntry((entry) => {
            Reflect.deleteProperty(entry, field);
          }),
        ).ok,
      ).toBe(true);
      expectErr(
        withEntry((entry) => {
          entry[field] = 7;
        }),
        field,
      );
    },
  );

  it.each<[string, unknown, string]>([
    ["elements as a string", "tool_name", "elements"],
    ["elements holding a number", [1], "elements"],
    ["judge as a string", "Judge Judy", "judge"],
    ["caption as a string", "title", "caption"],
    ["court as null", null, "court.name"],
  ])("rejects %s", (name, value, named) => {
    const field = name.split(" ")[0] ?? "";
    expectErr(
      withEntry((entry) => {
        entry[field] = value;
      }),
      named,
    );
  });
});

describe("loadOrders vocabulary _Requirements: 1.5_", () => {
  const GROUPS: readonly (readonly [string, string, (entry: Rec) => void])[] = [
    [
      "kind",
      "kind",
      (e) => {
        e["kind"] = "bogus";
      },
    ],
    [
      "applies_to",
      "applies_to",
      (e) => {
        e["applies_to"] = "bogus";
      },
    ],
    [
      "elements",
      "elements",
      (e) => {
        e["elements"] = ["tool_name", "bogus"];
      },
    ],
    [
      "caption.placement",
      "caption.placement",
      (e) => {
        e["caption"] = { placement: "bogus", text: "x" };
      },
    ],
    [
      "status",
      "status",
      (e) => {
        e["status"] = "bogus";
      },
    ],
  ];

  it.each(GROUPS)("rejects an unknown word in %s", (_group, named, change) => {
    expectErr(withEntry(change), named);
  });

  it.each(GROUPS)(
    "rejects a word the file lists but the code does not (%s)",
    (group, named, change) => {
      const root = mutated((r) => {
        vocabGroup(r, group)["bogus"] = "listed in the file only";
        change(entryAt(r, 0));
      });
      expectErr(root, named);
    },
  );

  const ENTRY_WORD: readonly (readonly [string, (entry: Rec) => unknown])[] = [
    ["kind", (e) => e["kind"]],
    ["applies_to", (e) => e["applies_to"]],
    ["status", (e) => e["status"]],
    [
      "elements",
      (e) => {
        const list = e["elements"] as readonly unknown[];
        return list[0];
      },
    ],
    [
      "caption.placement",
      (e) => {
        const caption = e["caption"];
        return isRec(caption) ? caption["placement"] : undefined;
      },
    ],
  ];

  it.each(ENTRY_WORD)(
    "rejects a word the code lists but the file's vocabulary lacks (%s)",
    (group, wordOf) => {
      const root = mutated((r) => {
        const word = wordOf(entryAt(r, 0));
        if (typeof word !== "string") throw new Error(`entry 0 has no ${group} word`);
        Reflect.deleteProperty(vocabGroup(r, group), word);
      });
      expectErr(root, group);
    },
  );

  it("rejects a missing or malformed vocabulary object", () => {
    expectErr(
      mutated((r) => {
        Reflect.deleteProperty(r, "vocabulary");
      }),
      "vocabulary",
    );
    expectErr(
      mutated((r) => {
        r["vocabulary"] = [];
      }),
      "vocabulary",
    );
  });
});

describe("loadOrders ids _Requirements: 1.6_", () => {
  it("rejects a duplicate id", () => {
    const root = mutated((r) => {
      entryAt(r, 1)["id"] = FIRST_ID;
    });
    expectErr(root, "id");
    expect(loadOrders(root)).toMatchObject({
      error: expect.stringContaining("duplicated") as unknown,
    });
  });

  it.each(["Bad_Id", "Upper-Case", "double--hyphen", "-leading", "trailing-", "has space", ""])(
    "rejects the non-kebab id %j",
    (id) => {
      expectErr(
        withEntry((entry) => {
          entry["id"] = id;
        }),
        "id",
      );
    },
  );

  it.each(["a", "a1", "a-b-2", "7-eleven"])("accepts the kebab id %j", (id) => {
    const root = fresh();
    for (const other of root["entries"] as Rec[]) {
      for (const field of ["supersedes", "superseded_by"]) {
        if (other[field] === FIRST_ID) other[field] = id;
      }
    }
    entryAt(root, 0)["id"] = id;
    expect(loadOrders(root).ok).toBe(true);
  });
});

describe("loadOrders references _Requirements: 1.7_", () => {
  it.each(["supersedes", "superseded_by"])("rejects a dangling %s", (field) => {
    expectErr(
      withEntry((entry) => {
        entry[field] = "no-such-entry";
      }),
      field,
    );
  });

  it.each(["supersedes", "superseded_by"])("accepts %s naming another entry", (field) => {
    const root = fresh();
    entryAt(root, 0)[field] = entryAt(root, 1)["id"];
    expect(loadOrders(root).ok).toBe(true);
  });
});

describe("loadOrders dates _Requirements: 1.8_", () => {
  it.each([
    "2024-02-29",
    "2000-02-29",
    "2023-02-28",
    "2023-01-31",
    "2023-04-30",
    "2023-12-31",
    "0400-02-29",
  ])("accepts %s", (date) => {
    expect(loadOrders(withEntry((e) => void (e["date"] = date))).ok).toBe(true);
  });

  it.each([
    "1900-02-29",
    "2023-02-29",
    "2100-02-29",
    "2023-04-31",
    "2023-06-31",
    "2023-09-31",
    "2023-11-31",
    "2023-01-32",
    "2023-13-01",
    "2023-00-10",
    "2023-01-00",
    "2023-1-05",
    "23-01-05",
    "2023/01/05",
    "2023-01-05T00:00:00Z",
    " 2023-01-05",
    "",
  ])("rejects %j", (date) => {
    expectErr(
      withEntry((e) => void (e["date"] = date)),
      "date",
    );
  });
});

describe("loadOrders source_url _Requirements: 1.9_", () => {
  it.each([
    "https://www.txnd.uscourts.gov/judge/x",
    "https://uscourts.gov.example.uscourts.gov/",
    "https://www.uscourts.gov",
    "https://edrm.net/path?q=1#top",
    "https://EDRM.NET/path",
  ])("accepts %s", (url) => {
    expect(loadOrders(withEntry((e) => void (e["source_url"] = url))).ok).toBe(true);
  });

  it.each([
    "http://www.txnd.uscourts.gov/x",
    "https://uscourts.gov/x",
    "https://uscourts.gov",
    "https://user@www.uscourts.gov/x",
    "https://user:pw@www.uscourts.gov/x",
    "https://www.uscourts.gov:8443/x",
    "https://www.edrm.net/x",
    "https://notuscourts.gov/x",
    "https://evil.example/.uscourts.gov",
    "https://evil.example?x=.uscourts.gov",
    "ftp://www.uscourts.gov/x",
    "www.uscourts.gov",
    "https://",
    "",
  ])("rejects %j", (url) => {
    expectErr(
      withEntry((e) => void (e["source_url"] = url)),
      "source_url",
    );
  });
});

describe("loadOrders key_language length _Requirements: 1.10_", () => {
  it.each([0, 401])("rejects %i characters", (length) => {
    expectErr(
      withEntry((e) => void (e["key_language"] = "x".repeat(length))),
      "key_language",
    );
  });

  it.each([1, 400])("accepts %i characters", (length) => {
    expect(loadOrders(withEntry((e) => void (e["key_language"] = "x".repeat(length)))).ok).toBe(
      true,
    );
  });
});

describe("loadOrders reports the first failing check _Requirements: 1.11_", () => {
  it("a bad date in entry 1 and a bad kind in entry 2 reports kind", () => {
    const root = mutated((r) => {
      entryAt(r, 0)["date"] = "2023-02-30";
      entryAt(r, 1)["kind"] = "bogus";
    });
    expectErr(root, "kind");
    expect(loadOrders(root)).toMatchObject({
      error: expect.stringContaining(String(entryAt(root, 1)["id"])) as unknown,
    });
  });

  it("a bad key_language in entry 1 and a bad source_url in entry 2 reports source_url", () => {
    expectErr(
      mutated((r) => {
        entryAt(r, 0)["key_language"] = "";
        entryAt(r, 1)["source_url"] = "http://www.uscourts.gov/";
      }),
      "source_url",
    );
  });

  it("a bad id in entry 2 beats a bad date in entry 1", () => {
    expectErr(
      mutated((r) => {
        entryAt(r, 0)["date"] = "nope";
        entryAt(r, 1)["id"] = "Bad_Id";
      }),
      "id",
    );
  });

  it("a bad version beats a malformed entry", () => {
    expectErr(
      mutated((r) => {
        r["version"] = 2;
        Reflect.deleteProperty(entryAt(r, 0), "title");
      }),
      "version",
    );
  });

  it("two failures of one check report the earlier entry", () => {
    const root = mutated((r) => {
      entryAt(r, 3)["date"] = "bad";
      entryAt(r, 1)["date"] = "bad";
    });
    expect(loadOrders(root)).toMatchObject({
      error: expect.stringContaining(String(entryAt(root, 1)["id"])) as unknown,
    });
  });
});

const BASE: OrderEntry = ORDERS.entries[0] as OrderEntry;

function make(id: string, court: string, judgeName: string | null): OrderEntry {
  const judge: OrderJudge | null = judgeName === null ? null : { name: judgeName, role: "Judge" };
  return { ...BASE, id, court: { ...BASE.court, abbreviation: court }, judge, status: "current" };
}

function setOf(...entries: OrderEntry[]): OrderSet {
  return { version: 1, entries };
}

function ids(set: OrderSet): string[][] {
  return selectableOrders(set).map((g) => g.entries.map((e) => e.id));
}

describe("selectableOrders on the shipped file _Requirements: 2.7, 2.8, 9.3_", () => {
  const groups = selectableOrders(ORDERS);

  it("holds exactly the current entries, none of any other status", () => {
    const listed = groups.flatMap((g) => g.entries.map((e) => e.id)).sort();
    const current = ORDERS.entries
      .filter((e) => e.status === "current")
      .map((e) => e.id)
      .sort();
    expect(listed).toEqual(current);
    expect(groups.every((g) => g.entries.every((e) => e.status === "current"))).toBe(true);
    expect(listed).not.toContain("ndtex-starr-2023");
    expect(listed).not.toContain("ca5-proposed-rule-32-3");
  });

  it("orders groups by first appearance of the abbreviation among current entries", () => {
    const expected: string[] = [];
    for (const e of ORDERS.entries) {
      if (e.status === "current" && !expected.includes(e.court.abbreviation)) {
        expected.push(e.court.abbreviation);
      }
    }
    expect(groups.map((g) => g.court)).toEqual(expected);
    expect(groups[0]?.court).toBe("N.D. Tex.");
  });

  it("puts each group's court-wide entry first and judges by surname", () => {
    expect(groups.find((g) => g.court === "E.D. Tex.")?.entries.map((e) => e.id)).toEqual([
      "edtex-lr-cv-11-g",
      "edtex-crone-mc-11",
      "edtex-love-2025",
    ]);
    expect(groups.find((g) => g.court === "N.D. Ill.")?.entries.map((e) => e.id)).toEqual([
      "ndill-genai-page",
      "ndill-johnston-2023",
    ]);
    expect(groups.find((g) => g.court === "Ct. Int'l Trade")?.entries.map((e) => e.id)).toEqual([
      "cit-choe-groves-2025",
      "cit-kelly-2025",
      "cit-restani-2025",
    ]);
  });

  it("leaves no judge before a court-wide entry in any group", () => {
    for (const g of groups) {
      const firstJudge = g.entries.findIndex((e) => e.judge !== null);
      const lastWide = g.entries.map((e) => e.judge === null).lastIndexOf(true);
      if (firstJudge !== -1) expect(lastWide).toBeLessThan(firstJudge);
    }
  });
});

describe("selectableOrders on synthetic sets _Requirements: 2.7, 2.8_", () => {
  it("keeps file order for judges with the same surname", () => {
    const set = setOf(make("b", "X", "Ann Smith"), make("a", "X", "Bob Smith"));
    expect(ids(set)).toEqual([["b", "a"]]);
  });

  it("sorts accented surnames with the en locale, not by code point", () => {
    const set = setOf(
      make("zimmer", "X", "Zoe Zimmer"),
      make("avila", "X", "Ana Ávila"),
      make("baker", "X", "Bo Baker"),
    );
    expect(ids(set)).toEqual([["avila", "baker", "zimmer"]]);
  });

  it("places two court-wide entries first, in file order", () => {
    const set = setOf(
      make("judge", "X", "Jo Adams"),
      make("wide-2", "X", null),
      make("wide-1", "X", null),
    );
    expect(ids(set)).toEqual([["wide-2", "wide-1", "judge"]]);
  });

  it("puts a later entry of an earlier court in that court's group", () => {
    const set = setOf(make("x1", "X", null), make("y1", "Y", null), make("x2", "X", "Al Zed"));
    expect(selectableOrders(set).map((g) => g.court)).toEqual(["X", "Y"]);
    expect(ids(set)).toEqual([["x1", "x2"], ["y1"]]);
  });

  it("ignores non-current entries when ordering groups", () => {
    const retired: OrderEntry = { ...make("w1", "W", null), status: "rescinded" };
    const set = setOf(retired, make("y1", "Y", null), make("w2", "W", null));
    expect(selectableOrders(set).map((g) => g.court)).toEqual(["Y", "W"]);
    expect(ids(set)).toEqual([["y1"], ["w2"]]);
  });

  it("returns no groups when nothing is current", () => {
    const set = setOf({ ...make("a", "X", null), status: "superseded" });
    expect(selectableOrders(set)).toEqual([]);
  });

  it("does not reorder the input set", () => {
    const set = setOf(make("judge", "X", "Jo Adams"), make("wide", "X", null));
    selectableOrders(set);
    expect(set.entries.map((e) => e.id)).toEqual(["judge", "wide"]);
  });
});

describe("judgeSurname _Requirements: 2.8_", () => {
  const judge = (name: string): OrderJudge => ({ name, role: "Judge" });

  it.each([
    ["Michael J. Newman", "Newman"],
    ["  Ada   Lovelace  ", "Lovelace"],
    ["Madonna", "Madonna"],
    ["Araceli Martínez-Olguín", "Martínez-Olguín"],
    ["Jennifer Choe-Groves", "Choe-Groves"],
  ])("takes the last token of %j", (name, surname) => {
    expect(judgeSurname(judge(name))).toBe(surname);
  });
});
