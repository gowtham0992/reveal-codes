import type { IssueCode, Origin, QuoteCheckResult, VerificationResult } from "@reveal-codes/engine";
import type { ParagraphRange } from "./ai-paragraphs.js";
import type { OrderCaption, OrderElement, OrderKind } from "./orders-types.js";

/** The only clock the package sees. `now` must be a valid Date. */
export type Meta = Readonly<{ now: Date; verifiedAt: string | null }>;

/** Structural subset of the app's RunLogEntry; a RunLogEntry is assignable to it. */
export type RunInfo = Readonly<{ runId: string; provider: string; modelId: string | null }>;

export type OriginCounts = Readonly<Record<Origin, number>>;
export type StatementTool = Readonly<{ provider: string; model: string | null }>;
export type StatementCitation = Readonly<{
  text: string;
  status: VerificationResult["status"];
  /** Present only when status is "verified". */
  clusterId?: string;
}>;
export type StatementQuote = Readonly<{
  text: string;
  status: QuoteCheckResult["status"];
  /** Present only when status is "mismatch"; not printed. */
  prefixLength?: number;
}>;
export type StatementOverride = Readonly<{
  code: IssueCode;
  text: string;
  reason: string;
  /** The stored ISO instant, unchanged. */
  timestamp: string;
  /** Local `YYYY-MM-DD HH:MM`; the stored string when `timestamp` is not a valid instant. */
  timestampLocal: string;
}>;

/** The selected instrument as the Statement carries it (plain data; `elements` per design D7). */
export type StatementOrder = Readonly<{
  id: string;
  instrument: string;
  title: string;
  /** court.name */
  court: string;
  /** judge.name, or null for a court-wide entry. */
  judge: string | null;
  date: string;
  /** source_url */
  sourceUrl: string;
  kind: OrderKind;
  caption: OrderCaption | null;
  elements: readonly OrderElement[];
}>;

export type Statement = Readonly<{
  /** The selected instrument, or null when none. */
  order: StatementOrder | null;
  /** Filing_Paragraph ranges that hold AI-origin text, ascending; [] when none. */
  aiRanges: readonly ParagraphRange[];
  /** runLog.length; the run count and the prompt count of the order sentences. */
  runCount: number;
  confidentialityCertified: boolean;
  aiUsed: boolean;
  tools: readonly StatementTool[];
  characters: OriginCounts;
  sentences: Readonly<{ total: number; byDominantOrigin: OriginCounts }>;
  citations: readonly StatementCitation[];
  quotes: readonly StatementQuote[];
  overrides: readonly StatementOverride[];
  /** meta.now.toISOString(), an ISO instant. */
  generatedAt: string;
  /** localDate(meta.now), local YYYY-MM-DD. */
  generatedDate: string;
  /** ISO instant or null, as given. */
  verifiedAt: string | null;
  /** localDate(new Date(verifiedAt)), or null. */
  verifiedDate: string | null;
  caption: string;
}>;

/** What renderStatement returns: title, numbered paragraph, table, or signature. */
export type StatementBlock =
  | Readonly<{ kind: "title"; text: string }>
  | Readonly<{ kind: "paragraph"; number: number; text: string }>
  | Readonly<{ kind: "table"; columns: readonly string[]; rows: readonly (readonly string[])[] }>
  | Readonly<{ kind: "signature"; line: string; date: string }>;

export type Appendix = Readonly<{
  /** "Provenance Appendix"; rendered before the intro sentences. */
  title: string;
  /** The two introductory sentences, in order. */
  intro: readonly [string, string];
  /** The lines of render(document, "full").text split on "\n", unmodified. */
  lines: readonly string[];
}>;
