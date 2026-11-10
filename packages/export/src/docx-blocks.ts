// Blocks and lines to docx elements. No layout decisions beyond docx-style.ts.
import {
  AlignmentType,
  type IRunOptions,
  LineRuleType,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { FirstPageHeading } from "./statement-order.js";
import type { StatementBlock } from "./types.js";
import {
  BODY_FONT,
  BODY_SIZE,
  CODE_FONT,
  CODE_SIZE,
  FILING_LINE,
  SINGLE_LINE,
  TABLE_BORDERS,
} from "./docx-style.js";

const FILING_SPACING = { line: FILING_LINE, lineRule: LineRuleType.AUTO } as const;
const SINGLE_SPACING = { line: SINGLE_LINE, lineRule: LineRuleType.AUTO } as const;
/** Statement paragraphs and titles; the gap keeps a table from sitting against the next paragraph. */
const STATEMENT_SPACING = { ...SINGLE_SPACING, before: 120 } as const;

function bodyRun(text: string, isBold = false): TextRun {
  const options: IRunOptions = { text, font: BODY_FONT, size: BODY_SIZE, bold: isBold };
  return new TextRun(options);
}

/** One paragraph per Filing_Paragraph; an empty one has no text run. */
export function filingParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: FILING_SPACING,
    children: text === "" ? [] : [bodyRun(text)],
  });
}

/** A bold title whose first run is a page break, so the title opens a new page. */
export function titleParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: STATEMENT_SPACING,
    children: [new PageBreak(), bodyRun(text, true)],
  });
}

export function singleParagraph(text: string): Paragraph {
  return new Paragraph({ spacing: STATEMENT_SPACING, children: [bodyRun(text)] });
}

/** First-page header: a bold centred heading, then the pointer paragraph. */
export function headerElements(h: FirstPageHeading): Paragraph[] {
  const heading = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: STATEMENT_SPACING,
    children: [bodyRun(h.heading, true)],
  });
  const pointer = new Paragraph({
    spacing: { ...STATEMENT_SPACING, after: 240 },
    children: [bodyRun(h.pointer)],
  });
  return [heading, pointer];
}

/** One Courier New paragraph per appendix line; leading and trailing spaces are kept. */
export function appendixLine(line: string): Paragraph {
  const children =
    line === "" ? [] : [new TextRun({ text: line, font: CODE_FONT, size: CODE_SIZE })];
  return new Paragraph({ spacing: SINGLE_SPACING, children });
}

function cell(text: string, bold: boolean): TableCell {
  return new TableCell({
    children: [new Paragraph({ spacing: SINGLE_SPACING, children: [bodyRun(text, bold)] })],
  });
}

function tableOf(columns: readonly string[], rows: readonly (readonly string[])[]): Table {
  const header = new TableRow({ tableHeader: true, children: columns.map((c) => cell(c, true)) });
  const body = rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [header, ...body],
  });
}

function blockElement(block: StatementBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "title":
      return [titleParagraph(block.text)];
    case "paragraph":
      return [singleParagraph(`${String(block.number)}. ${block.text}`)];
    case "table":
      return [tableOf(block.columns, block.rows)];
    case "signature":
      return [singleParagraph(block.line), singleParagraph(block.date)];
  }
}

/** Statement blocks to docx elements; the first block is the title with the page break. */
export function statementElements(blocks: readonly StatementBlock[]): (Paragraph | Table)[] {
  return blocks.flatMap(blockElement);
}
