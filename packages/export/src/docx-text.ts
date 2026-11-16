// Docx_Safe_Text (Req 22). One table of allowed code points, read by both functions.
// An unpaired surrogate is outside every range, and `for...of` yields it as one unit.

const ALLOWED: readonly (readonly [number, number])[] = [
  [0x9, 0xa],
  [0xd, 0xd],
  [0x20, 0xd7ff],
  [0xe000, 0xfffd],
  [0x10000, 0x10ffff],
];

export type DocxSafe = Readonly<{ text: string; removed: number }>;

function isAllowed(cp: number): boolean {
  return ALLOWED.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** Docx_Safe_Text: U+000B and U+000C become "\n"; "\r\n" and a lone "\r" become "\n";
 *  every other Docx_Unsafe_Character is removed and counted. */
export function docxSafe(text: string): DocxSafe {
  let out = "";
  let removed = 0;
  let afterCr = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const skipLf = cp === 0xa && afterCr;
    afterCr = cp === 0xd;
    if (skipLf) continue;
    if (cp === 0xd || cp === 0xb || cp === 0xc) out += "\n";
    else if (isAllowed(cp)) out += ch;
    else removed += 1;
  }
  return { text: out, removed };
}

/** True when the text holds any Docx_Unsafe_Character, U+000B and U+000C included. */
export function holdsDocxUnsafe(text: string): boolean {
  for (const ch of text) {
    if (!isAllowed(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}
