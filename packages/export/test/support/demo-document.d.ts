import type { Document } from "@reveal-codes/engine";
import type { RunInfo } from "../../src/index.js";
export declare const DEMO_NOW: Date;
export declare const DEMO_VERIFIED_AT = "2026-11-20T18:25:00.000Z";
export declare const DEMO_OVERRIDE_REASONS: readonly ["Cited from the client's court notice; copy requested from the clerk.", "Reporter volume is being confirmed with the court library.", "Quotation taken from a bench ruling transcript, not the opinion.", "Authority is cited for background only and will be removed."];
export declare const DEMO_RUN_LOG: readonly RunInfo[];
/** The demo motion verified against recorded fixtures, with one AI span and four overrides. */
export declare function buildDemoDocument(): Promise<Document>;
