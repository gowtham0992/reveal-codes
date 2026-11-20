/**
 * Control characters in file text (Req 9.13, design M6). Each replacement is one UTF-16
 * code unit, so no length, line or column changes. Pure; no `node:`.
 */
function replacement(code: number): string | null {
  if (code === 0x0a || code === 0x09) return null;
  if (code < 0x20) return String.fromCharCode(0x2400 + code);
  if (code === 0x7f) return "\u2421";
  if (code >= 0x80 && code <= 0x9f) return "\ufffd";
  return null;
}
/** `text` with each C0 control but LF and TAB as U+2400 plus its code, DEL as U+2421, C1 as U+FFFD. */
export function neutralize(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    out += replacement(ch.charCodeAt(0)) ?? ch;
  }
  return out;
}
