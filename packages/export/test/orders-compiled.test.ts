// The compiled date of the dataset. _Requirements: 23.1, 23.2_
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

type Dataset = { compiled: string; entries: { id: string; retrieved: string }[] };

function isDataset(value: unknown): value is Dataset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { compiled?: unknown; entries?: unknown };
  return typeof v.compiled === "string" && Array.isArray(v.entries);
}

function readDataset(): Dataset {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(ROOT, "data/standing-orders.json"), "utf8"),
  );
  if (!isDataset(parsed))
    throw new Error("data/standing-orders.json has no compiled date or entries");
  return parsed;
}

/** Ids of entries retrieved after the compiled date. ISO dates compare as strings. */
function entriesAfterCompiled(dataset: Dataset): string[] {
  return dataset.entries.filter((e) => e.retrieved > dataset.compiled).map((e) => e.id);
}

describe("compiled date (Requirements 23.1, 23.2)", () => {
  it("is not earlier than any entry's retrieved date", () => {
    expect(entriesAfterCompiled(readDataset())).toEqual([]);
  });

  it("equals the latest retrieved date of any entry", () => {
    const dataset = readDataset();
    const latest = dataset.entries.map((e) => e.retrieved).reduce((a, b) => (a > b ? a : b));
    expect(dataset.compiled).toBe(latest);
  });

  it("fails on a dataset whose compiled date is earlier than an entry's retrieved date", () => {
    const planted: Dataset = {
      compiled: "2026-11-08",
      entries: [
        { id: "a", retrieved: "2026-11-08" },
        { id: "b", retrieved: "2026-11-15" },
      ],
    };
    expect(entriesAfterCompiled(planted)).toEqual(["b"]);
  });
});
