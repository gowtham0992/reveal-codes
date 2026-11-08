import { ellipsize } from "./text.js";
import type { Statement, StatementBlock } from "./types.js";
import {
  CITATION_CODES,
  CITATION_COLUMNS,
  OVERRIDES_INTRO,
  OVERRIDE_COLUMNS,
  PARAGRAPH_1,
  PARAGRAPH_NO_AI,
  QUOTE_CODES,
  QUOTE_COLUMNS,
  RESPONSIBILITY,
  SIGNATURE_LINE,
  STATEMENT_TITLE,
  aiParagraph,
  citationParagraph,
  quoteParagraph,
} from "./wording.js";

const QUOTATION_MAX = 80;

/** a / t * 100 rounded half up to one decimal, in integer arithmetic; "0.0" when t is 0. */
function percent(a: number, t: number): string {
  if (t === 0) return "0.0";
  const tenths = Math.floor((2000 * a + t) / (2 * t));
  return `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`;
}

function paragraph(number: number, text: string): StatementBlock {
  return { kind: "paragraph", number, text };
}

function aiText(s: Statement): string {
  if (!s.aiUsed) return PARAGRAPH_NO_AI;
  const c = s.characters;
  const ai = c.AI + c["AI>HUM"];
  const total = c.HUM + c.PST + c.AI + c["AI>HUM"];
  return aiParagraph({
    tools: s.tools,
    ai,
    total,
    percent: percent(ai, total),
    edited: c["AI>HUM"],
  });
}

function countOf(items: readonly { status: string }[], status: string): number {
  return items.filter((i) => i.status === status).length;
}

function citationBlocks(s: Statement, number: number): StatementBlock[] {
  const text = citationParagraph({
    date: s.verifiedAt === null ? null : s.verifiedDate,
    verified: countOf(s.citations, "verified"),
    notFound: countOf(s.citations, "not_found"),
    ambiguous: countOf(s.citations, "ambiguous"),
    unchecked: countOf(s.citations, "unchecked"),
  });
  const rows = s.citations.map((c) => [c.text, CITATION_CODES[c.status], c.clusterId ?? ""]);
  return [paragraph(number, text), { kind: "table", columns: CITATION_COLUMNS, rows }];
}

function quoteBlocks(s: Statement, number: number): StatementBlock[] {
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
  return [
    { kind: "title", text: STATEMENT_TITLE },
    paragraph(1, PARAGRAPH_1),
    paragraph(2, aiText(statement)),
    ...citationBlocks(statement, 3),
    ...quoteBlocks(statement, 4),
    ...(hasOverrides ? overrideBlocks(statement, 5) : []),
    paragraph(hasOverrides ? 6 : 5, RESPONSIBILITY),
    { kind: "signature", line: SIGNATURE_LINE, date: statement.generatedDate },
  ];
}
