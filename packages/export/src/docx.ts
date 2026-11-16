// buildDocx: filing, then the Statement, then the Appendix, in one US Letter section.
import { Document as DocxDocument, Header, Packer } from "docx";
import type { Document } from "@reveal-codes/engine";
import { buildAppendix } from "./appendix.js";
import {
  appendixLine,
  filingParagraph,
  headerElements,
  singleParagraph,
  statementElements,
  titleParagraph,
} from "./docx-blocks.js";
import { PAGE } from "./docx-style.js";
import { renderStatement } from "./render-statement.js";
import { type FirstPageHeading, firstPageHeading } from "./statement-order.js";
import type { Statement } from "./types.js";

const CREATOR = "Reveal Codes";

/** Section options: today's page setup, plus a first-page header when there is a heading. */
function headerOptions(heading: FirstPageHeading | null) {
  if (heading === null) return { properties: { page: PAGE } };
  return {
    properties: { page: PAGE, titlePage: true },
    headers: { first: new Header({ children: headerElements(heading) }) },
  };
}

/** Packs the filing, Statement_Text and Appendix. Rejects if the packer result is not bytes. */
export async function buildDocx(document: Document, statement: Statement): Promise<Uint8Array> {
  const appendix = buildAppendix(document, statement.declaration);
  const file = new DocxDocument({
    creator: CREATOR,
    lastModifiedBy: CREATOR,
    title: statement.caption,
    sections: [
      {
        ...headerOptions(firstPageHeading(statement)),
        children: [
          ...document.text.split("\n").map(filingParagraph),
          ...statementElements(renderStatement(statement)),
          titleParagraph(appendix.title),
          ...appendix.intro.map(singleParagraph),
          ...appendix.lines.map(appendixLine),
        ],
      },
    ],
  });
  const packed: unknown = await Packer.toBuffer(file);
  // isView rather than instanceof: a Buffer from another realm (jsdom) is still bytes.
  if (!ArrayBuffer.isView(packed)) throw new Error("docx packer did not return bytes");
  return new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength);
}
