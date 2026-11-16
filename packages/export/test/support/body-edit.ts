// Writes one changed body paragraph into a .docx with fflate alone (open-draft task 2.10). Test support only.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const DOCUMENT_PART = "word/document.xml";
const OPEN_PARAGRAPH = /<w:p(?=[\s/>])[^>]*?(\/?)>/g;
const PARAGRAPH_PROPERTIES = /^\s*<w:pPr>[\s\S]*?<\/w:pPr>/;

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One run per stretch of text and one w:tab per tab, which is how Word writes a tab. */
function runsOf(text: string): string {
  return text
    .split("\t")
    .map((piece) =>
      piece === "" ? "" : `<w:r><w:t xml:space="preserve">${escapeText(piece)}</w:t></w:r>`,
    )
    .join("<w:r><w:tab/></w:r>");
}

/** `xml` with the content of its `index`th w:p replaced by `text`; the paragraph's own properties stay. */
export function replaceParagraphText(xml: string, index: number, text: string): string {
  const opens = [...xml.matchAll(OPEN_PARAGRAPH)];
  const open = opens[index];
  if (open === undefined) throw new Error(`document.xml has no paragraph ${String(index)}`);
  const head = open[0];
  const start = open.index + head.length;
  if (open[1] === "/") {
    return `${xml.slice(0, open.index)}${head.slice(0, -2)}>${runsOf(text)}</w:p>${xml.slice(start)}`;
  }
  const close = xml.indexOf("</w:p>", start);
  if (close === -1) throw new Error("unterminated w:p");
  const properties = PARAGRAPH_PROPERTIES.exec(xml.slice(start, close))?.[0] ?? "";
  return `${xml.slice(0, start)}${properties}${runsOf(text)}${xml.slice(close)}`;
}

/** `bytes` with body paragraph `index` rewritten to `text`. */
export function withParagraphText(bytes: Uint8Array, index: number, text: string): Uint8Array {
  const parts = unzipSync(bytes);
  const part = parts[DOCUMENT_PART];
  if (part === undefined) throw new Error(`missing part ${DOCUMENT_PART}`);
  const xml = replaceParagraphText(strFromU8(part), index, text);
  return zipSync({ ...parts, [DOCUMENT_PART]: strToU8(xml) });
}
