const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  hellip: "\u2026",
  sect: "\u00a7",
  para: "\u00b6",
};

const REPLACEMENT = "\ufffd";

const NON_CONTENT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const STAR_PAGE =
  /<([a-z][a-z0-9]*)\b[^>]*\bclass\s*=\s*["'][^"']*star-pagination[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAG = /<\/?(?:p|div|br|li|h[1-6]|blockquote|tr|footnote)\b[^>]*>/gi;
const ANY_TAG = /<\/?[a-z!][^>]*>/gi;
const ENTITY = /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g;

function fromCodePoint(n: number): string {
  const valid = n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff);
  return valid ? String.fromCodePoint(n) : REPLACEMENT;
}

function decodeEntity(
  whole: string,
  dec: string | undefined,
  hex: string | undefined,
  name: string | undefined,
): string {
  if (dec !== undefined) return fromCodePoint(Number.parseInt(dec, 10));
  if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16));
  const named = name === undefined ? undefined : NAMED_ENTITIES[name];
  return named ?? whole;
}

/**
 * Strips markup from an opinion HTML or XML field (design A10). Drops script,
 * style and star-pagination elements, turns block tags into newlines, removes
 * other tags, then decodes entities in one pass so `&amp;lt;` becomes `&lt;`.
 */
export function htmlToText(s: string): string {
  return s
    .replace(NON_CONTENT, "")
    .replace(STAR_PAGE, "")
    .replace(BLOCK_TAG, "\n")
    .replace(ANY_TAG, "")
    .replace(ENTITY, decodeEntity);
}
