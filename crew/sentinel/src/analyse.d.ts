import type { Deps } from "@reveal-codes/verifier";
import type { Finding } from "./types.js";
/**
 * Findings for one file. Never rejects and never writes `bytes`. The catch is the last resort
 * (D17): any unexpected throw becomes one `unreadable` Finding so the sweep can go on.
 */
export declare function analyseFile(file: string, bytes: Uint8Array, deps: Deps): Promise<readonly Finding[]>;
