export type PackageName = "@reveal-codes/verifier";

export const PACKAGE_NAME: PackageName = "@reveal-codes/verifier";

export { createDeps } from "./create-deps";
export { createMemoryCacheStore } from "./cache-memory";
export { createFileCacheStore } from "./cache-file";
export { lookup, lookupWithInfo } from "./lookup";
export type { LookupInfo } from "./lookup";
export { judgeRecords } from "./judge";
export type { DisplayInfo, Judged } from "./judge";
export { clusterDataByIndex, foundNames, foundYear } from "./clusters";
export type { ClusterData } from "./clusters";
export { COURTLISTENER_ORIGIN, courtListenerLink, isDisplayInfo, isSafeAbsoluteUrl } from "./link";
export { namesMatch } from "./name-match";
export { verifierStatus } from "./status";
export type { VerifierStatus } from "./status";
export { checkQuote } from "./quote";
export { fetchOpinionText } from "./opinion";
export { UNRESOLVABLE_FORMS } from "./unresolvable";
export { createFixtureFetch } from "./fixtures";
export type { CacheStore, Deps, DepsInit, FetchInit, FetchLike, HttpResponse } from "./deps";
