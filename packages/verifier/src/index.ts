export type PackageName = "@reveal-codes/verifier";

export const PACKAGE_NAME: PackageName = "@reveal-codes/verifier";

export { createDeps } from "./create-deps";
export { createMemoryCacheStore } from "./cache-memory";
export type { CacheStore, Deps, DepsInit, FetchInit, FetchLike, HttpResponse } from "./deps";
