import type { VerificationResult } from "@reveal-codes/engine";
import type { ClusterData } from "./clusters";
import type { Deps } from "./deps";
import { isRecord } from "./json";
import { bumpCounter } from "./status";
import { nowMs, toIso } from "./time";

export const CACHE_TTL_MS = 86_400_000;

export type TerminalResult = Exclude<VerificationResult, { status: "unchecked" }>;

function isStringArray(v: unknown): v is readonly string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Shape guard for a cached citation value (design "Cache entries"). */
export function isTerminalResult(v: unknown): v is TerminalResult {
  if (!isRecord(v)) return false;
  switch (v["status"]) {
    case "verified":
      return typeof v["clusterId"] === "string";
    case "ambiguous":
      return isStringArray(v["candidates"]) && v["candidates"].length >= 2;
    case "not_found":
      return v["reason"] === undefined || typeof v["reason"] === "string";
    default:
      return false;
  }
}

/** A resolved line as cached: the result plus the display data of its cluster (case-match D8). */
export type CachedVerified = Readonly<{
  status: "verified";
  clusterId: string;
  cluster: ClusterData;
}>;

export type CachedLine = CachedVerified | Exclude<TerminalResult, { status: "verified" }>;

function isClusterData(v: unknown): v is ClusterData {
  if (!isRecord(v)) return false;
  return Object.values(v).every((x) => typeof x === "string");
}

/** Guard for a cached line: a `verified` entry with no cluster record is a miss. */
export function isCachedLine(v: unknown): v is CachedLine {
  if (!isTerminalResult(v)) return false;
  if (v.status !== "verified") return true;
  return isClusterData((v as Readonly<Record<string, unknown>>)["cluster"]);
}

/** Shape guard for a cached opinion text: a non-empty string. */
export function isOpinionText(v: unknown): v is string {
  return typeof v === "string" && v !== "";
}

const NO_VALUE: Promise<undefined> = Promise.resolve(undefined);

function readStore(deps: Deps, key: string): Promise<unknown> {
  return Promise.resolve()
    .then(() => deps.cache.get(key))
    .then(
      (v) => v,
      () => undefined,
    );
}

/**
 * Reads `key`. A value passing `guard` counts as a hit and is returned; anything else
 * (absent, wrong shape, or a store rejection) counts as a miss and returns `undefined`.
 */
export function cacheGet(deps: Deps, key: string): Promise<TerminalResult | undefined>;
export function cacheGet<T>(
  deps: Deps,
  key: string,
  guard: (v: unknown) => v is T,
): Promise<T | undefined>;
export async function cacheGet(
  deps: Deps,
  key: string,
  guard: (v: unknown) => boolean = isTerminalResult,
): Promise<unknown> {
  const value = await readStore(deps, key);
  const good = value !== undefined && guard(value);
  bumpCounter(deps, good ? "hits" : "misses");
  return good ? value : undefined;
}

function isUnchecked(v: unknown): boolean {
  return isRecord(v) && v["status"] === "unchecked";
}

/**
 * Stores `value` with expiry `Deps.now` + 24 h. An `unchecked` result is never written
 * (Req 10.2). A store rejection is ignored (Req 10.10).
 */
export async function cacheSet(deps: Deps, key: string, value: unknown): Promise<void> {
  if (isUnchecked(value)) return NO_VALUE;
  const expiresAt = toIso(nowMs(deps) + CACHE_TTL_MS);
  if (expiresAt === null) return NO_VALUE;
  bumpCounter(deps, "writes");
  await Promise.resolve()
    .then(() => deps.cache.set(key, value, expiresAt))
    .then(
      () => undefined,
      () => undefined,
    );
}
