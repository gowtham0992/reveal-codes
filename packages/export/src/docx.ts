// buildDocx: filing, then the Statement, then the Appendix, in one US Letter section.
import { Document as DocxDocument, Packer } from "docx";
import type { Document } from "@reveal-codes/engine";
import { buildAppendix } from "./appendix.js";
import {
  appendixLine,
  filingParagraph,
  singleParagraph,
  statementElements,
  titleParagraph,
} from "./docx-blocks.js";
import { PAGE } from "./docx-style.js";
import { renderStatement } from "./render-statement.js";
import type { Statement } from "./types.js";

const CREATOR = "Reveal Codes";

/** Packs the filing, Statement_Text and Appendix. Rejects if the packer result is not bytes. */
export async function buildDocx(document: Document, statement: Statement): Promise<Uint8Array> {
  const appendix = buildAppendix(document);
  const file = new DocxDocument({
    creator: CREATOR,
    lastModifiedBy: CREATOR,
    title: statement.caption,
    sections: [
      {
        properties: { page: PAGE },
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
