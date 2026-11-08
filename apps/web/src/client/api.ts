import type { CitationRecord, IssueKey, Result, VerificationResult } from "@reveal-codes/engine";
import { streamDraft } from "./assistant-client";

export type ApiError =
  | Readonly<{ kind: "network" }>
  | Readonly<{ kind: "status"; status: number }>
  | Readonly<{ kind: "shape" }>;
export type FullRecord = Extract<CitationRecord, { kind: "full" }>;
export type VerifyPairs = readonly (readonly [IssueKey, VerificationResult])[];
export type AssistantInfo = Readonly<{
  provider: "bedrock" | "anthropic" | "fixture";
  modelId: string | null;
}>;
export type ModeInfo = Readonly<{ mode: "fixtures" | "live"; assistant?: AssistantInfo }>;
export type FetchFn = (
  input: string,
  init?: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: string;
    signal?: AbortSignal;
  }>,
) => Promise<Response>;

export type ApiClient = Readonly<{
  verify(
    records: readonly FullRecord[],
    signal?: AbortSignal,
  ): Promise<Result<VerifyPairs, ApiError>>;
  opinion(clusterId: string, signal?: AbortSignal): Promise<Result<string | null, ApiError>>;
  mode(): Promise<Result<ModeInfo, ApiError>>;
  demoMotion(): Promise<Result<string, ApiError>>;
  /** Tier 2. Calls `onChunk` with each decoded piece as it arrives; resolves when the stream ends. */
  draft(
    prompt: string,
    context: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<Result<void, ApiError>>;
}>;

type Init = NonNullable<Parameters<FetchFn>[1]>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrings(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isVerificationResult(value: unknown): value is VerificationResult {
  if (!isObject(value)) return false;
  switch (value["status"]) {
    case "verified":
      return typeof value["clusterId"] === "string";
    case "ambiguous":
      return isStrings(value["candidates"]);
    case "not_found":
    case "unchecked":
      return true;
    default:
      return false;
  }
}

function toPair(value: unknown): readonly [IssueKey, VerificationResult] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [key, result] = value as [unknown, unknown];
  return typeof key === "string" && isVerificationResult(result) ? [key, result] : null;
}

function toPairs(body: unknown): Result<VerifyPairs, ApiError> {
  if (!Array.isArray(body)) return { ok: false, error: { kind: "shape" } };
  const pairs: (readonly [IssueKey, VerificationResult])[] = [];
  for (const item of body as unknown[]) {
    const pair = toPair(item);
    if (pair !== null) pairs.push(pair);
  }
  return { ok: true, value: pairs };
}

function toOpinion(body: unknown): Result<string | null, ApiError> {
  if (!isObject(body)) return { ok: false, error: { kind: "shape" } };
  const text = body["text"];
  if (text === null || typeof text === "string") return { ok: true, value: text };
  return { ok: false, error: { kind: "shape" } };
}

function toAssistant(value: unknown): AssistantInfo | null {
  if (!isObject(value)) return null;
  const { provider, modelId } = value;
  const known = provider === "bedrock" || provider === "anthropic" || provider === "fixture";
  if (!known || (modelId !== null && typeof modelId !== "string")) return null;
  return { provider, modelId };
}

/** A missing or malformed `assistant` field is dropped, not an error: Tier 1 never needs it. */
function toMode(body: unknown): Result<ModeInfo, ApiError> {
  if (!isObject(body)) return { ok: false, error: { kind: "shape" } };
  const mode = body["mode"];
  if (mode !== "fixtures" && mode !== "live") return { ok: false, error: { kind: "shape" } };
  const assistant = toAssistant(body["assistant"]);
  return { ok: true, value: assistant === null ? { mode } : { mode, assistant } };
}

/** Turns a rejection into a value so callers branch on it instead of catching. */
async function attempt<T>(run: () => Promise<T>): Promise<T | Error> {
  try {
    return await run();
  } catch (error) {
    return error instanceof Error ? error : new Error("request failed");
  }
}

type Reader<T> = (response: Response) => Promise<Result<T, ApiError>>;

async function request<T>(
  fetchFn: FetchFn,
  url: string,
  init: Init | undefined,
  read: Reader<T>,
): Promise<Result<T, ApiError>> {
  const response = await attempt(() => fetchFn(url, init));
  if (response instanceof Error) return { ok: false, error: { kind: "network" } };
  if (!response.ok) return { ok: false, error: { kind: "status", status: response.status } };
  return read(response);
}

function jsonReader<T>(narrow: (body: unknown) => Result<T, ApiError>): Reader<T> {
  return async (response) => {
    const body = await attempt(() => response.json() as Promise<unknown>);
    if (body instanceof Error) return { ok: false, error: { kind: "shape" } };
    return narrow(body);
  };
}

const readText: Reader<string> = async (response) => {
  const text = await attempt(() => response.text());
  if (text instanceof Error) return { ok: false, error: { kind: "network" } };
  return { ok: true, value: text };
};

function withSignal(init: Init, signal?: AbortSignal): Init {
  return signal === undefined ? init : { ...init, signal };
}

export function createApiClient(fetchFn: FetchFn): ApiClient {
  return {
    verify: (records, signal) =>
      request(
        fetchFn,
        "/api/verify",
        withSignal(
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records }),
          },
          signal,
        ),
        jsonReader(toPairs),
      ),
    opinion: (clusterId, signal) =>
      request(
        fetchFn,
        `/api/opinion/${encodeURIComponent(clusterId)}`,
        withSignal({ method: "GET" }, signal),
        jsonReader(toOpinion),
      ),
    mode: () => request(fetchFn, "/api/mode", { method: "GET" }, jsonReader(toMode)),
    demoMotion: () => request(fetchFn, "/demo-motion.txt", { method: "GET" }, readText),
    draft: (prompt, context, onChunk, signal) =>
      streamDraft(fetchFn, prompt, context, onChunk, signal),
  };
}

/** The only `fetch(` call in the browser bundle. */
export function browserApi(): ApiClient {
  return createApiClient((input, init) => fetch(input, init));
}
