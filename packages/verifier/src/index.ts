export type PackageName = "@reveal-codes/verifier";

export const PACKAGE_NAME: PackageName = "@reveal-codes/verifier";

export { createDeps } from "./create-deps";
export { createMemoryCacheStore } from "./cache-memory";
export { createFileCacheStore } from "./cache-file";
export { verifierStatus } from "./status";
export type { VerifierStatus } from "./status";
export { checkQuote } from "./quote";
export { fetchOpinionText } from "./opinion";
export { UNRESOLVABLE_FORMS } from "./unresolvable";
export type { CacheStore, Deps, DepsInit, FetchInit, FetchLike, HttpResponse } from "./deps";
