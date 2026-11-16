// Public entry point: named re-exports only (Req 1.9). `testing/` is deliberately not exported (Req 1.2).

// creation and editing
export { apply, createDocument, normalise } from "./document.js";
export { normaliseSpans } from "./spans.js";
export { DEFAULT_RELABEL_THRESHOLD } from "./ops/validate.js";

// segmentation and citations
export { segment } from "./segment.js";
export { extract } from "./citations/extract.js";
export { format } from "./citations/format.js";

// verification state
export { setQuoteCheck, setVerification, verificationOf } from "./verification.js";

// issues and overrides
export { blockingIssues, issues, overrides, recordOverride } from "./issues.js";

// Reveal Codes
export { parse, parseRecord, render, renderRecord, strip, stripPositions } from "./codes.js";
export type { DocumentRecord } from "./codes.js";

// pasted-text declaration
export {
  TOOL_NAME_MAX,
  TOOL_NAME_MIN,
  checkToolName,
  declareAi,
  declareNone,
  holdsSubstantivePasted,
  insertsPasted,
  isDeclaration,
} from "./declaration.js";
export type { Declaration, DeclarationSubject, ToolNameFault } from "./declaration.js";

// results and errors
export { err, ok } from "./result.js";
export type { Result } from "./result.js";
export type { EngineError, EngineErrorKind, MalformedRule, SpanViolation } from "./errors.js";

// public types
export type {
  Applied,
  CallerOperation,
  CitationRecord,
  CitationValue,
  CodePosition,
  DatabaseValue,
  Delete,
  Document,
  EngineConfig,
  ExtractedCitation,
  ExtractedQuote,
  Extraction,
  FullValue,
  IdValue,
  Insert,
  Inverse,
  Issue,
  IssueCode,
  IssueKey,
  Operation,
  Origin,
  Override,
  ParallelValue,
  PartyValue,
  Provenance,
  QuoteCheckResult,
  QuoteRecord,
  QuoteRule,
  OtherValue,
  Rendering,
  RenderMode,
  Replace,
  ReporterMember,
  ReporterValue,
  Restore,
  RunEntry,
  Sentence,
  Span,
  VerificationResult,
} from "./types.js";
