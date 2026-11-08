import type { BucketState } from "./bucket";

/** Options passed to the injected fetch. Only these fields are ever set. */
export type FetchInit = Readonly<{
  method: "GET" | "POST";
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal: AbortSignal;
  redirect: "error";
}>;

/** The slice of a fetch Response the verifier reads. */
export type HttpResponse = Readonly<{
  status: number;
  headers: Readonly<{ get(name: string): string | null }>;
  text(): Promise<string>;
}>;

export type FetchLike = (url: string, init: FetchInit) => Promise<HttpResponse>;

export type CacheStore = Readonly<{
  /** `undefined` is a miss. Never rejects. */
  get(key: string): Promise<unknown>;
  /** `expiresAt` is an ISO-8601 UTC string. Never rejects. */
  set(key: string, value: unknown, expiresAt: string): Promise<void>;
  delete(key: string): Promise<void>;
}>;

/** The six caller-visible dependencies. */
export type DepsInit = Readonly<{
  fetch: FetchLike;
  now: () => Date;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  cache: CacheStore;
  token?: string;
  baseUrl: string;
}>;

/** The only mutable shape in the package. Written only by bucket, status and gate modules. */
export type Cell<T> = { value: T };

export type Counters = Readonly<{ hits: number; misses: number; writes: number }>;

export type VerifierState = Readonly<{
  bucket: Cell<BucketState>;
  counters: Cell<Counters>;
  gateTail: Cell<Promise<void>>;
}>;

/** `DepsInit` plus per-instance state. Built only by `createDeps`. */
export type Deps = DepsInit & Readonly<{ state: VerifierState }>;
