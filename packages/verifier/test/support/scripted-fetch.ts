import { onTestFinished } from "vitest";
import type { FetchInit, FetchLike, HttpResponse } from "../../src/deps";

export type ScriptStep =
  | Readonly<{ status: number; headers?: Readonly<Record<string, string>>; body: unknown }>
  | Readonly<{ reject: string }>
  | Readonly<{ hang: true }>;

export type RecordedCall = Readonly<{
  url: string;
  method: "GET" | "POST";
  headers: Readonly<Record<string, string>>;
  /** Raw request body, if any. */
  body: string | undefined;
  /** The decoded `text` form field (Citation_Lines joined by newline), or "" when absent. */
  text: string;
  signal: AbortSignal;
}>;

export type ScriptedFetch = Readonly<{
  fetch: FetchLike;
  calls: readonly RecordedCall[];
  /** Number of steps not yet consumed. */
  remaining(): number;
}>;

function decodeText(body: string | undefined): string {
  if (body === undefined) return "";
  return new URLSearchParams(body).get("text") ?? "";
}

function toResponse(step: Extract<ScriptStep, { status: number }>): HttpResponse {
  const raw = typeof step.body === "string" ? step.body : JSON.stringify(step.body);
  const lower = new Map(Object.entries(step.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status: step.status,
    headers: { get: (name) => lower.get(name.toLowerCase()) ?? null },
    text: () => Promise.resolve(raw),
  };
}

function never(signal: AbortSignal): Promise<HttpResponse> {
  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

/**
 * A fetch that replays `steps` in order and records every call. A string `body`
 * is sent as is; any other body is JSON-encoded. A call with no step left
 * rejects and fails the running test when it finishes (the verifier would
 * otherwise swallow the rejection as `unchecked`).
 */
export function scriptedFetch(steps: readonly ScriptStep[]): ScriptedFetch {
  const calls: RecordedCall[] = [];
  let next = 0;
  const fetch: FetchLike = (url: string, init: FetchInit) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
      text: decodeText(init.body),
      signal: init.signal,
    });
    const step = steps[next++];
    if (step === undefined) {
      const message = `scripted fetch: call ${String(next)} to ${url} has no step (only ${String(steps.length)})`;
      onTestFinished(() => {
        throw new Error(message);
      });
      return Promise.reject(new Error(message));
    }
    if ("reject" in step) return Promise.reject(new Error(step.reject));
    if ("hang" in step) return never(init.signal);
    return Promise.resolve(toResponse(step));
  };
  return { fetch, calls, remaining: () => Math.max(0, steps.length - next) };
}
