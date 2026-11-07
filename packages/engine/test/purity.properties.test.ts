import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbApiCall, arbDocument } from "../src/testing/arbitraries";
import { runs } from "./support/fc";

// Property 42 helpers: deep freezing, walking plain data, and the "invents no values" checks.

const TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const KEY = /^k(\d+)$/;

/** Freezes `v` and everything reachable from it. Strict mode makes a later write throw. */
function deepFreeze(v: unknown): void {
  if (typeof v !== "object" || v === null || Object.isFrozen(v)) return;
  Object.freeze(v);
  for (const child of Object.values(v)) deepFreeze(child);
}

/** Every value reachable from `v`, `v` included. */
function* walk(v: unknown): Generator<unknown, void, undefined> {
  yield v;
  if (typeof v !== "object" || v === null) return;
  for (const child of Object.values(v)) yield* walk(child);
}

function* records(v: unknown): Generator<Record<string, unknown>> {
  for (const x of walk(v)) {
    if (typeof x === "object" && x !== null && !Array.isArray(x)) {
      yield x as Record<string, unknown>;
    }
  }
}

const strings = (v: unknown): string[] =>
  [...walk(v)].filter((x): x is string => typeof x === "string");

/** Plain data: no functions, no class instances (Date, Map, ...). */
function plainDataViolations(v: unknown): string[] {
  const bad: string[] = [];
  for (const x of walk(v)) {
    if (typeof x === "function") bad.push("function");
    if (typeof x === "object" && x !== null) {
      const proto: unknown = Object.getPrototypeOf(x);
      if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) {
        bad.push("non-plain object");
      }
    }
  }
  return bad;
}

/** Timestamps and Run_Ids in `result` that no string in `args` contains. */
function inventedValues(args: unknown, result: unknown): string[] {
  // Codes text escapes `\`, `[`, `;` and so on with a backslash; `parse` decodes them, so a
  // decoded Run_Id (`r\[1\]` -> `r[1]`) is given by the argument, not invented.
  const raw = strings(args);
  const given = [...raw, ...raw.map((s) => s.replace(/\\(.)/gs, "$1"))];
  const known = (s: string): boolean => given.some((g) => g.includes(s));
  const found: string[] = [];
  for (const s of strings(result)) found.push(...(s.match(TIMESTAMP) ?? []));
  for (const r of records(result)) {
    for (const field of ["timestamp", "runId"] as const) {
      const value = r[field];
      if (typeof value === "string") found.push(value);
    }
  }
  return found.filter((s) => !known(s));
}

/** Issue keys of any Document in `result` that are not `k<n>` with n < keyCounter. */
function keysBeyondCounter(result: unknown): string[] {
  const bad: string[] = [];
  for (const r of records(result)) {
    const counter = r["keyCounter"];
    if (typeof counter !== "number") continue;
    for (const list of [r["citations"], r["quotes"], r["overrides"]]) {
      for (const rec of Array.isArray(list) ? (list as unknown[]) : []) {
        const key = (rec as Record<string, unknown>)["key"];
        if (key === undefined) continue;
        const n = typeof key === "string" ? KEY.exec(key)?.[1] : undefined;
        if (n === undefined || Number(n) >= counter) bad.push(JSON.stringify(key));
      }
    }
  }
  return bad;
}

describe("Property 42: Engine functions are deterministic, pure, and invent no values _Requirements: 1.4, 1.5, 1.6, 1.7_", () => {
  // Property 42
  it("P42 calls on frozen arguments are repeatable, leave arguments equal, and invent nothing", () => {
    fc.assert(
      fc.property(
        arbDocument.chain((d) => arbApiCall(d)),
        (call) => {
          const before = structuredClone(call.args);
          deepFreeze(call.args);
          const first = call.run(call.args);
          const second = call.run(call.args);
          expect(second).toStrictEqual(first);
          // structuredClone drops the null prototypes fast-check records carry, so
          // compare structurally rather than by prototype.
          expect(call.args).toEqual(before);
          expect(plainDataViolations(first)).toEqual([]);
          expect(inventedValues(call.args, first)).toEqual([]);
          expect(keysBeyondCounter(first)).toEqual([]);
        },
      ),
      runs(),
    );
  });
});
