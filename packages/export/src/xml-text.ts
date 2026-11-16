const ENTITY = /&(?:(amp|lt|gt|quot|apos)|#([0-9]+)|#[xX]([0-9a-fA-F]+));/g;

const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const MAX_CODE_POINT = 0x10ffff;

function isUsable(cp: number): boolean {
  if (!Number.isFinite(cp) || cp === 0 || cp > MAX_CODE_POINT) return false;
  return cp < 0xd800 || cp > 0xdfff;
}

/** Single left-to-right pass: &amp; &lt; &gt; &quot; &apos; and numeric references. */
export function decodeEntities(text: string): string {
  return text.replace(
    ENTITY,
    (match: string, named?: string, dec?: string, hex?: string): string => {
      if (named !== undefined) return NAMED[named] ?? match;
      const cp = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? "", 16);
      return isUsable(cp) ? String.fromCodePoint(cp) : match;
    },
  );
}

const TOKEN =
  /<w:p(?=[\s/>])[^>]*?(\/?)>|<\/w:p>|<w:t(?=[\s/>])[^>]*?(\/?)>([^<]*)|<w:tab(?=[\s/>])[^>]*>|<w:br(?=[\s/>])([^>]*)>/g;

const BREAK_TYPE = /w:type\s*=\s*(?:"([^"]*)"|'([^']*)')/;

function breaksLine(attributes: string): boolean {
  const found = BREAK_TYPE.exec(attributes);
  if (found === null) return true;
  return (found[1] ?? found[2]) === "textWrapping";
}

/** One entry per w:p in tag order, from the XML of word/document.xml. Total. */
export function paragraphsOf(xml: string): readonly string[] {
  const paragraphs: string[] = [];
  let open = false;
  const append = (s: string): void => {
    const last = paragraphs.length - 1;
    if (open && last >= 0) paragraphs[last] = (paragraphs[last] ?? "") + s;
  };
  for (const m of xml.matchAll(TOKEN)) {
    const tag = m[0];
    if (tag.startsWith("</w:p>")) {
      open = false;
    } else if (tag.startsWith("<w:tab")) {
      append("\t");
    } else if (tag.startsWith("<w:br")) {
      if (breaksLine(m[4] ?? "")) append("\n");
    } else if (tag.startsWith("<w:t")) {
      if (m[2] !== "/") append(decodeEntities(m[3] ?? ""));
    } else {
      paragraphs.push("");
      open = m[1] !== "/";
    }
  }
  return paragraphs;
}
