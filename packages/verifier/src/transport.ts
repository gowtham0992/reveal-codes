import type { Deps, HttpResponse } from "./deps";
import { isRecord, parseJson } from "./json";
import { authHeaders } from "./request";
import type { RequestSpec } from "./request";
import { nowMs, parseRetryAfter, parseWaitUntil, retryAfterIso } from "./time";

export const REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_RETRY_MS = 1_000;
export const MAX_RETRY_MS = 30_000;
export const MAX_ATTEMPTS = 3;

/**
 * What one request produced. Carries no request header, so no token can leak
 * through it (Req 11.4).
 */
export type HttpOutcome =
  | Readonly<{ kind: "json"; json: unknown }>
  | Readonly<{ kind: "network" }>
  | Readonly<{ kind: "timeout" }>
  | Readonly<{ kind: "bad_body" }>
  | Readonly<{
      kind: "http_error";
      status: number;
      retryable: boolean;
      retryAfter: string | null;
      waitUntil: string | null;
    }>;

export type Attempted = Readonly<{ outcome: HttpOutcome; attempts: number }>;

const NETWORK: HttpOutcome = { kind: "network" };
const TIMEOUT: HttpOutcome = { kind: "timeout" };
const BAD_BODY: HttpOutcome = { kind: "bad_body" };

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function waitUntilOfBody(text: string): string | null {
  const parsed = parseJson(text);
  if (!parsed.ok || !isRecord(parsed.value)) return null;
  const body = parsed.value;
  return parseWaitUntil(body["wait_until"] ?? body["wait_util"]);
}

function classify(res: HttpResponse, text: string): HttpOutcome {
  const { status } = res;
  if (status >= 200 && status <= 299) {
    const parsed = parseJson(text);
    return parsed.ok ? { kind: "json", json: parsed.value } : BAD_BODY;
  }
  const retryable = isRetryableStatus(status);
  return {
    kind: "http_error",
    status,
    retryable,
    retryAfter: retryable ? res.headers.get("Retry-After") : null,
    waitUntil: retryable ? waitUntilOfBody(text) : null,
  };
}

function readResponse(res: HttpResponse): Promise<HttpOutcome> {
  return res.text().then(
    (text) => classify(res, text),
    () => NETWORK,
  );
}

/**
 * One request, raced against `Deps.sleep(15000, signal)`. The loser is aborted
 * (Req 4.2). The token is attached by `authHeaders` only (Req 2.9, 2.10).
 */
export async function requestOnce(
  deps: Deps,
  url: string,
  spec: RequestSpec,
): Promise<HttpOutcome> {
  const fetchAbort = new AbortController();
  const sleepCancel = new AbortController();
  const headers = authHeaders(deps, url, spec.headers);
  const init = { ...spec, headers, signal: fetchAbort.signal, redirect: "error" } as const;
  const work: Promise<HttpOutcome> = new Promise<HttpResponse>((resolve) => {
    resolve(deps.fetch(url, init));
  }).then(readResponse, () => NETWORK);
  const timeout = deps.sleep(REQUEST_TIMEOUT_MS, sleepCancel.signal).then(() => TIMEOUT);
  const winner = await Promise.race([work, timeout]);
  sleepCancel.abort();
  if (winner === TIMEOUT) fetchAbort.abort();
  return winner;
}

/** Delay before a retry (Req 7.8): the larger of the two hints, 1 000 ms when none, at most 30 000 ms. */
export function retryDelayMs(outcome: HttpOutcome, nowMillis: number): number {
  if (outcome.kind !== "http_error") return DEFAULT_RETRY_MS;
  const fromHeader = parseRetryAfter(outcome.retryAfter, nowMillis);
  const until = outcome.waitUntil === null ? Number.NaN : Date.parse(outcome.waitUntil);
  const fromBody = Number.isNaN(until) ? null : Math.max(0, until - nowMillis);
  const hints = [fromHeader, fromBody].filter((v): v is number => v !== null);
  const delay = hints.length === 0 ? DEFAULT_RETRY_MS : Math.max(...hints);
  return Math.min(delay, MAX_RETRY_MS);
}

/**
 * Runs `send` at most three times, retrying only 429 and 5xx. `before()` runs
 * ahead of every attempt, retries included, and returns false when no request
 * may be made (Req 7.4, 7.10, 7.11).
 */
export async function withRetries(
  deps: Deps,
  before: () => Promise<boolean>,
  send: () => Promise<HttpOutcome>,
): Promise<Attempted> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!(await before())) return { outcome: NETWORK, attempts: attempt };
    const outcome = await send();
    const again = outcome.kind === "http_error" && outcome.retryable && attempt < MAX_ATTEMPTS - 1;
    if (!again) return { outcome, attempts: attempt + 1 };
    await deps.sleep(retryDelayMs(outcome, nowMs(deps)));
  }
  return { outcome: NETWORK, attempts: MAX_ATTEMPTS };
}

/**
 * `waitUntil` for the `unchecked` results of a failed chunk (Req 4.5, 4.6):
 * the body's `wait_until`, else `Retry-After` converted with `Deps.now`, else `null`.
 */
export function waitUntilOf(outcome: HttpOutcome, nowMillis: number): string | null {
  if (outcome.kind !== "http_error" || !outcome.retryable) return null;
  return outcome.waitUntil ?? retryAfterIso(outcome.retryAfter, nowMillis);
}
