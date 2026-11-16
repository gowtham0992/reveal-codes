import { paragraphTwo } from "./paragraph-two.js";
import { citingParagraph, signatureLine } from "./render-order.js";
import { statementTitle } from "./statement-order.js";
import { ellipsize } from "./text.js";
import type { Statement, StatementBlock } from "./types.js";
import {
  CITATION_COLUMNS,
  NO_CITATIONS_SENTENCE,
  NO_QUOTATIONS_SENTENCE,
  OVERRIDES_INTRO,
  OVERRIDE_COLUMNS,
  PARAGRAPH_1,
  QUOTE_CODES,
  QUOTE_COLUMNS,
  RESPONSIBILITY,
  citationParagraph,
  citationStatusCell,
  quoteParagraph,
} from "./wording.js";

const QUOTATION_MAX = 80;

function paragraph(number: number, text: string): StatementBlock {
  return { kind: "paragraph", number, text };
}

function countOf(items: readonly { status: string }[], status: string): number {
  return items.filter((i) => i.status === status).length;
}

function citationBlocks(s: Statement, number: number): StatementBlock[] {
  if (s.citations.length === 0) return [paragraph(number, NO_CITATIONS_SENTENCE)];
  const text = citationParagraph({
    date: s.verifiedAt === null ? null : s.verifiedDate,
    verified: countOf(s.citations, "verified"),
    wrongCase: countOf(s.citations, "wrong_case"),
    notFound: countOf(s.citations, "not_found"),
    ambiguous: countOf(s.citations, "ambiguous"),
    unchecked: countOf(s.citations, "unchecked"),
  });
  const rows = s.citations.map((c) => [c.text, citationStatusCell(c), c.clusterId ?? ""]);
  return [paragraph(number, text), { kind: "table", columns: CITATION_COLUMNS, rows }];
}

function quoteBlocks(s: Statement, number: number): StatementBlock[] {
  if (s.quotes.length === 0) return [paragraph(number, NO_QUOTATIONS_SENTENCE)];
  const text = quoteParagraph(
    countOf(s.quotes, "match"),
    countOf(s.quotes, "mismatch"),
    countOf(s.quotes, "unchecked"),
  );
  const rows = s.quotes.map((q) => [ellipsize(q.text, QUOTATION_MAX), QUOTE_CODES[q.status]]);
  return [paragraph(number, text), { kind: "table", columns: QUOTE_COLUMNS, rows }];
}

function overrideBlocks(s: Statement, number: number): StatementBlock[] {
  const rows = s.overrides.map((o) => [o.code, o.text, o.reason, o.timestampLocal]);
  return [paragraph(number, OVERRIDES_INTRO), { kind: "table", columns: OVERRIDE_COLUMNS, rows }];
}

/** The Statement_Text as blocks: pure, and dependent only on the Statement. */
export function renderStatement(statement: Statement): readonly StatementBlock[] {
  const hasOverrides = statement.overrides.length > 0;
  const order = statement.order;
  const n = order === null ? 0 : 1;
  return [
    { kind: "title", text: statementTitle(statement) },
    ...(order === null ? [] : [paragraph(1, citingParagraph(order))]),
    paragraph(1 + n, PARAGRAPH_1),
    paragraph(2 + n, paragraphTwo(statement)),
    ...citationBlocks(statement, 3 + n),
    ...quoteBlocks(statement, 4 + n),
    ...(hasOverrides ? overrideBlocks(statement, 5 + n) : []),
    paragraph((hasOverrides ? 6 : 5) + n, RESPONSIBILITY),
    { kind: "signature", line: signatureLine(statement), date: statement.generatedDate },
  ];
}
