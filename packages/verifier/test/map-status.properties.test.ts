import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { VerificationResult } from "@reveal-codes/engine";
import { mapChunk, parseLookupBody } from "../src/map-status";
import { arbLookupBody } from "./support/arb-lookup";
import { runs } from "./support/fc";

type Raw = Readonly<Record<string, unknown>>;

function isObject(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Cluster ids as the requirement states them: positive safe integer or digit string without leading zero. */
function oracleIds(entry: Raw): string[] {
  const clusters = entry["clusters"];
  const out: string[] = [];
  if (!Array.isArray(clusters)) return out;
  for (const c of clusters as unknown[]) {
    if (!isObject(c)) continue;
    const id = c["id"];
    let s: string | null = null;
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) s = String(id);
    else if (typeof id === "string" && /^[1-9][0-9]*$/.test(id)) s = id;
    if (s !== null && !out.includes(s)) out.push(s);
  }
  return out;
}

function oracleWait(entry: Raw): string | undefined {
  const raw = entry["wait_until"] ?? entry["wait_util"];
  if (typeof raw !== "string" || raw === "" || Number.isNaN(Date.parse(raw))) return undefined;
  return new Date(Date.parse(raw)).toISOString();
}

/** Req 3.1 to 3.7 restated independently of `mapEntry`. */
function expected(raw: unknown): VerificationResult {
  const unchecked: VerificationResult = { status: "unchecked" };
  if (!isObject(raw)) return unchecked;
  const s = raw["status"];
  const ids = typeof s === "number" ? oracleIds(raw) : [];
  if (s === 200 && ids.length === 1) return { status: "verified", clusterId: ids[0] as string };
  if ((s === 200 || s === 300) && ids.length >= 2) return { status: "ambiguous", candidates: ids };
  if (s === 404) return { status: "not_found" };
  if (s === 400) return { status: "not_found", reason: "unknown_reporter" };
  if (s === 429) {
    const w = oracleWait(raw);
    return w === undefined ? unchecked : { status: "unchecked", waitUntil: w };
  }
  return unchecked;
}

const arbCase = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 8 })
  .chain((lines) => fc.record({ lines: fc.constant(lines), body: arbLookupBody(lines) }));

// Property 1
// Feature: citation-verifier, Property 1: Status mapping yields verified only for Line_Status 200 and one result per line
describe("Property 1: status mapping _Requirements: 1.8, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_", () => {
  it("maps each line by position, verified only for 200 with exactly one cluster id", () => {
    fc.assert(
      fc.property(arbCase, ({ lines, body }) => {
        const now = 1_700_000_000_000;
        const first = mapChunk(lines, parseLookupBody(body), null, now);
        const second = mapChunk(lines, parseLookupBody(body), null, now);
        expect([...first.keys()]).toEqual(lines);
        expect(second).toEqual(first);
        const aligned = Array.isArray(body) && body.length === lines.length;
        lines.forEach((line, i) => {
          const want = aligned ? expected((body as unknown[])[i]) : { status: "unchecked" };
          expect(first.get(line)).toStrictEqual(want);
        });
      }),
      { numRuns: runs() },
    );
  });
});
