import type { Result } from "@reveal-codes/engine";

export type TextDecodeError = Readonly<{ kind: "not_utf8"; cause: unknown }>;

const BOM = "\uFEFF";

/** UTF-8 only (UTF-16 fails), one leading U+FEFF removed, `\r\n` and lone `\r` become `\n`. */
export function decodeTextFile(bytes: Uint8Array): Result<string, TextDecodeError> {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (cause) {
    return { ok: false, error: { kind: "not_utf8", cause } };
  }
  const bare = decoded.startsWith(BOM) ? decoded.slice(1) : decoded;
  return { ok: true, value: bare.replace(/\r\n?/g, "\n") };
}
