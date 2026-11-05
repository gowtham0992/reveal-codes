/**
 * Plain-data types for the engine (design "Data Models"). Every value is
 * immutable. Optional fields are absent, never `undefined`
 * (exactOptionalPropertyTypes).
 */

// Provenance

export type Origin = "HUM" | "PST" | "AI" | "AI>HUM";

/** `runId` is present iff `origin` is `AI` or `AI>HUM`; checkProvenance enforces it (Req 2.5). */
export type Provenance = Readonly<{ origin: Origin; runId?: string; timestamp: string }>;

export type Span = Readonly<{ start: number; end: number; provenance: Provenance }>;

export type RunEntry = Readonly<{
  runId: string;
  /** ≥ 1 in every engine-produced entry. */
  originalLength: number;
  /** Cumulative_Edited_Count. */
  editedCount: number;
  /** Relabelled_Flag. */
  relabelled: boolean;
}>;

/** Always matches /^k(0|[1-9][0-9]*)$/ in engine output. */
export type IssueKey = string;

// Citation values

export type ReporterMember = Readonly<{
  volume: number;
  reporter: string;
  page: number;
  pincite?: number;
}>;

export type ReporterValue = Readonly<{
  kind: "reporter";
  volume: number;
  reporter: string;
  page: number;
  pincite?: number;
  court?: string;
  year?: number;
}>;

export type ParallelValue = Readonly<{
  kind: "parallel";
  members: readonly ReporterMember[];
  court?: string;
  year?: number;
}>;

/** `lexisCourt` is present iff `designator` is `LEXIS`. */
export type DatabaseValue = Readonly<{
  kind: "database";
  year: number;
  designator: "WL" | "LEXIS";
  lexisCourt?: string;
  number: number;
  pincite?: number;
}>;

export type IdValue = Readonly<{
  kind: "short";
  form: "id";
  pincite?: number;
  /** Start Offset of the target Full_Citation, or null for an Orphan. */
  targetStart: number | null;
}>;

export type PartyValue = Readonly<{
  kind: "short";
  form: "party";
  /** Stripped Short_Form_Party; may hold one " v. " and Entity_Suffixes. */
  party: string;
  volume: number;
  reporter: string;
  pincite: number;
  /** Start Offset of the target Full_Citation, or null for an Orphan. */
  targetStart: number | null;
}>;

export type OtherValue = Readonly<{
  kind: "other";
  form: "usc" | "cfr" | "fed_rule";
  title?: number;
  section: string;
}>;

export type FullValue = ReporterValue | ParallelValue | DatabaseValue;
export type CitationValue = FullValue | IdValue | PartyValue | OtherValue;

// Extraction

export type ExtractedCitation = Readonly<{
  start: number;
  end: number;
  text: string;
  value: CitationValue;
  normalised?: string;
}>;

/** Preceding_Quote (Req 13.1) or Following_Quote (Req 13.8). */
export type QuoteRule = "preceding" | "following";

export type ExtractedQuote = Readonly<{
  start: number;
  end: number;
  text: string;
  /** Start of the attached Full_Citation or Short_Form. */
  citationStart: number;
  rule: QuoteRule;
}>;

export type Extraction = Readonly<{
  citations: readonly ExtractedCitation[];
  quotes: readonly ExtractedQuote[];
}>;

// Verification state

export type VerificationResult =
  | Readonly<{ status: "verified"; clusterId: string }>
  | Readonly<{ status: "ambiguous"; candidates: readonly string[] }>
  | Readonly<{ status: "not_found"; reason?: string }>
  | Readonly<{ status: "unchecked"; waitUntil?: string }>;

export type QuoteCheckResult =
  | Readonly<{ status: "unchecked" }>
  | Readonly<{ status: "match" }>
  | Readonly<{ status: "mismatch"; prefixLength: number }>;

export type CitationRecord =
  | Readonly<{
      kind: "full";
      key: IssueKey;
      citation: ExtractedCitation;
      result: VerificationResult;
    }>
  /** Result derived from the target (Req 12.4, 12.5). */
  | Readonly<{ kind: "short"; key: IssueKey; citation: ExtractedCitation }>
  /** Other_Reference: no key, no result. */
  | Readonly<{ kind: "other"; citation: ExtractedCitation }>;

export type QuoteRecord = Readonly<{
  key: IssueKey;
  quote: ExtractedQuote;
  result: QuoteCheckResult;
}>;

export type Override = Readonly<{ key: IssueKey; reason: string; timestamp: string }>;

// Document

export type Document = Readonly<{
  text: string;
  /** Canonical (Req 3). */
  spans: readonly Span[];
  /** Sorted by runId in UTF-16 code unit order. */
  runs: readonly RunEntry[];
  /** Ascending start. */
  citations: readonly CitationRecord[];
  /** Ascending start. */
  quotes: readonly QuoteRecord[];
  /** Issue order (Req 18.7). */
  overrides: readonly Override[];
  /** Issue_Key_Counter. */
  keyCounter: number;
}>;

// Operations

export type Insert = Readonly<{ kind: "insert"; at: number; text: string; provenance: Provenance }>;
export type Delete = Readonly<{ kind: "delete"; from: number; to: number; actor: Origin }>;
export type Replace = Readonly<{
  kind: "replace";
  from: number;
  to: number;
  text: string;
  provenance: Provenance;
}>;
export type CallerOperation = Insert | Delete | Replace;

export type Restore = Readonly<{
  /** Text patch applied to `expect.text`. */
  at: number;
  removeLength: number;
  insertText: string;
  spans: readonly Span[];
  runs: readonly RunEntry[];
  citations: readonly CitationRecord[];
  quotes: readonly QuoteRecord[];
  overrides: readonly Override[];
  keyCounter: number;
}>;

export type Inverse = Readonly<{ kind: "inverse"; expect: Document; restore: Restore }>;
export type Operation = CallerOperation | Inverse;
export type Applied = Readonly<{ document: Document; inverse: Inverse }>;
export type EngineConfig = Readonly<{ relabelThreshold?: number }>;

// Segmentation

export type Sentence = Readonly<{
  start: number;
  end: number;
  dominantOrigin: Origin;
  /** Listed in the fixed order HUM, PST, AI, AI>HUM. */
  origins: readonly Origin[];
}>;

// Issues

export type IssueCode = "CIT ✘" | "CIT ?" | "CIT …" | "QUO ✘" | "QUO …";

export type Issue = Readonly<{
  key: IssueKey;
  kind: "citation" | "orphan" | "quote";
  start: number;
  end: number;
  code: IssueCode;
}>;

// Rendering

export type RenderMode = "full" | "display";

/** `code` is the exact token text, escaped. */
export type CodePosition = Readonly<{ offset: number; code: string }>;

export type Rendering = Readonly<{ text: string; positions: readonly CodePosition[] }>;
