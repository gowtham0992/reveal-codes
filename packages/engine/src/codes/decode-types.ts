/** Draft Document types produced by decode (design A12 step 2). */
import type { Provenance, QuoteCheckResult, RunEntry } from "../types.js";
import type { LexFault } from "./lex.js";

export type DecodeFault = LexFault;

/** Payload of a citation Code. Payload fields are absent for a Short_Form. */
export type DraftStatus =
  | Readonly<{ status: "verified"; clusterId?: string }>
  | Readonly<{ status: "wrong_case"; clusterId?: string; foundName?: string; foundYear?: number }>
  | Readonly<{ status: "ambiguous"; count: number; candidates?: readonly string[] }>
  | Readonly<{ status: "not_found"; reason?: string }>
  | Readonly<{ status: "unchecked"; waitUntil?: string }>;

export type DraftOverride = Readonly<{
  /** Input index of the `[OVR]` Code. */
  index: number;
  reason: string;
  timestamp: string;
}>;

export type DraftCitation = Readonly<{
  index: number;
  start: number;
  end: number;
  key: string;
  status: DraftStatus;
  override?: DraftOverride;
}>;

export type DraftQuote = Readonly<{
  index: number;
  start: number;
  end: number;
  key: string;
  result: QuoteCheckResult;
  override?: DraftOverride;
}>;

export type DraftRef = Readonly<{
  index: number;
  start: number;
  end: number;
  override?: DraftOverride;
}>;

export type DraftSpan = Readonly<{
  index: number;
  start: number;
  end: number;
  provenance: Provenance;
}>;

export type DraftDocument = Readonly<{
  text: string;
  keyCounter: number;
  /** In input order; check verifies they are sorted. */
  runs: readonly RunEntry[];
  spans: readonly DraftSpan[];
  /** In opening-Code order. */
  citations: readonly DraftCitation[];
  quotes: readonly DraftQuote[];
  refs: readonly DraftRef[];
}>;
