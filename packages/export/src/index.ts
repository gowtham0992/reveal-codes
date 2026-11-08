// Public surface of @reveal-codes/export. Named re-exports only; modules land in later tasks.
export type {
  Appendix,
  Meta,
  OriginCounts,
  RunInfo,
  Statement,
  StatementBlock,
  StatementCitation,
  StatementOverride,
  StatementQuote,
  StatementTool,
} from "./types.js";
export { ellipsize } from "./text.js";
export { isInstant, localDate } from "./time.js";
