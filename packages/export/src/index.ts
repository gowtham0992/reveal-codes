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
export { buildStatement } from "./statement.js";
export { buildAppendix } from "./appendix.js";
export { renderStatement } from "./render-statement.js";
export { exportFileName } from "./file-name.js";
export { ellipsize } from "./text.js";
export { isInstant, localDate, localDateTime } from "./time.js";
export { buildDocx } from "./docx.js";
export { canExport } from "./gate.js";
