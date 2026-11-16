// Loader and dataset tests for the court-rules-page spec. _Requirements: 1.6, 15.2, 15.3, 15.4_
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import data from "../../../data/standing-orders.json";
import { loadOrders } from "../src/index.js";
import {
  APPLIES_TO,
  CAPTION_PLACEMENTS,
  ORDER_ELEMENTS,
  ORDER_KINDS,
  ORDER_STATUSES,
} from "../src/orders-types.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DATASET_PATH = resolve(ROOT, "data/standing-orders.json");
const POWER_COPY_PATH = resolve(
  ROOT,
  "powers/citation-check/skills/court-ai-rules/references/standing-orders.json",
);

const NEGATIVE_SENTENCE =
  "The filer certifies that no generative AI was used: by filing without the disclosure, or by a statement of non-use that the instrument requires.";

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fresh(): Rec {
  const copy: unknown = structuredClone(data);
  if (!isRec(copy)) throw new Error("shipped file is not an object");
  return copy;
}

function group(root: Rec, name: string): Rec {
  const vocabulary = root["vocabulary"];
  if (!isRec(vocabulary)) throw new Error("vocabulary is not an object");
  const words = vocabulary[name];
  if (!isRec(words)) throw new Error(`vocabulary ${name} is not an object`);
  return words;
}

function entriesOf(value: unknown): unknown {
  if (!isRec(value)) throw new Error("root is not an object");
  return value["entries"];
}

describe("loadOrders result (_Requirements: 1.6_)", () => {
  it("returns compiled and a complete vocabulary", () => {
    const loaded = loadOrders(fresh());
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.value.compiled).toBe((data as { compiled: string }).compiled);
    const v = loaded.value.vocabulary;
    expect(Object.keys(v.kind)).toEqual([...ORDER_KINDS]);
    expect(Object.keys(v.applies_to)).toEqual([...APPLIES_TO]);
    expect(Object.keys(v.elements)).toEqual([...ORDER_ELEMENTS]);
    expect(Object.keys(v["caption.placement"])).toEqual([...CAPTION_PLACEMENTS]);
    expect(Object.keys(v.status)).toEqual([...ORDER_STATUSES]);
    for (const words of [v.kind, v.applies_to, v.elements, v["caption.placement"], v.status]) {
      for (const text of Object.values(words)) expect(text.length).toBeGreaterThan(0);
    }
  });

  it("fails with the lacking word when a status word is missing", () => {
    for (const word of ORDER_STATUSES) {
      // No entries, so the per-entry vocabulary check cannot fire before the completeness check.
      const root: Rec = { ...fresh(), entries: [] };
      const status = group(root, "status");
      Reflect.deleteProperty(status, word);
      const loaded = loadOrders(root);
      expect(loaded).toEqual({ ok: false, error: `orders: vocabulary "status" lacks "${word}"` });
    }
  });
});

describe("shipped dataset (_Requirements: 15.2, 15.3, 15.4_)", () => {
  it("carries the negative certification sentence from requirement 15.1", () => {
    expect(group(fresh(), "elements")["negative_certification_when_unused"]).toBe(
      NEGATIVE_SENTENCE,
    );
  });

  it("keeps every entry equal to the entries at HEAD", () => {
    const head = execFileSync("git", ["show", "HEAD:data/standing-orders.json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const headEntries: unknown = entriesOf(JSON.parse(head));
    expect(Array.isArray(headEntries)).toBe(true);
    expect(JSON.stringify(entriesOf(data))).toBe(JSON.stringify(headEntries));
  });

  it("has a Power copy byte-equal to the dataset", () => {
    const dataset = readFileSync(DATASET_PATH);
    const copy = readFileSync(POWER_COPY_PATH);
    expect(Buffer.compare(dataset, copy)).toBe(0);
  });
});
