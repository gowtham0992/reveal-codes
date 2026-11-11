import { homedir } from "node:os";
import { join } from "node:path";
import {
  createDeps,
  createFileCacheStore,
  createFixtureFetch,
  createMemoryCacheStore,
} from "@reveal-codes/verifier";
import type { Deps, FetchLike } from "@reveal-codes/verifier";
import { parsePublicLinks } from "../public-links";
import type { PublicLinks } from "../public-links";

// This module is the only reader of process.env in apps/web (Req 15.1).
export type ServerEnv = Readonly<Record<string, string | undefined>>;

export type ServerMode = "fixtures" | "live";

/** Tier 2. A provider is non-null only when both of its variables are non-empty. Model ids come only from env. */
export type AssistantConfig = Readonly<{
  bedrock: Readonly<{ region: string; modelId: string; roleArn: string | null }> | null;
  anthropic: Readonly<{ apiKey: string; modelId: string }> | null;
}>;

export type ServerConfig = Readonly<{
  mode: ServerMode;
  /** Non-null only in live mode. Never logged, returned or sent to the browser. */
  token: string | null;
  baseUrl: string;
  /** `null` means `<home>/.reveal-codes/cache`. */
  cacheDir: string | null;
  /** Tier 2. Holds the Anthropic key when set: never log it or send it to the browser. The Bedrock role ARN is not a secret but is never sent to the browser or printed in an error. */
  assistant: AssistantConfig;
}>;

export type ServerIo = Readonly<{
  fetch: FetchLike;
  now: () => Date;
  sleep: Deps["sleep"];
  homeDir: string;
}>;

export const DEFAULT_BASE_URL = "https://www.courtlistener.com/api/rest/v4";

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

function readAssistant(env: ServerEnv): AssistantConfig {
  const region = nonEmpty(env["AWS_REGION"]);
  const bedrockModel = nonEmpty(env["BEDROCK_MODEL_ID"]);
  const roleArn = nonEmpty(env["BEDROCK_ROLE_ARN"]);
  const apiKey = nonEmpty(env["ANTHROPIC_API_KEY"]);
  const anthropicModel = nonEmpty(env["ANTHROPIC_MODEL"]);
  return {
    bedrock:
      region !== null && bedrockModel !== null ? { region, modelId: bedrockModel, roleArn } : null,
    anthropic:
      apiKey !== null && anthropicModel !== null ? { apiKey, modelId: anthropicModel } : null,
  };
}

/** Pure: the Mode is `fixtures` unless a token is present and fixtures-only is not `1`. */
export function readServerConfig(env: ServerEnv): ServerConfig {
  const token = nonEmpty(env["COURTLISTENER_TOKEN"]);
  const live = token !== null && env["REVEAL_CODES_FIXTURES_ONLY"] !== "1";
  return {
    mode: live ? "live" : "fixtures",
    token: live ? token : null,
    baseUrl: nonEmpty(env["COURTLISTENER_BASE_URL"]) ?? DEFAULT_BASE_URL,
    cacheDir: nonEmpty(env["REVEAL_CODES_CACHE_DIR"]),
    assistant: readAssistant(env),
  };
}

/**
 * A real, abortable timer. The Verifier races every request against
 * `sleep(15000)`; an instantly resolving sleep would win every race. Abort
 * clears the timer and resolves, so the loser of a race leaves nothing behind.
 */
export function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    timer.unref();
    function done(): void {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort(): void {
      clearTimeout(timer);
      done();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Live uses the supplied fetch, a file cache and the token; fixtures use recorded responses only. */
export function buildServerDeps(config: ServerConfig, io: ServerIo): Deps {
  const base = { now: io.now, sleep: io.sleep, baseUrl: config.baseUrl };
  if (config.mode === "fixtures" || config.token === null) {
    return createDeps({
      ...base,
      fetch: createFixtureFetch(),
      cache: createMemoryCacheStore({ now: io.now }),
    });
  }
  const dir = config.cacheDir ?? join(io.homeDir, ".reveal-codes", "cache");
  return createDeps({
    ...base,
    fetch: io.fetch,
    cache: createFileCacheStore({ dir, now: io.now }),
    token: config.token,
  });
}

export type ServerContext = Readonly<{ config: ServerConfig; deps: Deps }>;

const CONTEXT_KEY = Symbol.for("reveal-codes.server-context");
type Holder = { [CONTEXT_KEY]?: ServerContext };

/** One context per process, kept on `globalThis` so dev hot reload keeps the bucket and cache. */
export function getServerContext(): ServerContext {
  const holder = globalThis as Holder;
  const existing = holder[CONTEXT_KEY];
  if (existing !== undefined) return existing;
  const config = readServerConfig(process.env);
  const io: ServerIo = {
    fetch: (url, init) => fetch(url, init),
    now: () => new Date(),
    sleep: realSleep,
    homeDir: homedir(),
  };
  const context: ServerContext = { config, deps: buildServerDeps(config, io) };
  holder[CONTEXT_KEY] = context;
  return context;
}

/** Pure: `NEXT_PUBLIC_VIDEO_URL` and `NEXT_PUBLIC_REPO_URL`, each null unless set to an http(s) address. */
export function readPublicLinks(env: ServerEnv): PublicLinks {
  return parsePublicLinks(env["NEXT_PUBLIC_VIDEO_URL"], env["NEXT_PUBLIC_REPO_URL"]);
}

/** The small-screen page links, read where the page is built (a server component), never in the browser. */
export function getPublicLinks(): PublicLinks {
  return readPublicLinks(process.env);
}
