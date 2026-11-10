// Public surface of @reveal-codes/export. Named re-exports only; modules land in later tasks.
export type {
  Appendix,
  Meta,
  OriginCounts,
  RunInfo,
  Statement,
  StatementBlock,
  StatementCitation,
  StatementOrder,
  StatementOverride,
  StatementQuote,
  StatementTool,
} from "./types.js";
export { buildStatement } from "./statement.js";
export { buildAppendix } from "./appendix.js";
export { renderStatement } from "./render-statement.js";
export { prohibitionNotice, needsConfidentiality } from "./order-rules.js";
export type { ProhibitionNotice } from "./order-rules.js";
export { firstPageHeading } from "./statement-order.js";
export type { FirstPageHeading } from "./statement-order.js";
export type { ParagraphRange } from "./ai-paragraphs.js";
export { exportFileName } from "./file-name.js";
export { ellipsize } from "./text.js";
export { isInstant, localDate, localDateTime } from "./time.js";
export { buildDocx } from "./docx.js";
export { canExport } from "./gate.js";
export { APPENDIX_TITLE, STATEMENT_TITLE, STATEMENT_TITLES } from "./wording.js";
export { ORDERS, loadOrders, selectableOrders, orderById, judgeSurname } from "./orders.js";
export { APPLIES_TO, ORDER_KINDS } from "./orders-types.js";
export type { OrderGroup } from "./orders.js";
export type {
  OrderContext,
  OrderElement,
  OrderEntry,
  OrderKind,
  OrderSet,
} from "./orders-types.js";
