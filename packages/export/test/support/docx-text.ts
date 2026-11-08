// Reads the paragraph list of word/document.xml; a page break is a "\f" entry before its paragraph.
import { strFromU8, unzipSync } from "fflate";

const PARAGRAPH = /<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TEXT_OR_TAB = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\/>/g;

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textOf(paragraphXml: string): string {
  let out = "";
  for (const m of paragraphXml.matchAll(TEXT_OR_TAB)) {
    out += m[0] === "<w:tab/>" ? "\t" : unescapeXml(m[1] ?? "");
  }
  return out;
}

export function readDocxPart(bytes: Uint8Array, path: string): string {
  const part = unzipSync(bytes)[path];
  if (part === undefined) throw new Error(`missing part ${path}`);
  return strFromU8(part);
}

export function readDocxParagraphs(bytes: Uint8Array): string[] {
  const xml = readDocxPart(bytes, "word/document.xml");
  const out: string[] = [];
  for (const m of xml.matchAll(PARAGRAPH)) {
    if (m[0].includes('<w:br w:type="page"/>')) out.push("\f");
    out.push(textOf(m[0]));
  }
  return out;
}
