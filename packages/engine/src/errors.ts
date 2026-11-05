/**
 * Engine_Error: plain-data errors with a discriminating `kind` (design
 * "Error Handling"). No engine module throws.
 */

/** Syntax faults found while lexing a Full_Rendering (Req 20.3). */
export type MalformedSyntaxRule =
  | "unknown_code"
  | "unterminated_code"
  | "unbalanced_close"
  | "unclosed_open"
  | "missing_doc"
  | "misplaced_doc"
  | "bad_field"
  | "dangling_escape"
  | "ovr_position";

/** Semantic faults found after decoding a Full_Rendering (Req 20.4, 20.5). */
export type MalformedSemanticRule =
  | "coverage"
  | "canonical"
  | "provenance"
  | "surrogate"
  | "quote_prefix"
  | "short_form_code"
  | "ref_code"
  | "run_invariant"
  | "override_target"
  | "issue_key"
  | "extractor_mismatch";

export type MalformedRule = MalformedSyntaxRule | MalformedSemanticRule;

export type SpanViolation = "empty" | "overlap" | "unsorted" | "gap" | "coverage";

export type InvalidProvenance = Readonly<{
  kind: "invalid_provenance";
  field: "origin" | "runId" | "actor";
  value: unknown;
}>;
export type SplitSurrogate = Readonly<{
  kind: "split_surrogate";
  offset: number;
  where: "document" | "text";
}>;
export type InvalidTimestamp = Readonly<{ kind: "invalid_timestamp"; value: unknown }>;
export type InvalidSpans = Readonly<{
  kind: "invalid_spans";
  offset: number;
  violation: SpanViolation;
}>;
export type OutOfRange = Readonly<{
  kind: "out_of_range";
  field: "at" | "from" | "to";
  value: unknown;
  length: number;
}>;
export type InvertedRange = Readonly<{ kind: "inverted_range"; from: number; to: number }>;
export type InvalidConfig = Readonly<{
  kind: "invalid_config";
  field: "relabelThreshold";
  value: unknown;
}>;
export type StaleInverse = Readonly<{ kind: "stale_inverse" }>;
/** `field` names the first failing field in validateFullValue order (design A13). */
export type InvalidCitation = Readonly<{ kind: "invalid_citation"; field: string }>;
export type UnknownCitation = Readonly<{ kind: "unknown_citation"; key: string }>;
export type NotVerifiable = Readonly<{ kind: "not_verifiable"; key: string }>;
/** `field` names the payload field that fails Req 16.2 (for example `waitUntil`). */
export type InvalidVerificationResult = Readonly<{
  kind: "invalid_verification_result";
  field: string;
}>;
export type UnknownQuote = Readonly<{ kind: "unknown_quote"; key: string }>;
export type InvalidQuoteResult = Readonly<{
  kind: "invalid_quote_result";
  field: "prefixLength";
  value: unknown;
}>;
export type EmptyOverrideReason = Readonly<{ kind: "empty_override_reason"; key: string }>;
export type UnknownIssue = Readonly<{ kind: "unknown_issue"; key: string }>;
export type MalformedCodes = Readonly<{
  kind: "malformed_codes";
  index: number;
  rule: MalformedRule;
}>;

export type EngineError =
  | InvalidProvenance
  | SplitSurrogate
  | InvalidTimestamp
  | InvalidSpans
  | OutOfRange
  | InvertedRange
  | InvalidConfig
  | StaleInverse
  | InvalidCitation
  | UnknownCitation
  | NotVerifiable
  | InvalidVerificationResult
  | UnknownQuote
  | InvalidQuoteResult
  | EmptyOverrideReason
  | UnknownIssue
  | MalformedCodes;

export type EngineErrorKind = EngineError["kind"];
