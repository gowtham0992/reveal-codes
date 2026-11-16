/** One entry per w:p of word/document.xml, in document order. */
export type DocxText = readonly string[];

export type ExportParts = Readonly<{
  /** Every paragraph before the Statement_Title, nothing removed. */
  body: readonly string[];
  /** Every paragraph after the Appendix_Title, less the first INTRO_LENGTH. */
  appendix: readonly string[];
}>;

export type DocxReadError = Readonly<{ kind: "not_docx" }> | Readonly<{ kind: "part_too_large" }>;
