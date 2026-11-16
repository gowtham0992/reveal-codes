// Endnotes helper (open-draft task 2.1): post-processes .docx bytes with fflate so word/endnotes.xml holds
// Word's separator and continuation-separator notes plus real endnotes, with its content-type and relationship
// entries present exactly once. docx 9.15.3 already writes an endnotes part with the two separators and no real
// note, so this replaces that part and adds the entries only where they are missing.
import { strFromU8, strToU8 } from "fflate";
import { partsOf, zipFixed } from "./docx-fixtures.js";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ENDNOTES_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml";
const ENDNOTES_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes";
const SEPARATOR_PARAGRAPH = (kind: "separator" | "continuationSeparator") =>
  `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:${kind}/></w:r></w:p>`;

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function endnoteXml(id: number, text: string): string {
  return (
    `<w:endnote w:id="${String(id)}"><w:p><w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r>` +
    `<w:r><w:t xml:space="preserve">${escapeText(text)}</w:t></w:r></w:p></w:endnote>`
  );
}

/** The whole part: separator (id -1), continuation separator (id 0), then the notes numbered from 1. */
export function endnotesPartXml(texts: readonly string[]): string {
  const notes = texts.map((t, i) => endnoteXml(i + 1, t)).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:endnotes xmlns:w="${W_NS}">` +
    `<w:endnote w:type="separator" w:id="-1">${SEPARATOR_PARAGRAPH("separator")}</w:endnote>` +
    `<w:endnote w:type="continuationSeparator" w:id="0">${SEPARATOR_PARAGRAPH("continuationSeparator")}</w:endnote>` +
    `${notes}</w:endnotes>`
  );
}

function withContentType(xml: string): string {
  if (xml.includes('PartName="/word/endnotes.xml"')) return xml;
  const entry = `<Override ContentType="${ENDNOTES_TYPE}" PartName="/word/endnotes.xml"/>`;
  return xml.replace("</Types>", `${entry}</Types>`);
}

function withRelationship(xml: string): string {
  if (xml.includes('Target="endnotes.xml"')) return xml;
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const id = `rId${String(Math.max(0, ...ids) + 1)}`;
  const entry = `<Relationship Id="${id}" Type="${ENDNOTES_REL}" Target="endnotes.xml"/>`;
  return xml.replace("</Relationships>", `${entry}</Relationships>`);
}

/** Adds a reference to each endnote at the end of the last body paragraph, so the notes are reachable. */
function withReferences(xml: string, count: number): string {
  const sect = xml.indexOf("<w:sectPr");
  const end = xml.lastIndexOf("</w:p>", sect === -1 ? xml.length : sect);
  if (end === -1 || count === 0) return xml;
  let refs = "";
  for (let id = 1; id <= count; id++) {
    refs += `<w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteReference w:id="${String(id)}"/></w:r>`;
  }
  return xml.slice(0, end) + refs + xml.slice(end);
}

function textOfPart(parts: Record<string, Uint8Array>, name: string): string {
  const part = parts[name];
  if (part === undefined) throw new Error(`docx has no part ${name}`);
  return strFromU8(part);
}

/** Returns `bytes` with word/endnotes.xml holding `texts` as endnotes 1.. and Word's two separator notes. */
export function addEndnotes(bytes: Uint8Array, texts: readonly string[]): Uint8Array {
  const parts = partsOf(bytes);
  const next = {
    ...parts,
    "word/endnotes.xml": strToU8(endnotesPartXml(texts)),
    "[Content_Types].xml": strToU8(withContentType(textOfPart(parts, "[Content_Types].xml"))),
    "word/_rels/document.xml.rels": strToU8(
      withRelationship(textOfPart(parts, "word/_rels/document.xml.rels")),
    ),
    "word/document.xml": strToU8(
      withReferences(textOfPart(parts, "word/document.xml"), texts.length),
    ),
  };
  return zipFixed(next);
}
