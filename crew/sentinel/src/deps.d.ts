import type { Deps, FetchLike } from "@reveal-codes/verifier";
import type { Clock, Mode } from "./types.js";
export type SentinelEnv = Readonly<Record<string, string | undefined>>;
export type SentinelConfig = Readonly<{
    mode: Mode;
    /** Non-null only in live mode. Never logged or written to a report. */
    token: string | null;
    baseUrl: string;
    /** `null` means `<home>/.reveal-codes/cache`. */
    cacheDir: string | null;
}>;
export type SentinelIo = Readonly<{
    fetch: FetchLike;
    now: Clock;
    sleep: Deps["sleep"];
    homeDir: string;
}>;
export declare const DEFAULT_BASE_URL = "https://www.courtlistener.com/api/rest/v4";
/** Pure: live when a token is present and fixtures-only is not exactly `1`. Reads four names only. */
export declare function readSentinelConfig(env: SentinelEnv): SentinelConfig;
/** Depends on `env` and `io` alone. Fixtures use recorded responses only. */
export declare function buildDeps(env: SentinelEnv, io: SentinelIo): Readonly<{
    mode: Mode;
    deps: Deps;
}>;
